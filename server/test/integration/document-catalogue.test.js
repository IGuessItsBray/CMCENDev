const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'document-catalogue-test-secret';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'test';
process.env.MINIO_SECRET_KEY = 'test';
process.env.MINIO_BUCKET_NAME = 'test';
process.env.CDN_PUBLIC_BASE_URL = 'https://media.example.test';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Document = require('../../models/ArchiveDocument');
const User = require('../../models/User');
const Page = require('../../models/Page');
const Article = require('../../models/NewsArticle');
const {
  planMigration,
  applyMigration,
  seedRecord,
  cards,
  digest,
  listIndexes,
} = require('../../services/document-migration');
const app = express();
app.use(express.json());
app.use(require('../../routes/page-content'));
app.use('/api/search', require('../../routes/search'));
app.use(
  '/api/admin/archive-staff-review',
  require('../../routes/archive-staff-review'),
);
let mongo, editor, subscriber, editorToken, subscriberToken, originalCatalogue;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Document.init();
  editor = new mongoose.Types.ObjectId();
  subscriber = new mongoose.Types.ObjectId();
  await User.collection.insertMany([
    {
      _id: editor,
      username: 'editor-docs',
      email: 'editor-docs@example.test',
      role: 'editor',
      sessionVersion: 0,
    },
    {
      _id: subscriber,
      username: 'reader-docs',
      email: 'reader-docs@example.test',
      role: 'subscriber',
      sessionVersion: 0,
    },
  ]);
  editorToken = jwt.sign(
    { userId: String(editor), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  subscriberToken = jwt.sign(
    { userId: String(subscriber), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('absent collection preview is read-only and apply creates the complete catalogue', async () => {
  const fresh = mongoose.connection.db.collection('absent_catalogue_test');
  assert.deepEqual(await listIndexes(fresh), []);
  assert.equal(
    await mongoose.connection.db
      .listCollections({ name: fresh.collectionName })
      .hasNext(),
    false,
  );
  const plan = planMigration(
    await fresh.find({}).toArray(),
    await listIndexes(fresh),
  );
  assert.equal(plan.counts.insert, 84);
  await applyMigration(fresh, plan, plan.sha256);
  assert.equal(await fresh.countDocuments(), 84);
  assert.equal(
    (await listIndexes(fresh)).find((index) => index.key.sourceId === 1).unique,
    true,
  );
});

test('operator CLI previews an absent database without creating it and requires an exact plan and exclusive backup', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const {
    main,
  } = require('../../scripts/migration/migrate-document-catalogue');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-cli-test-'));
  const savedUri = process.env.MONGO_URI;
  process.env.MONGO_URI = mongo.getUri('catalogue_cli_test');
  try {
    const preview = await main(['--database', 'catalogue_cli_test']);
    assert.equal(preview.mode, 'database-preview');
    assert.equal(preview.counts.insert, 84);
    await assert.rejects(
      main(['--database', 'wrong_database']),
      /Database mismatch/u,
    );
    await assert.rejects(
      main([
        '--database',
        'catalogue_cli_test',
        '--apply',
        '--expected-plan',
        'wrong',
        '--backup',
        path.join(folder, 'wrong.json'),
      ]),
      /Exact reviewed plan/u,
    );
    assert.equal(fs.existsSync(path.join(folder, 'wrong.json')), false);
    const backup = path.join(folder, 'backup.json');
    const applied = await main([
      '--database',
      'catalogue_cli_test',
      '--apply',
      '--expected-plan',
      preview.sha256,
      '--backup',
      backup,
    ]);
    assert.equal(applied.mode, 'applied');
    assert.equal(applied.counts.preserve, 84);
    assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')), {
      documents: [],
      indexes: [],
    });
    const repeated = await main(['--database', 'catalogue_cli_test']);
    assert.equal(repeated.counts.insert, 0);
    await assert.rejects(
      main([
        '--database',
        'catalogue_cli_test',
        '--apply',
        '--expected-plan',
        repeated.sha256,
        '--backup',
        backup,
      ]),
      /EEXIST/u,
    );
    await assert.rejects(
      main(['--snapshot', backup, '--apply']),
      /preview-only/u,
    );
  } finally {
    if (savedUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = savedUri;
    fs.rmSync(folder, { recursive: true });
  }
});

test('fresh and partial migrations return 503; interrupted writes restart safely without changing numeric source identities', async () => {
  await request(app).get('/page-content/document-library.json').expect(503);
  const restart = mongoose.connection.db.collection('catalogue_restart_test');
  await restart.createIndex({ sourceId: 1 }, { unique: true });
  const dynamic = {
    _id: new mongoose.Types.ObjectId(),
    sourceId: 54321,
    fileKey: 'documents/library/staff.pdf',
    status: 'draft',
    title: { en: 'Staff draft' },
  };
  await restart.insertOne(dynamic);
  const before = digest(await restart.findOne({ _id: dynamic._id }));
  const plan = planMigration(
    await restart.find({}).toArray(),
    await restart.listIndexes().toArray(),
  );
  let inserts = 0;
  const interrupted = new Proxy(restart, {
    get(target, key) {
      if (key === 'insertOne')
        return async (...args) => {
          if (++inserts === 6)
            throw new Error('Simulated process interruption');
          return target.insertOne(...args);
        };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await assert.rejects(
    applyMigration(interrupted, plan, plan.sha256),
    /Simulated process interruption/u,
  );
  assert.equal(
    await restart.countDocuments({ catalogueId: { $exists: true } }),
    5,
  );
  await Document.collection.insertMany(cards.slice(0, 5).map(seedRecord));
  await request(app).get('/page-content/document-library.json').expect(503);
  await Document.collection.deleteMany({ catalogueId: { $exists: true } });
  const resumed = planMigration(
    await restart.find({}).toArray(),
    await restart.listIndexes().toArray(),
  );
  assert.deepEqual(resumed.counts, { insert: 79, adopt: 0, preserve: 5 });
  await applyMigration(restart, resumed, resumed.sha256);
  assert.equal(digest(await restart.findOne({ _id: dynamic._id })), before);
  await assert.rejects(
    restart.insertOne({ sourceId: 54321 }),
    (error) => error.code === 11000,
  );
  assert.equal(await restart.countDocuments(), 85);
});

test('disposable migration preserves dynamic records, is idempotent, and serves 84 compatible cards', async () => {
  const dynamic = await Document.create({
    sourceId: 123456,
    legacy: { source: 'https://cmcen-rcmce.ca', originalStatus: 'publish' },
    organization: 'branch',
    type: 'policy',
    fileKey: 'documents/library/independent.pdf',
    title: { en: 'Independent policy' },
    status: 'published',
  });
  const before = digest(
    await Document.collection.findOne({ _id: dynamic._id }),
  );
  const plan = planMigration(
    await Document.collection.find({}).toArray(),
    await Document.collection.listIndexes().toArray(),
  );
  assert.equal(plan.counts.insert, 84);
  assert.equal(plan.untouchedDynamicRecords, 1);
  const rerun = await applyMigration(Document.collection, plan, plan.sha256);
  assert.deepEqual(rerun.counts, { insert: 0, adopt: 0, preserve: 84 });
  await applyMigration(Document.collection, rerun, rerun.sha256);
  assert.equal(
    digest(await Document.collection.findOne({ _id: dynamic._id })),
    before,
  );
  const complete = await request(app)
    .get('/page-content/document-library.json')
    .expect(200);
  originalCatalogue = {
    ...complete.body,
    documents: complete.body.documents.slice(0, 84),
  };
  assert.deepEqual(
    complete.body.documents.slice(0, 84).map((item) => item.id),
    cards.map((item) => item.id),
  );
  for (const [order, card] of cards.entries()) {
    const actual = complete.body.documents[order];
    for (const field of ['id', 'organization', 'type', 'en', 'fr'])
      assert.deepEqual(actual[field], card[field]);
    assert.equal(actual.pageUrl, card.pageUrl || '');
    assert.equal(actual.fileKey, card.fileKey);
    assert.equal(
      actual.fileUrl,
      card.fileKey ? `https://media.example.test/${card.fileKey}` : undefined,
    );
  }
  const queueRoute =
    '/api/admin/archive-staff-review/archiveDocument?status=all';
  await request(app).get(queueRoute).expect(401);
  await request(app)
    .get(queueRoute)
    .set('Authorization', `Bearer ${subscriberToken}`)
    .expect(403);
  let offset = 0;
  const queueIds = [];
  do {
    const queue = await request(app)
      .get(`${queueRoute}&offset=${offset}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
    queueIds.push(...queue.body.items.map((item) => item.id));
    offset = queue.body.nextOffset;
  } while (offset !== null);
  const migrated = await Document.find({
    catalogueId: { $exists: true },
  }).lean();
  assert.equal(migrated.length, 84);
  assert.ok(migrated.every((item) => queueIds.includes(String(item._id))));
  await Document.updateOne(
    { catalogueId: cards[0].id },
    { $set: { 'title.en': 'Staff-edited title' } },
  );
  const edited = planMigration(await Document.collection.find({}).toArray());
  assert.equal(edited.counts.preserve, 84);
  assert.equal(edited.counts.insert, 0);
  const response = await request(app)
    .get('/page-content/document-library.json')
    .expect(200);
  assert.equal(response.body.documents.length, 85);
  assert.equal(
    new Set(response.body.documents.map((item) => item.id)).size,
    85,
  );
  const missing = response.body.documents.find(
    (item) => item.id === 'foundation-annual-report-2024-2025',
  );
  assert.equal(missing.fileUrl, undefined);
  assert.equal(missing.en.dateLabel, '2024–2025');
  assert.ok(response.body.en.library.organizations.length);
  assert.ok(response.body.documents.every((item) => !('legacy' in item)));
});

test('existing nonpartial source index is previewed and replaced locally; missing IDs do not collide', async () => {
  await Document.collection.dropIndex('sourceId_1');
  // Use a separate disposable collection with the legacy index to represent the old deployment.
  const legacy = mongoose.connection.db.collection(
    'legacy_document_index_test',
  );
  await legacy.createIndex({ sourceId: 1 }, { unique: true });
  const plan = planMigration([], await legacy.listIndexes().toArray());
  assert.equal(plan.indexChanges.length, 1);
  await applyMigration(legacy, plan, plan.sha256);
  assert.equal(await legacy.countDocuments(), 84);
  await Document.collection.createIndex(
    { sourceId: 1 },
    {
      unique: true,
      partialFilterExpression: { sourceId: { $type: 'number' } },
    },
  );
});

test('preview refuses collisions and changed destination before index or data mutation', async () => {
  const plan = planMigration(
    await Document.collection.find({}).toArray(),
    await Document.collection.listIndexes().toArray(),
  );
  await Document.updateOne(
    { catalogueId: cards[1].id },
    { $set: { 'description.en': 'A new staff change' } },
  );
  await assert.rejects(
    applyMigration(Document.collection, plan, plan.sha256),
    /Destination changed/u,
  );
  const other = seedRecord(cards[2]);
  delete other.catalogueId;
  other._id = new mongoose.Types.ObjectId();
  await Document.collection.insertOne(other);
  const collision = planMigration(
    await Document.collection.find({}).toArray(),
    await Document.collection.listIndexes().toArray(),
  );
  assert.ok(collision.conflicts.length);
  await assert.rejects(
    applyMigration(Document.collection, collision, collision.sha256),
    /conflict-free/u,
  );
  await Document.collection.deleteOne({ _id: other._id });
});

test('bilingual site search returns document anchors and excludes drafts; public catalogue excludes drafts', async () => {
  await Document.create({
    catalogueId: 'private-document',
    organization: 'branch',
    type: 'policy',
    fileKey: 'documents/library/private.pdf',
    title: { en: 'Hidden needle', fr: 'Aiguille cachée' },
    status: 'draft',
  });
  const english = await request(app)
    .get('/api/search?q=Heritage Awards Application&lang=en')
    .expect(200);
  assert.ok(
    english.body.results.some(
      (item) =>
        item.type === 'document' &&
        item.url === '/document-library#heritage-awards-application',
    ),
  );
  const french = await request(app)
    .get('/api/search?q=Formulaire de candidature&lang=fr')
    .expect(200);
  assert.ok(
    french.body.results.some(
      (item) => item.type === 'document' && item.title.startsWith('Formulaire'),
    ),
  );
  const hidden = await request(app)
    .get('/api/search?q=Hidden needle')
    .expect(200);
  assert.ok(
    !hidden.body.results.some((item) => item.sourceId === 'private-document'),
  );
  const library = await request(app)
    .get('/page-content/document-library.json')
    .expect(200);
  assert.ok(
    !library.body.documents.some((item) => item.id === 'private-document'),
  );
});

test('usage endpoint requires authorization and counts unique permitted parents, omitting restricted titles', async () => {
  const document = await Document.findOne({
    catalogueId: 'heritage-awards-application',
  });
  const link = `/${document.fileKey}`;
  await Page.collection.insertMany([
    {
      title: { en: 'Public use' },
      slug: 'public-use',
      status: 'published',
      access: { audience: 'public' },
      blocks: [
        { type: 'button', url: link },
        { type: 'text', body: { en: `<a href="${link}">Again</a>` } },
      ],
    },
    {
      title: { en: 'Restricted secret' },
      slug: 'restricted-use',
      status: 'published',
      access: { audience: 'restricted', roles: ['developer'] },
      blocks: [{ type: 'button', url: link }],
    },
    {
      title: { en: 'Draft use' },
      slug: 'draft-use',
      status: 'draft',
      access: { audience: 'public' },
      blocks: [{ type: 'button', url: link }],
    },
  ]);
  await Article.create({
    title: { en: 'Draft article use' },
    content: { en: '' },
    layout: 'newsletter',
    newsletterBlocks: {
      en: [{ type: 'document', label: 'Application', href: link }],
      fr: [{ type: 'document', label: 'Application', href: link }],
    },
    status: 'draft',
    createdBy: editor,
  });
  const route = `/api/admin/archive-staff-review/archiveDocument/${document._id}/usage`;
  await request(app).get(route).expect(401);
  await request(app)
    .get(route)
    .set('Authorization', `Bearer ${subscriberToken}`)
    .expect(403);
  const result = await request(app)
    .get(route)
    .set('Authorization', `Bearer ${editorToken}`)
    .expect(200);
  assert.equal(result.body.count, 3);
  assert.ok(
    !result.body.references.some((item) => item.title === 'Restricted secret'),
  );
  assert.ok(result.body.references.every((item) => item.href.startsWith('/')));
  const detail = await request(app)
    .get(route.replace('/usage', ''))
    .set('Authorization', `Bearer ${editorToken}`)
    .expect(200);
  assert.equal(detail.body.record.canEditArchive, false);
  if (process.env.CATALOGUE_QA_OUTPUT) {
    const queue = [];
    let offset = 0;
    do {
      const response = await request(app)
        .get(
          `/api/admin/archive-staff-review/archiveDocument?status=all&offset=${offset}`,
        )
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);
      queue.push(...response.body.items);
      offset = response.body.nextOffset;
    } while (offset !== null);
    require('node:fs').writeFileSync(
      process.env.CATALOGUE_QA_OUTPUT,
      JSON.stringify(
        {
          scenario:
            'Sanitized disposable integration database; no live data or credentials',
          catalogue: originalCatalogue,
          queue: queue.filter((item) =>
            originalCatalogue.documents.some(
              (card) => String(seedRecord(card)._id) === item.id,
            ),
          ),
          detail: detail.body,
          usage: result.body,
          permissions: require('../../config/permissions').getUserPermissions({
            role: 'editor',
          }),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  await request(app)
    .patch(route.replace('/usage', ''))
    .set('Authorization', `Bearer ${editorToken}`)
    .send({})
    .expect(404);
});
