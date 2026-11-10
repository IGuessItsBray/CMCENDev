const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
Object.assign(process.env, {
  JWT_SECRET: 'integration-test-jwt-secret', NODE_ENV: 'test',
  DISABLE_EMAIL_SENDING: 'true', APP_BASE_URL: 'http://localhost:3000',
  MINIO_ENDPOINT: 'http://127.0.0.1:9000', MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000',
  MINIO_ACCESS_KEY: 'integration-test', MINIO_SECRET_KEY: 'integration-test',
  MINIO_BUCKET_NAME: 'integration-test', CDN_PUBLIC_BASE_URL: 'https://cdn.example.test/integration-test',
  PLAUSIBLE_DOMAIN: '', PLAUSIBLE_API_URL: '',
});
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Event = require('../../models/Event');
const Comment = require('../../models/Comment');
const NewsArticle = require('../../models/NewsArticle');
const RetirementMessage = require('../../models/RetirementMessage');
const LastPostMessage = require('../../models/LastPostMessage');
const ContentRevision = require('../../models/ContentRevision');
const AuditLog = require('../../models/AuditLog');
const { recordContentRevision } = require('../../services/content-revisions');
const { createSessionToken } = require('../../services/auth-session');
let mongo;
let sequence = 0;

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'cmcen-revert-tests' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function user(overrides = {}) {
  sequence += 1;
  return User.create({ username: `revert-${sequence}@example.test`, email: `revert-${sequence}@example.test`,
    password: 'Correct-Horse-Integration-1!', accountName: 'Revert Tester', firstName: 'Test', lastName: 'Editor',
    address: { line1: '1 Test Way', city: 'Ottawa', country: 'Canada', stateProvince: 'Ontario', postalCode: 'K1A 0A1' },
    rank: 'Captain', currentUnit: 'Test Unit', status: 'regular', affiliationElement: 'army', preferredLanguage: 'en',
    role: 'editor', emailVerification: { required: false, verified: true, verifiedAt: new Date() }, ...overrides });
}
const auth = (actor) => `Bearer ${createSessionToken(actor)}`;
const path = (type, content) => `/api/admin/content/${type}/${content._id}/revisions`;
const history = (actor, type, content) => request(app).get(path(type, content)).set('Authorization', auth(actor));
const revert = (actor, type, content, revision, version) => request(app)
  .post(`${path(type, content)}/${revision._id}/revert`).set('Authorization', auth(actor)).send({ version });
async function eventFixture(overrides = {}, revisionOverrides = {}) {
  const actor = await user();
  const content = await Event.create({ title: { en: 'Current title', fr: 'Titre français' },
    description: { en: 'Current body', fr: 'Texte français' }, location: { en: 'Ottawa', fr: 'Ottawa' },
    registration: { en: '', fr: '' }, startDate: new Date('2027-01-01T12:00:00Z'),
    status: 'published', createdBy: actor._id, publishedBy: actor._id, publishedAt: new Date('2026-01-01'),
    submitter: { email: 'private@example.test', phone: '6135550100' }, ...overrides });
  const revision = await recordContentRevision({ contentType: 'event', content, actor, status: content.status,
    language: 'en', fields: ['title', 'description', 'location', 'registration', 'formattedBody'],
    before: { title: 'Previous title', description: 'Current body', location: 'Ottawa', registration: '', formattedBody: null },
    after: { title: 'Current title', description: 'Current body', location: 'Ottawa', registration: '', formattedBody: null },
    ...revisionOverrides });
  return { actor, content, revision };
}

test('revert requires authentication and exact type permissions for reads and writes', async () => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  await request(app).get(path('event', content)).expect(401);
  await request(app).post(`${path('event', content)}/${revision._id}/revert`).send({ version }).expect(401);
  const member = await user({ role: 'subscriber' });
  await history(member, 'event', content).expect(403);
  await revert(member, 'event', content, revision, version).expect(403);
  const newsRole = await Role.create({ name: 'News only', slug: 'news-only', permissions: ['news.manage'] });
  const newsOnly = await user({ role: 'subscriber', customRoles: [newsRole._id] });
  await history(newsOnly, 'event', content).expect(403);
  await revert(newsOnly, 'event', content, revision, version).expect(403);
  const reviewRole = await Role.create({ name: 'Review only', slug: 'review-only', permissions: ['content.review'] });
  const reviewOnly = await user({ role: 'subscriber', customRoles: [reviewRole._id] });
  const article = await NewsArticle.create({ title: { en: 'New', fr: '' }, content: { en: 'Copy', fr: '' }, createdBy: actor._id });
  const articleRevision = await recordContentRevision({ contentType: 'newsArticle', content: article, actor,
    status: article.status, language: 'en', fields: ['title'], before: { title: 'Old' }, after: { title: 'New' } });
  await history(reviewOnly, 'newsArticle', article).expect(403);
  await revert(reviewOnly, 'newsArticle', article, articleRevision, version).expect(403);
  const articleHistory = (await history(newsOnly, 'newsArticle', article).expect(200)).body;
  await revert(newsOnly, 'newsArticle', article, articleRevision, articleHistory.version).expect(200);
});

test('revert restores exact recorded language text and writes durable reverse revision and audit', async () => {
  const { actor, content, revision } = await eventFixture();
  const initial = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(initial.revisions[0].canRevert, true);
  assert.match(initial.version, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(initial).includes('private@example.test'), false);
  const result = (await revert(actor, 'event', content, revision, initial.version).expect(200)).body;
  const saved = await Event.findById(content._id).lean();
  assert.equal(saved.title.en, 'Previous title');
  assert.equal(saved.title.fr, 'Titre français');
  assert.deepEqual(saved.description, content.description.toObject());
  assert.equal(saved.status, 'published');
  assert.equal(saved.publishedAt.toISOString(), content.publishedAt.toISOString());
  assert.equal(String(saved.publishedBy), String(actor._id));
  assert.equal(saved.submitter.email, 'private@example.test');
  assert.equal(saved.submitter.phone, '6135550100');
  assert.notEqual(result.version, initial.version);
  const reverse = await ContentRevision.findById(result.revisionId).lean();
  assert.equal(reverse.action, 'staff_content_reverted');
  assert.equal(reverse.revertState, 'applied');
  assert.equal(String(reverse.revertedRevisionId), String(revision._id));
  assert.equal(reverse.before.title, 'Current title');
  assert.equal(reverse.after.title, 'Previous title');
  assert.equal(reverse.revertVersion, result.version);
  const audit = await AuditLog.findOne({ action: 'content.reverted', target: content._id }).lean();
  assert.equal(audit.metadata.revertedRevisionId, String(revision._id));
  assert.equal(audit.metadata.revisionId, result.revisionId);
  assert.equal(audit.metadata.before.title, 'Current title');
  assert.equal(audit.metadata.after.title, 'Previous title');
  assert.equal(audit.metadata.outcome, 'applied');
  const refreshed = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(refreshed.version, result.version);
  assert.equal(refreshed.revisions.find((item) => item._id === result.revisionId).canRevert, true);
  await revert(actor, 'event', content, reverse, result.version).expect(200);
  assert.equal((await Event.findById(content._id)).title.en, 'Current title');
});

test('missing legacy snapshots, wrong content revision, invalid IDs, and replacement payloads cannot be used', async () => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  await request(app).post(`${path('event', content)}/${revision._id}/revert`).set('Authorization', auth(actor))
    .send({ version, before: { title: 'Client supplied replacement' } }).expect(400);
  await revert(actor, 'event', content, { _id: 'not-an-id' }, version).expect(400);
  await revert(actor, 'event', content, { _id: new mongoose.Types.ObjectId() }, version).expect(404);
  const other = await Event.create({ title: { en: 'Different event' }, startDate: new Date() });
  const otherVersion = (await history(actor, 'event', other).expect(200)).body.version;
  await revert(actor, 'event', other, revision, otherVersion).expect(404);
  await ContentRevision.collection.updateOne({ _id: revision._id }, { $unset: { before: 1 } });
  const legacyHistory = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(legacyHistory.revisions[0].canRevert, false);
  await revert(actor, 'event', content, revision, version).expect(409);
  assert.equal((await Event.findById(content._id)).title.en, 'Current title');
  assert.equal(await AuditLog.countDocuments({ action: 'content.reverted' }), 0);
});

test('changed snapshots and unsupported mixed revisions are rejected without partial restores', async () => {
  const { actor, content, revision } = await eventFixture();
  await Event.updateOne({ _id: content._id }, { $set: { 'description.en': 'Newer unrelated snapshot copy' } });
  let current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  await revert(actor, 'event', content, revision, current.version).expect(409);
  for (const field of ['status', 'imagePath', 'layout', 'submitter']) {
    await ContentRevision.updateOne({ _id: revision._id }, { $set: {
      fields: ['title', field], before: { title: 'Previous title', [field]: 'Before' }, after: { title: 'Current title', [field]: 'After' },
    } });
    current = (await history(actor, 'event', content).expect(200)).body;
    assert.equal(current.revisions[0].canRevert, false);
    await revert(actor, 'event', content, revision, current.version).expect(409);
  }
  assert.equal((await Event.findById(content._id)).title.en, 'Current title');
  assert.equal(await ContentRevision.countDocuments(), 1);
});

test('stale versions and concurrent duplicate requests cannot overwrite a newer edit', async () => {
  const { actor, content, revision } = await eventFixture();
  const oldVersion = (await history(actor, 'event', content).expect(200)).body.version;
  await Event.updateOne({ _id: content._id }, { $set: { 'title.fr': 'Une nouvelle traduction' } });
  await revert(actor, 'event', content, revision, oldVersion).expect(409);
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  const results = await Promise.all([revert(actor, 'event', content, revision, version), revert(actor, 'event', content, revision, version)]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await Event.findById(content._id)).title.fr, 'Une nouvelle traduction');
  assert.equal(await ContentRevision.countDocuments({ action: 'staff_content_reverted', revertState: 'applied' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'content.reverted' }), 1);
  await revert(actor, 'event', content, revision, version).expect(409);
});

test('atomic compare-and-swap rejects an edit arriving after the server reads the document', async (t) => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  const updateOne = Event.updateOne.bind(Event);
  t.mock.method(Event, 'updateOne', async (filter, update, options) => {
    await Event.collection.updateOne({ _id: content._id }, { $set: { 'title.en': 'Concurrent newer title', updatedAt: new Date(content.updatedAt.getTime() + 1000) } });
    return updateOne(filter, update, options);
  });
  await revert(actor, 'event', content, revision, version).expect(409);
  assert.equal((await Event.findById(content._id)).title.en, 'Concurrent newer title');
  assert.equal(await ContentRevision.countDocuments({ revertState: 'conflict' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'content.reverted' }), 0);
  assert.equal(await AuditLog.countDocuments({ action: 'content.revert_conflicted' }), 1);
});

test('body formatting and newsletter blocks are never resurrected or made inconsistent', async () => {
  const formatted = { version: 1, text: 'Current body', blocks: [{ type: 'paragraph', children: ['Current body'] }] };
  const { actor, content, revision } = await eventFixture({ formattedBody: { en: formatted } }, {
    fields: ['description'], before: { description: 'Older body' }, after: { description: 'Current body' },
  });
  let current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  await revert(actor, 'event', content, revision, current.version).expect(409);
  await ContentRevision.updateOne({ _id: revision._id }, { $set: { fields: ['description', 'formattedBody'],
    before: { description: 'Older body', formattedBody: null }, after: { description: 'Current body', formattedBody: formatted } } });
  current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  const article = await NewsArticle.create({ title: { en: 'Newsletter' }, content: { en: 'New body' }, layout: 'newsletter',
    newsletterBlocks: { en: [{ type: 'paragraph', children: ['New body'] }] }, createdBy: actor._id });
  const newsRevision = await recordContentRevision({ contentType: 'newsArticle', content: article, actor,
    status: article.status, language: 'en', fields: ['content'], before: { content: 'Old body' }, after: { content: 'New body' } });
  current = (await history(actor, 'newsArticle', article).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  await revert(actor, 'newsArticle', article, newsRevision, current.version).expect(409);
  assert.deepEqual((await Event.findById(content._id).lean()).formattedBody.en, formatted);
});

test('retirement aliases, Last Post language copy, and comment body restore without touching personal fields', async () => {
  const actor = await user();
  const submitter = { rank: 'Captain', firstName: 'Private', lastName: 'Person', email: 'private@example.test', unit: 'Test', relationship: 'self' };
  for (const [type, Model, extras] of [
    ['retirementMessage', RetirementMessage, { message: 'New copy', publicationConsent: { confirmed: true, confirmedAt: new Date() } }],
    ['lastPost', LastPostMessage, {}],
  ]) {
    const content = await Model.create({ messageLanguage: 'en', messages: { en: 'New copy', fr: 'Version française' },
      status: 'published', submitter, ...extras });
    const revision = await recordContentRevision({ contentType: type, content, actor, status: content.status,
      language: 'en', fields: ['message', 'formattedBody'], before: { message: 'Old copy', formattedBody: null }, after: { message: 'New copy', formattedBody: null } });
    const version = (await history(actor, type, content).expect(200)).body.version;
    await revert(actor, type, content, revision, version).expect(200);
    const saved = await Model.findById(content._id).lean();
    assert.equal(saved.messages.en, 'Old copy');
    assert.equal(saved.messages.fr, 'Version française');
    assert.equal(saved.submitter.email, submitter.email);
    if (type === 'retirementMessage') assert.equal(saved.message, 'Old copy');
  }
  const comment = await Comment.create({ parentType: 'retirement', parentId: new mongoose.Types.ObjectId(), body: 'New comment', status: 'rejected' });
  const revision = await recordContentRevision({ contentType: 'comment', content: comment, actor, status: comment.status,
    fields: ['body'], before: { body: 'Old comment' }, after: { body: 'New comment' } });
  const version = (await history(actor, 'comment', comment).expect(200)).body.version;
  await revert(actor, 'comment', comment, revision, version).expect(200);
  assert.equal((await Comment.findById(comment._id)).body, 'Old comment');
});

test('bilingual admin snapshots restore only changed language subpaths', async () => {
  const { actor, content, revision } = await eventFixture({}, { language: '', fields: ['title'],
    before: { title: { en: 'Previous title', fr: 'Titre français' } }, after: { title: { en: 'Current title', fr: 'Titre français' } } });
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  await revert(actor, 'event', content, revision, version).expect(200);
  const saved = await Event.findById(content._id).lean();
  assert.deepEqual(saved.title, { en: 'Previous title', fr: 'Titre français' });
});

test('unsupported statuses and newly invalid required text are not restored', async () => {
  const { actor, content, revision } = await eventFixture({ status: 'draft' });
  let current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  await revert(actor, 'event', content, revision, current.version).expect(409);
  await Event.updateOne({ _id: content._id }, { $set: { status: 'published', 'title.fr': '' } });
  await ContentRevision.updateOne({ _id: revision._id }, { $set: { fields: ['title'], before: { title: '' }, after: { title: 'Current title' } } });
  current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions[0].canRevert, false);
  await revert(actor, 'event', content, revision, current.version).expect(409);
});

test('news restore keeps existing required-text and editor length limits', async () => {
  const actor = await user();
  const article = await NewsArticle.create({ title: { en: 'Current title', fr: 'Titre' },
    content: { en: 'Current copy', fr: 'Texte' }, status: 'published', createdBy: actor._id });
  for (const [field, oldValue] of [['title', ''], ['content', ''], ['title', 'x'.repeat(241)], ['content', 'x'.repeat(20001)]]) {
    const revision = await recordContentRevision({ contentType: 'newsArticle', content: article, actor,
      status: article.status, language: 'en', fields: [field], before: { [field]: oldValue }, after: { [field]: article[field].en } });
    const current = (await history(actor, 'newsArticle', article).expect(200)).body;
    assert.equal(current.revisions.find((item) => item._id === String(revision._id)).canRevert, false);
    await revert(actor, 'newsArticle', article, revision, current.version).expect(409);
  }
  assert.equal((await NewsArticle.findById(article._id)).title.en, 'Current title');
  assert.equal(await AuditLog.countDocuments({ action: 'content.reverted' }), 0);
});

test('audit storage failure before compare-and-swap prevents any content change', async (t) => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  t.mock.method(AuditLog, 'create', async () => { throw new Error('Simulated audit storage failure'); });
  await revert(actor, 'event', content, revision, version).expect(500);
  assert.equal((await Event.findById(content._id)).title.en, 'Current title');
  assert.equal(await ContentRevision.countDocuments({ revertState: 'failed' }), 1);
  const current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions.find((item) => item.revertState === 'failed').canRevert, false);
});

test('history finalization failure is explicit and leaves a durable pending journal that blocks retry', async (t) => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  t.mock.method(AuditLog, 'updateOne', async () => { throw new Error('Simulated audit finalization failure'); });
  const response = await revert(actor, 'event', content, revision, version).expect(503);
  assert.equal(response.body.contentChanged, true);
  assert.equal((await Event.findById(content._id)).title.en, 'Previous title');
  const pending = await ContentRevision.findById(response.body.revisionId).lean();
  assert.equal(pending.revertState, 'pending');
  assert.equal(pending.before.title, 'Current title');
  assert.equal(pending.after.title, 'Previous title');
  const intent = await AuditLog.findOne({ action: 'content.revert_requested' }).lean();
  assert.equal(intent.metadata.revisionId, String(pending._id));
  assert.equal(intent.metadata.outcome, 'pending');
  const current = (await history(actor, 'event', content).expect(200)).body;
  assert.equal(current.revisions.every((item) => item.canRevert === false), true);
  await revert(actor, 'event', content, revision, current.version).expect(409);
});

test('an uncertain database reply is never retried or reported as an unchanged document', async (t) => {
  const { actor, content, revision } = await eventFixture();
  const version = (await history(actor, 'event', content).expect(200)).body.version;
  const updateOne = Event.updateOne.bind(Event);
  const update = t.mock.method(Event, 'updateOne', async (...args) => {
    await updateOne(...args);
    throw new Error('Simulated lost database reply after successful content write');
  });
  const response = await revert(actor, 'event', content, revision, version).expect(503);
  assert.equal(response.body.contentChanged, null);
  assert.equal(update.mock.callCount(), 1);
  assert.equal((await Event.findById(content._id)).title.en, 'Previous title');
  assert.equal(await ContentRevision.countDocuments({ revertState: 'pending' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'content.revert_requested', 'metadata.outcome': 'pending' }), 1);
  const current = (await history(actor, 'event', content).expect(200)).body;
  await revert(actor, 'event', content, revision, current.version).expect(409);
  assert.equal(update.mock.callCount(), 1);
});
