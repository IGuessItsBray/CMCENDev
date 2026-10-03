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
