const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { EJSON, ObjectId } = require('mongoose').mongo.BSON;

const collections = {
  retirement: 'retirementmessages',
  'last-post': 'lastpostmessages',
};
const canonical = (value) => {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(EJSON.serialize(value, { relaxed: false })));
};
const digest = (value) =>
  crypto.createHash('sha256').update(canonical(value)).digest('hex');
const bytesDigest = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};
const ids = (d) => [
  ...new Set(
    [
      ...(d.legacy?.sourcePostIds || []),
      ...(d.legacy?.sourceRecords || []).map((s) => s.sourceId),
      d.legacy?.postId,
      d.legacy?.sourcePostId,
      d.legacy?.wordpressPostId,
    ]
      .filter((x) => Number.isSafeInteger(Number(x)) && Number(x) > 0)
      .map(Number),
  ),
];
const decode = (d) => EJSON.deserialize(d);

// Scan the actual document tree, not only the operator's media inventory.
// Original source bodies are retained provenance, never resolved display copy.
function assertGroupMediaDependencies(values, media, mediaKeys) {
  const known = new Set(media.map((m) => m.key));
  const declared = new Set(mediaKeys);
  const visit = (value) => {
    if (typeof value === 'string') {
      const references = [
        ...value.matchAll(/\{\{media:([^}]+)\}\}/g),
        ...value.matchAll(
          /((?:images|documents)\/archive\/wordpress\/[a-f\d]{64}\.[a-z0-9]+)/g,
        ),
      ];
      for (const [, key] of references) {
        assert(known.has(key), 'Referenced media missing from package');
        assert(
          declared.has(key),
          'Referenced media missing from group dependencies',
        );
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        if (key !== 'originalBody') visit(child);
  };
  visit(values);
}

function validateManifest(manifest) {
  assert.equal(manifest.version, 1);
  assert.equal(new URL(manifest.targetOrigin).origin, manifest.targetOrigin);
  assert.equal(new URL(manifest.sourceOrigin).origin, manifest.sourceOrigin);
  assert(
    manifest.batchId &&
      manifest.groups?.length &&
      manifest.groups.length <= 1000,
  );
  const seen = new Set();
  const commentIds = new Set();
  const targetIds = new Set();
  const media = new Map();
  for (const m of manifest.media || []) {
    assert(!media.has(m.key));
    assert(
      /^(images|documents)\/archive\/wordpress\/[a-f\d]{64}\.[a-z0-9]+$/.test(
        m.key,
      ),
    );
    assert(/^[a-f\d]{64}$/.test(m.sha256));
    const contentAddress =
      /^(?:images|documents)\/archive\/wordpress\/([a-f\d]{64})\.[a-z0-9]+$/.exec(
        m.key,
      );
    if (contentAddress)
      assert.equal(
        contentAddress[1],
        m.sha256,
        'Content-addressed media key differs from byte checksum',
      );
    assert(
      Number.isSafeInteger(m.bytes) &&
        m.bytes > 0 &&
        m.bytes <= 25 * 1024 * 1024,
    );
    assert(
      new URL(m.url).protocol === 'https:' ||
        ['localhost', '127.0.0.1'].includes(new URL(m.url).hostname),
    );
    assert(m.existingAssetId || m.assetDocument);
    if (m.existingAssetId) assert(/^[a-f\d]{24}$/.test(m.existingAssetId));
    else {
      const asset = decode(m.assetDocument);
      assert(asset._id instanceof ObjectId);
      assert.equal(asset.key, m.key);
      assert.equal(asset.fileMetadata?.sha256, m.sha256);
    }
    media.set(m.key, m);
  }
  for (const g of manifest.groups) {
    assert(collections[g.kind] && g.key && !seen.has(`group:${g.key}`));
    seen.add(`group:${g.key}`);
    assert(g.sourceIds?.length && /^[a-f\d]{64}$/.test(g.sourceFingerprint));
    const d = decode(g.document);
    assert(d._id instanceof ObjectId && !targetIds.has(String(d._id)));
    targetIds.add(String(d._id));
    assert.equal(d.status, 'draft');
    assert(
      !d.publishedAt &&
        !d.publishedBy &&
        !d.scheduledPublishAt &&
        !d.scheduledBy &&
        !d.scheduledAt,
    );
    assert.equal(d.legacy?.source, manifest.sourceOrigin);
    assert.deepEqual(
      ids(d).sort((a, b) => a - b),
      [...g.sourceIds].sort((a, b) => a - b),
    );
    for (const id of g.sourceIds) {
      assert(Number.isSafeInteger(id) && id > 0 && !seen.has(id));
      seen.add(id);
    }
    assert(g.authorMappings?.length);
    assert(
      g.authorMappings.some((m) => String(m.userId) === String(d.createdBy)),
    );
    for (const c of g.comments || []) {
      const cd = decode(c.document);
      assert(
        Number.isSafeInteger(c.sourceCommentId) &&
          !commentIds.has(c.sourceCommentId),
      );
      commentIds.add(c.sourceCommentId);
      assert(cd._id instanceof ObjectId && !targetIds.has(String(cd._id)));
      targetIds.add(String(cd._id));
      assert.equal(cd.status, 'draft');
      assert(!cd.publishedAt && !cd.publishedBy);
      assert.equal(String(cd.parentId), String(d._id));
      assert.equal(
        cd.parentType,
        g.kind === 'retirement' ? 'retirement' : 'lastPost',
      );
      assert.equal(cd.legacy?.source, manifest.sourceOrigin);
      assert.equal(cd.legacy.wordpressCommentId, c.sourceCommentId);
      assert(g.sourceIds.includes(cd.legacy.postId));
      if (cd.legacy.authorUserId === 0) assert(!cd.author);
      else
        assert(
          g.authorMappings.some(
            (m) =>
              m.sourceUserId === cd.legacy.authorUserId &&
              m.userId === String(cd.author),
          ),
        );
      if (cd.legacy.parentCommentId)
        assert(
          g.comments.some(
            (p) => p.sourceCommentId === cd.legacy.parentCommentId,
          ),
        );
    }
    for (const key of g.mediaKeys) assert(media.has(key));
    assertGroupMediaDependencies(
      [g.document, ...g.comments.map((c) => c.document)],
      manifest.media,
      g.mediaKeys,
    );
  }
  return digest(manifest);
}

function groupPlan(manifest, group) {
  const media = manifest.media.filter((m) => group.mediaKeys.includes(m.key));
  return { ...group, media };
}

function checkAuthorization(
  manifest,
  db,
  store,
  authorization,
  now = new Date(),
) {
  if (
    !authorization?.allowApply ||
    !authorization.approvedBy?.trim() ||
    !authorization.backupReference?.trim()
  )
    fail('OWNER_AUTHORIZATION_REQUIRED');
  if (
    authorization.targetOrigin !== manifest.targetOrigin ||
    authorization.targetDatabase !== db.databaseName ||
    authorization.manifestDigest !== validateManifest(manifest)
  )
    fail('AUTHORIZATION_TARGET_OR_MANIFEST_MISMATCH');
  if (canonical(authorization.storageTarget) !== canonical(store.target))
    fail('STORAGE_TARGET_MISMATCH');
  const checked = new Date(authorization.destinationVerifiedAt).getTime();
  if (
    !Number.isFinite(checked) ||
    now.getTime() - checked > 15 * 60 * 1000 ||
    checked > now.getTime() + 60 * 1000
  )
    fail('FRESH_DESTINATION_VERIFICATION_REQUIRED');
}

async function inspectGroup(db, manifest, group, session) {
  const options = session ? { session } : {};
  const collection = collections[group.kind];
  const document = decode(group.document);
  const groupId = `${manifest.sourceOrigin}|group|${group.key}`;
  const expectedDigest = digest(groupPlan(manifest, group));
  const checkpoint = await db
    .collection('migrationgroups')
    .findOne({ _id: groupId }, options);
  if (checkpoint && checkpoint.groupDigest !== expectedDigest)
    fail('GROUP_MANIFEST_CHANGED');
  if (checkpoint && !['pending', 'complete'].includes(checkpoint.state))
    fail('INVALID_CHECKPOINT_STATE');
  const matches = [];
  for (const name of [
    'newsarticles',
    'retirementmessages',
    'lastpostmessages',
    'events',
  ]) {
    const query = {
      $or: [
        { 'legacy.sourcePostIds': { $in: group.sourceIds } },
        { 'legacy.sourceRecords.sourceId': { $in: group.sourceIds } },
        { 'legacy.postId': { $in: group.sourceIds } },
        { 'legacy.sourcePostId': { $in: group.sourceIds } },
        { 'legacy.wordpressPostId': { $in: group.sourceIds } },
        { _id: document._id },
      ],
    };
    for (const d of await db
      .collection(name)
      .find(query, options)
      .limit(2)
      .toArray())
      matches.push({ collection: name, doc: d });
  }
  if (
    matches.length > 1 ||
    matches.some(
      (m) =>
        m.collection !== collection ||
        String(m.doc._id) !== String(document._id) ||
        m.doc.legacy?.source !== manifest.sourceOrigin ||
        canonical(ids(m.doc).sort((a, b) => a - b)) !==
          canonical([...group.sourceIds].sort((a, b) => a - b)),
    )
  )
    fail('SOURCE_OR_TARGET_COLLISION');
  const existing = matches[0]?.doc;
  const complete = checkpoint?.state === 'complete';
  if (complete) {
    const receipt = await db
      .collection('migrationreceipts')
      .findOne(
        { _id: `${groupId}:${expectedDigest}`, state: 'complete' },
        options,
      );
    if (
      !receipt ||
      canonical(receipt.sourceIds) !== canonical(group.sourceIds) ||
      canonical(receipt.commentIds) !==
        canonical(group.comments.map((c) => c.sourceCommentId)) ||
      canonical(receipt.mediaKeys) !== canonical(group.mediaKeys)
    )
      fail('COMPLETION_RECEIPT_MISSING');
  }
  if (complete && !existing) fail('COMPLETED_CONTENT_MISSING');
  if (existing && !complete && canonical(existing) !== canonical(document))
    fail('EXISTING_CONTENT_CHANGED_NO_OVERWRITE');
  if (group.kind === 'last-post' && document.slug) {
    if (
      await db
        .collection(collection)
        .findOne({ slug: document.slug, _id: { $ne: document._id } }, options)
    )
      fail('SLUG_COLLISION');
  }
  for (const mapping of group.authorMappings) {
    const rows = await db
      .collection('legacyaccountmaps')
      .find(
        { source: manifest.sourceOrigin, sourceUserId: mapping.sourceUserId },
        { ...options, projection: { state: 1, userId: 1 } },
      )
      .limit(2)
      .toArray();
    if (
      rows.length !== 1 ||
      rows[0].state !== 'complete' ||
      String(rows[0].userId) !== mapping.userId ||
      !(await db
        .collection('users')
        .findOne(
          { _id: new ObjectId(mapping.userId) },
          { ...options, projection: { _id: 1 } },
        ))
    )
      fail('ACCOUNT_MAPPING_CHANGED');
  }
  for (const c of group.comments) {
    const cd = decode(c.document);
    const found = [];
    for (const name of ['comments', 'retirementcomments', 'lastpostcomments']) {
      for (const d of await db
        .collection(name)
        .find(
          {
            $or: [
              { _id: cd._id },
              {
                'legacy.source': manifest.sourceOrigin,
                'legacy.wordpressCommentId': c.sourceCommentId,
              },
            ],
          },
          options,
        )
        .limit(2)
        .toArray())
        found.push({ collection: name, doc: d });
    }
    if (
      found.length > 1 ||
      found.some(
        (r) =>
          r.collection !== 'comments' ||
          String(r.doc._id) !== String(cd._id) ||
          String(r.doc.parentId) !== String(cd.parentId) ||
          r.doc.legacy?.wordpressCommentId !== c.sourceCommentId ||
          r.doc.legacy?.source !== manifest.sourceOrigin ||
          r.doc.legacy?.postId !== cd.legacy.postId ||
          r.doc.legacy?.authorUserId !== cd.legacy.authorUserId ||
          String(r.doc.author || '') !== String(cd.author || ''),
      )
    )
      fail('COMMENT_IDENTITY_OR_PARENT_COLLISION');
    if (complete && !found.length) fail('COMPLETED_COMMENT_MISSING');
    if (found.length && !complete && canonical(found[0].doc) !== canonical(cd))
      fail('EXISTING_COMMENT_CHANGED_NO_OVERWRITE');
  }
  for (const m of manifest.media.filter((a) =>
    group.mediaKeys.includes(a.key),
  )) {
    const rows = await db
      .collection('mediaassets')
      .find({ key: m.key }, options)
      .limit(2)
      .toArray();
    const expectedId = m.existingAssetId || String(decode(m.assetDocument)._id);
    if (rows.length > 1 || rows.some((a) => String(a._id) !== expectedId))
      fail('MEDIA_IDENTITY_COLLISION');
    if ((complete || m.existingAssetId) && !rows.length)
      fail('REUSED_OR_COMPLETED_MEDIA_MISSING');
    if (
      rows.length &&
      !complete &&
      !m.existingAssetId &&
      canonical(rows[0]) !== canonical(decode(m.assetDocument))
    )
      fail('UNFINISHED_MEDIA_RECORD_CHANGED_NO_OVERWRITE');
    if (!m.existingAssetId) {
      const byId = await db
        .collection('mediaassets')
        .findOne({ _id: decode(m.assetDocument)._id }, options);
      if (byId && byId.key !== m.key) fail('MEDIA_TARGET_ID_COLLISION');
    }
  }
  const claims = [
    ...group.sourceIds.map((id) => `post:${id}`),
    ...group.comments.map((c) => `comment:${c.sourceCommentId}`),
  ];
  for (const id of claims) {
    const row = await db
      .collection('migrationclaims')
      .findOne({ _id: `${manifest.sourceOrigin}|${id}` }, options);
    if (row && (row.groupId !== groupId || row.groupDigest !== expectedDigest))
      fail('SOURCE_CLAIM_COLLISION');
    if (row && !['pending', 'complete'].includes(row.state))
      fail('INVALID_CLAIM_STATE');
    if (complete && row?.state !== 'complete')
      fail('COMPLETION_CLAIMS_MISSING');
  }
  return {
    groupId,
    groupDigest: expectedDigest,
    state: complete
      ? 'skip-complete-preserve-edits'
      : existing
        ? 'adopt-exact-existing'
        : checkpoint
          ? 'resume-pending'
          : 'new',
    claims,
  };
}

async function verifyObject(store, media, expected) {
  const storage = await store.get(media.key, media.bytes);
  if (
    storage &&
    (storage.length !== media.bytes || bytesDigest(storage) !== media.sha256)
  )
    fail('EXISTING_OBJECT_BYTES_DIFFER');
  if (!storage) return false;
  const publicBytes = await store.publicGet(media.url, media.bytes);
  if (
    !publicBytes ||
    publicBytes.length !== media.bytes ||
    bytesDigest(publicBytes) !== media.sha256
  )
    fail('PUBLIC_OBJECT_VERIFICATION_FAILED');
  if (
    expected &&
    (expected.length !== media.bytes || bytesDigest(expected) !== media.sha256)
  )
    fail('LOCAL_MEDIA_CHANGED');
  return true;
}

async function runContentImport({
  db,
  manifest,
  store,
  readMedia,
  authorization,
  apply = false,
  journal,
  hook = async () => {},
}) {
  const manifestDigest = validateManifest(manifest);
  const report = {
    readOnly: !apply,
    manifestDigest,
    groups: [],
    verifiedComplete: 0,
    insertedGroups: 0,
    reusedComplete: 0,
  };
  for (const m of manifest.media) {
    const bytes = await readMedia(m);
    if (bytes.length !== m.bytes || bytesDigest(bytes) !== m.sha256)
      fail('LOCAL_MEDIA_CHANGED');
  }
  for (const group of manifest.groups)
    report.groups.push({
      key: group.key,
      ...(await inspectGroup(db, manifest, group)),
    });
  if (!apply) {
    report.media = [];
    for (const m of manifest.media)
      report.media.push({
        key: m.key,
        destinationVerified: await verifyObject(store, m),
      });
    return report;
  }
  checkAuthorization(manifest, db, store, authorization);
  if (typeof journal !== 'function') fail('DURABLE_JOURNAL_REQUIRED');
  // Standalone-safe single-document lock. Never expire/take over automatically:
  // a timeout cannot prove that the previous process has stopped writing.
  const token = crypto.randomUUID();
  const lockId = manifest.targetOrigin;
  const locks = db.collection('migrationlocks');
  const recovery = authorization.lockRecovery;
  if (recovery) {
    if (
      recovery.priorWriterStopped !== true ||
      typeof recovery.abandonedToken !== 'string' ||
      !recovery.abandonedToken
    )
      fail('STOPPED_WRITER_CONFIRMATION_REQUIRED');
    const changed = await locks.updateOne(
      { _id: lockId, token: recovery.abandonedToken },
      { $set: { token, recoveredAt: new Date() } },
    );
    if (changed.matchedCount !== 1) fail('ABANDONED_LOCK_CHANGED');
  } else {
    try {
      await locks.insertOne({
        _id: lockId,
        token,
        acquiredAt: new Date(),
        manifestDigest,
      });
    } catch (error) {
      if (error.code === 11000) fail('IMPORT_ALREADY_RUNNING');
      throw error;
    }
  }
  const fenced = async () => {
    if (!(await locks.findOne({ _id: lockId, token })))
      fail('IMPORT_LOCK_LOST');
  };
  const write = async (boundary, group, fn) => {
    await fenced();
    const result = await fn();
    await hook(boundary, group);
    await hook('after-durable-write', { groupKey: group?.key, boundary });
    await fenced();
    return result;
  };
  try {
    await hook('after-lock-acquired');
    await write('after-media-index', null, () =>
      db.collection('mediaassets').createIndex({ key: 1 }, { unique: true }),
    );
    for (const group of manifest.groups) {
      await fenced();
      const planned = await inspectGroup(db, manifest, group);
      const complete = planned.state.startsWith('skip-complete');
      const groups = db.collection('migrationgroups');
      const progress = async (step) => {
        const result = await write('after-step-checkpoint', group, () =>
          groups.updateOne(
            {
              _id: planned.groupId,
              groupDigest: planned.groupDigest,
              state: 'pending',
            },
            {
              $addToSet: { verifiedSteps: step },
              $set: { lastVerifiedAt: new Date() },
            },
          ),
        );
        if (result.matchedCount !== 1) fail('CHECKPOINT_NOT_PENDING');
        await journal({
          eventId: `${planned.groupId}:${planned.groupDigest}:${step}`,
          groupKey: group.key,
          state: 'pending',
          step,
        });
        await hook('after-step-journal', group);
      };
      if (!complete) {
        await write('after-group-reservation', group, () =>
          groups.updateOne(
            { _id: planned.groupId, groupDigest: planned.groupDigest },
            {
              $setOnInsert: {
                groupKey: group.key,
                sourceOrigin: manifest.sourceOrigin,
                targetOrigin: manifest.targetOrigin,
                collection: collections[group.kind],
                groupDigest: planned.groupDigest,
                state: 'pending',
                sourceIds: group.sourceIds,
                destinationId: String(decode(group.document)._id),
                manifestDigest,
                batchId: manifest.batchId,
                createdAt: new Date(),
                verifiedSteps: [],
              },
            },
            { upsert: true },
          ),
        );
        for (const id of planned.claims) {
          const [sourceType, number] = id.split(':');
          const sourceId = Number(number);
          const destinationId =
            sourceType === 'post'
              ? String(decode(group.document)._id)
              : String(
                  decode(
                    group.comments.find((c) => c.sourceCommentId === sourceId)
                      .document,
                  )._id,
                );
          await write('after-source-claim', group, () =>
            db.collection('migrationclaims').updateOne(
              {
                _id: `${manifest.sourceOrigin}|${id}`,
                groupId: planned.groupId,
                groupDigest: planned.groupDigest,
              },
              {
                $setOnInsert: {
                  sourceOrigin: manifest.sourceOrigin,
                  targetOrigin: manifest.targetOrigin,
                  sourceType,
                  sourceId,
                  destinationId,
                  groupId: planned.groupId,
                  groupDigest: planned.groupDigest,
                  state: 'pending',
                },
              },
              { upsert: true },
            ),
          );
        }
      }
      await hook('after-reservation', group);
      const media = manifest.media.filter((m) =>
        group.mediaKeys.includes(m.key),
      );
      for (const m of media) {
        await fenced();
        const local = await readMedia(m);
        if (!(await verifyObject(store, m, local))) {
          if (m.existingAssetId || complete)
            fail('REUSED_OR_COMPLETED_OBJECT_MISSING');
          await write('after-object-put', group, () =>
            store.putIfAbsent(m.key, local, m.mimeType),
          );
          if (!(await verifyObject(store, m, local)))
            fail('STORED_OBJECT_MISSING');
        }
        await hook('after-media-verification', group);
        if (!complete) await progress(`object:${m.key}`);
      }
      if (complete) {
        // Completion provenance is checked again after dependency verification.
        await inspectGroup(db, manifest, group);
        report.reusedComplete++;
        report.verifiedComplete++;
        await journal({
          eventId: `${planned.groupId}:${planned.groupDigest}:complete`,
          groupKey: group.key,
          state: 'complete',
          recoveredFromRegistry: true,
        });
        continue;
      }
      await inspectGroup(db, manifest, group);
      const entries = [
        ...media
          .filter((m) => !m.existingAssetId)
          .map((m) => ({
            collection: 'mediaassets',
            doc: decode(m.assetDocument),
          })),
        { collection: collections[group.kind], doc: decode(group.document) },
        ...group.comments.map((c) => ({
          collection: 'comments',
          doc: decode(c.document),
        })),
      ];
      for (const entry of entries) {
        await fenced();
        // Recheck foreign source/parent/slug ownership before every insert.
        await inspectGroup(db, manifest, group);
        const col = db.collection(entry.collection);
        const old = await col.findOne({ _id: entry.doc._id });
        if (!old)
          await write(
            entry.collection === 'mediaassets'
              ? 'after-media-record-write'
              : entry.collection === 'comments'
                ? 'after-comment-write'
                : 'after-content-write',
            group,
            () => col.insertOne(entry.doc),
          );
        const saved = await col.findOne({ _id: entry.doc._id });
        if (canonical(saved) !== canonical(entry.doc)) fail('READBACK_DIFFERS');
        await progress(`record:${entry.collection}:${entry.doc._id}`);
      }
      await hook('after-readback', group);
      await hook('before-completion', group);
      // Claims and receipt can complete one at a time. Only the final group
      // checkpoint advertises completion; pending runs reverify every step.
      await inspectGroup(db, manifest, group);
      for (const m of media) {
        if (!(await verifyObject(store, m))) fail('STORED_OBJECT_MISSING');
        const asset = await db
          .collection('mediaassets')
          .findOne({ key: m.key });
        if (
          !asset ||
          String(asset._id) !==
            (m.existingAssetId || String(decode(m.assetDocument)._id))
        )
          fail('MEDIA_DEPENDENCY_MISSING');
      }
      for (const id of planned.claims) {
        const result = await write('after-claim-completion', group, () =>
          db.collection('migrationclaims').updateOne(
            {
              _id: `${manifest.sourceOrigin}|${id}`,
              groupId: planned.groupId,
              groupDigest: planned.groupDigest,
            },
            { $set: { state: 'complete', verifiedAt: new Date() } },
          ),
        );
        if (result.matchedCount !== 1) fail('COMPLETION_CLAIM_MISSING');
      }
      const receipt = {
        _id: `${planned.groupId}:${planned.groupDigest}`,
        groupId: planned.groupId,
        groupDigest: planned.groupDigest,
        manifestDigest,
        sourceIds: group.sourceIds,
        commentIds: group.comments.map((c) => c.sourceCommentId),
        mediaKeys: group.mediaKeys,
        approvedBy: authorization.approvedBy,
        state: 'complete',
      };
      const previousReceipt = await db
        .collection('migrationreceipts')
        .findOne({ _id: receipt._id });
      // Manifest-wide digest may change for a later batch, but group ownership
      // and immutable dependency receipt must remain exactly the same.
      const receiptIdentity = ({
        verifiedAt,
        manifestDigest: ignoredManifest,
        approvedBy,
        ...rest
      }) => rest;
      if (
        previousReceipt &&
        canonical(receiptIdentity(previousReceipt)) !==
          canonical(receiptIdentity(receipt))
      )
        fail('COMPLETION_RECEIPT_CONFLICT');
      if (!previousReceipt)
        await write('after-receipt-write', group, () =>
          db
            .collection('migrationreceipts')
            .insertOne({ ...receipt, verifiedAt: new Date() }),
        );
      await inspectGroup(db, manifest, group);
      const finished = await write('after-group-completion', group, () =>
        groups.updateOne(
          {
            _id: planned.groupId,
            groupDigest: planned.groupDigest,
            state: 'pending',
          },
          { $set: { state: 'complete', verifiedAt: new Date() } },
        ),
      );
      if (finished.matchedCount !== 1) fail('CHECKPOINT_NOT_PENDING');
      await hook('after-commit', group);
      await inspectGroup(db, manifest, group);
      await journal({
        eventId: `${planned.groupId}:${planned.groupDigest}:complete`,
        groupKey: group.key,
        state: 'complete',
        sourceIds: group.sourceIds,
        destinationId: String(decode(group.document)._id),
        manifestDigest,
      });
      await hook('after-completion-journal', group);
      report.insertedGroups++;
      report.verifiedComplete++;
    }
    return report;
  } finally {
    // Cooperative caught failures release their lock. A killed process leaves
    // it intact and requires owner-confirmed stopped-process recovery.
    await locks.deleteOne({ _id: lockId, token });
  }
}

async function readContentCompletionIndex(db, sourceOrigin) {
  const result = [];
  for await (const group of db
    .collection('migrationgroups')
    .find({ sourceOrigin, state: 'complete' })) {
    const receipt = await db
      .collection('migrationreceipts')
      .findOne({ _id: `${group._id}:${group.groupDigest}`, state: 'complete' });
    if (!receipt || canonical(receipt.sourceIds) !== canonical(group.sourceIds))
      fail('COMPLETION_RECEIPT_MISSING');
    const claims = [
      ...group.sourceIds.map((id) => `post:${id}`),
      ...receipt.commentIds.map((id) => `comment:${id}`),
    ];
    for (const id of claims)
      if (
        !(await db.collection('migrationclaims').findOne({
          _id: `${sourceOrigin}|${id}`,
          groupId: group._id,
          groupDigest: group.groupDigest,
          state: 'complete',
        }))
      )
        fail('COMPLETION_CLAIMS_MISSING');
    result.push({
      groupKey: group.groupKey,
      collection: group.collection,
      destinationId: group.destinationId,
      sourceIds: group.sourceIds,
      sourceCommentIds: receipt.commentIds,
      mediaKeys: receipt.mediaKeys,
      verifiedAt: group.verifiedAt,
    });
  }
  return { readOnly: true, sourceOrigin, completeGroups: result };
}

module.exports = {
  assertGroupMediaDependencies,
  canonical,
  digest,
  bytesDigest,
  ids,
  validateManifest,
  checkAuthorization,
  inspectGroup,
  runContentImport,
  readContentCompletionIndex,
};
