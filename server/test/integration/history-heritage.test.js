const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
process.env.JWT_SECRET = 'heritage-integration-only';
process.env.NODE_ENV = 'test';
const express = require('express');
const mongoose = require('mongoose');
const { createSessionToken } = require('../../services/auth-session');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Page = require('../../models/Page');
const NewsArticle = require('../../models/NewsArticle');
const User = require('../../models/User');
const app = express();
app.use(express.json());
app.use('/api/history-heritage', require('../../routes/history-heritage'));
app.use('/api/news', require('../../routes/news'));
app.use(require('../../routes/pages'));
let mongo, token, editorToken, articleId, pageId;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const userId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: userId,
    username: 'reader',
    email: 'reader@example.test',
    role: 'subscriber',
    sessionVersion: 0,
  });
  token = createSessionToken({ _id: userId, sessionVersion: 0 });
  const editorId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: editorId,
    username: 'editor',
    email: 'editor@example.test',
    role: 'editor',
    sessionVersion: 0,
  });
  editorToken = createSessionToken({ _id: editorId, sessionVersion: 0 });
  const article = await NewsArticle.create({
    category: 'history-heritage',
    status: 'published',
    createdBy: userId,
    title: { en: 'Heritage Moment', fr: 'Moment du patrimoine' },
    content: { en: 'Original account', fr: 'Récit original' },
    publishedAt: new Date('2026-10-01'),
    originalPublishedAt: new Date('2017-04-09'),
  });
  articleId = String(article._id);
  await NewsArticle.create({
    category: 'history-heritage',
    status: 'draft',
    createdBy: userId,
    title: { en: 'Draft' },
    content: { en: 'Secret' },
  });
  await NewsArticle.create({
    category: 'news',
    status: 'published',
    createdBy: userId,
    title: { en: 'Ordinary news' },
    content: { en: 'Unrelated' },
  });
  const page = await Page.create({
    slug: 'ce-branch-battlefield-tour-vimy',
    category: 'history-heritage',
    status: 'published',
    title: {
      en: 'Heritage Events - 2017',
      fr: 'Événements patrimoniaux - 2017',
    },
    summary: { en: 'Vimy account' },
    publishedAt: new Date('2026-10-02'),
    legacy: { source: 'fixture' },
    blocks: [{ type: 'heading', text: { en: 'Vimy', fr: 'Vimy' } }],
  });
  pageId = String(page._id);
  await Page.create({
    slug: 'selected-draft',
    category: 'history-heritage',
    status: 'draft',
    title: { en: 'Excluded page draft' },
  });
  await Page.create({
    slug: 'unselected',
    status: 'published',
    title: { en: 'Unrelated page' },
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('mixed listing uses category membership and original years, and preserves detail renderers', async () => {
  const { body, headers } = await request(app)
    .get('/api/history-heritage')
    .expect(200);
  assert.equal(body.items.length, 2);
  assert.match(headers['cache-control'], /private/);
  const article = body.items.find((item) => item.type === 'article');
  const page = body.items.find((item) => item.type === 'page');
  assert.equal(article.year, 2017);
  assert.equal(article.title.fr, 'Moment du patrimoine');
  assert.equal(article.url, `/news-story?id=${articleId}`);
  assert.equal(page.year, null, 'import date cannot supply an archival year');
  assert.equal(page.url, '/pages/ce-branch-battlefield-tour-vimy');
  const detail = await request(app).get(`/api/news/${articleId}`).expect(200);
  assert.equal(detail.body.article.content.en, 'Original account');
  const pageDetail = await request(app)
    .get('/api/pages/ce-branch-battlefield-tour-vimy')
    .expect(200);
  assert.equal(pageDetail.body.page.blocks[0].type, 'heading');
});

test('draft exclusion holds for all visitors and both detail APIs', async () => {
  await Page.updateOne({ _id: pageId }, { status: 'draft' });
  for (const auth of [null, token]) {
    let query = request(app).get('/api/history-heritage');
    if (auth) query = query.set('Authorization', `Bearer ${auth}`);
    const result = await query.expect(200);
    assert.deepEqual(
      result.body.items.map((item) => item.id),
      [articleId],
    );
  }
  await request(app)
    .get('/api/pages/ce-branch-battlefield-tour-vimy')
    .expect(404);
  const draft = await NewsArticle.findOne({ status: 'draft' });
  await request(app).get(`/api/news/${draft._id}`).expect(404);
  await Page.updateOne({ _id: pageId }, { status: 'published' });
});

test('page permissions are enforced before pagination, including invalid sessions', async () => {
  await Page.updateOne(
    { _id: pageId },
    { access: { audience: 'authenticated' } },
  );
  const anon = await request(app)
    .get('/api/history-heritage?limit=1')
    .expect(200);
  assert.equal(anon.body.items[0].id, articleId);
  assert.equal(anon.body.hasMore, false);
  const signedIn = await request(app)
    .get('/api/history-heritage?limit=1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(signedIn.body.items[0].id, pageId);
  assert.equal(signedIn.body.hasMore, true);
  const next = await request(app)
    .get('/api/history-heritage?limit=1&offset=1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(next.body.items[0].id, articleId);
  assert.equal(next.body.hasMore, false);
  await request(app)
    .get('/api/pages/ce-branch-battlefield-tour-vimy')
    .expect(401);
  await Page.updateOne(
    { _id: pageId },
    { access: { audience: 'restricted', roles: ['editor'] } },
  );
  const denied = await request(app)
    .get('/api/history-heritage')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(denied.body.items.length, 1);
  await request(app)
    .get('/api/pages/ce-branch-battlefield-tour-vimy')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
  await Page.updateOne(
    { _id: pageId },
    { access: { audience: 'restricted', roles: ['subscriber'] } },
  );
  const allowed = await request(app)
    .get('/api/history-heritage')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(allowed.body.items.length, 2);
  const invalid = await request(app)
    .get('/api/history-heritage')
    .set('Authorization', 'Bearer invalid')
    .expect(200);
  assert.equal(invalid.body.items.length, 1);
  const jwt = require('jsonwebtoken');
  const wrongPurpose = jwt.sign(
    { ...jwt.decode(token), tokenType: 'refresh' },
    process.env.JWT_SECRET,
  );
  const purposeDenied = await request(app)
    .get('/api/history-heritage')
    .set('Authorization', `Bearer ${wrongPurpose}`)
    .expect(200);
  assert.equal(
    purposeDenied.body.items.length,
    1,
    'refresh tokens cannot expose authenticated heritage pages',
  );
});

test('pagination validates malformed input', async () => {
  for (const query of [
    'limit=0',
    'limit=49',
    'limit=2.5',
    'offset=-1',
    'offset=abc',
    'offset=9007199254740992',
  ]) {
    await request(app).get(`/api/history-heritage?${query}`).expect(400);
  }
});

test('an empty published collection returns a sensible empty listing', async () => {
  await NewsArticle.updateMany(
    { category: 'history-heritage' },
    { status: 'hidden' },
  );
  await Page.updateOne({ _id: pageId }, { status: 'draft' });
  const result = await request(app).get('/api/history-heritage').expect(200);
  assert.deepEqual(result.body, { items: [], hasMore: false });
});

test('staff can select any page for heritage through audited category saves without publishing drafts', async () => {
  const AuditLog = require('../../models/AuditLog');
  const payload = {
    slug: 'another-heritage-page',
    title: { en: 'Another page', fr: 'Une autre page' },
  };
  await request(app).post('/api/admin/pages').send(payload).expect(401);
  await request(app)
    .post('/api/admin/pages')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
    .expect(403);
  const auth = { Authorization: `Bearer ${editorToken}` };
  for (const category of ['invalid', null, 123, ['history-heritage']]) {
    await request(app)
      .post('/api/admin/pages')
      .set(auth)
      .send({ ...payload, category })
      .expect(400);
  }
  const created = await request(app)
    .post('/api/admin/pages')
    .set(auth)
    .send(payload)
    .expect(201);
  const id = created.body.page._id;
  assert.equal(created.body.page.category, '');
  const url = `/api/admin/pages/${id}`;
  await request(app)
    .patch(url)
    .send({ category: 'history-heritage' })
    .expect(401);
  await request(app)
    .patch(url)
    .set('Authorization', `Bearer ${token}`)
    .send({ category: 'history-heritage' })
    .expect(403);
  const selected = await request(app)
    .patch(url)
    .set(auth)
    .send({ category: 'history-heritage' })
    .expect(200);
  assert.equal(selected.body.page.category, 'history-heritage');
  assert.equal(selected.body.page.status, 'draft');
  assert.equal(
    (await request(app).get('/api/history-heritage')).body.items.length,
    0,
  );
  const audit = await AuditLog.findOne({ action: 'page.updated', target: id })
    .sort({ createdAt: -1 })
    .lean();
  assert.equal(audit.targetSnapshot.category, 'history-heritage');
  assert.equal(audit.metadata.previousPage.category, '');
  assert.equal(audit.metadata.newPage.category, 'history-heritage');
  await request(app)
    .patch(`${url}/status`)
    .set(auth)
    .send({ status: 'published' })
    .expect(200);
  const published = await request(app).get('/api/history-heritage').expect(200);
  assert.deepEqual(
    published.body.items.map((item) => item.id),
    [id],
  );
  assert.equal(published.body.items[0].url, '/pages/another-heritage-page');
  const unchanged = await request(app)
    .patch(url)
    .set(auth)
    .send({ summary: { en: 'Updated summary' } })
    .expect(200);
  assert.equal(unchanged.body.page.category, 'history-heritage');
  const detail = await request(app)
    .get('/api/pages/another-heritage-page')
    .expect(200);
  assert.equal(detail.body.page.category, 'history-heritage');
  await request(app)
    .patch(url)
    .set(auth)
    .send({ category: 'invalid' })
    .expect(400);
  assert.equal((await Page.findById(id)).category, 'history-heritage');
  const cleared = await request(app)
    .patch(url)
    .set(auth)
    .send({ category: '' })
    .expect(200);
  assert.equal(cleared.body.page.category, '');
  assert.equal(cleared.body.page.status, 'published');
  assert.deepEqual((await request(app).get('/api/history-heritage')).body, {
    items: [],
    hasMore: false,
  });
  await request(app)
    .patch(url)
    .set(auth)
    .send({ category: 'news' })
    .expect(200);
  assert.equal(
    (await request(app).get('/api/history-heritage')).body.items.length,
    0,
  );
});
