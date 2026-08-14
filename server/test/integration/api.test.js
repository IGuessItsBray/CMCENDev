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
const jwt = require('jsonwebtoken');
const request = require('supertest');
const sharp = require('sharp');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const AuditLog = require('../../models/AuditLog');
const CertificateRequest = require('../../models/CertificateRequest');
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
const { buildPublicMediaUrl } = require('../../services/media-library');

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

async function login(user, options = {}) {
  const agent = options.agent || request(app);
  const response = await agent.post('/api/login').send({
    username: user.username,
    password: options.password || 'Correct-Horse-Integration-1!',
    sessionCookieConsent: options.sessionCookieConsent ?? true,
  });

  assert.equal(
    response.status,
    options.expectedStatus || 200,
    `Login setup failed for ${user.username}: ${JSON.stringify(response.body)}`,
  );

  return response;
}

function bearer(token) {
  return `Bearer ${token}`;
}

function retirementPayload() {
  const message =
    'This integration retirement message contains enough detail to satisfy the minimum length while exercising the complete submission and review workflow.';

  return {
    retiree: {
      rank: 'Sergeant',
      firstName: 'Alex',
      lastName: 'Example',
      postNominals: 'CD',
      tradeRole: RETIREMENT_TRADE_ROLES[0],
      retirementDate: '2026-08-01',
    },
    message,
    messageLanguage: 'en',
    photoUrl: '',
    submitter: {
      firstName: 'Integration',
      lastName: 'Submitter',
      relationship: 'colleague',
      email: 'submitter@example.test',
      unit: 'Integration Test Unit',
    },
    publicationConsentConfirmed: true,
    memberReviewConfirmed: true,
  };
}

function certificateRequestPayload() {
  return {
    member: {
      fullName: 'Sergeant Alex Example, CD',
      rankLanguage: 'en',
      decorations: ['CD'],
      lastUnit: 'CMBG HQ & Sigs',
      cafEnrollmentDate: '2001-09-01',
      releaseDate: '2026-08-01',
      ceBranchEnrollmentDate: '',
      neededByDate: '2026-07-15',
      dwdParadeRequested: false,
    },
    familyMembers: [
      {
        relationship: 'son',
        fullName: 'Jordan Example',
      },
      {
        relationship: 'daughter',
        fullName: 'Taylor Example',
      },
    ],
    mailingAddress: {
      line1: '100 Certificate Way',
      line2: 'Unit 2',
      city: 'Ottawa',
      province: 'Ontario',
      postalCode: 'K1A 0A1',
      country: 'Canada',
    },
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
      fr: "Exercice d'integration",
    },
    description: {
      en: 'English event description',
      fr: "Description francaise de l'evenement",
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
      email: 'events@example.test',
    },
    publicationPermissionConfirmed: true,
    contentArea: 'general',
    ...overrides,
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
        fr: translatedMessage('French'),
      },
    })
    .expect(200);

  return message;
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
      expectedStatus: 401,
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

  test('requires session-cookie consent before issuing a login session', async () => {
    const user = await createUser();

    const consentRequired = await login(user, {
      sessionCookieConsent: false,
    });

    assert.equal(consentRequired.body.sessionCookieConsentRequired, true);
    assert.equal(consentRequired.body.token, undefined);
    assert.equal(consentRequired.headers['set-cookie'], undefined);

    const consentedLogin = await login(user, { sessionCookieConsent: true });

    assert.equal(typeof consentedLogin.body.token, 'string');
    assert.match(consentedLogin.headers['set-cookie'][0], /cmcen_refresh=/);
  });
});

describe('public search', () => {
  test('returns canonical destinations for event, retirement, and static page results', async () => {
    const owner = await createUser({ role: 'editor' });
    const event = await Event.create({
      title: {
        en: 'Searchable signal exercise',
        fr: 'Exercice de transmissions',
      },
      description: { en: 'Search result destination check.', fr: '' },
      startDate: new Date('2040-07-18T12:00:00.000Z'),
      allDay: true,
      status: 'published',
      createdBy: owner._id,
    });
    const retirement = await submitAndPublishRetirement();
    const lastPost = await LastPostMessage.create({
      title: 'Last Post for Searchable Signal',
      submitter: {
        rank: 'Captain',
        firstName: 'Search',
        lastName: 'Tester',
        email: 'search@example.test',
      },
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Signal',
        surname: 'Memorial',
      },
      messageLanguage: 'en',
      messages: {
        en: 'A searchable memorial notice for the signal community.',
        fr: 'Un avis commemoratif recherche.',
      },
      status: 'published',
      publishedAt: new Date(),
      createdBy: owner._id,
    });

    const eventSearch = await request(app)
      .get('/api/search?q=signal%20exercise')
      .expect(200);
    const eventResult = eventSearch.body.results.find(
      (result) => result.type === 'event',
    );
    assert.equal(eventResult.url, `/event?id=${event._id}`);

    const lastPostSearch = await request(app)
      .get('/api/search?q=signal%20memorial')
      .expect(200);
    const lastPostResult = lastPostSearch.body.results.find(
      (result) => result.type === 'last-post-message',
    );
    assert.equal(lastPostResult.url, `/last-post-message?id=${lastPost._id}`);

    const retirementSearch = await request(app)
      .get('/api/search?q=alex%20example')
      .expect(200);
    const retirementResult = retirementSearch.body.results.find(
      (result) => result.type === 'retirement-message',
    );
    assert.equal(
      retirementResult.url,
      `/retirement-message?id=${retirement._id}`,
    );

    const pageSearch = await request(app)
      .get('/api/search?q=calendar')
      .expect(200);
    const pageResult = pageSearch.body.results.find(
      (result) => result.sourceId === '/calendar',
    );
    assert.equal(pageResult.url, '/calendar');

    const historySearch = await request(app)
      .get('/api/search?q=history')
      .expect(200);
    assert.equal(historySearch.body.results[0].sourceId, '/history');

    const homeSearch = await request(app)
      .get('/api/search?q=home')
      .expect(200);
    assert.equal(
      homeSearch.body.results.some((result) => result.sourceId === '/index'),
      false,
    );

    const retirementPageSearch = await request(app)
      .get('/api/search?q=retirement')
      .expect(200);
    assert.equal(
      retirementPageSearch.body.results[0].sourceId,
      '/retirements',
    );

    const lastPostPageSearch = await request(app)
      .get('/api/search?q=last%20post')
      .expect(200);
    assert.equal(lastPostPageSearch.body.results[0].sourceId, '/last-post');

    const eventPageSearch = await request(app)
      .get('/api/search?q=event')
      .expect(200);
    assert.equal(eventPageSearch.body.results[0].sourceId, '/calendar');

    assert.equal(
      [...eventSearch.body.results, ...lastPostSearch.body.results].every(
        (result) => Boolean(result.url),
      ),
      true,
    );
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
          role: admin.role,
        },
        targetType: 'event',
        targetSnapshot: { title: 'Quoted, "Event"' },
        metadata: { note: 'First line\nSecond line' },
      },
      {
        action: 'content.deleted',
        actor: admin._id,
        actorSnapshot: {
          username: admin.username,
          accountName: admin.accountName,
          role: admin.role,
        },
        targetType: 'page',
        targetSnapshot: { title: 'Other record' },
      },
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

    const exportAudit = await AuditLog.findOne({
      action: 'audit.exported',
    }).lean();
    assert.equal(exportAudit.metadata.entryCount, 1);
  });
});

describe('retirement message lifecycle', () => {
  test('creates a pending certificate request alongside a retirement submission', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const contributorLogin = await login(contributor);

    const submitted = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        ...retirementPayload(),
        certificateRequest: certificateRequestPayload(),
      })
      .expect(201);

    assert.equal(submitted.body.status, 'pending');
    assert.equal(submitted.body.certificateRequest.status, 'pending');

    const retirementMessage = await RetirementMessage.findOne().lean();
    const certificateRequest = await CertificateRequest.findById(
      submitted.body.certificateRequest.id,
    ).lean();

    assert.equal(certificateRequest.certificateType, 'retirement');
    assert.equal(certificateRequest.status, 'pending');
    assert.equal(certificateRequest.source.type, 'retirementMessage');
    assert.equal(
      String(certificateRequest.source.id),
      String(retirementMessage._id),
    );
    assert.equal(certificateRequest.member.rank, 'Sergeant');
    assert.equal(
      certificateRequest.member.tradeRole,
      RETIREMENT_TRADE_ROLES[0],
    );
    assert.equal(certificateRequest.member.ceBranchEnrollmentDate, null);
    assert.equal(certificateRequest.member.dwdParadeRequested, false);
    assert.deepEqual(
      certificateRequest.familyMembers.map((member) => member.relationship),
      ['son', 'daughter'],
    );

    const auditLog = await AuditLog.findOne({
      action: 'content.certificate_request_created',
      target: certificateRequest._id,
    }).lean();
    assert.equal(auditLog.targetType, 'certificateRequest');
    assert.equal(auditLog.metadata.status, 'pending');
  });

  test('requires every certificate field other than the C&E enrollment date', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const contributorLogin = await login(contributor);
    const invalidCertificateRequest = certificateRequestPayload();
    invalidCertificateRequest.mailingAddress.line2 = '';

    const rejected = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        ...retirementPayload(),
        certificateRequest: invalidCertificateRequest,
      })
      .expect(400);

    assert.match(rejected.body.error, /mailing address field is required/);
    assert.equal(await RetirementMessage.countDocuments(), 0);
    assert.equal(await CertificateRequest.countDocuments(), 0);
  });

  test('requires every certificate confirmation before mailing and audits fulfillment', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorLogin = await login(contributor);
    const editorLogin = await login(editor);

    const submitted = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        ...retirementPayload(),
        certificateRequest: certificateRequestPayload(),
      })
      .expect(201);

    const certificateRequestId = submitted.body.certificateRequest.id;

    await request(app)
      .get('/api/certificate-requests/count')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(403);

    const count = await request(app)
      .get('/api/certificate-requests/count')
      .set('Authorization', bearer(editorLogin.body.token))
      .expect(200);
    assert.equal(count.body.pending, 1);
    assert.equal(count.body.readyToMail, 0);
    assert.equal(count.body.actionable, 1);

    const pendingRequests = await request(app)
      .get('/api/certificate-requests?status=pending')
      .set('Authorization', bearer(editorLogin.body.token))
      .expect(200);
    assert.equal(pendingRequests.body.certificateRequests.length, 1);
    assert.equal(
      pendingRequests.body.certificateRequests[0].mailingAddress.line1,
      '100 Certificate Way',
    );

    await request(app)
      .patch(`/api/certificate-requests/${certificateRequestId}/status`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ status: 'ready_to_mail', printedCertificateKeys: ['member'] })
      .expect(400);

    const printingConfirmed = await request(app)
      .patch(`/api/certificate-requests/${certificateRequestId}/status`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({
        status: 'ready_to_mail',
        printedCertificateKeys: ['member', 'family:0', 'family:1'],
      })
      .expect(200);
    assert.equal(
      printingConfirmed.body.certificateRequest.status,
      'ready_to_mail',
    );

    const printedRequest =
      await CertificateRequest.findById(certificateRequestId).lean();
    assert.equal(printedRequest.status, 'ready_to_mail');
    assert.equal(String(printedRequest.printedBy), String(editor._id));
    assert.ok(printedRequest.printedAt);
    assert.deepEqual(
      printedRequest.printedCertificates.map(
        (certificate) => certificate.certificateKey,
      ),
      ['member', 'family:0', 'family:1'],
    );

    const readyToMailCount = await request(app)
      .get('/api/certificate-requests/count')
      .set('Authorization', bearer(editorLogin.body.token))
      .expect(200);
    assert.equal(readyToMailCount.body.pending, 0);
    assert.equal(readyToMailCount.body.readyToMail, 1);
    assert.equal(readyToMailCount.body.actionable, 1);

    const readyToMailRequests = await request(app)
      .get('/api/certificate-requests?status=actionable')
      .set('Authorization', bearer(editorLogin.body.token))
      .expect(200);
    assert.equal(readyToMailRequests.body.certificateRequests.length, 1);
    assert.equal(
      readyToMailRequests.body.certificateRequests[0].status,
      'ready_to_mail',
    );

    const printAudit = await AuditLog.findOne({
      action: 'content.certificate_request_print_confirmed',
      target: certificateRequestId,
    }).lean();
    assert.equal(printAudit.metadata.previousStatus, 'pending');
    assert.equal(printAudit.metadata.status, 'ready_to_mail');
    assert.equal(printAudit.metadata.certificateCount, 3);

    const mailed = await request(app)
      .patch(`/api/certificate-requests/${certificateRequestId}/status`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ status: 'mailed' })
      .expect(200);
    assert.equal(mailed.body.certificateRequest.status, 'mailed');

    const mailedRequest =
      await CertificateRequest.findById(certificateRequestId).lean();
    assert.equal(mailedRequest.status, 'mailed');
    assert.equal(String(mailedRequest.mailedBy), String(editor._id));
    assert.ok(mailedRequest.mailedAt);

    const emptyActionableRequests = await request(app)
      .get('/api/certificate-requests?status=actionable')
      .set('Authorization', bearer(editorLogin.body.token))
      .expect(200);
    assert.equal(emptyActionableRequests.body.certificateRequests.length, 0);

    const mailAudit = await AuditLog.findOne({
      action: 'content.certificate_request_mailed',
      target: certificateRequestId,
    }).lean();
    assert.equal(mailAudit.metadata.previousStatus, 'ready_to_mail');
    assert.equal(mailAudit.metadata.status, 'mailed');
  });

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
    assert.equal(message.submitter.firstName, contributor.firstName);
    assert.equal(message.submitter.lastName, contributor.lastName);
    assert.equal(message.submitter.email, contributor.email);
    assert.equal(message.submitter.unit, contributor.currentUnit);
    assert.equal(message.submitter.relationship, 'colleague');

    const updatePayload = retirementPayload();
    updatePayload.submitter.relationship = 'family';

    await RetirementMessage.updateOne(
      { _id: message._id },
      { $set: { 'submitter.unit': '' } },
    );

    await request(app)
      .patch(`/api/retirement-messages/${message._id}`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(updatePayload)
      .expect(200);

    const updatedMessage = await RetirementMessage.findById(message._id).lean();
    assert.equal(updatedMessage.submitter.firstName, contributor.firstName);
    assert.equal(updatedMessage.submitter.lastName, contributor.lastName);
    assert.equal(updatedMessage.submitter.email, contributor.email);
    assert.equal(updatedMessage.submitter.unit, contributor.currentUnit);
    assert.equal(updatedMessage.submitter.relationship, 'family');

    await request(app)
      .patch(`/api/retirement-messages/${message._id}/review`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ action: 'publish' })
      .expect(403);
  });

  test('lets bypass-capable users choose immediate publication', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const developer = await createUser({ role: 'developer' });
    const contributorLogin = await login(contributor);
    const developerLogin = await login(developer);

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ ...retirementPayload(), publishNow: true })
      .expect(403);

    const queued = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(developerLogin.body.token))
      .send(retirementPayload())
      .expect(201);
    assert.equal(queued.body.status, 'pending');

    const queuedMessage = await RetirementMessage.findOne({
      status: 'pending',
    }).lean();
    const resubmitted = await request(app)
      .patch(`/api/retirement-messages/${queuedMessage._id}`)
      .set('Authorization', bearer(developerLogin.body.token))
      .send({ ...retirementPayload(), publishNow: true })
      .expect(200);
    assert.equal(resubmitted.body.retirementMessage.status, 'published');

    const published = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(developerLogin.body.token))
      .send({ ...retirementPayload(), publishNow: true })
      .expect(201);
    assert.equal(published.body.status, 'published');
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
          fr: translatedMessage('French'),
        },
      })
      .expect(200);

    const publicMessage = await request(app)
      .get(`/api/retirement-messages/${message._id}`)
      .expect(200);
    assert.equal(
      (await RetirementMessage.findById(message._id)).status,
      'published',
    );
    assert.equal(publicMessage.body.retirementMessage.status, undefined);
    assert.equal(
      publicMessage.body.retirementMessage.messages.en,
      translatedMessage('English'),
    );
    assert.equal(
      publicMessage.body.retirementMessage.messages.fr,
      translatedMessage('French'),
    );

    const publishedAudit = await AuditLog.findOne({
      action: 'content.published',
      targetType: 'retirementMessage',
    }).lean();
    assert.equal(String(publishedAudit.target), String(message._id));
  });

  test('lets reviewers save a retirement translation before publication', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorLogin = await login(contributor);
    const editorLogin = await login(editor);

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);

    const messageId = (await RetirementMessage.findOne())._id;
    const frenchTranslation = translatedMessage('French reviewer');

    await request(app)
      .patch(`/api/retirement-messages/${messageId}/review-content`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ language: 'fr', message: frenchTranslation })
      .expect(403);

    const response = await request(app)
      .patch(`/api/retirement-messages/${messageId}/review-content`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ language: 'fr', message: frenchTranslation })
      .expect(200);

    assert.equal(response.body.retirementMessage.status, 'pending');
    assert.equal(
      response.body.retirementMessage.messages.fr,
      frenchTranslation,
    );

    const savedMessage = await RetirementMessage.findById(messageId);
    assert.equal(savedMessage.status, 'pending');
    assert.equal(savedMessage.messages.fr, frenchTranslation);

    const auditEntry = await AuditLog.findOne({
      action: 'content.review_content_updated',
      target: savedMessage._id,
    });
    assert.equal(auditEntry.targetType, 'retirementMessage');
    assert.equal(auditEntry.metadata.language, 'fr');

    await request(app)
      .patch(`/api/retirement-messages/${messageId}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ action: 'publish' })
      .expect(200);
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
      .send({
        action: 'reject',
        rejectionReason: 'Missing confirmation details',
      })
      .expect(200);

    assert.equal(
      (await RetirementMessage.findById(message._id)).status,
      'rejected',
    );
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
          postNominal: 'CD',
        },
        messageLanguage: 'en',
        message: 'An English Last Post notice used by the integration test.',
        imageUrl: '',
        publicationPermissionConfirmed: true,
      })
      .expect(201);

    const notice = await LastPostMessage.findOne();
    assert.equal(notice.status, 'pending');
    assert.equal(notice.publicationPermission.confirmed, true);
    assert.equal(
      String(notice.publicationPermission.confirmedBy),
      String(contributor._id),
    );

    await request(app)
      .patch(`/api/last-posts/${notice._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({
        action: 'publish',
        messages: {
          en: 'Published English Last Post notice.',
          fr: 'Avis du Dernier appel publie en francais.',
        },
      })
      .expect(200);

    const list = await request(app).get('/api/last-posts').expect(200);
    assert.equal(list.body.lastPosts.length, 1);
    assert.equal(list.body.lastPosts[0].deceased.surname, 'Example');
  });

  test('lets reviewers save a Last Post translation before publication', async () => {
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
          firstName: 'Last',
          surname: 'Post',
          postNominal: 'CD',
        },
        messageLanguage: 'en',
        message: 'Submitted English Last Post notice.',
        publicationPermissionConfirmed: true,
      })
      .expect(201);

    const notice = await LastPostMessage.findOne();
    const frenchTranslation = 'Avis du Dernier appel ajouté par le réviseur.';

    await request(app)
      .patch(`/api/last-posts/${notice._id}/review-content`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ language: 'fr', message: frenchTranslation })
      .expect(403);

    const response = await request(app)
      .patch(`/api/last-posts/${notice._id}/review-content`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ language: 'fr', message: frenchTranslation })
      .expect(200);

    assert.equal(response.body.lastPost.status, 'pending');
    assert.equal(response.body.lastPost.messages.fr, frenchTranslation);

    const savedNotice = await LastPostMessage.findById(notice._id);
    assert.equal(savedNotice.status, 'pending');
    assert.equal(savedNotice.messages.fr, frenchTranslation);

    const auditEntry = await AuditLog.findOne({
      action: 'content.review_content_updated',
      target: savedNotice._id,
    });
    assert.equal(auditEntry.targetType, 'lastPost');
    assert.equal(auditEntry.metadata.language, 'fr');

    await request(app)
      .patch(`/api/last-posts/${notice._id}/review`)
      .set('Authorization', bearer(editorLogin.body.token))
      .send({ action: 'publish' })
      .expect(200);
  });

  test('requires chain-of-command consent and limits immediate publication to reviewers', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const administrator = await createUser({ role: 'administrator' });
    const contributorLogin = await login(contributor);
    const administratorLogin = await login(administrator);
    const submission = {
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Immediate',
        surname: 'Publication',
      },
      messageLanguage: 'en',
      message: 'A Last Post notice used to verify consent and immediate publication.',
    };

    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(submission)
      .expect(400);

    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        ...submission,
        publicationPermissionConfirmed: true,
        publishNow: true,
      })
      .expect(403);

    const published = await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(administratorLogin.body.token))
      .send({
        ...submission,
        publicationPermissionConfirmed: true,
        publishNow: true,
      })
      .expect(201);
    assert.equal(published.body.lastPost.status, 'published');

    const publishedNotice = await LastPostMessage.findOne({
      status: 'published',
    });
    assert.ok(publishedNotice.publishedAt);
    assert.equal(
      String(publishedNotice.publishedBy),
      String(administrator._id),
    );

    const publicationAudit = await AuditLog.findOne({
      action: 'content.published',
      target: publishedNotice._id,
    });
    assert.equal(publicationAudit.targetType, 'lastPost');
    assert.equal(publicationAudit.metadata.source, 'create');
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
      { role: 'administrator', path: '/api/admin/pages', expected: 200 },
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

  test('restricts Internal Beta role changes to developers', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const developer = await createUser({ role: 'developer' });
    const member = await createUser({ role: 'subscriber' });
    const administratorLogin = await login(administrator);
    const developerLogin = await login(developer);

    await request(app)
      .patch(`/api/admin/users/${member._id}/role`)
      .set('Authorization', bearer(administratorLogin.body.token))
      .send({ role: 'internal_beta' })
      .expect(403);

    await request(app)
      .patch(`/api/admin/users/${member._id}/role`)
      .set('Authorization', bearer(developerLogin.body.token))
      .send({ role: 'internal_beta' })
      .expect(200);

    const updatedMember = await User.findById(member._id).lean();
    assert.equal(updatedMember.role, 'internal_beta');
  });

  test('invites a user with a built-in role and rejects custom role assignment', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const customRole = await Role.create({
      name: 'Invite-only custom role',
      slug: 'invite-only-custom-role',
      permissions: ['audit.view'],
    });
    const token = jwt.sign(
      { userId: administrator._id },
      process.env.JWT_SECRET,
    );

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(token))
      .send({
        firstName: 'Jordan',
        lastName: 'Example',
        email: 'jordan.example@example.test',
        role: 'editor',
        customRoleIds: [String(customRole._id)],
      })
      .expect(400);

    const response = await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(token))
      .send({
        firstName: 'Jordan',
        lastName: 'Example',
        email: 'jordan.example@example.test',
        role: 'editor',
      })
      .expect(201);

    assert.equal(response.body.user.role, 'editor');
    assert.deepEqual(response.body.user.customRoles, []);
    const invitedUser = await User.findById(response.body.user._id).lean();
    assert.equal(invitedUser.accountType, 'invited');
    assert.equal(invitedUser.firstName, 'Jordan');
    assert.equal(invitedUser.lastName, 'Example');
    assert.deepEqual(invitedUser.customRoles, []);
  });

  test('restricts Internal Beta invitations to developers', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const developer = await createUser({ role: 'developer' });
    const administratorLogin = await login(administrator);
    const developerLogin = await login(developer);
    const invitation = {
      firstName: 'Beta',
      lastName: 'Member',
      email: 'internal-beta@example.test',
      role: 'internal_beta',
    };

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(administratorLogin.body.token))
      .send(invitation)
      .expect(403);

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(developerLogin.body.token))
      .send(invitation)
      .expect(201);

    const invitedMember = await User.findOne({
      email: invitation.email,
    }).lean();
    assert.equal(invitedMember.role, 'internal_beta');
  });

  test('grants catalog permissions through a custom role but not developer-only access', async () => {
    const customRole = await Role.create({
      name: 'Audit Reader',
      slug: 'audit-reader',
      permissions: ['audit.view', 'site_config.access'],
    });
    const user = await createUser({
      role: 'subscriber',
      customRoles: [customRole._id],
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
    assert.equal(event.submitter.rank, contributor.rank);
    assert.equal(event.submitter.firstName, contributor.firstName);
    assert.equal(event.submitter.lastName, contributor.lastName);
    assert.equal(event.submitter.unitRole, contributor.currentUnit);
    assert.equal(event.submitter.email, contributor.email);

    await request(app)
      .patch(`/api/events/${event._id}`)
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(200);

    const updatedEvent = await Event.findById(event._id);
    assert.equal(updatedEvent.submitter.rank, contributor.rank);
    assert.equal(updatedEvent.submitter.firstName, contributor.firstName);
    assert.equal(updatedEvent.submitter.lastName, contributor.lastName);
    assert.equal(updatedEvent.submitter.unitRole, contributor.currentUnit);
    assert.equal(updatedEvent.submitter.email, contributor.email);

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

  test('lets reviewers update one pending event language without changing its review state', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorSession = await login(contributor);
    const editorSession = await login(editor);

    const submitted = await request(app)
      .post('/api/events')
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(201);

    const eventId = submitted.body.event._id;
    const changes = {
      title: 'Exercice d’intégration révisé',
      location: 'Ottawa, Ontario',
      description: 'Description française ajoutée par le réviseur.',
      registration: 'Inscription auprès de la section locale.',
    };

    await request(app)
      .patch(`/api/events/${eventId}/review-content`)
      .set('Authorization', bearer(contributorSession.body.token))
      .send({ language: 'fr', content: changes })
      .expect(403);

    const response = await request(app)
      .patch(`/api/events/${eventId}/review-content`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ language: 'fr', content: changes })
      .expect(200);

    assert.equal(response.body.event.status, 'pending');
    assert.equal(response.body.event.title.en, 'Integration exercise');
    assert.deepEqual(response.body.event.title.fr, changes.title);

    const updatedEvent = await Event.findById(eventId);
    assert.equal(updatedEvent.status, 'pending');
    assert.equal(updatedEvent.location.fr, changes.location);
    assert.equal(updatedEvent.description.fr, changes.description);
    assert.equal(updatedEvent.registration.fr, changes.registration);

    const auditEntry = await AuditLog.findOne({
      action: 'content.review_content_updated',
      target: updatedEvent._id,
    });
    assert.equal(auditEntry.metadata.language, 'fr');
  });

  test('returns published events that overlap a requested calendar range', async () => {
    const owner = await createUser({ role: 'editor' });

    await Event.create([
      {
        title: { en: 'Overlapping event', fr: 'Événement en cours' },
        provinceRegion: 'ON',
        organizingEntity: 'association',
        eventType: 'training',
        startDate: new Date('2040-06-29T12:00:00.000Z'),
        endDate: new Date('2040-07-02T12:00:00.000Z'),
        allDay: true,
        status: 'published',
        createdBy: owner._id,
      },
      {
        title: { en: 'July event', fr: 'Événement de juillet' },
        provinceRegion: 'QC',
        organizingEntity: 'branch',
        eventType: 'ceremony',
        startDate: new Date('2040-07-18T12:00:00.000Z'),
        allDay: true,
        status: 'published',
        createdBy: owner._id,
      },
      {
        title: { en: 'August event', fr: 'Événement d’août' },
        provinceRegion: 'ON',
        organizingEntity: 'association',
        eventType: 'training',
        startDate: new Date('2040-08-01T12:00:00.000Z'),
        allDay: true,
        status: 'published',
        createdBy: owner._id,
      },
    ]);

    const response = await request(app)
      .get('/api/events?from=2040-07-01&to=2040-07-31')
      .expect(200);

    assert.deepEqual(
      response.body.events.map((event) => event.title.en),
      ['Overlapping event', 'July event'],
    );

    const filteredResponse = await request(app)
      .get(
        '/api/events?from=2040-07-01&to=2040-07-31&eventType=training&organizingEntity=association&provinceRegion=ON',
      )
      .expect(200);

    assert.deepEqual(
      filteredResponse.body.events.map((event) => event.title.en),
      ['Overlapping event'],
    );

    const incompleteRange = await request(app)
      .get('/api/events?from=2040-07-01')
      .expect(400);

    assert.equal(
      incompleteRange.body.error,
      'The from and to parameters must be used together',
    );

    const invalidFilter = await request(app)
      .get('/api/events?eventType=invalid')
      .expect(400);

    assert.equal(
      invalidFilter.body.error,
      'The eventType parameter is invalid',
    );
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
      blocks: [
        {
          type: 'text',
          body: { en: 'English body', fr: 'Corps francais' },
        },
      ],
      access: { audience: 'public' },
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
    assert.equal(
      await RetirementComment.countDocuments({ status: 'pending' }),
      1,
    );
  });
});

describe('MFA and audit behavior', () => {
  test('rate limits repeated password reset requests for the same email', async () => {
    const email = `reset-limit-${Date.now()}@example.test`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app)
        .post('/api/password-reset/request')
        .set('X-Forwarded-For', `198.51.100.${attempt + 1}`)
        .send({ email })
        .expect(200);
    }

    const limited = await request(app)
      .post('/api/password-reset/request')
      .set('X-Forwarded-For', '198.51.100.4')
      .send({ email })
      .expect(429);

    assert.match(limited.headers['retry-after'], /^\d+$/);
    assert.equal(
      limited.body.error,
      'Too many requests. Please try again later.',
    );
  });

  test('rate limits repeated invalid TOTP verification attempts per account', async () => {
    const user = await createUser();
    const session = await login(user);
    const authorization = bearer(session.body.token);

    await request(app)
      .post('/api/mfa/totp/setup')
      .set('Authorization', authorization)
      .expect(200);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/mfa/totp/verify')
        .set('Authorization', authorization)
        .send({ token: '000000' })
        .expect(400);
    }

    const limited = await request(app)
      .post('/api/mfa/totp/verify')
      .set('Authorization', authorization)
      .send({ token: '000000' })
      .expect(429);

    assert.match(limited.headers['retry-after'], /^\d+$/);
  });

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
      { action: 'page.created', targetType: 'page', createdAt: recentDate },
    ]);

    const filtered = await request(app)
      .get(
        '/api/audit-logs?action=page.created&startDate=2026-07-01&endDate=2026-07-31',
      )
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.equal(filtered.body.logs.length, 1);

    await request(app)
      .get('/api/audit-logs/export.csv')
      .set('Authorization', bearer(session.body.token))
      .set('X-Forwarded-For', '203.0.113.8, 2001:db8::1')
      .expect(200);
    const exportAudit = await AuditLog.findOne({
      action: 'audit.exported',
    }).lean();
    assert.equal(exportAudit.metadata.ipAddress, '203.0.113.8');
    assert.equal(
      exportAudit.metadata.ipAddresses.includes('2001:db8::1'),
      true,
    );
  });
});

describe('media lifecycle', () => {
  test('filters media by content type and searches file or image names', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const retirementAsset = await MediaAsset.create({
      key: 'images/retirement-ceremony/original.png',
      originalKey: 'images/retirement-ceremony/original.png',
      originalName: 'retirement-ceremony.png',
      displayName: 'Retirement ceremony portrait',
      uploadContext: { type: 'retirementMessage' },
    });
    await MediaAsset.create({
      key: 'images/event-banner/original.png',
      originalKey: 'images/event-banner/original.png',
      originalName: 'event-banner.png',
      displayName: 'Summer event banner',
      uploadContext: { type: 'event' },
    });

    const searched = await request(app)
      .get('/api/admin/media?search=ceremony')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.deepEqual(
      searched.body.media.map((asset) => asset.key),
      [retirementAsset.key],
    );

    const filtered = await request(app)
      .get('/api/admin/media?type=retirement')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.equal(
      filtered.body.media.some((asset) => asset.key === retirementAsset.key),
      true,
    );
    assert.equal(filtered.body.type, 'retirement');
  });

  test('uploads image variants with a custom CDN slug and prevents reuse', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const admin = await createUser({ role: 'administrator' });
    const contributorSession = await login(contributor);
    const adminSession = await login(admin);
    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async (command) => {
      sentCommands.push(command);
      return {};
    };

    try {
      const image = await sharp({
        create: {
          width: 32,
          height: 24,
          channels: 3,
          background: '#336699',
        },
      })
        .jpeg()
        .withMetadata({
          exif: {
            IFD0: {
              Artist: 'Sensitive source identity',
            },
          },
        })
        .toBuffer();
      assert.ok((await sharp(image).metadata()).exif);
      const uploaded = await request(app)
        .post('/api/upload')
        .set('Authorization', bearer(contributorSession.body.token))
        .field('uploadSource', 'mediaManager')
        .field('sourceName', 'Integration portrait')
        .field('cdnSlug', 'integration-portrait')
        .attach('image', image, {
          filename: 'portrait.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      const asset = await MediaAsset.findById(
        uploaded.body.mediaAsset._id,
      ).lean();
      assert.equal(asset.uploadContext.type, 'mediaManager');
      assert.equal(asset.displayName, 'Integration portrait');
      assert.equal(asset.originalName, 'portrait.jpg');
      assert.equal(asset.cdnSlug, 'integration-portrait');
      assert.equal(asset.mimeType, 'image/webp');
      assert.match(asset.key, /\/original\.webp$/);
      assert.match(
        asset.url,
        /\/integration-test\/images\/integration-portrait\/large\.webp$/,
      );
      assert.equal(Object.keys(asset.variants).length, 4);
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'PutObjectCommand',
        ).length,
        5,
      );
      const storedOriginal = sentCommands.find(
        (command) =>
          command.constructor.name === 'PutObjectCommand' &&
          command.input.Key === asset.originalKey,
      );
      assert.ok(storedOriginal);
      const storedMetadata = await sharp(storedOriginal.input.Body).metadata();
      assert.equal(storedMetadata.exif, undefined);
      assert.equal(storedMetadata.xmp, undefined);
      assert.equal(storedMetadata.iptc, undefined);
      assert.equal(storedMetadata.icc, undefined);
      assert.equal(asset.imageMetadata.format, 'webp');
      assert.equal(asset.imageMetadata.width, 32);
      assert.equal(asset.imageMetadata.height, 24);
      assert.equal('exif' in asset.imageMetadata, false);
      assert.equal('xmp' in asset.imageMetadata, false);
      assert.equal('iptc' in asset.imageMetadata, false);
      assert.equal('icc' in asset.imageMetadata, false);

      const uploadAudit = await AuditLog.findOne({
        action: 'media.uploaded',
        target: asset._id,
      }).lean();
      assert.equal(uploadAudit.metadata.cdnSlug, 'integration-portrait');

      const duplicate = await request(app)
        .post('/api/upload')
        .set('Authorization', bearer(contributorSession.body.token))
        .field('uploadSource', 'mediaManager')
        .field('cdnSlug', 'integration-portrait')
        .attach('image', image, {
          filename: 'portrait.png',
          contentType: 'image/png',
        })
        .expect(409);
      assert.equal(duplicate.body.error, 'That CDN slug is already in use');

      await request(app)
        .delete(`/api/admin/media/${encodeURIComponent(asset.key)}`)
        .set('Authorization', bearer(adminSession.body.token))
        .expect(200);
      assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 0);
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'DeleteObjectCommand',
        ).length,
        5,
      );
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('rejects signed direct uploads that would bypass media sanitization', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const session = await login(contributor);

    const response = await request(app)
      .post('/api/upload-url')
      .set('Authorization', bearer(session.body.token))
      .send({ filename: 'unsanitized.jpg', contentType: 'image/jpeg' })
      .expect(410);

    assert.match(response.body.error, /Direct uploads are disabled/u);
    assert.equal(
      await MediaAsset.countDocuments({ originalName: 'unsanitized.jpg' }),
      0,
    );
  });

  test('refuses to delete media attached to a retirement message', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const asset = await MediaAsset.create({
      key: 'images/attached/original.png',
      originalKey: 'images/attached/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/attached/original.png',
      originalUrl:
        'http://127.0.0.1:9000/integration-test/images/attached/original.png',
      originalName: 'attached.png',
    });
    const message = await submitAndPublishRetirement();
    await RetirementMessage.updateOne(
      { _id: message._id },
      { $set: { photoUrl: asset.url } },
    );

    const response = await request(app)
      .delete(`/api/admin/media/${encodeURIComponent(asset.key)}`)
      .set('Authorization', bearer(session.body.token))
      .expect(409);

    assert.equal(response.body.error, 'Image is still attached to content');
    assert.equal(await MediaAsset.countDocuments({ _id: asset._id }), 1);
  });

  test('deletes unshared images and variants when an administrator deletes content', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const contributor = await createUser({ role: 'contributor' });
    const administratorSession = await login(administrator);
    const contributorSession = await login(contributor);
    const createAsset = async (slug) => {
      const baseKey = `images/${slug}`;
      const originalKey = `${baseKey}/original.png`;
      const variants = Object.fromEntries(
        ['thumb', 'medium', 'large', 'hero'].map((name) => [
          name,
          {
            key: `${baseKey}/${name}.webp`,
            url: buildPublicMediaUrl(`${baseKey}/${name}.webp`),
          },
        ]),
      );

      return MediaAsset.create({
        key: originalKey,
        url: variants.large.url,
        originalKey,
        originalUrl: buildPublicMediaUrl(originalKey),
        variants,
      });
    };
    const [eventAsset, retirementAsset, lastPostAsset] = await Promise.all([
      createAsset('delete-event'),
      createAsset('delete-retirement'),
      createAsset('delete-last-post'),
    ]);

    await request(app)
      .post('/api/events')
      .set('Authorization', bearer(administratorSession.body.token))
      .send(
        eventPayload({
          imagePath: eventAsset.url,
          publishNow: true,
        }),
      )
      .expect(201);
    const event = await Event.findOne({ imagePath: eventAsset.url }).lean();
    assert.equal(event.status, 'published');

    await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorSession.body.token))
      .send({ ...retirementPayload(), photoUrl: retirementAsset.url })
      .expect(201);
    const retirementMessage = await RetirementMessage.findOne({
      photoUrl: retirementAsset.url,
    }).lean();
    assert.equal(retirementMessage.status, 'pending');

    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorSession.body.token))
      .send({
        deceased: {
          fullRank: 'Sergeant',
          firstName: 'Image',
          surname: 'Cleanup',
        },
        messageLanguage: 'en',
        message: 'A Last Post notice with an image that should be deleted with the notice.',
        imageUrl: lastPostAsset.url,
        publicationPermissionConfirmed: true,
      })
      .expect(201);
    const lastPost = await LastPostMessage.findOne({
      imageUrl: lastPostAsset.url,
    }).lean();
    assert.equal(lastPost.status, 'pending');

    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async (command) => {
      sentCommands.push(command);
      return {};
    };

    try {
      await request(app)
        .delete(`/api/admin/events/${event._id}`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);
      await request(app)
        .delete(`/api/admin/retirement-messages/${retirementMessage._id}`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);
      await request(app)
        .delete(`/api/admin/last-posts/${lastPost._id}`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      assert.equal(await Event.countDocuments({ _id: event._id }), 0);
      assert.equal(
        await RetirementMessage.countDocuments({ _id: retirementMessage._id }),
        0,
      );
      assert.equal(await LastPostMessage.countDocuments({ _id: lastPost._id }), 0);
      assert.equal(await MediaAsset.countDocuments({ _id: eventAsset._id }), 0);
      assert.equal(
        await MediaAsset.countDocuments({ _id: retirementAsset._id }),
        0,
      );
      assert.equal(await MediaAsset.countDocuments({ _id: lastPostAsset._id }), 0);
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'DeleteObjectCommand',
        ).length,
        15,
      );

      const deleteAudit = await AuditLog.findOne({
        action: 'content.deleted',
        target: event._id,
      }).lean();
      assert.equal(deleteAudit.metadata.mediaCleanup[0].status, 'deleted');
      assert.equal(deleteAudit.metadata.mediaCleanup[0].objectCount, 5);
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('keeps an image while another content record still references it', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const contributor = await createUser({ role: 'contributor' });
    const administratorSession = await login(administrator);
    const contributorSession = await login(contributor);
    const baseKey = 'images/shared-content-image';
    const originalKey = `${baseKey}/original.png`;
    const sharedAsset = await MediaAsset.create({
      key: originalKey,
      url: buildPublicMediaUrl(`${baseKey}/large.webp`),
      originalKey,
      originalUrl: buildPublicMediaUrl(originalKey),
      variants: Object.fromEntries(
        ['thumb', 'medium', 'large', 'hero'].map((name) => [
          name,
          { key: `${baseKey}/${name}.webp` },
        ]),
      ),
    });

    await request(app)
      .post('/api/events')
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload({ imagePath: sharedAsset.url }))
      .expect(201);
    const event = await Event.findOne({ imagePath: sharedAsset.url }).lean();

    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorSession.body.token))
      .send({
        deceased: {
          fullRank: 'Sergeant',
          firstName: 'Shared',
          surname: 'Image',
        },
        messageLanguage: 'en',
        message: 'A Last Post notice that deliberately shares an event image.',
        imageUrl: sharedAsset.url,
        publicationPermissionConfirmed: true,
      })
      .expect(201);
    const lastPost = await LastPostMessage.findOne({
      imageUrl: sharedAsset.url,
    }).lean();

    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async (command) => {
      sentCommands.push(command);
      return {};
    };

    try {
      await request(app)
        .delete(`/api/admin/events/${event._id}`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      assert.equal(await MediaAsset.countDocuments({ _id: sharedAsset._id }), 1);
      assert.equal(sentCommands.length, 0);

      await request(app)
        .delete(`/api/admin/last-posts/${lastPost._id}`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      assert.equal(await MediaAsset.countDocuments({ _id: sharedAsset._id }), 0);
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'DeleteObjectCommand',
        ).length,
        5,
      );
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('bulk deletion reports deleted, attached, and missing keys independently', async () => {
    const admin = await createUser({ role: 'administrator' });
    const session = await login(admin);
    const orphan = await MediaAsset.create({
      key: 'images/orphan/original.png',
      originalKey: 'images/orphan/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/orphan/original.png',
    });
    const attached = await MediaAsset.create({
      key: 'images/used/original.png',
      originalKey: 'images/used/original.png',
      url: 'http://127.0.0.1:9000/integration-test/images/used/original.png',
    });
    const message = await submitAndPublishRetirement();
    await RetirementMessage.updateOne(
      { _id: message._id },
      { $set: { photoUrl: attached.url } },
    );
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async () => ({});

    try {
      const response = await request(app)
        .post('/api/admin/media/bulk-delete')
        .set('Authorization', bearer(session.body.token))
        .send({
          keys: [orphan.key, attached.key, 'images/missing/original.png'],
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
      (error) => error?.code === 11000,
    );

    await MediaAsset.create({ key: 'images/unique/original.png' });
    await assert.rejects(
      MediaAsset.create({ key: 'images/unique/original.png' }),
      (error) => error?.code === 11000,
    );
  });

  test('rejects duplicate page slugs and repeated review transitions', async () => {
    const editor = await createUser({ role: 'editor' });
    const session = await login(editor);
    const pagePayload = {
      title: { en: 'Unique page' },
      slug: 'unique-page',
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
