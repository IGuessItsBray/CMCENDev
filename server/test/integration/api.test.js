const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, test } = require('node:test');

process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.JWT_ACCESS_TOKEN_TTL = '15m';
process.env.JWT_REFRESH_TOKEN_TTL_DAYS = '1';
process.env.NODE_ENV = 'test';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'integration-test';
process.env.MINIO_SECRET_KEY = 'integration-test';
process.env.MINIO_BUCKET_NAME = 'integration-test';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const AuditLog = require('../../models/AuditLog');
const LastPostMessage = require('../../models/LastPostMessage');
const RetirementMessage = require('../../models/RetirementMessage');
const User = require('../../models/User');
const { RETIREMENT_TRADE_ROLES } = require('../../config/content');

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
      postalCode: 'K1A 0A1'
    },
    rank: 'Captain',
    status: 'regular',
    affiliationElement: 'army',
    preferredLanguage: 'en',
    role: 'subscriber',
    emailVerification: {
      required: false,
      verified: true,
      verifiedAt: new Date()
    },
    ...overrides
  };
}

async function createUser(overrides = {}) {
  return User.create(createMemberData(overrides));
}

async function login(user, options = {}) {
  const agent = options.agent || request(app);
  const response = await agent
    .post('/api/login')
    .send({
      username: user.username,
      password: options.password || 'Correct-Horse-Integration-1!'
    });

  return response;
}

function bearer(token) {
  return `Bearer ${token}`;
}

function retirementPayload() {
  const message = 'This integration retirement message contains enough detail to satisfy the minimum length while exercising the complete submission and review workflow.';

  return {
    retiree: {
      rank: 'Sergeant',
      firstName: 'Alex',
      lastName: 'Example',
      postNominals: 'CD',
      tradeRole: RETIREMENT_TRADE_ROLES[0],
      retirementDate: '2026-08-01'
    },
    message,
    messageLanguage: 'en',
    photoUrl: '',
    submitter: {
      firstName: 'Integration',
      lastName: 'Submitter',
      relationship: 'colleague',
      email: 'submitter@example.test',
      unit: 'Integration Test Unit'
    },
    publicationConsentConfirmed: true,
    memberReviewConfirmed: true
  };
}

function translatedMessage(language) {
  return `${language} integration translation `.repeat(8).trim();
}

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'cmcen-integration'
    }
  });

  await mongoose.connect(mongoServer.getUri());
  await Promise.all(
    Object.values(mongoose.models).map(model => model.init())
  );
});

beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map(collection => collection.deleteMany({})));
});

after(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('system and authentication', () => {
  test('returns a public health response and a controlled API 404', async () => {
    const health = await request(app).get('/api/data').expect(200);
    assert.equal(typeof health.body.message, 'string');

    const missing = await request(app).get('/api/does-not-exist').expect(404);
    assert.equal(missing.body.error, 'Endpoint not found');
  });

  test('rejects invalid credentials and malformed bearer tokens', async () => {
    const user = await createUser();

    const invalidLogin = await login(user, { password: 'wrong-password' });
    assert.equal(invalidLogin.status, 401);
    assert.equal(invalidLogin.body.error, 'Invalid credentials');

    const invalidToken = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    assert.equal(invalidToken.body.error, 'Invalid or expired token');
  });

  test('logs in, returns a safe profile, refreshes, and revokes the session', async () => {
    const user = await createUser();
    const agent = request.agent(app);
    const loginResponse = await login(user, { agent });

    assert.equal(loginResponse.status, 200);
    assert.equal(typeof loginResponse.body.token, 'string');
    assert.match(loginResponse.headers['set-cookie'][0], /cmcen_refresh=/);

    const profile = await agent
      .get('/api/me')
      .set('Authorization', bearer(loginResponse.body.token))
      .expect(200);
    assert.equal(profile.body.email, user.email);
    assert.equal(profile.body.password, undefined);
    assert.equal(profile.body.totp?.secret, undefined);

    const refresh = await agent.post('/api/session/refresh').expect(200);
    assert.equal(typeof refresh.body.token, 'string');

    await agent.post('/api/session/logout').expect(204);
    await agent.post('/api/session/refresh').expect(401);

    const audit = await AuditLog.findOne({ action: 'user.login' }).lean();
    assert.equal(String(audit.actor), String(user._id));
  });
});

describe('permissions and audit logs', () => {
  test('prevents a subscriber from reading the audit log', async () => {
    const user = await createUser({ role: 'subscriber' });
    const loginResponse = await login(user);

    const response = await request(app)
      .get('/api/audit-logs')
      .set('Authorization', bearer(loginResponse.body.token))
      .expect(403);

    assert.equal(response.body.error, 'Insufficient permissions');
  });

  test('filters audit entries and exports correctly escaped CSV', async () => {
    const admin = await createUser({ role: 'administrator' });
    const loginResponse = await login(admin);
    const token = loginResponse.body.token;

    await AuditLog.create([
      {
        action: 'content.created',
        actor: admin._id,
        actorSnapshot: {
          username: admin.username,
          accountName: admin.accountName,
          role: admin.role
        },
        targetType: 'event',
        targetSnapshot: { title: 'Quoted, "Event"' },
        metadata: { note: 'First line\nSecond line' }
      },
      {
        action: 'content.deleted',
        actor: admin._id,
        actorSnapshot: {
          username: admin.username,
          accountName: admin.accountName,
          role: admin.role
        },
        targetType: 'page',
        targetSnapshot: { title: 'Other record' }
      }
    ]);

    const filtered = await request(app)
      .get('/api/audit-logs?action=content.created&targetType=event')
      .set('Authorization', bearer(token))
      .expect(200);
    assert.equal(filtered.body.logs.length, 1);
    assert.equal(filtered.body.logs[0].targetType, 'event');

    const csv = await request(app)
      .get('/api/audit-logs/export.csv?action=content.created')
      .set('Authorization', bearer(token))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    assert.match(csv.text, /"Quoted, ""Event"""/);
    assert.match(csv.text, /"note: First line\nSecond line"/);

    const exportAudit = await AuditLog.findOne({ action: 'audit.exported' }).lean();
    assert.equal(exportAudit.metadata.entryCount, 1);
  });
});

describe('retirement message lifecycle', () => {
  test('enforces submission and review permissions', async () => {
    const subscriber = await createUser({ role: 'subscriber' });
    const contributor = await createUser({ role: 'contributor' });
    const subscriberLogin = await login(subscriber);
    const contributorLogin = await login(contributor);

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(subscriberLogin.body.token))
      .send(retirementPayload())
      .expect(403);

    const submitted = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);
    assert.equal(submitted.body.status, 'pending');

    const message = await RetirementMessage.findOne().lean();
    await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ action: 'publish' })
      .expect(403);
  });

  test('requires bilingual review content, publishes, and exposes the message publicly', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorLogin = await login(contributor);
    const editorLogin = await login(editor);

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);

    const message = await RetirementMessage.findOne();

    const missingTranslation = await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ action: 'publish' })
      .expect(400);
    assert.match(missingTranslation.body.error, /English and French/);

    await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({
        action: 'publish',
        messages: {
          en: translatedMessage('English'),
          fr: translatedMessage('French')
        }
      })
      .expect(200);

    const publicMessage = await request(app)
      .get(`/api/retirement-messages/${message._id}`)
      .expect(200);
    assert.equal((await RetirementMessage.findById(message._id)).status, 'published');
    assert.equal(publicMessage.body.retirementMessage.status, undefined);
    assert.equal(publicMessage.body.retirementMessage.messages.en, translatedMessage('English'));
    assert.equal(publicMessage.body.retirementMessage.messages.fr, translatedMessage('French'));

    const publishedAudit = await AuditLog.findOne({
      action: 'content.published',
      targetType: 'retirementMessage'
    }).lean();
    assert.equal(String(publishedAudit.target), String(message._id));
  });

  test('requires a reason when rejecting a pending message', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorLogin = await login(contributor);
    const editorLogin = await login(editor);

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);
    const message = await RetirementMessage.findOne();

    await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ action: 'reject' })
      .expect(400);

    await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ action: 'reject', rejectionReason: 'Missing confirmation details' })
      .expect(200);

    assert.equal((await RetirementMessage.findById(message._id)).status, 'rejected');
  });
});

describe('Last Post lifecycle', () => {
  test('submits, reviews, and publicly lists a bilingual Last Post notice', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorLogin = await login(contributor);
    const editorLogin = await login(editor);

    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        deceased: {
          fullRank: 'Sergeant',
          firstName: 'Jordan',
          surname: 'Example',
          postNominal: 'CD'
        },
        messageLanguage: 'en',
        message: 'An English Last Post notice used by the integration test.',
        imageUrl: ''
      })
      .expect(201);

    const notice = await LastPostMessage.findOne();
    assert.equal(notice.status, 'pending');

    await request(app)
      .patch(`/api/last-posts/${notice._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({
        action: 'publish',
        messages: {
          en: 'Published English Last Post notice.',
          fr: 'Avis du Dernier appel publie en francais.'
        }
      })
      .expect(200);

    const list = await request(app).get('/api/last-posts').expect(200);
    assert.equal(list.body.lastPosts.length, 1);
    assert.equal(list.body.lastPosts[0].deceased.surname, 'Example');
  });
});
