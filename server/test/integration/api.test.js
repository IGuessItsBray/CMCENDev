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
const sharp = require('sharp');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const AuditLog = require('../../models/AuditLog');
const Event = require('../../models/Event');
const LastPostMessage = require('../../models/LastPostMessage');
const MediaAsset = require('../../models/MediaAsset');
const Page = require('../../models/Page');
const RetirementComment = require('../../models/RetirementComment');
const RetirementMessage = require('../../models/RetirementMessage');
const Role = require('../../models/Role');
const User = require('../../models/User');
const s3Client = require('../../storage');
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

  assert.equal(
    response.status,
    options.expectedStatus || 200,
    `Login setup failed for ${user.username}: ${JSON.stringify(response.body)}`
  );

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

function eventPayload(overrides = {}) {
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return {
    title: {
      en: 'Integration exercise',
      fr: "Exercice d'integration"
    },
    description: {
      en: 'English event description',
      fr: "Description francaise de l'evenement"
    },
    location: { en: 'Ottawa', fr: 'Ottawa' },
    city: 'Ottawa',
    provinceRegion: 'ON',
    organizingEntity: 'association',
    eventType: 'training',
    timezone: 'America/Toronto',
    startDate: startDate.toISOString().slice(0, 10),
    allDay: true,
    submitter: {
      rank: 'Captain',
      firstName: 'Integration',
      lastName: 'Submitter',
      unitRole: 'Test Unit',
      email: 'events@example.test'
    },
    publicationPermissionConfirmed: true,
    contentArea: 'general',
    ...overrides
  };
}

async function submitAndPublishRetirement() {
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
    .send({
      action: 'publish',
      messages: {
        en: translatedMessage('English'),
        fr: translatedMessage('French')
      }
    })
    .expect(200);

  return message;
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

    const invalidLogin = await login(user, {
      password: 'wrong-password',
      expectedStatus: 401
    });
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

describe('authorization matrix and account integrity', () => {
  test('enforces representative built-in role boundaries', async () => {
    const cases = [
      { role: 'subscriber', path: '/api/events/review', expected: 403 },
      { role: 'contributor', path: '/api/events/review', expected: 403 },
      { role: 'editor', path: '/api/events/review', expected: 200 },
      { role: 'editor', path: '/api/audit-logs', expected: 403 },
      { role: 'administrator', path: '/api/audit-logs', expected: 200 },
      { role: 'administrator', path: '/api/admin/pages', expected: 200 }
    ];

    for (const item of cases) {
      const user = await createUser({ role: item.role });
      const session = await login(user);
      await request(app)
        .get(item.path)
        .set('Authorization', bearer(session.body.token))
        .expect(item.expected);
    }
  });

  test('grants catalog permissions through a custom role but not developer-only access', async () => {
    const customRole = await Role.create({
      name: 'Audit Reader',
      slug: 'audit-reader',
      permissions: ['audit.view', 'site_config.access']
    });
    const user = await createUser({
      role: 'subscriber',
      customRoles: [customRole._id]
    });
    const session = await login(user);

    await request(app)
      .get('/api/audit-logs')
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    await request(app)
      .post('/api/admin/site-config/access')
      .set('Authorization', bearer(session.body.token))
      .send({})
      .expect(404);
  });

  test('rejects an otherwise valid token after its user is deleted', async () => {
    const user = await createUser();
    const session = await login(user);
    await User.deleteOne({ _id: user._id });

    const response = await request(app)
      .get('/api/me')
      .set('Authorization', bearer(session.body.token))
      .expect(401);

    assert.equal(response.body.error, 'User no longer exists');
  });
});

describe('event, page, and comment workflows', () => {
  test('submits, reviews, and publicly returns a bilingual event', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorSession = await login(contributor);
    const editorSession = await login(editor);

    const submitted = await request(app)
      .post('/api/events')
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(201);
    assert.equal(submitted.body.event.status, 'pending');

    const event = await Event.findOne();
    await request(app)
      .patch(`/api/events/${event._id}/review`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ action: 'publish' })
      .expect(200);

    const publicEvent = await request(app)
      .get(`/api/events/${event._id}`)
      .expect(200);
    assert.equal(publicEvent.body.event.title.en, 'Integration exercise');
    assert.equal(publicEvent.body.event.title.fr, "Exercice d'integration");
    assert.equal((await Event.findById(event._id)).status, 'published');
  });

  test('prevents unauthorized page management and publishes a bilingual page', async () => {
    const subscriber = await createUser({ role: 'subscriber' });
    const editor = await createUser({ role: 'editor' });
    const subscriberSession = await login(subscriber);
    const editorSession = await login(editor);
    const payload = {
      title: { en: 'Integration Page', fr: "Page d'integration" },
      slug: 'integration-page',
      summary: { en: 'English summary', fr: 'Resume francais' },
      blocks: [{
        type: 'text',
        body: { en: 'English body', fr: 'Corps francais' }
      }],
      access: { audience: 'public' }
    };

    await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(subscriberSession.body.token))
      .send(payload)
      .expect(403);

    const created = await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(editorSession.body.token))
      .send(payload)
      .expect(201);
    const pageId = created.body.page._id;

    await request(app)
      .patch(`/api/admin/pages/${pageId}/status`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ status: 'published' })
      .expect(200);

    const publicPage = await request(app)
      .get('/api/pages/integration-page')
      .expect(200);
    assert.equal(publicPage.body.page.title.fr, "Page d'integration");
    assert.equal((await Page.findById(pageId)).status, 'published');
  });

  test('holds subscriber comments for review and immediately publishes author comments', async () => {
    const message = await submitAndPublishRetirement();
    const subscriber = await createUser({ role: 'subscriber' });
    const author = await createUser({ role: 'author' });
    const subscriberSession = await login(subscriber);
    const authorSession = await login(author);

    const pending = await request(app)
      .post(`/api/retirement-messages/${message._id}/comments`)
      .set('Authorization', bearer(subscriberSession.body.token))
      .send({ body: 'A pending integration comment.' })
      .expect(201);
    assert.equal(pending.body.status, 'pending');
    assert.equal(pending.body.comment, null);

    const published = await request(app)
      .post(`/api/retirement-messages/${message._id}/comments`)
      .set('Authorization', bearer(authorSession.body.token))
      .send({ body: 'An immediately published integration comment.' })
      .expect(201);
    assert.equal(published.body.status, 'published');

    const publicComments = await request(app)
      .get(`/api/retirement-messages/${message._id}/comments`)
      .expect(200);
    assert.equal(publicComments.body.comments.length, 1);
    assert.equal(await RetirementComment.countDocuments({ status: 'pending' }), 1);
  });
});

describe('MFA and audit behavior', () => {
  test('sets up and verifies TOTP without exposing the secret in audit logs', async () => {
    const user = await createUser();
    const session = await login(user);
    const authorization = bearer(session.body.token);

    const setup = await request(app)
      .post('/api/mfa/totp/setup')
      .set('Authorization', authorization)
      .expect(200);
    const secret = new URL(setup.body.otpauth_url).searchParams.get('secret');
    assert.equal(typeof secret, 'string');

    const token = speakeasy.totp({ secret, encoding: 'base32' });
    await request(app)
      .post('/api/mfa/totp/verify')
      .set('Authorization', authorization)
      .send({ token })
      .expect(200);

    const status = await request(app)
      .get('/api/mfa/totp/status')
      .set('Authorization', authorization)
      .expect(200);
    assert.equal(status.body.enabled, true);

    const auditText = JSON.stringify(await AuditLog.find({}).lean());
    assert.equal(auditText.includes(secret), false);
  });

  test('normalizes forwarded IPv4 and composes audit date filters', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const oldDate = new Date('2026-01-01T12:00:00.000Z');
    const recentDate = new Date('2026-07-20T12:00:00.000Z');

    await AuditLog.create([
      { action: 'page.created', targetType: 'page', createdAt: oldDate },
      { action: 'page.created', targetType: 'page', createdAt: recentDate }
    ]);

    const filtered = await request(app)
      .get('/api/audit-logs?action=page.created&startDate=2026-07-01&endDate=2026-07-31')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.equal(filtered.body.logs.length, 1);

    await request(app)
      .get('/api/audit-logs/export.csv')
      .set('Authorization', bearer(session.body.token))
      .set('X-Forwarded-For', '203.0.113.8, 2001:db8::1')
      .expect(200);
    const exportAudit = await AuditLog.findOne({ action: 'audit.exported' }).lean();
    assert.equal(exportAudit.metadata.ipAddress, '203.0.113.8');
    assert.equal(exportAudit.metadata.ipAddresses.includes('2001:db8::1'), true);
  });
});

describe('media lifecycle', () => {
  test('uploads image variants with source metadata and deletes an orphan', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const admin = await createUser({ role: 'administrator' });
    const contributorSession = await login(contributor);
    const adminSession = await login(admin);
    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async command => {
      sentCommands.push(command);
      return {};
    };

    try {
      const image = await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 3,
          background: '#336699'
        }
      }).png().toBuffer();
      const uploaded = await request(app)
        .post('/api/upload')
        .set('Authorization', bearer(contributorSession.body.token))
        .field('uploadSource', 'mediaManager')
        .field('sourceName', 'Integration portrait')
        .attach('image', image, {
          filename: 'portrait.png',
          contentType: 'image/png'
        })
        .expect(201);

      const asset = await MediaAsset.findById(uploaded.body.mediaAsset._id).lean();
      assert.equal(asset.uploadContext.type, 'mediaManager');
      assert.equal(asset.displayName, 'Integration portrait');
      assert.equal(asset.originalName, 'portrait.png');
      assert.match(asset.url, /\/integration-test\/images\//);
      assert.equal(Object.keys(asset.variants).length, 4);
      assert.equal(sentCommands.filter(command => command.constructor.name === 'PutObjectCommand').length, 5);

      await request(app)
        .delete(`/api/admin/media/${encodeURIComponent(asset.key)}`)
        .set('Authorization', bearer(adminSession.body.token))
        .expect(200);
      assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 0);
      assert.equal(sentCommands.filter(command => command.constructor.name === 'DeleteObjectCommand').length, 5);
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('refuses to delete media attached to a retirement message', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const asset = await MediaAsset.create({
      key: 'images/attached/original.png',
      originalKey: 'images/attached/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/attached/original.png',
      originalUrl: 'http://127.0.0.1:9000/integration-test/images/attached/original.png',
      originalName: 'attached.png'
    });
    const message = await submitAndPublishRetirement();
    await RetirementMessage.updateOne(
      { _id: message._id },
      { $set: { photoUrl: asset.url } }
    );

    const response = await request(app)
      .delete(`/api/admin/media/${encodeURIComponent(asset.key)}`)
      .set('Authorization', bearer(session.body.token))
      .expect(409);

    assert.equal(response.body.error, 'Image is still attached to content');
    assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 1);
  });

  test('bulk deletion reports deleted, attached, and missing keys independently', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const orphan = await MediaAsset.create({
      key: 'images/orphan/original.png',
      originalKey: 'images/orphan/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/orphan/original.png'
    });
    const attached = await MediaAsset.create({
      key: 'images/used/original.png',
      originalKey: 'images/used/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/used/original.png'
    });
    const message = await submitAndPublishRetirement();
    await RetirementMessage.updateOne(
      { _id: message._id },
      { $set: { photoUrl: attached.url } }
    );
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async () => ({});

    try {
      const response = await request(app)
        .post('/api/admin/media/bulk-delete')
        .set('Authorization', bearer(session.body.token))
        .send({
          keys: [orphan.key, attached.key, 'images/missing/original.png']
        })
        .expect(200);

      assert.deepEqual(response.body.deleted, [orphan.key]);
      assert.equal(response.body.skipped[0].key, attached.key);
      assert.deepEqual(response.body.missing, ['images/missing/original.png']);
      assert.equal(await MediaAsset.countDocuments({ _id: orphan._id }), 0);
      assert.equal(await MediaAsset.countDocuments({ _id: attached._id }), 1);
    } finally {
      s3Client.send = originalSend;
    }
  });
});

describe('database integrity', () => {
  test('enforces unique user email and media keys', async () => {
    const userData = createMemberData({ email: 'unique@example.test' });
    await User.create(userData);

    await assert.rejects(
      User.create({ ...userData, username: 'different@example.test' }),
      error => error?.code === 11000
    );

    await MediaAsset.create({ key: 'images/unique/original.png' });
    await assert.rejects(
      MediaAsset.create({ key: 'images/unique/original.png' }),
      error => error?.code === 11000
    );
  });

  test('rejects duplicate page slugs and repeated review transitions', async () => {
    const editor = await createUser({ role: 'editor' });
    const session = await login(editor);
    const pagePayload = {
      title: { en: 'Unique page' },
      slug: 'unique-page'
    };

    await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send(pagePayload)
      .expect(201);
    await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send(pagePayload)
      .expect(409);

    const contributor = await createUser({ role: 'contributor' });
    const contributorSession = await login(contributor);
    await request(app)
      .post('/api/events')
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(201);
    const event = await Event.findOne();
    await request(app)
      .patch(`/api/events/${event._id}/review`)
      .set('Authorization', bearer(session.body.token))
      .send({ action: 'publish' })
      .expect(200);
    await request(app)
      .patch(`/api/events/${event._id}/review`)
      .set('Authorization', bearer(session.body.token))
      .send({ action: 'publish' })
      .expect(409);
  });
});
