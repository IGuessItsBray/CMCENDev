const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EJSON } = require('mongoose').mongo.BSON;
const pinned = require('../../../data/archive-review/pilot-source-links-2026-10-02.json');
const { safeArchiveUrl } = require('../../../services/archive-source-links');

const collections = {
  retirement: 'retirementmessages',
  'last-post': 'lastpostmessages',
};
const canonical = (v) =>
  JSON.stringify(sort(EJSON.serialize(v, { relaxed: false })));
const clone = (v) => EJSON.deserialize(EJSON.serialize(v, { relaxed: false }));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sort(v[k])]),
    );
  return v;
}
const digest = (v) => createHash('sha256').update(canonical(v)).digest('hex');
const missing = (v) => v == null || v === '';

function validateManifest(manifest) {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.batchId, pinned.batchId);
  assert.equal(manifest.targetOrigin, pinned.targetOrigin);
  assert.equal(manifest.sourceOrigin, pinned.sourceOrigin);
  assert.equal(
    manifest.groups.length,
    20,
    'Exactly the reviewed 20 pilot records',
  );
  // Scope, language and URLs are pinned to the checked-in, verified evidence.
  assert.deepEqual(
    manifest.groups,
    pinned.groups,
    'Pilot scope or verified URLs changed',
  );
  assert.equal(new Set(manifest.groups.map((g) => g.destinationId)).size, 20);
  for (const group of manifest.groups) {
    assert(collections[group.kind]);
    assert(/^[a-f\d]{24}$/.test(group.destinationId));
    assert.equal(group.sources.length, 2);
    assert.deepEqual(group.sources.map((s) => s.language).sort(), ['en', 'fr']);
    assert.deepEqual(
      group.sourceIds.toSorted(),
      group.sources.map((s) => s.sourceId).toSorted(),
    );
    for (const source of group.sources)
      assert.equal(safeArchiveUrl(source.url), source.url);
  }
}

function planRepair(manifest, documents) {
  validateManifest(manifest);
  const operations = [];
  for (const group of manifest.groups) {
    const collection = collections[group.kind];
    const doc = documents.find(
      (d) =>
        d.collection === collection &&
        String(d.document?._id) === group.destinationId,
    )?.document;
    assert(doc, `Missing pilot document ${group.destinationId}`);
    const legacy = doc.legacy;
    assert(
      legacy && legacy.source === manifest.sourceOrigin,
      'Source origin mismatch',
    );
    assert.equal(legacy.importBatch, manifest.batchId, 'Import batch mismatch');
    assert.deepEqual(
      legacy.sourcePostIds.toSorted(),
      group.sourceIds.toSorted(),
      'Source IDs mismatch',
    );
    assert(
      Array.isArray(legacy.sourceRecords) &&
        legacy.sourceRecords.length === group.sources.length,
      'Source records missing or ambiguous',
    );
    const allowedUrls = group.sources.map((s) => s.url);
    for (const value of [
      doc.migrationSource,
      legacy.sourceUrl,
      ...(legacy.sourceUrls || []),
    ]) {
      assert(
        missing(value) || allowedUrls.includes(value),
        'Existing aggregate source URL conflicts',
      );
    }
    const set = {};
    const before = {};
    const seen = new Set();
    legacy.sourceRecords.forEach((record, index) => {
      const source = group.sources.find((s) => s.sourceId === record.sourceId);
      assert(
        source &&
          source.language === record.language &&
          !seen.has(record.sourceId),
        'Source ID/language mismatch',
      );
      seen.add(record.sourceId);
      for (const key of ['url', 'sourceUrl']) {
        assert(
          missing(record[key]) || record[key] === source.url,
          'Existing source URL conflicts',
        );
      }
      // Preserve an already valid sourceUrl alias; do not add redundant fields.
      if (!missing(record.url) || !missing(record.sourceUrl)) return;
      const field = `legacy.sourceRecords.${index}.url`;
      before[field] = {
        exists: Object.hasOwn(record, 'url'),
        ...(Object.hasOwn(record, 'url') ? { value: record.url } : {}),
      };
      set[field] = source.url;
    });
    if (!Object.keys(set).length) continue;
    const beforeRecords = clone(legacy.sourceRecords);
    const afterRecords = clone(beforeRecords);
    for (const [field, url] of Object.entries(set))
      afterRecords[Number(field.split('.')[2])].url = url;
    operations.push({
      collection,
      destinationId: group.destinationId,
      sourceIds: [...legacy.sourcePostIds],
      beforeRecords,
      afterRecords,
      before,
      set,
    });
  }
  return {
    version: 1,
    targetOrigin: manifest.targetOrigin,
    batchId: manifest.batchId,
    scopeDigest: digest(manifest),
    operations,
  };
}

function guard(operation, records, ObjectId, manifest) {
  return {
    _id: new ObjectId(operation.destinationId),
    'legacy.source': manifest.sourceOrigin,
    'legacy.importBatch': manifest.batchId,
    'legacy.sourcePostIds': operation.sourceIds,
    'legacy.sourceRecords': records,
  };
}

function authorize(authorization, plan, databaseName, now) {
  assert(
    authorization?.allowApply === true,
    'Explicit owner apply authorization required',
  );
  assert(
    authorization.approvedBy && authorization.backupReference,
    'Owner and backup reference required',
  );
  assert.equal(authorization.targetOrigin, plan.targetOrigin);
  assert.equal(authorization.targetDatabase, databaseName);
  assert.equal(
    authorization.planDigest,
    digest(plan),
    'Fresh reviewed dry-run plan changed',
  );
  const age =
    now.getTime() - new Date(authorization.destinationVerifiedAt).getTime();
  assert(
    Number.isFinite(age) && age >= 0 && age <= 15 * 60 * 1000,
    'Fresh destination verification required',
  );
}

async function runRepair({
  db,
  manifest = pinned,
  ObjectId,
  apply = false,
  authorization,
  journal,
  now = new Date(),
}) {
  validateManifest(manifest);
  const documents = [];
  for (const group of manifest.groups) {
    const collection = collections[group.kind];
    const document = await db
      .collection(collection)
      .findOne(
        { _id: new ObjectId(group.destinationId) },
        { projection: { legacy: 1, migrationSource: 1 } },
      );
    documents.push({ collection, document });
  }
  const plan = planRepair(manifest, documents);
  if (!apply)
    return {
      dryRun: true,
      scope: 20,
      plannedRecords: plan.operations.length,
      plannedUrls: plan.operations.reduce(
        (n, o) => n + Object.keys(o.set).length,
        0,
      ),
      planDigest: digest(plan),
      plan,
    };
  authorize(authorization, plan, db.databaseName, now);
  assert(typeof journal === 'function', 'Durable journal required');
  for (const operation of plan.operations) {
    // Fsync the reversible intent before the conditional, dotted-field write.
    await journal({
      event: 'prepared',
      planDigest: digest(plan),
      targetOrigin: plan.targetOrigin,
      targetDatabase: db.databaseName,
      operation,
    });
    const filter = guard(
      operation,
      operation.beforeRecords,
      ObjectId,
      manifest,
    );
    const result = await db
      .collection(operation.collection)
      .updateOne(filter, { $set: operation.set });
    assert.equal(
      result.matchedCount,
      1,
      'Concurrent provenance change; stop and retain journal',
    );
    const verified = await db
      .collection(operation.collection)
      .findOne(guard(operation, operation.afterRecords, ObjectId, manifest), {
        projection: { _id: 1 },
      });
    assert(verified, 'URL update readback failed; retain journal');
    await journal({
      event: 'applied',
      destinationId: operation.destinationId,
      planDigest: digest(plan),
    });
  }
  return {
    dryRun: false,
    updatedRecords: plan.operations.length,
    planDigest: digest(plan),
  };
}

// Owner-reviewed rollback instructions: only restore our URL fields, with an
// exact post-write provenance guard. A later URL/provenance edit blocks rollback.
function rollbackPlan(events, ObjectId, manifest = pinned) {
  validateManifest(manifest);
  const applied = new Set(
    events
      .filter((e) => e.event === 'applied')
      .map((e) => `${e.planDigest}|${e.destinationId}`),
  );
  return events
    .filter(
      (e) =>
        e.event === 'prepared' &&
        applied.has(`${e.planDigest}|${e.operation.destinationId}`),
    )
    .toReversed()
    .map((event) => {
      const o = event.operation;
      const group = manifest.groups.find(
        (g) =>
          g.destinationId === o.destinationId &&
          collections[g.kind] === o.collection,
      );
      assert(group, 'Rollback outside pilot scope');
      assert.deepEqual(o.sourceIds.toSorted(), group.sourceIds.toSorted());
      assert.equal(o.beforeRecords.length, 2);
      const expectedAfter = clone(o.beforeRecords);
      assert.deepEqual(Object.keys(o.before).sort(), Object.keys(o.set).sort());
      for (const [field, url] of Object.entries(o.set)) {
        assert(
          /^legacy\.sourceRecords\.\d+\.url$/.test(field),
          'Rollback outside URL fields',
        );
        const index = Number(field.split('.')[2]),
          record = o.beforeRecords[index];
        const source = group.sources.find(
          (s) =>
            s.sourceId === record?.sourceId && s.language === record?.language,
        );
        assert(
          source &&
            url === source.url &&
            missing(record.url) &&
            missing(record.sourceUrl),
          'Rollback URL evidence conflicts',
        );
        assert.equal(o.before[field].exists, Object.hasOwn(record, 'url'));
        if (o.before[field].exists)
          assert.deepEqual(o.before[field].value, record.url);
        expectedAfter[index].url = url;
      }
      assert.equal(
        canonical(expectedAfter),
        canonical(o.afterRecords),
        'Rollback after-state changed',
      );
      const $set = {},
        $unset = {};
      for (const [field, before] of Object.entries(o.before)) {
        assert(
          /^legacy\.sourceRecords\.\d+\.url$/.test(field),
          'Rollback outside URL fields',
        );
        if (before.exists) $set[field] = before.value;
        else $unset[field] = '';
      }
      return {
        collection: o.collection,
        filter: guard(o, o.afterRecords, ObjectId, manifest),
        update: {
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
      };
    });
}

module.exports = {
  pinned,
  digest,
  validateManifest,
  planRepair,
  runRepair,
  rollbackPlan,
};
