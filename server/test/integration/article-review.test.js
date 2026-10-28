const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.JWT_ACCESS_TOKEN_TTL = '15m';
process.env.JWT_REFRESH_TOKEN_TTL_DAYS = '1';
process.env.NODE_ENV = 'test';
// The local .env may enable the production mail stop. Integration delivery is
// simulated by the mailer; individual stop tests set this flag explicitly.
process.env.DISABLE_EMAIL_SENDING = 'false';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.CASL_SENDER_NAME = 'CMCEN / RCMCE';
process.env.CASL_SENDER_MAILING_ADDRESS =
  '100 Example Street, Ottawa, ON K1A 0A1';
process.env.CASL_SENDER_CONTACT = 'https://example.test/contact';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_PUBLIC_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'integration-test';
process.env.MINIO_SECRET_KEY = 'integration-test';
process.env.MINIO_BUCKET_NAME = 'integration-test';
// Public article images require HTTPS, independent of local .env or CI settings.
process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.test/integration-test';
process.env.PLAUSIBLE_DOMAIN = '';
process.env.PLAUSIBLE_API_URL = '';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const User = require('../../models/User');
const Role = require('../../models/Role');
const NewsArticle = require('../../models/NewsArticle');
const MediaAsset = require('../../models/MediaAsset');
const ContentRevision = require('../../models/ContentRevision');
const AuditLog = require('../../models/AuditLog');
let mongoServer;
let userSequence = 0;

function createMemberData(overrides = {}) {
  userSequence += 1;
  const email = overrides.email || `member-${userSequence}@example.test`;

  return {
    username: email,
    email,
    password: 'Correct-Horse-Integration-1!',
    accountName: `Integration Member ${userSequence}`,
    firstName: 'Integration',
    lastName: `Member${userSequence}`,
    address: {
      line1: '1 Test Way',
      city: 'Ottawa',
      country: 'Canada',
      stateProvince: 'Ontario',
      postalCode: 'K1A 0A1',
    },
    rank: 'Captain',
    currentUnit: 'Integration Test Unit',
    status: 'regular',
    affiliationElement: 'army',
    preferredLanguage: 'en',
    role: 'subscriber',
    emailVerification: {
      required: false,
      verified: true,
      verifiedAt: new Date(),
    },
    ...overrides,
  };
}

async function createUser(overrides = {}) {
  return User.create(createMemberData(overrides));
}

function bearer(token) {
  return `Bearer ${token}`;
}
before(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'cmcen-integration',
    },
  });

  await mongoose.connect(mongoServer.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
});

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

after(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test('archive timestamps can be corrected in UTC without losing seconds on unrelated saves', async () => {
  const staff = await createUser({ role: 'editor' });
  const token = bearer(require('../../services/auth-session').createSessionToken(staff));
  const body = { layout: 'newsletter', status: 'draft', title: { en: 'Archive' },
    newsletter: { archived: true, date: '2022-08-12', language: 'en' },
    newsletterBlocks: { en: [{ type: 'paragraph', children: ['Original copy'] }] } };
  const article = (await request(app).post('/api/news').set('Authorization', token).send(body).expect(201)).body.article;
  await request(app).patch(`/api/news/${article._id}`).send({ ...body, originalPublishedAt: '2022-08-12T02:26:14Z' }).expect(401);
  const subscriber = await createUser();
  await request(app).patch(`/api/news/${article._id}`).set('Authorization', bearer(require('../../services/auth-session').createSessionToken(subscriber))).send({ ...body, originalPublishedAt: '2022-08-12T02:26:14Z' }).expect(403);
  for (const originalPublishedAt of ['2022-08-12', '2022-08-12T02:26:14', '2022-02-30T02:00:00Z', '2099-01-01T00:00:00Z', 123])
    await request(app).patch(`/api/news/${article._id}`).set('Authorization', token).send({ ...body, originalPublishedAt }).expect(400);
  await request(app).patch(`/api/news/${article._id}`).set('Authorization', token).send({ ...body, originalPublishedAt: '2022-08-11T22:26:14.123-04:00' }).expect(200);
  await request(app).patch(`/api/news/${article._id}`).set('Authorization', token).send({ ...body, status: 'published' }).expect(200);
  let saved = await NewsArticle.findById(article._id).lean();
  assert.equal(saved.originalPublishedAt.toISOString(), '2022-08-12T02:26:14.123Z');
  assert.equal(saved.publishedAt.toISOString(), '2022-08-12T02:26:14.123Z');
  await request(app).patch(`/api/news/${article._id}`).set('Authorization', token).send({ ...body, status: 'published', originalPublishedAt: '2022-08-13T03:39:59Z' }).expect(200);
  saved = await NewsArticle.findById(article._id).lean();
  assert.equal(saved.newsletter.date, '2022-08-13');
  assert.equal(saved.publishedAt.toISOString(), '2022-08-13T03:39:59.000Z');
  assert.equal(await ContentRevision.countDocuments({ contentId: article._id, fields: 'originalPublishedAt' }), 2);
  const item = (await request(app).get(`/api/admin/content?type=newsArticle&id=${article._id}`).set('Authorization', token).expect(200)).body.items[0];
  assert.equal(item.publicationDate.precision, 'time');
  assert.equal(item.publicationDate.originalPublishedAt, '2022-08-13T03:39:59.000Z');
});

test('date-only archive creation and publication need no time or additional date choice', async () => {
  const staff = await createUser({ role: 'editor' });
  const token = bearer(require('../../services/auth-session').createSessionToken(staff));
  const body = { layout: 'newsletter', title: { en: 'Date-only archive' },
    newsletter: { archived: true, date: '2022-08-12', language: 'en' },
    newsletterBlocks: { en: [{ type: 'paragraph', children: ['Original copy'] }] } };
  const article = (await request(app).post('/api/news').set('Authorization', token).send(body).expect(201)).body.article;
  const saved = await NewsArticle.findById(article._id).lean();
  assert.equal(saved.publishedAt.toISOString(), '2022-08-12T12:00:00.000Z');
  assert.equal(saved.originalPublishedAt, undefined);
  assert.equal(saved.publicationDateChoice, 'original');
  const item = (await request(app).get(`/api/admin/content?type=newsArticle&id=${article._id}`).set('Authorization', token).expect(200)).body.items[0];
  assert.equal(item.publicationDate.precision, 'date');
  await request(app).patch(`/api/news/${article._id}`).set('Authorization', token)
    .send({ ...body, newsletter: { ...body.newsletter, date: '2022-08-13' } }).expect(200);
  assert.equal((await NewsArticle.findById(article._id)).publishedAt.toISOString(), '2022-08-13T12:00:00.000Z');
});

test('cover placement API defaults new articles, preserves legacy saves, validates choices and records revisions', async () => {
  const staff = await createUser({ role: 'editor' });
  const token = bearer(require('../../services/auth-session').createSessionToken(staff));
  const imageUrl = `${process.env.CDN_PUBLIC_BASE_URL}/images/shared-cover.jpg`;
  const body = { layout: 'newsletter', category: 'history-heritage', status: 'draft',
    title: { en: 'Cover article', fr: 'Couverture' }, imageUrl, imageDisplayUrl: imageUrl,
    newsletterBlocks: { en: [{ type: 'paragraph', children: ['English body'] }], fr: [{ type: 'paragraph', children: ['Texte français'] }] },
    newsletter: { language: 'en', archived: false } };
  const created = (await request(app).post('/api/news').set('Authorization', token).send(body).expect(201)).body.article;
  assert.equal(created.coverPlacement, 'body');
  await request(app).get(`/api/news/${created._id}`).expect(404);
  const old = await NewsArticle.create({ ...body, content: { en: 'English body', fr: 'Texte français' }, coverPlacement: undefined, createdBy: staff._id });
  for (const layout of ['standard', 'newsletter']) {
    await NewsArticle.updateOne({ _id: old._id }, { $set: { layout } });
    const saved = (await request(app).patch(`/api/news/${old._id}`).set('Authorization', token).send({ ...body, layout, content: { en: 'English body', fr: 'Texte français' }, title: { en: 'Unrelated title edit', fr: 'Titre' } }).expect(200)).body.article;
    assert(!Object.hasOwn(saved, 'coverPlacement'));
    assert(!Object.hasOwn(await NewsArticle.findById(old._id).lean(), 'coverPlacement'));
    assert.equal(saved.layout, layout);assert.equal(saved.imageUrl, imageUrl);
  }
  for (const coverPlacement of ['header', 'body', 'cards']) {
    const response = (await request(app).patch(`/api/news/${old._id}`).set('Authorization', token).send({ ...body, coverPlacement }).expect(200)).body.article;
    assert.equal(response.coverPlacement, coverPlacement);
    const preview = (await request(app).get(`/api/news/${old._id}/preview`).set('Authorization', token).expect(200)).body.article;
    assert.equal(preview.coverPlacement, coverPlacement);
    const row = (await request(app).get(`/api/admin/content?scope=articles&id=${old._id}`).set('Authorization', token).expect(200)).body.items.find(i => i._id === String(old._id));
    assert.equal(row.content.coverPlacement, coverPlacement);
  }
  assert.equal(await ContentRevision.countDocuments({ contentId: old._id, fields: 'coverPlacement' }), 3);
  for (const coverPlacement of ['invalid', '', null, false])
    await request(app).patch(`/api/news/${old._id}`).set('Authorization', token).send({ ...body, coverPlacement }).expect(400);
  await request(app).patch(`/api/news/${old._id}`).send({ ...body, coverPlacement: 'body' }).expect(401);
});

test('empty/removed covers stay absent in details while listing cards retain their fallback', async () => {
  const staff = await createUser({ role: 'editor' });
  const token = bearer(require('../../services/auth-session').createSessionToken(staff));
  const base = { layout: 'standard', title: { en: 'English', fr: 'Français' }, content: { en: 'English body', fr: 'Texte français' }, createdBy: staff._id, status: 'published' };
  const photo = `${process.env.CDN_PUBLIC_BASE_URL}/images/cover.jpg`;
  const old = await NewsArticle.create({ ...base, imageUrl: photo, imageDisplayUrl: photo });
  const removed = (await request(app).patch(`/api/news/${old._id}`).set('Authorization', token).send({ ...base, imageUrl: '', imageDisplayUrl: '' }).expect(200)).body.article;
  assert.equal(removed.coverPlacement, 'header');assert.equal(removed.imageUrl, '');assert.equal(removed.imageDisplayUrl, '');
  const detail = (await request(app).get(`/api/news/${old._id}`).expect(200)).body.article;
  assert.equal(detail.imageUrl, '');
  const cards = (await request(app).get('/api/news').expect(200)).body.articles;
  assert.match(cards.find(a => a._id === String(old._id)).imageUrl, /branch-crest/);
  const empty = await NewsArticle.create({ ...base, imageUrl: '', imageDisplayUrl: '' });
  await request(app).patch(`/api/news/${empty._id}`).set('Authorization', token).send({ ...base, imageUrl: '', imageDisplayUrl: '' }).expect(200);
  assert(!Object.hasOwn(await NewsArticle.findById(empty._id).lean(), 'coverPlacement'));
  assert.match((await request(app).get(`/api/news/${empty._id}`).expect(200)).body.article.imageUrl, /branch-crest/);
  for (const coverPlacement of ['header', 'body', 'cards']) {
    const record = await NewsArticle.create({ ...base, coverPlacement, imageUrl: '', imageDisplayUrl: '' });
    const response = (await request(app).get(`/api/news/${record._id}`).expect(200)).body.article;
    assert.equal(response.imageUrl, '');assert.equal(response.imageDisplayUrl, '');
    const unchanged = (await request(app).patch(`/api/news/${record._id}`).set('Authorization', token).send({ ...base, title: { en: 'Changed title', fr: 'Titre modifié' } }).expect(200)).body.article;
    assert.equal(unchanged.coverPlacement, coverPlacement);assert.equal(unchanged.imageUrl, '');
  }
});

test('public and authenticated article details resolve originals without changing display data or exposing unrelated media', async () => {
  const staff = await createUser({ role: 'editor' });
  const token = bearer(require('../../services/auth-session').createSessionToken(staff));
  const base = process.env.CDN_PUBLIC_BASE_URL;
  const figure = { type: 'figure', caption: 'Caption', image: { url: `${base}/images/photo/large.webp`, width: 300, height: 225, alt: 'Photo', variants: { thumb: { url: `${base}/images/photo/thumb.webp`, width: 400, height: 300 } } } };
  await MediaAsset.create({ key: 'images/photo/original.jpg', url: figure.image.url, originalUrl: `${base}/images/photo/original.jpg`, uploadedBy: staff._id, fileMetadata: { private: 'Not part of the article response' }, variants: { thumb: { url: figure.image.variants.thumb.url } } });
  await MediaAsset.create({ key: 'images/unrelated/original.jpg', url: `${base}/images/unrelated/large.webp`, originalUrl: `${base}/images/unrelated/original.jpg` });
  const article = await NewsArticle.create({ title: { en: 'Image detail', fr: 'Image' }, content: { en: 'Copy', fr: 'Texte' }, layout: 'newsletter', newsletterBlocks: { en: [figure], fr: [figure] }, imageUrl: figure.image.variants.thumb.url, status: 'published', createdBy: staff._id });
  const publicResponse = (await request(app).get(`/api/news/${article._id}`).expect(200)).body.article;
  const previewResponse = (await request(app).get(`/api/news/${article._id}/preview`).set('Authorization', token).expect(200)).body.article;
  for (const response of [publicResponse, previewResponse]) {
    assert.equal(response.imageOriginalUrl, `${base}/images/photo/original.jpg`);
    for (const language of ['en', 'fr']) assert.deepEqual(response.newsletterBlocks[language][0], { ...figure, image: { ...figure.image, originalUrl: `${base}/images/photo/original.jpg` } });
    assert(!JSON.stringify(response).includes('Not part of the article response'));
    assert(!JSON.stringify(response).includes('images/unrelated'));
  }
  assert.deepEqual((await NewsArticle.findById(article._id).lean()).newsletterBlocks.en, [figure]);
  await request(app).get(`/api/news/${article._id}/preview`).expect(401);
  await NewsArticle.updateOne({ _id: article._id }, { $set: { status: 'draft' } });
  await request(app).get(`/api/news/${article._id}`).expect(404);
  await request(app).get(`/api/news/${article._id}/preview`).set('Authorization', token).expect(200);
});

test('ambiguous, unsafe and unregistered original metadata cannot become an article original link', async () => {
  const staff = await createUser({ role: 'editor' });
  const base = process.env.CDN_PUBLIC_BASE_URL;
  const url = `${base}/images/shared.webp`;
  for (const name of ['one', 'two']) await MediaAsset.create({ key: `images/${name}.jpg`, url, originalUrl: `${base}/images/${name}.jpg` });
  const figure = { type: 'figure', image: { url, alt: '' } };
  const article = await NewsArticle.create({ title: { en: 'Fallback', fr: 'Image' }, content: { en: 'Copy', fr: 'Texte' }, layout: 'newsletter', newsletterBlocks: { en: [figure, { type: 'figure', image: { url: 'https://other.example/unregistered.jpg', alt: '' } }], fr: [] }, status: 'published', createdBy: staff._id });
  let response = (await request(app).get(`/api/news/${article._id}`).expect(200)).body.article;
  assert(response.newsletterBlocks.en.every((block) => block.image.originalUrl === ''));
  await MediaAsset.deleteMany({});
  await MediaAsset.create({ key: 'images/bad.jpg', url, originalUrl: 'javascript:alert(1)' });
  response = (await request(app).get(`/api/news/${article._id}`).expect(200)).body.article;
  assert.equal(response.newsletterBlocks.en[0].image.originalUrl, '');
});

test('article review flags preserve bilingual legacy notes, permissions and publication independently', async () => {
  const staff = await createUser({ role: 'editor' });
  const authorizationFor = (user) =>
    bearer(require('../../services/auth-session').createSessionToken(user));
  const authorization = authorizationFor(staff);
  const article = await NewsArticle.create({
    title: { en: 'Review story', fr: 'Article' },
    content: { en: 'Public story', fr: 'Texte public' },
    status: 'published',
    createdBy: staff._id,
  });
  const newer = await NewsArticle.create({
    title: { en: 'Unflagged newer' },
    content: { en: 'Public' },
    status: 'draft',
    createdBy: staff._id,
  });
  const path = `/api/admin/content/newsArticle/${article._id}/review`;
  const body = { needsReview: true, note: 'Shared concern' };
  await request(app).patch(path).send(body).expect(401);
  const reviewerRole = await Role.create({
    name: 'Review only',
    slug: 'review-only',
    permissions: ['content.review'],
  });
  const reviewer = await createUser({ customRoles: [reviewerRole._id] });
  await request(app)
    .patch(path)
    .set('Authorization', authorizationFor(reviewer))
    .send(body)
    .expect(403);
  const member = await createUser();
  await request(app)
    .patch(path)
    .set('Authorization', authorizationFor(member))
    .send(body)
    .expect(403);
  for (const invalid of [
    { needsReview: 'true', note: '' },
    { needsReview: true },
    { needsReview: false, note: 'x'.repeat(4101) },
  ])
    await request(app)
      .patch(path)
      .set('Authorization', authorization)
      .send(invalid)
      .expect(400);
  await request(app)
    .patch(path.replace(String(article._id), 'invalid'))
    .set('Authorization', authorization)
    .send(body)
    .expect(400);
  await request(app)
    .patch(
      path.replace(String(article._id), String(new mongoose.Types.ObjectId())),
    )
    .set('Authorization', authorization)
    .send(body)
    .expect(404);
  for (const language of ['en', 'fr'])
    await request(app)
      .patch(`/api/admin/content/newsArticle/${article._id}/editorial-note`)
      .set('Authorization', authorization)
      .send({ language, note: `${language} concern` })
      .expect(200);
  const get = (query = '') =>
    request(app)
      .get(`/api/admin/content?scope=articles${query}`)
      .set('Authorization', authorization);
  const legacy = await get('&flagged=true&limit=1').expect(200);
  assert.equal(legacy.body.items[0]._id, String(article._id));
  assert.equal(
    legacy.body.items[0].articleReview.note,
    'EN: en concern\n\nFR: fr concern',
  );
  await get('&flagged=invalid').expect(400);
  await request(app)
    .patch(path)
    .set('Authorization', authorization)
    .send(body)
    .expect(200);
  await request(app)
    .patch(path)
    .set('Authorization', authorization)
    .send(body)
    .expect(200);
  assert.equal(
    await ContentRevision.countDocuments({ fields: 'articleReview' }),
    1,
  );
  const persisted = await get(`&id=${article._id}`).expect(200);
  assert.deepEqual(persisted.body.items[0].articleReview, {
    ...body,
    legacyNotes: { en: 'en concern', fr: 'fr concern' },
  });
  assert.equal(
    (await get('&flagged=true&status=draft').expect(200)).body.items.length,
    0,
  );
  await request(app)
    .patch(path)
    .set('Authorization', authorization)
    .send({ ...body, needsReview: false })
    .expect(200);
  assert.equal((await get('&flagged=true').expect(200)).body.items.length, 0);
  assert.equal((await NewsArticle.findById(article._id)).status, 'published');
  assert.equal((await NewsArticle.findById(newer._id)).status, 'draft');
  const cleared = await get(`&id=${article._id}`).expect(200);
  assert.equal(cleared.body.items[0].articleReview.note, body.note);
  assert.equal(cleared.body.items[0].articleReview.needsReview, false);
  assert.equal(
    await ContentRevision.countDocuments({ contentId: article._id }),
    4,
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'content.article_review_updated',
    }),
    2,
  );
  const publicArticle = await request(app)
    .get(`/api/news/${article._id}`)
    .expect(200);
  assert.ok(!JSON.stringify(publicArticle.body).includes(body.note));
  const draftPath = path.replace(String(article._id), String(newer._id));
  await request(app)
    .patch(draftPath)
    .set('Authorization', authorization)
    .send(body)
    .expect(200);
  assert.equal(
    (await get('&flagged=true&status=draft&search=Unflagged').expect(200)).body
      .items[0]._id,
    String(newer._id),
  );
  await request(app)
    .patch(draftPath)
    .set('Authorization', authorization)
    .send({ ...body, needsReview: false })
    .expect(200);
  assert.equal((await NewsArticle.findById(newer._id)).status, 'draft');
  await request(app)
    .patch(draftPath)
    .set('Authorization', authorization)
    .send({ needsReview: true, note: '' })
    .expect(200);
  await request(app)
    .patch(
      draftPath.replace(String(newer._id), String(newer._id).toUpperCase()),
    )
    .set('Authorization', authorization)
    .send({ needsReview: false, note: '' })
    .expect(200);
  assert.equal((await get('&flagged=true').expect(200)).body.items.length, 0);
});
