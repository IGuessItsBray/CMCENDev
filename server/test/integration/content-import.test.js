const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { EJSON, ObjectId } = mongoose.mongo.BSON;
const {
  runContentImport,
  digest,
  bytesDigest,
  canonical,
  readContentCompletionIndex,
} = require('../../scripts/migration/lib/content-import');
const {
  contentObjectStore,
} = require('../../scripts/migration/lib/content-import-storage');

let mongo;
let sequence = 0;
before(async () => {
  mongo = await MongoMemoryServer.create();
});
after(async () => {
  await mongo?.stop();
});

async function fixture() {
  const database = `synthetic_content_${++sequence}`;
  const uri = mongo.getUri(database);
  assert(['127.0.0.1', 'localhost'].includes(new URL(uri).hostname));
  const client = new mongoose.mongo.MongoClient(uri);
  await client.connect();
  const db = client.db();
  const objects = new Map();
  let wrongPublic = false;
  let puts = 0;
  const server = http.createServer((req, res) => {
    const bytes = objects.get(decodeURIComponent(req.url.slice(1)));
    if (!bytes) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.end(wrongPublic ? Buffer.from('wrong-public-bytes') : bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sdk = {
    async send(command) {
      const { Key, Body, IfNoneMatch } = command.input;
      if (command.constructor.name === 'PutObjectCommand') {
        assert.equal(IfNoneMatch, '*');
        puts++;
        if (objects.has(Key)) {
          const e = new Error('exists');
          e.name = 'PreconditionFailed';
          throw e;
        }
        objects.set(Key, Buffer.from(Body));
        return {};
      }
      const bytes = objects.get(Key);
      if (!bytes) {
        const e = new Error('missing');
        e.name = 'NoSuchKey';
        throw e;
      }
      return { Body: Readable.from([bytes]), ContentLength: bytes.length };
    },
  };
  const store = contentObjectStore({
    client: sdk,
    bucket: 'synthetic-test-only',
    endpoint: origin,
    publicOrigin: origin,
  });
  const user = new ObjectId();
  await db.collection('users').insertOne({ _id: user, synthetic: true });
  await db.collection('legacyaccountmaps').insertOne({
    source: 'https://synthetic.example',
    sourceUserId: 7,
    userId: user,
    state: 'complete',
  });
  const bytes = Buffer.from('synthetic-object-payload');
  const sha = bytesDigest(bytes);
  const key = `images/archive/wordpress/${sha}.png`;
  const assetId = new ObjectId();
  const contentId = new ObjectId();
  const commentId = new ObjectId();
  const createdAt = new Date('2020-01-02T12:00:00Z');
  const document = {
    _id: contentId,
    messages: { en: 'Synthetic English', fr: 'Texte synthétique français' },
    message: 'Synthetic English',
    messageLanguage: 'en',
    status: 'draft',
    publishedAt: null,
    createdBy: user,
    createdAt,
    legacy: {
      source: 'https://synthetic.example',
      sourcePostIds: [10, 11],
      importBatch: 'synthetic-batch',
      sourceRecords: [{ sourceId: 10 }, { sourceId: 11 }],
    },
  };
  const comment = {
    _id: commentId,
    parentType: 'retirement',
    parentId: contentId,
    author: null,
    body: 'Synthetic guest',
    status: 'draft',
    publishedAt: null,
    createdAt,
    legacy: {
      source: 'https://synthetic.example',
      wordpressCommentId: 90,
      postId: 10,
      parentCommentId: 0,
      authorUserId: 0,
      originalApproval: '1',
    },
  };
  const manifest = {
    version: 1,
    batchId: 'synthetic-batch',
    targetOrigin: origin,
    sourceOrigin: 'https://synthetic.example',
    groups: [
      {
        key: 'retirement:pair-10',
        kind: 'retirement',
        sourceIds: [10, 11],
        sourceFingerprint: bytesDigest(Buffer.from('synthetic source')),
        document: EJSON.serialize(document, { relaxed: false }),
        comments: [
          {
            sourceCommentId: 90,
            document: EJSON.serialize(comment, { relaxed: false }),
          },
        ],
        authorMappings: [{ sourceUserId: 7, userId: String(user) }],
        mediaKeys: [key],
      },
    ],
    media: [
      {
        key,
        filename: `${sha}.png`,
        sha256: sha,
        bytes: bytes.length,
        mimeType: 'image/png',
        url: `${origin}/${key}`,
        assetDocument: EJSON.serialize(
          {
            _id: assetId,
            key,
            url: `${origin}/${key}`,
            fileMetadata: { sha256: sha },
          },
          { relaxed: false },
        ),
      },
    ],
  };
  const journal = [];
  const authorize = () => ({
    allowApply: true,
    approvedBy: 'synthetic owner',
    backupReference: 'disposable test fixture',
    targetOrigin: origin,
    targetDatabase: database,
    manifestDigest: digest(manifest),
    storageTarget: store.target,
    destinationVerifiedAt: new Date().toISOString(),
  });
  const run = (options = {}) =>
    runContentImport({
      client,
      db,
      manifest,
      store,
      readMedia: async () => bytes,
      journal: async (e) => journal.push(e),
      ...options,
    });
  return {
    client,
    db,
    manifest,
    store,
    objects,
    bytes,
    key,
    document,
    comment,
    assetId,
    journal,
    authorize,
    run,
    puts: () => puts,
    wrongPublic: () => {
      wrongPublic = true;
    },
    close: async () => {
      await client.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('content dry run creates no records, registry, indexes, objects or journal', async () => {
  const f = await fixture();
  try {
    const before = (await f.db.listCollections().toArray())
      .map((c) => c.name)
      .sort();
    const result = await f.run();
    assert(result.readOnly);
    assert.equal(result.media[0].destinationVerified, false);
    assert.deepEqual(
      (await f.db.listCollections().toArray()).map((c) => c.name).sort(),
      before,
    );
    assert.equal(f.puts(), 0);
    assert.equal(f.journal.length, 0);
  } finally {
    await f.close();
  }
});

test('apply authorization, exact target, storage and fresh verification are mandatory', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run({ apply: true }),
      /OWNER_AUTHORIZATION_REQUIRED/,
    );
    for (const patch of [
      { targetDatabase: 'other' },
      { manifestDigest: 'other' },
      { storageTarget: { bucket: 'other' } },
      { destinationVerifiedAt: '2000-01-01' },
    ]) {
      await assert.rejects(
        f.run({ apply: true, authorization: { ...f.authorize(), ...patch } }),
      );
    }
    assert.equal(await f.db.collection('migrationgroups').countDocuments(), 0);
    assert.equal(f.puts(), 0);
  } finally {
    await f.close();
  }
});

test('standalone Mongo applies successfully without transactions', async () => {
  const single = await MongoMemoryServer.create();
  const f = await fixture();
  const client = new mongoose.mongo.MongoClient(
    single.getUri('synthetic_standalone'),
  );
  try {
    await client.connect();
    const db = client.db();
    await db.collection('users').insertOne({ _id: f.document.createdBy });
    await db.collection('legacyaccountmaps').insertOne({
      source: f.manifest.sourceOrigin,
      sourceUserId: 7,
      userId: f.document.createdBy,
      state: 'complete',
    });
    const result = await runContentImport({
      client,
      db,
      manifest: f.manifest,
      store: f.store,
      readMedia: async () => f.bytes,
      apply: true,
      journal: async () => {},
      authorization: { ...f.authorize(), targetDatabase: db.databaseName },
    });
    assert.equal(result.verifiedComplete, 1);
    assert.equal(f.puts(), 1);
    assert.equal(
      await db
        .collection('migrationgroups')
        .countDocuments({ state: 'complete' }),
      1,
    );
  } finally {
    await client.close();
    await single.stop();
    await f.close();
  }
});

test('verified group completion persists identities and reruns preserve curator edits', async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.run({ apply: true, authorization: f.authorize() }))
        .verifiedComplete,
      1,
    );
    assert.equal(
      await f.db
        .collection('migrationclaims')
        .countDocuments({ state: 'complete' }),
      3,
    );
    assert.equal(
      await f.db
        .collection('migrationreceipts')
        .countDocuments({ state: 'complete' }),
      1,
    );
    const index = await readContentCompletionIndex(
      f.db,
      f.manifest.sourceOrigin,
    );
    assert.deepEqual(index.completeGroups[0].sourceIds, [10, 11]);
    assert.deepEqual(index.completeGroups[0].sourceCommentIds, [90]);
    await f.db
      .collection('retirementmessages')
      .updateOne(
        { _id: f.document._id },
        { $set: { message: 'Curator edited', status: 'published' } },
      );
    await f.db
      .collection('comments')
      .updateOne({ _id: f.comment._id }, { $set: { body: 'Curated comment' } });
    await f.db
      .collection('mediaassets')
      .updateOne(
        { _id: f.assetId },
        { $set: { displayName: 'Curated asset name' } },
      );
    const before = await f.db
      .collection('retirementmessages')
      .findOne({ _id: f.document._id });
    const again = await f.run({ apply: true, authorization: f.authorize() });
    assert.equal(again.reusedComplete, 1);
    assert.deepEqual(
      await f.db
        .collection('retirementmessages')
        .findOne({ _id: f.document._id }),
      before,
    );
    assert.equal(
      (await f.db.collection('comments').findOne({ _id: f.comment._id })).body,
      'Curated comment',
    );
    assert.equal(
      (await f.db.collection('mediaassets').findOne({ _id: f.assetId }))
        .displayName,
      'Curated asset name',
    );
    assert.equal(f.puts(), 1);
    assert.equal(await f.db.collection('comments').countDocuments(), 1);
  } finally {
    await f.close();
  }
});

test('every interrupted dependency/write/checkpoint boundary resumes without duplicates or premature completion', async (t) => {
  for (const boundary of [
    'after-reservation',
    'after-object-put',
    'after-media-verification',
    'after-content-write',
    'after-comment-write',
    'after-readback',
    'before-completion',
    'after-commit',
  ])
    await t.test(boundary, async () => {
      const f = await fixture();
      try {
        await assert.rejects(
          f.run({
            apply: true,
            authorization: f.authorize(),
            hook: async (name) => {
              if (name === boundary) throw new Error('synthetic interruption');
            },
          }),
          /synthetic interruption/,
        );
        const afterCommit = boundary === 'after-commit';
        assert.equal(
          await f.db
            .collection('migrationgroups')
            .countDocuments({ state: 'complete' }),
          afterCommit ? 1 : 0,
        );
        assert.equal(
          await f.db.collection('retirementmessages').countDocuments(),
          [
            'after-content-write',
            'after-comment-write',
            'after-readback',
            'before-completion',
            'after-commit',
          ].includes(boundary)
            ? 1
            : 0,
        );
        assert.equal(
          await f.db.collection('comments').countDocuments(),
          [
            'after-comment-write',
            'after-readback',
            'before-completion',
            'after-commit',
          ].includes(boundary)
            ? 1
            : 0,
        );
        assert.equal(
          f.journal.some((e) => e.state === 'complete'),
          false,
        );
        assert.equal(
          (await readContentCompletionIndex(f.db, f.manifest.sourceOrigin))
            .completeGroups.length,
          afterCommit ? 1 : 0,
        );
        await f.run({ apply: true, authorization: f.authorize() });
        assert.equal(
          await f.db.collection('retirementmessages').countDocuments(),
          1,
        );
        assert.equal(await f.db.collection('comments').countDocuments(), 1);
        assert.equal(
          await f.db
            .collection('migrationgroups')
            .countDocuments({ state: 'complete' }),
          1,
        );
        assert.equal(f.puts(), 1);
        assert(f.journal.length);
      } finally {
        await f.close();
      }
    });
});

test('foreign content, comment parents, changed maps and object bytes are held without overwrite', async (t) => {
  for (const scenario of ['content', 'comment', 'mapping', 'object', 'public'])
    await t.test(scenario, async () => {
      const f = await fixture();
      try {
        if (scenario === 'content')
          await f.db.collection('newsarticles').insertOne({
            legacy: { sourcePostIds: [10] },
            title: 'Existing curated article',
          });
        if (scenario === 'comment')
          await f.db
            .collection('comments')
            .insertOne({ ...f.comment, parentId: new ObjectId() });
        if (scenario === 'mapping')
          await f.db
            .collection('legacyaccountmaps')
            .updateOne(
              { sourceUserId: 7 },
              { $set: { userId: new ObjectId() } },
            );
        if (scenario === 'object')
          f.objects.set(f.key, Buffer.from('wrong object'));
        if (scenario === 'public') {
          f.objects.set(f.key, f.bytes);
          f.wrongPublic();
        }
        await assert.rejects(
          f.run({ apply: true, authorization: f.authorize() }),
        );
        assert.equal(
          await f.db
            .collection('migrationgroups')
            .countDocuments({ state: 'complete' }),
          0,
        );
        if (scenario !== 'comment')
          assert.equal(await f.db.collection('comments').countDocuments(), 0);
      } finally {
        await f.close();
      }
    });
});

test('changed pending manifests cannot resume a reserved source group', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run({
        apply: true,
        authorization: f.authorize(),
        hook: async (name) => {
          if (name === 'after-reservation') throw new Error('stop');
        },
      }),
    );
    f.manifest.groups[0].document.message = 'Changed prepared copy';
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /GROUP_MANIFEST_CHANGED/,
    );
    assert.equal(
      await f.db.collection('retirementmessages').countDocuments(),
      0,
    );
  } finally {
    await f.close();
  }
});

test('concurrent importer is rejected; changed lock token stops stale writes', async () => {
  const f = await fixture();
  try {
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = f.run({
      apply: true,
      authorization: f.authorize(),
      hook: async (name) => {
        if (name === 'after-reservation') {
          entered();
          await gate;
        }
      },
    });
    await waiting;
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /IMPORT_ALREADY_RUNNING/,
    );
    await f.db
      .collection('migrationlocks')
      .updateOne({}, { $set: { token: 'synthetic stolen lease' } });
    release();
    await assert.rejects(first, /IMPORT_LOCK_LOST/);
    assert.equal(
      await f.db.collection('retirementmessages').countDocuments(),
      0,
    );
  } finally {
    await f.close();
  }
});

test('exact pre-existing content/comments and verified reused media are adopted without mutation', async () => {
  const f = await fixture();
  try {
    const oldAsset = {
      _id: f.assetId,
      key: f.key,
      displayName: 'Existing curator label',
    };
    await f.db.collection('mediaassets').insertOne(oldAsset);
    f.objects.set(f.key, f.bytes);
    delete f.manifest.media[0].assetDocument;
    f.manifest.media[0].existingAssetId = String(f.assetId);
    await f.db.collection('retirementmessages').insertOne(f.document);
    await f.db.collection('comments').insertOne(f.comment);
    const contentBefore = canonical(
      await f.db
        .collection('retirementmessages')
        .findOne({ _id: f.document._id }),
    );
    await f.run({ apply: true, authorization: f.authorize() });
    assert.equal(f.puts(), 0);
    assert.deepEqual(
      await f.db.collection('mediaassets').findOne({ _id: f.assetId }),
      oldAsset,
    );
    assert.equal(
      canonical(
        await f.db
          .collection('retirementmessages')
          .findOne({ _id: f.document._id }),
      ),
      contentBefore,
    );
    assert.equal(await f.db.collection('comments').countDocuments(), 1);
  } finally {
    await f.close();
  }
});

test('missing completed dependencies or receipts do not silently reimport', async () => {
  const f = await fixture();
  try {
    await f.run({ apply: true, authorization: f.authorize() });
    await f.db.collection('migrationreceipts').deleteOne({});
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /COMPLETION_RECEIPT_MISSING/,
    );
    assert.equal(await f.db.collection('comments').countDocuments(), 1);
  } finally {
    await f.close();
  }
});

test('completed objects missing from storage are held, not silently restored', async () => {
  const f = await fixture();
  try {
    await f.run({ apply: true, authorization: f.authorize() });
    f.objects.delete(f.key);
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /REUSED_OR_COMPLETED_OBJECT_MISSING/,
    );
    assert.equal(f.puts(), 1);
    assert.equal(
      await f.db
        .collection('migrationgroups')
        .countDocuments({ state: 'complete' }),
      1,
    );
  } finally {
    await f.close();
  }
});

test('a hundred groups complete and rerun using one shared object without duplicate writes', async () => {
  const f = await fixture();
  try {
    const template = structuredClone(f.manifest.groups[0]);
    f.manifest.groups = [];
    for (let i = 0; i < 100; i++) {
      const g = structuredClone(template);
      g.key = `retirement:scale-${i}`;
      g.sourceIds = [2000 + i * 2, 2001 + i * 2];
      g.comments = [];
      const d = EJSON.deserialize(g.document);
      d._id = new ObjectId();
      d.legacy.sourcePostIds = g.sourceIds;
      d.legacy.sourceRecords = g.sourceIds.map((sourceId) => ({ sourceId }));
      g.document = EJSON.serialize(d, { relaxed: false });
      f.manifest.groups.push(g);
    }
    const first = await f.run({ apply: true, authorization: f.authorize() });
    assert.equal(first.verifiedComplete, 100);
    assert.equal(
      await f.db
        .collection('migrationclaims')
        .countDocuments({ state: 'complete' }),
      200,
    );
    assert.equal(
      await f.db.collection('migrationreceipts').countDocuments(),
      100,
    );
    assert.equal(f.puts(), 1);
    assert.equal(
      (await f.run({ apply: true, authorization: f.authorize() }))
        .reusedComplete,
      100,
    );
    assert.equal(
      await f.db.collection('retirementmessages').countDocuments(),
      100,
    );
  } finally {
    await f.close();
  }
});

test('every individual durable write can be interrupted and resumed on standalone Mongo', async (t) => {
  const baseline = await fixture();
  const boundaries = [];
  try {
    await baseline.run({
      apply: true,
      authorization: baseline.authorize(),
      hook: async (name, detail) => {
        if (name === 'after-durable-write') boundaries.push(detail.boundary);
      },
    });
  } finally {
    await baseline.close();
  }
  assert(boundaries.includes('after-receipt-write'));
  assert(boundaries.includes('after-group-completion'));
  for (let target = 0; target < boundaries.length; target++)
    await t.test(`${target}:${boundaries[target]}`, async () => {
      const f = await fixture();
      let writes = 0;
      try {
        await assert.rejects(
          f.run({
            apply: true,
            authorization: f.authorize(),
            hook: async (name) => {
              if (name === 'after-durable-write' && writes++ === target)
                throw Error('individual interruption');
            },
          }),
          /individual interruption/,
        );
        const index = await readContentCompletionIndex(
          f.db,
          f.manifest.sourceOrigin,
        );
        assert.equal(
          index.completeGroups.length,
          boundaries[target] === 'after-group-completion' ? 1 : 0,
        );
        await f.run({ apply: true, authorization: f.authorize() });
        assert.equal(
          await f.db.collection('retirementmessages').countDocuments(),
          1,
        );
        assert.equal(await f.db.collection('comments').countDocuments(), 1);
        assert.equal(await f.db.collection('mediaassets').countDocuments(), 1);
        assert.equal(
          await f.db.collection('migrationreceipts').countDocuments(),
          1,
        );
        assert.equal(
          (await readContentCompletionIndex(f.db, f.manifest.sourceOrigin))
            .completeGroups.length,
          1,
        );
        assert.equal(f.puts(), 1);
      } finally {
        await f.close();
      }
    });
});

test('abandoned locks never expire; recovery requires stopped-writer confirmation and exact token', async () => {
  const f = await fixture();
  try {
    await f.db.collection('migrationlocks').insertOne({
      _id: f.manifest.targetOrigin,
      token: 'abandoned-synthetic-token',
      expiresAt: new Date(0),
    });
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /IMPORT_ALREADY_RUNNING/,
    );
    for (const lockRecovery of [
      {
        abandonedToken: 'abandoned-synthetic-token',
        priorWriterStopped: false,
      },
      { abandonedToken: 'wrong-token', priorWriterStopped: true },
    ])
      await assert.rejects(
        f.run({
          apply: true,
          authorization: { ...f.authorize(), lockRecovery },
        }),
      );
    assert.equal(await f.db.collection('migrationgroups').countDocuments(), 0);
    assert.equal(
      (
        await f.run({
          apply: true,
          authorization: {
            ...f.authorize(),
            lockRecovery: {
              abandonedToken: 'abandoned-synthetic-token',
              priorWriterStopped: true,
            },
          },
        })
      ).verifiedComplete,
      1,
    );
  } finally {
    await f.close();
  }
});

test('partial curator edits and conflicting receipt ownership stop recovery without overwrite', async (t) => {
  for (const scenario of ['content', 'comment', 'receipt', 'missing-claim'])
    await t.test(scenario, async () => {
      const f = await fixture();
      try {
        const boundary =
          scenario === 'content'
            ? 'after-content-write'
            : scenario === 'comment'
              ? 'after-comment-write'
              : 'after-receipt-write';
        await assert.rejects(
          f.run({
            apply: true,
            authorization: f.authorize(),
            hook: async (name) => {
              if (name === boundary) throw Error('stop');
            },
          }),
        );
        if (scenario === 'content')
          await f.db
            .collection('retirementmessages')
            .updateOne({}, { $set: { message: 'Edited while pending' } });
        if (scenario === 'comment')
          await f.db
            .collection('comments')
            .updateOne({}, { $set: { body: 'Edited while pending' } });
        if (scenario === 'receipt')
          await f.db
            .collection('migrationreceipts')
            .updateOne({}, { $set: { sourceIds: [999] } });
        if (scenario === 'missing-claim')
          await f.db
            .collection('migrationclaims')
            .updateOne({}, { $set: { groupDigest: 'foreign' } });
        await assert.rejects(
          f.run({ apply: true, authorization: f.authorize() }),
        );
        assert.equal(
          await f.db
            .collection('migrationgroups')
            .countDocuments({ state: 'complete' }),
          0,
        );
        if (scenario === 'content')
          assert.equal(
            (await f.db.collection('retirementmessages').findOne({})).message,
            'Edited while pending',
          );
        if (scenario === 'comment')
          assert.equal(
            (await f.db.collection('comments').findOne({})).body,
            'Edited while pending',
          );
      } finally {
        await f.close();
      }
    });
});

test('failed step journal and final journal recover from canonical database progress', async (t) => {
  for (const failState of ['pending', 'complete'])
    await t.test(failState, async () => {
      const f = await fixture();
      try {
        await assert.rejects(
          f.run({
            apply: true,
            authorization: f.authorize(),
            journal: async (e) => {
              if (e.state === failState) throw Error('journal unavailable');
            },
          }),
          /journal unavailable/,
        );
        await f.run({ apply: true, authorization: f.authorize() });
        assert.equal(
          await f.db.collection('retirementmessages').countDocuments(),
          1,
        );
        assert.equal(await f.db.collection('comments').countDocuments(), 1);
        assert(f.journal.some((e) => e.state === 'complete'));
      } finally {
        await f.close();
      }
    });
});

test('hard-killed standalone writer leaves lock and partial checkpoint recoverable only after process exit', async () => {
  const f = await fixture();
  try {
    const engine =
      require.resolve('../../scripts/migration/lib/content-import');
    const driver = require.resolve('mongoose');
    const program = `
      let input=''; process.stdin.on('data',b=>input+=b); process.stdin.on('end',async()=>{
        const p=JSON.parse(input);const {MongoClient}=require(${JSON.stringify(driver)}).mongo;
        const client=new MongoClient(p.uri);await client.connect();
        await require(${JSON.stringify(engine)}).runContentImport({db:client.db(),manifest:p.manifest,
          store:{target:p.storageTarget},readMedia:async()=>Buffer.from(p.bytes),
          apply:true,authorization:p.authorization,journal:async()=>{},
          hook:async(name)=>{if(name==='after-group-reservation')process.kill(process.pid,'SIGKILL');}
        });
      });`;
    const child = spawn(process.execPath, ['-e', program], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (b) => {
      errors += b;
    });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    child.stdin.end(
      JSON.stringify({
        uri: mongo.getUri(f.db.databaseName),
        manifest: f.manifest,
        bytes: [...f.bytes],
        authorization: f.authorize(),
        storageTarget: f.store.target,
      }),
    );
    const result = await exited;
    assert.equal(result.signal, 'SIGKILL', errors);
    assert.equal(
      await f.db
        .collection('migrationgroups')
        .countDocuments({ state: 'pending' }),
      1,
    );
    const abandoned = await f.db.collection('migrationlocks').findOne({});
    assert(abandoned);
    await assert.rejects(
      f.run({ apply: true, authorization: f.authorize() }),
      /IMPORT_ALREADY_RUNNING/,
    );
    await f.run({
      apply: true,
      authorization: {
        ...f.authorize(),
        lockRecovery: {
          priorWriterStopped: true,
          abandonedToken: abandoned.token,
        },
      },
    });
    assert.equal(
      (await readContentCompletionIndex(f.db, f.manifest.sourceOrigin))
        .completeGroups.length,
      1,
    );
    assert.equal(await f.db.collection('migrationlocks').countDocuments(), 0);
  } finally {
    await f.close();
  }
});

test('unfinished media URL and metadata conflicts cannot complete on resume', async (t) => {
  for (const patch of [
    { url: 'https://different.example/changed.png' },
    { 'fileMetadata.sha256': 'changed' },
    { displayName: 'Edited while unfinished' },
  ])
    await t.test(Object.keys(patch)[0], async () => {
      const f = await fixture();
      try {
        await assert.rejects(
          f.run({
            apply: true,
            authorization: f.authorize(),
            hook: async (name) => {
              if (name === 'after-media-record-write')
                throw Error('stop after media');
            },
          }),
        );
        await f.db
          .collection('mediaassets')
          .updateOne({ _id: f.assetId }, { $set: patch });
        const before = await f.db
          .collection('mediaassets')
          .findOne({ _id: f.assetId });
        await assert.rejects(
          f.run({ apply: true, authorization: f.authorize() }),
          /UNFINISHED_MEDIA_RECORD_CHANGED_NO_OVERWRITE/,
        );
        assert.deepEqual(
          await f.db.collection('mediaassets').findOne({ _id: f.assetId }),
          before,
        );
        assert.equal(
          await f.db
            .collection('migrationgroups')
            .countDocuments({ state: 'complete' }),
          0,
        );
        assert.equal(
          await f.db.collection('retirementmessages').countDocuments(),
          0,
        );
      } finally {
        await f.close();
      }
    });
});
