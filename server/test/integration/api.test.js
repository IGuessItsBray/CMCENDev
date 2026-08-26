const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');

process.env.JWT_SECRET = 'integration-test-jwt-secret';
process.env.JWT_ACCESS_TOKEN_TTL = '15m';
process.env.JWT_REFRESH_TOKEN_TTL_DAYS = '1';
process.env.NODE_ENV = 'test';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.CASL_SENDER_NAME = 'CMCEN / RCMCE';
process.env.CASL_SENDER_MAILING_ADDRESS =
  '100 Example Street, Ottawa, ON K1A 0A1';
process.env.CASL_SENDER_CONTACT = 'https://example.test/contact';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'integration-test';
process.env.MINIO_SECRET_KEY = 'integration-test';
process.env.MINIO_BUCKET_NAME = 'integration-test';
process.env.PLAUSIBLE_DOMAIN = '';
process.env.PLAUSIBLE_API_URL = '';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const sharp = require('sharp');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const AuditLog = require('../../models/AuditLog');
const CertificateRequest = require('../../models/CertificateRequest');
const ContentRevision = require('../../models/ContentRevision');
const Event = require('../../models/Event');
const LastPostMessage = require('../../models/LastPostMessage');
const MediaAsset = require('../../models/MediaAsset');
const NewsArticle = require('../../models/NewsArticle');
const Page = require('../../models/Page');
const RetirementComment = require('../../models/RetirementComment');
const RetirementMessage = require('../../models/RetirementMessage');
const Role = require('../../models/Role');
const User = require('../../models/User');
const s3Client = require('../../storage');
const { RETIREMENT_TRADE_ROLES } = require('../../config/content');
const { buildPublicMediaUrl } = require('../../services/media-library');
const { createUnsubscribeToken } = require('../../services/weekly-brief');

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

  test('serves the public changelog as Markdown', async () => {
    const response = await request(app).get('/changelog.md').expect(200);

    assert.match(response.headers['content-type'], /^text\/markdown/u);
    assert.match(response.text, /^# Changelog/mu);
  });

  test('does not expose Plausible tracking until it is configured', async () => {
    const response = await request(app)
      .get('/api/client-config/plausible')
      .expect(200);

    assert.deepEqual(response.body, { enabled: false });
  });

  test('redirects the retired notifications page to the dashboard', async () => {
    await request(app)
      .get('/notifications')
      .expect('Location', '/dashboard')
      .expect(301);

    await request(app)
      .get('/notifications.html')
      .expect('Location', '/dashboard')
      .expect(301);
  });

  test('rejects invalid credentials and malformed bearer tokens', async () => {
    const user = await createUser();

    const invalidLogin = await login(user, {
      password: 'wrong-password',
      expectedStatus: 401,
    });
    assert.equal(invalidLogin.status, 401);
    assert.equal(invalidLogin.body.error, 'Invalid credentials');
    const rejectedLoginAudit = await AuditLog.findOne({
      action: 'user.login_rejected',
    }).lean();
    assert.equal(rejectedLoginAudit.targetType, 'user');
    assert.equal(rejectedLoginAudit.metadata.reason, 'invalid_credentials');
    assert.equal(
      JSON.stringify(rejectedLoginAudit).includes('wrong-password'),
      false,
    );

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
    await agent
      .get('/api/me')
      .set('Authorization', bearer(loginResponse.body.token))
      .expect(401);

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

  test('audits invitation activation attempts without storing the invitation token', async () => {
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const email = 'activation.audit@example.test';
    const invitedUser = await User.create({
      accountType: 'invited',
      profileComplete: false,
      username: email,
      email,
      password: 'Temporary-Password-1!',
      firstName: 'Activation',
      lastName: 'Audit',
      role: 'subscriber',
      invitation: {
        tokenHash: crypto
          .createHash('sha256')
          .update(invitationToken)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const activation = await request(app)
      .post('/api/register')
      .send({
        email,
        password: 'Activated-Password-1!',
        passwordConfirmation: 'Activated-Password-1!',
        invitationToken,
        sessionCookieConsent: true,
      })
      .expect(201);

    assert.equal(typeof activation.body.token, 'string');
    assert.ok(
      await AuditLog.exists({
        action: 'user.invitation_activation_attempted',
        target: invitedUser._id,
        'metadata.outcome': 'matched_invitation',
      }),
    );
    assert.ok(
      await AuditLog.exists({
        action: 'user.invitation_activated',
        target: invitedUser._id,
      }),
    );
    const auditText = JSON.stringify(
      await AuditLog.find({ target: invitedUser._id }).lean(),
    );
    assert.equal(auditText.includes(invitationToken), false);
  });

  test('audits a rejected invitation activation without exposing its token', async () => {
    const invitationToken = crypto.randomBytes(32).toString('hex');

    await request(app)
      .post('/api/register')
      .send({
        email: 'not-an-invitation@example.test',
        password: 'Rejected-Password-1!',
        passwordConfirmation: 'Rejected-Password-1!',
        invitationToken,
      })
      .expect(400);

    const rejectedAudit = await AuditLog.findOne({
      action: 'user.invitation_activation_rejected',
    }).lean();
    assert.equal(rejectedAudit.metadata.outcome, 'invalid_or_expired');
    assert.equal(JSON.stringify(rejectedAudit).includes(invitationToken), false);
  });

  test('records express weekly-brief consent and permits immediate email-link withdrawal', async () => {
    const user = await createUser();
    const loginResponse = await login(user);

    await request(app)
      .put('/api/subscriptions/weekly-brief')
      .set('Authorization', bearer(loginResponse.body.token))
      .send({ subscribed: true })
      .expect(400);

    const subscribed = await request(app)
      .put('/api/subscriptions/weekly-brief')
      .set('Authorization', bearer(loginResponse.body.token))
      .send({ subscribed: true, expressConsent: true })
      .expect(200);

    assert.equal(subscribed.body.weeklyBrief.subscribed, true);
    assert.ok(subscribed.body.weeklyBrief.consentedAt);
    assert.equal(subscribed.body.weeklyBrief.available, true);
    assert.ok(
      await AuditLog.exists({ action: 'user.weekly_brief_subscribed' }),
    );

    const token = await createUnsubscribeToken(user);
    await request(app)
      .get(`/api/subscriptions/weekly-brief/unsubscribe?token=${token}`)
      .expect(200);

    const withdrawnUser = await User.findById(user._id).lean();
    assert.equal(
      withdrawnUser.emailSubscriptions.weeklyBrief.subscribed,
      false,
    );
    assert.ok(withdrawnUser.emailSubscriptions.weeklyBrief.unsubscribedAt);
    assert.ok(
      await AuditLog.exists({ action: 'user.weekly_brief_unsubscribed' }),
    );
  });
});

describe('public search', () => {
  test('returns canonical destinations for news, event, retirement, and static page results', async () => {
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
    const newsStory = await NewsArticle.create({
      title: {
        en: 'Searchable Signal News',
        fr: 'Nouvelles de transmissions recherchables',
      },
      content: {
        en: 'A searchable news story for the signal community.',
        fr: 'Une nouvelle recherchable pour la communauté des transmissions.',
      },
      status: 'published',
      publishedAt: new Date(),
      createdBy: owner._id,
      publishedBy: owner._id,
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

    const newsSearch = await request(app)
      .get('/api/search?q=signal%20news')
      .expect(200);
    const newsResult = newsSearch.body.results.find(
      (result) => result.type === 'news-story',
    );
    assert.equal(newsResult.url, `/news-story?id=${newsStory._id}`);

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

    const retirementPageSearch = await request(app)
      .get('/api/search?q=retirement')
      .expect(200);
    const retirementPageResult = retirementPageSearch.body.results.find(
      (result) => result.sourceId === '/retirements',
    );
    assert.equal(
      retirementPageResult.summary,
      'Browse retirement messages celebrating members of the C&E community.',
    );
    assert.doesNotMatch(retirementPageResult.summary, /loading/i);

    await RetirementMessage.updateOne(
      { _id: retirement._id },
      {
        $set: {
          'messages.en':
            '<p>A retirement tribute for Alex Example from the C&amp;E community.</p>',
        },
      },
    );
    const sanitizedRetirementSearch = await request(app)
      .get('/api/search?q=alex%20example')
      .expect(200);
    const sanitizedRetirementResult = sanitizedRetirementSearch.body.results.find(
      (result) => result.sourceId === String(retirement._id),
    );
    assert.equal(
      sanitizedRetirementResult.summary,
      'A retirement tribute for Alex Example from the C&E community.',
    );

    const pageSearch = await request(app)
      .get('/api/search?q=calendar')
      .expect(200);
    const pageResult = pageSearch.body.results.find(
      (result) => result.sourceId === '/calendar',
    );
    assert.equal(pageResult.url, '/calendar');

    const frenchCalendarSearch = await request(app)
      .get('/api/search?q=calendrier&lang=fr')
      .expect(200);
    const frenchCalendarResult = frenchCalendarSearch.body.results.find(
      (result) => result.sourceId === '/calendar',
    );
    assert.equal(frenchCalendarResult.url, '/calendar');
    assert.equal(frenchCalendarResult.title, 'Calendrier des événements');

    const historySearch = await request(app)
      .get('/api/search?q=history')
      .expect(200);
    assert.equal(historySearch.body.results[0].sourceId, '/history');

    const homeSearch = await request(app).get('/api/search?q=home').expect(200);
    assert.equal(
      homeSearch.body.results.some((result) => result.sourceId === '/index'),
      false,
    );

    assert.equal(retirementPageSearch.body.results[0].sourceId, '/retirements');

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
  test('sends contact messages using the authenticated member profile', async () => {
    const previousMailToBranch = process.env.MAIL_TO_BRANCH;
    process.env.MAIL_TO_BRANCH = 'branch@example.test';

    try {
      const user = await createUser({ phone: '613-555-0100' });
      const session = await login(user);
      const token = session.body.token;

      await request(app)
        .post('/api/contact')
        .set('Authorization', bearer(token))
        .send({
          subject: 'Need assistance',
          message: 'Please contact me about my membership.',
          email: 'spoofed@example.test',
          phone: '000-000-0000',
        })
        .expect(202);

      const auditLog = await AuditLog.findOne({
        action: 'contact.submitted',
        actor: user._id,
      }).lean();
      assert.equal(auditLog.targetType, 'contactMessage');
      assert.equal(auditLog.targetSnapshot.subject, 'Need assistance');
      assert.equal(auditLog.metadata.messageLength, 38);
      assert.equal(auditLog.actorSnapshot.email, user.email);
    } finally {
      if (previousMailToBranch === undefined) {
        delete process.env.MAIL_TO_BRANCH;
      } else {
        process.env.MAIL_TO_BRANCH = previousMailToBranch;
      }
    }
  });

  test('requires sign-in and configured branch delivery for contact messages', async () => {
    await request(app)
      .post('/api/contact')
      .send({ subject: 'Need assistance', message: 'Please contact me.' })
      .expect(401);

    const user = await createUser();
    const session = await login(user);
    const previousMailToBranch = process.env.MAIL_TO_BRANCH;
    delete process.env.MAIL_TO_BRANCH;

    try {
      await request(app)
        .post('/api/contact')
        .set('Authorization', bearer(session.body.token))
        .send({ subject: 'Need assistance', message: 'Please contact me.' })
        .expect(503);
    } finally {
      if (previousMailToBranch !== undefined) {
        process.env.MAIL_TO_BRANCH = previousMailToBranch;
      }
    }
  });

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

describe('news stories', () => {
  test('uses the news permission to publish bilingual stories and audit their changes', async () => {
    const publisherRole = await Role.create({
      name: 'News Publisher',
      slug: 'news-publisher',
      permissions: ['news.manage'],
    });
    const publisher = await createUser({
      role: 'subscriber',
      customRoles: [publisherRole._id],
    });
    const session = await login(publisher);
    const token = session.body.token;
    const payload = {
      title: { en: 'Signal update', fr: 'Mise a jour des transmissions' },
      content: {
        en: 'An English news story for the C&E Family.',
        fr: 'Un article francais pour la famille des C et E.',
      },
      imageUrl: '',
      status: 'published',
    };

    const created = await request(app)
      .post('/api/news')
      .set('Authorization', bearer(token))
      .send(payload)
      .expect(201);
    const articleId = created.body.article._id;
    assert.equal(
      created.body.article.imageUrl,
      'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp',
    );
    assert.equal(
      created.body.article.imageDisplayUrl,
      'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp',
    );

    const publicNews = await request(app).get('/api/news').expect(200);
    assert.equal(publicNews.body.articles.length, 1);
    assert.equal(publicNews.body.articles[0].title.fr, payload.title.fr);

    const publicArticle = await request(app)
      .get(`/api/news/${articleId}`)
      .expect(200);
    assert.equal(publicArticle.body.article.content.en, payload.content.en);

    const feed = await request(app).get('/api/news/feed').expect(200);
    assert.equal(feed.body.items[0].type, 'news');
    assert.equal(feed.body.items[0].title.en, payload.title.en);

    const workspaceNews = await request(app)
      .get(`/api/admin/content?type=newsArticle&id=${articleId}`)
      .set('Authorization', bearer(token))
      .expect(200);
    assert.equal(workspaceNews.body.items.length, 1);
    assert.equal(workspaceNews.body.items[0].type, 'newsArticle');
    assert.equal(workspaceNews.body.items[0].content.title.en, payload.title.en);

    const workspaceAll = await request(app)
      .get(`/api/admin/content?type=all&id=${articleId}`)
      .set('Authorization', bearer(token))
      .expect(200);
    assert.deepEqual(
      workspaceAll.body.items.map((item) => item.type),
      ['newsArticle'],
    );

    const updatedEnglishContent =
      'An updated English news story for the C&E Family.';

    const removed = await request(app)
      .patch(`/api/news/${articleId}/hide`)
      .set('Authorization', bearer(token))
      .send({ reason: 'Correct the story before returning it to public view.' })
      .expect(200);
    assert.equal(removed.body.article.status, 'hidden');

    const removedPublicNews = await request(app).get('/api/news').expect(200);
    assert.equal(removedPublicNews.body.articles.length, 0);
    await request(app).get(`/api/news/${articleId}`).expect(404);

    const updatedWhileHidden = await request(app)
      .patch(`/api/news/${articleId}`)
      .set('Authorization', bearer(token))
      .send({
        ...payload,
        content: { ...payload.content, en: updatedEnglishContent },
        status: 'published',
        revisionNote: 'Correct the copy while the story is removed.',
      })
      .expect(200);
    assert.equal(updatedWhileHidden.body.article.status, 'hidden');

    const hiddenWorkspaceNews = await request(app)
      .get(`/api/admin/content?type=newsArticle&status=hidden&id=${articleId}`)
      .set('Authorization', bearer(token))
      .expect(200);
    assert.equal(hiddenWorkspaceNews.body.items.length, 1);
    assert.equal(hiddenWorkspaceNews.body.items[0].hiddenFromStatus, 'published');

    const restored = await request(app)
      .patch(`/api/news/${articleId}/restore`)
      .set('Authorization', bearer(token))
      .expect(200);
    assert.equal(restored.body.article.status, 'published');

    const restoredPublicArticle = await request(app)
      .get(`/api/news/${articleId}`)
      .expect(200);
    assert.equal(restoredPublicArticle.body.article.content.en, updatedEnglishContent);

    await request(app)
      .patch(`/api/news/${articleId}`)
      .set('Authorization', bearer(token))
      .send({
        ...payload,
        content: { ...payload.content, en: updatedEnglishContent },
        status: 'draft',
        revisionNote: 'Move the story back to draft after the copy correction.',
      })
      .expect(200);

    const hiddenPublicNews = await request(app).get('/api/news').expect(200);
    assert.equal(hiddenPublicNews.body.articles.length, 0);
    const managedNews = await request(app)
      .get('/api/news/manage')
      .set('Authorization', bearer(token))
      .expect(200);
    assert.equal(managedNews.body.articles[0].status, 'draft');

    await request(app)
      .patch(`/api/news/${articleId}/hide`)
      .set('Authorization', bearer(token))
      .expect(409);

    const revisionHistory = await request(app)
      .get(`/api/admin/content/newsArticle/${articleId}/revisions`)
      .set('Authorization', bearer(token))
      .expect(200);
    const copyRevision = revisionHistory.body.revisions.find(
      (revision) => revision.language === 'en',
    );
    assert.deepEqual(copyRevision.fields, ['content']);
    assert.equal(copyRevision.after.content, updatedEnglishContent);
    assert.equal(
      copyRevision.note,
      'Correct the copy while the story is removed.',
    );
    const statusRevision = revisionHistory.body.revisions.find(
      (revision) => revision.fields.includes('status'),
    );
    assert.equal(statusRevision.after.status, 'draft');

    const audits = await AuditLog.find({ target: articleId }).lean();
    assert.deepEqual(
      audits.map((audit) => audit.action).sort(),
      [
        'content.created',
        'content.hidden',
        'content.published',
        'content.restored',
        'content.updated',
        'content.updated',
        'content.unpublished',
      ].sort(),
    );
  });
});

describe('retirement message lifecycle', () => {
  test('lets guests search and filter only published retirement messages', async () => {
    const first = await submitAndPublishRetirement();
    const firstRecord = await RetirementMessage.findById(first._id).lean();

    await RetirementMessage.updateOne(
      { _id: first._id },
      {
        $set: {
          retiree: {
            ...firstRecord.retiree,
            firstName: 'Archive',
            lastName: 'Pioneer',
            tradeRole: 'Signals Technician',
            retirementDate: new Date('2024-06-15T00:00:00.000Z'),
          },
          messages: {
            en: translatedMessage('Signal archive'),
            fr: translatedMessage('Archive des transmissions'),
          },
        },
      },
    );

    const second = await RetirementMessage.create({
      ...firstRecord,
      _id: undefined,
      retiree: {
        ...firstRecord.retiree,
        firstName: 'Different',
        lastName: 'Retiree',
        retirementDate: new Date('2023-06-15T00:00:00.000Z'),
      },
      message: translatedMessage('Different'),
      messages: {
        en: translatedMessage('Different'),
        fr: translatedMessage('Différent'),
      },
      status: 'published',
      publishedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    await RetirementMessage.create({
      ...second.toObject(),
      _id: undefined,
      retiree: {
        ...second.retiree.toObject(),
        firstName: 'Archive',
        lastName: 'Hidden',
      },
      status: 'hidden',
      hiddenFromStatus: 'published',
    });

    const matching = await request(app)
      .get('/api/retirement-messages?q=Signals&year=2024')
      .expect(200);

    assert.deepEqual(
      matching.body.retirementMessages.map((message) => message.retiree.lastName),
      ['Pioneer'],
    );
    assert.equal(matching.body.retirementMessages[0].submitter, undefined);

    const escapedSearch = await request(app)
      .get('/api/retirement-messages?q=Archive.*')
      .expect(200);
    assert.equal(escapedSearch.body.retirementMessages.length, 0);

    const yearOnly = await request(app)
      .get('/api/retirement-messages?year=2023')
      .expect(200);
    assert.deepEqual(
      yearOnly.body.retirementMessages.map((message) => message.retiree.lastName),
      ['Retiree'],
    );
  });

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

  test('lists the current user’s non-hidden retirement messages', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const otherContributor = await createUser({ role: 'contributor' });
    const contributorLogin = await login(contributor);
    const otherContributorLogin = await login(otherContributor);

    const submitted = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);
    const otherSubmitted = await request(app)
      .post('/api/retirement-messages')
      .set('Authorization', bearer(otherContributorLogin.body.token))
      .send(retirementPayload())
      .expect(201);

    const mine = await request(app)
      .get('/api/retirement-messages/mine')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.deepEqual(
      mine.body.retirementMessages.map((message) => String(message._id)),
      [String(submitted.body.retirementMessage._id)],
    );

    await RetirementMessage.updateOne(
      { _id: submitted.body.retirementMessage._id },
      { $set: { status: 'hidden' } },
    );

    const afterRemoval = await request(app)
      .get('/api/retirement-messages/mine')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(afterRemoval.body.retirementMessages.length, 0);
    assert.ok(otherSubmitted.body.retirementMessage._id);
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

  test('lets owners and reviewers save retirement translations before publication', async () => {
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
    const ownerTranslation = translatedMessage('English submitter');
    const frenchTranslation = translatedMessage('French reviewer');

    const ownerResponse = await request(app)
      .patch(`/api/retirement-messages/${messageId}/review-content`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ language: 'en', message: ownerTranslation })
      .expect(200);
    assert.equal(ownerResponse.body.retirementMessage.status, 'pending');
    assert.equal(
      ownerResponse.body.retirementMessage.messages.en,
      ownerTranslation,
    );

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
      'metadata.language': 'fr',
    });
    assert.equal(auditEntry.targetType, 'retirementMessage');
    assert.equal(auditEntry.metadata.language, 'fr');

    const revision = await ContentRevision.findOne({
      contentType: 'retirementMessage',
      contentId: savedMessage._id,
      language: 'fr',
    }).lean();
    assert.equal(revision.language, 'fr');
    assert.equal(revision.before.message, '');
    assert.equal(revision.after.message, frenchTranslation);

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

    const frenchMessage = translatedMessage('Retirement message preserved in French');
    await RetirementMessage.findByIdAndUpdate(message._id, {
      $set: { 'messages.fr': frenchMessage },
    });

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    const rejectionNotification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(message._id),
    );
    assert.equal(
      rejectionNotification.href,
      `/submit-retirement?id=${message._id}`,
    );

    const editPayload = await request(app)
      .get(`/api/retirement-messages/${message._id}/edit`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(editPayload.body.retirementMessage.status, 'rejected');
    assert.equal(editPayload.body.retirementMessage.messages.fr, frenchMessage);

    const revisedSubmission = retirementPayload();
    revisedSubmission.message = translatedMessage('Retirement resubmission');

    const resubmitted = await request(app)
      .patch(`/api/retirement-messages/${message._id}`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(revisedSubmission)
      .expect(200);
    assert.equal(resubmitted.body.retirementMessage.status, 'pending');
    assert.equal(resubmitted.body.retirementMessage.rejectionReason, '');
    assert.equal(resubmitted.body.retirementMessage.messages.fr, frenchMessage);

    const resolvedNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(
      resolvedNotifications.body.notifications.items.some(
        (item) => String(item.id) === String(message._id),
      ),
      false,
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

  test('lists the current user’s non-hidden Last Post notices', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const otherContributor = await createUser({ role: 'contributor' });
    const contributorLogin = await login(contributor);
    const otherContributorLogin = await login(otherContributor);
    const submission = {
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Workspace',
        surname: 'Notice',
      },
      messageLanguage: 'en',
      message: 'A Last Post notice listed in the current user content workspace.',
      publicationPermissionConfirmed: true,
    };

    const submitted = await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(submission)
      .expect(201);
    await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(otherContributorLogin.body.token))
      .send(submission)
      .expect(201);

    const mine = await request(app)
      .get('/api/last-posts/mine')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.deepEqual(
      mine.body.lastPosts.map((notice) => String(notice._id)),
      [String(submitted.body.lastPost._id)],
    );

    await LastPostMessage.updateOne(
      { _id: submitted.body.lastPost._id },
      { $set: { status: 'hidden' } },
    );

    const afterRemoval = await request(app)
      .get('/api/last-posts/mine')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(afterRemoval.body.lastPosts.length, 0);
  });

  test('lets an owner revise a rejected Last Post notice without exposing it to other contributors', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const otherContributor = await createUser({ role: 'contributor' });
    const contributorLogin = await login(contributor);
    const otherContributorLogin = await login(otherContributor);
    const submission = {
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Rejected',
        surname: 'Notice',
      },
      messageLanguage: 'en',
      message: 'A Last Post notice that needs a contributor revision.',
      publicationPermissionConfirmed: true,
    };

    const created = await request(app)
      .post('/api/last-posts')
      .set('Authorization', bearer(contributorLogin.body.token))
      .send(submission)
      .expect(201);
    const lastPostId = created.body.lastPost._id;

    await LastPostMessage.findByIdAndUpdate(lastPostId, {
      $set: {
        status: 'rejected',
        rejectionReason: 'Please add the missing service details.',
        'messages.fr': 'Un avis du Dernier appel qui doit être préservé.',
      },
    });

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    const rejectionNotification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(lastPostId),
    );
    assert.equal(rejectionNotification.href, `/submit-last-post?id=${lastPostId}`);

    const editPayload = await request(app)
      .get(`/api/last-posts/${lastPostId}/edit`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(editPayload.body.lastPost.status, 'rejected');
    assert.equal(
      editPayload.body.lastPost.messages.fr,
      'Un avis du Dernier appel qui doit être préservé.',
    );

    await request(app)
      .get(`/api/last-posts/${lastPostId}/edit`)
      .set('Authorization', bearer(otherContributorLogin.body.token))
      .expect(403);

    await request(app)
      .patch(`/api/last-posts/${lastPostId}`)
      .set('Authorization', bearer(otherContributorLogin.body.token))
      .send(submission)
      .expect(403);

    const updated = await request(app)
      .patch(`/api/last-posts/${lastPostId}`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({
        ...submission,
        message: 'A revised Last Post notice with the requested service details.',
      })
      .expect(200);
    assert.equal(updated.body.lastPost.status, 'pending');
    assert.equal(updated.body.lastPost.rejectionReason, '');
    assert.equal(
      updated.body.lastPost.messages.fr,
      'Un avis du Dernier appel qui doit être préservé.',
    );

    const resolvedNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorLogin.body.token))
      .expect(200);
    assert.equal(
      resolvedNotifications.body.notifications.items.some(
        (item) => String(item.id) === String(lastPostId),
      ),
      false,
    );
  });

  test('lets owners and reviewers save Last Post translations before publication', async () => {
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
    const ownerTranslation = 'Corrected English Last Post notice from its submitter.';
    const frenchTranslation = 'Avis du Dernier appel ajouté par le réviseur.';

    const ownerResponse = await request(app)
      .patch(`/api/last-posts/${notice._id}/review-content`)
      .set('Authorization', bearer(contributorLogin.body.token))
      .send({ language: 'en', message: ownerTranslation })
      .expect(200);
    assert.equal(ownerResponse.body.lastPost.status, 'pending');
    assert.equal(ownerResponse.body.lastPost.messages.en, ownerTranslation);

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
      'metadata.language': 'fr',
    });
    assert.equal(auditEntry.targetType, 'lastPost');
    assert.equal(auditEntry.metadata.language, 'fr');

    const revision = await ContentRevision.findOne({
      contentType: 'lastPost',
      contentId: savedNotice._id,
      language: 'fr',
    }).lean();
    assert.equal(revision.language, 'fr');
    assert.equal(revision.before.message, '');
    assert.equal(revision.after.message, frenchTranslation);

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
      message:
        'A Last Post notice used to verify consent and immediate publication.',
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
  test('prevents a custom user manager from escalating their own access', async () => {
    const userManagerRole = await Role.create({
      name: 'Member Manager',
      slug: 'member-manager',
      permissions: ['users.manage'],
    });
    const contributor = await createUser({
      role: 'contributor',
      customRoles: [userManagerRole._id],
    });
    const session = await login(contributor);

    await request(app)
      .patch(`/api/admin/users/${contributor._id}`)
      .set('Authorization', bearer(session.body.token))
      .send({ role: 'administrator' })
      .expect(403);

    await request(app)
      .patch(`/api/admin/users/${contributor._id}`)
      .set('Authorization', bearer(session.body.token))
      .send({ customRoleIds: [] })
      .expect(403);

    const unchangedUser = await User.findById(contributor._id).lean();
    assert.equal(unchangedUser.role, 'contributor');
    assert.deepEqual(
      unchangedUser.customRoles.map(String),
      [String(userManagerRole._id)],
    );
  });

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

  test('excludes legacy cmcen.local accounts from user lists and exports', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const visibleUser = await createUser({
      email: 'visible.member@example.test',
      username: 'visible.member@example.test',
    });
    const legacyGhost = await createUser({
      accountType: 'ghost',
      role: 'ghost',
      email: 'legacy-commenter@cmcen.local',
      username: 'legacy-commenter',
    });
    const session = await login(administrator);

    const list = await request(app)
      .get('/api/admin/users?limit=100')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    const listedUserIds = list.body.users.map((user) => String(user._id));

    assert.ok(listedUserIds.includes(String(visibleUser._id)));
    assert.ok(!listedUserIds.includes(String(legacyGhost._id)));

    const exportResponse = await request(app)
      .get('/api/admin/users/export?format=csv')
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    assert.match(exportResponse.text, /visible\.member@example\.test/);
    assert.doesNotMatch(exportResponse.text, /legacy-commenter@cmcen\.local/);
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
    assert.equal(invitedUser.invitation.delivery.status, 'sent');
  });

  test('stores an optional invitation message for delivery and resends', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const session = await login(administrator);
    const message = 'Welcome to the team!\nPlease activate your account today.';

    const response = await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(session.body.token))
      .send({
        firstName: 'Message',
        lastName: 'Recipient',
        email: 'message.recipient@example.test',
        role: 'subscriber',
        message,
      })
      .expect(201);

    const invitedUser = await User.findById(response.body.user._id).lean();
    assert.equal(invitedUser.invitation.message, message);

    await request(app)
      .post(`/api/admin/users/${response.body.user._id}/invitation/resend`)
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    const resentUser = await User.findById(response.body.user._id).lean();
    assert.equal(resentUser.invitation.message, message);
  });

  test('rejects an invitation message longer than 2,000 characters', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const session = await login(administrator);

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(session.body.token))
      .send({
        firstName: 'Long',
        lastName: 'Message',
        email: 'long.message@example.test',
        role: 'subscriber',
        message: 'a'.repeat(2001),
      })
      .expect(400);
  });

  test('resends an invitation with a renewed token and delivery diagnostics', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const session = await login(administrator);
    const invitation = await request(app)
      .post('/api/admin/users')
      .set('Authorization', bearer(session.body.token))
      .send({
        firstName: 'Resend',
        lastName: 'Member',
        email: 'resend.member@example.test',
        role: 'subscriber',
      })
      .expect(201);
    const invitedUserId = invitation.body.user._id;
    const beforeResend = await User.findById(invitedUserId)
      .select('+invitation.tokenHash')
      .lean();

    const resend = await request(app)
      .post(`/api/admin/users/${invitedUserId}/invitation/resend`)
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    assert.equal(resend.body.user.invitation.delivery.status, 'sent');
    assert.ok(resend.body.user.invitation.delivery.attemptedAt);
    assert.ok(resend.body.user.invitation.sentAt);
    const afterResend = await User.findById(invitedUserId)
      .select('+invitation.tokenHash')
      .lean();
    assert.notEqual(
      afterResend.invitation.tokenHash,
      beforeResend.invitation.tokenHash,
    );
    const auditEntry = await AuditLog.findOne({
      action: 'user.invitation_resent',
      target: invitedUserId,
    }).lean();
    assert.equal(auditEntry.metadata.delivery.status, 'sent');
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

  test('grants catalog permissions through a custom role without developer-only escalation', async () => {
    const customRole = await Role.create({
      name: 'Audit Reader',
      slug: 'audit-reader',
      permissions: ['audit.view', 'review.bypass'],
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

    const profile = await request(app)
      .get('/api/me')
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    assert.equal(profile.body.permissions.canBypassReviewStages, false);
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

    // Existing accounts created before notification tracking have no read time.
    // Their first notification request must still include recent approvals.
    await User.updateOne(
      { _id: contributor._id },
      { $unset: { notificationState: 1 } },
    );

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

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(200);
    const publishedNotification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(event._id),
    );

    assert.equal(notifications.body.notifications.unreadCount, 1);
    assert.equal(publishedNotification.type, 'event');
    assert.equal(publishedNotification.status, 'published');
    assert.equal(publishedNotification.href, `/event?id=${event._id}`);
  });

  test('records account-derived RSVPs and limits management to owners and administrators', async () => {
    const owner = await createUser({ role: 'contributor' });
    const attendee = await createUser({
      status: 'civilian',
      rank: '',
      currentUnit: '',
      phone: '613-555-0100',
    });
    const administrator = await createUser({ role: 'administrator' });
    const otherUser = await createUser();
    const event = await Event.create({
      ...eventPayload(),
      createdBy: owner._id,
      status: 'published',
      rsvpEnabled: true,
      rsvpDeadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    });
    const attendeeSession = await login(attendee);
    const ownerSession = await login(owner);
    const administratorSession = await login(administrator);
    const otherSession = await login(otherUser);

    await request(app).post(`/api/events/${event._id}/rsvp`).send({ response: 'accepted' }).expect(401);

    await request(app)
      .post(`/api/events/${event._id}/rsvp`)
      .set('Authorization', bearer(ownerSession.body.token))
      .send({ response: 'accepted' })
      .expect(403);

    const accepted = await request(app)
      .post(`/api/events/${event._id}/rsvp`)
      .set('Authorization', bearer(attendeeSession.body.token))
      .send({ response: 'accepted' })
      .expect(200);
    assert.equal(accepted.body.rsvp.response, 'accepted');
    assert.equal(accepted.body.rsvp.unitOrStatus, 'Civilian');
    assert.equal(accepted.body.rsvp.email, attendee.email);
    assert.equal(accepted.body.rsvp.phone, attendee.phone);

    await request(app)
      .post(`/api/events/${event._id}/rsvp`)
      .set('Authorization', bearer(attendeeSession.body.token))
      .send({ response: 'declined' })
      .expect(200);

    const ownerList = await request(app)
      .get(`/api/events/${event._id}/rsvps`)
      .set('Authorization', bearer(ownerSession.body.token))
      .expect(200);
    assert.equal(ownerList.body.rsvps.length, 1);
    assert.equal(ownerList.body.rsvps[0].response, 'declined');

    const ownerNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(ownerSession.body.token))
      .expect(200);
    const rsvpNotification = ownerNotifications.body.notifications.items.find(
      (item) => item.type === 'eventRsvp',
    );
    assert.equal(rsvpNotification.response, 'declined');
    assert.equal(rsvpNotification.href, `/event?id=${event._id}`);

    await request(app)
      .get(`/api/events/${event._id}/rsvps`)
      .set('Authorization', bearer(otherSession.body.token))
      .expect(403);

    await request(app)
      .get(`/api/events/${event._id}/rsvps`)
      .set('Authorization', bearer(administratorSession.body.token))
      .expect(200);

    const csv = await request(app)
      .get(`/api/events/${event._id}/rsvps.csv`)
      .set('Authorization', bearer(ownerSession.body.token))
      .expect(200);
    assert.match(csv.text, /Response,Rank,First name/);
    assert.match(csv.text, /declined/);
    assert.ok(
      await AuditLog.exists({ action: 'event.rsvps_exported', target: event._id }),
    );
  });

  test('keeps removed events unavailable to their original submitter', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorSession = await login(contributor);
    const editorSession = await login(editor);
    const now = new Date();
    const pendingEvent = await Event.create({
      ...eventPayload({
        title: { en: 'Visible pending event', fr: 'Événement visible en attente' },
      }),
      createdBy: contributor._id,
      status: 'pending',
    });
    const rejectedEvent = await Event.create({
      ...eventPayload({
        title: { en: 'Rejected event', fr: 'Événement refusé' },
      }),
      createdBy: contributor._id,
      status: 'rejected',
      rejectionReason: 'Please add the missing details.',
      reviewedBy: editor._id,
      reviewedAt: now,
    });
    const publishedEvent = await Event.create({
      ...eventPayload({
        title: { en: 'Published event', fr: 'Événement publié' },
      }),
      createdBy: contributor._id,
      status: 'published',
      reviewedBy: editor._id,
      reviewedAt: now,
      publishedBy: editor._id,
      publishedAt: now,
    });
    const hiddenEvent = await Event.create({
      ...eventPayload({
        title: { en: 'Removed event', fr: 'Événement retiré' },
      }),
      createdBy: contributor._id,
      status: 'hidden',
      hiddenFromStatus: 'pending',
    });

    const mine = await request(app)
      .get('/api/events/mine')
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(200);
    const eventIds = mine.body.events.map((event) => String(event._id));
    assert.equal(eventIds.includes(String(pendingEvent._id)), true);
    assert.equal(eventIds.includes(String(rejectedEvent._id)), true);
    assert.equal(eventIds.includes(String(publishedEvent._id)), true);
    assert.equal(eventIds.includes(String(hiddenEvent._id)), false);

    await request(app)
      .get(`/api/events/${hiddenEvent._id}/edit`)
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(404);

    await request(app)
      .get(`/api/events/${hiddenEvent._id}/edit`)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);

    await request(app)
      .patch(`/api/events/${publishedEvent._id}`)
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(409);

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(200);
    const rejectedNotification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(rejectedEvent._id),
    );
    assert.equal(
      rejectedNotification.href,
      `/submit-event?id=${rejectedEvent._id}`,
    );

    await request(app)
      .post('/api/notifications/read')
      .set('Authorization', bearer(contributorSession.body.token))
      .send({ readThrough: notifications.body.notifications.readThrough })
      .expect(200);

    const actionableNotification = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(200);
    assert.equal(
      actionableNotification.body.notifications.items.some(
        (item) => String(item.id) === String(rejectedEvent._id),
      ),
      true,
    );

    const correctedStartDate = new Date(
      Date.now() + 45 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    const resubmitted = await request(app)
      .patch(`/api/events/${rejectedEvent._id}`)
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload({
        title: { en: 'Corrected event title', fr: 'Événement corrigé' },
        startDate: correctedStartDate,
        city: 'Kingston',
        allDay: true,
      })
      )
      .expect(200);
    assert.equal(resubmitted.body.event.status, 'pending');
    assert.equal(resubmitted.body.event.rejectionReason, '');
    assert.equal(resubmitted.body.event.city, 'Kingston');
    assert.equal(
      new Date(resubmitted.body.event.startDate).toISOString().slice(0, 10),
      correctedStartDate,
    );

    const resolvedNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(200);
    assert.equal(
      resolvedNotifications.body.notifications.items.some(
        (item) => String(item.id) === String(rejectedEvent._id),
      ),
      false,
    );
  });

  test('lets owners and reviewers update one pending event language without changing its review state', async () => {
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
      .expect(200);

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

    const revision = await ContentRevision.findOne({
      contentType: 'event',
      contentId: updatedEvent._id,
      actor: contributor._id,
    }).lean();
    assert.equal(revision.language, 'fr');
    assert.equal(revision.before.title, "Exercice d'integration");
    assert.equal(revision.after.title, changes.title);
  });

  test('lets a reviewer resubmit their own rejected event copy', async () => {
    const editor = await createUser({ role: 'editor' });
    const editorSession = await login(editor);
    const rejectedEvent = await Event.create({
      ...eventPayload({
        title: { en: 'Rejected staff event', fr: 'Événement du personnel refusé' },
      }),
      createdBy: editor._id,
      status: 'rejected',
      rejectionReason: 'Please correct the public wording.',
      reviewedBy: editor._id,
      reviewedAt: new Date(),
    });
    const correctedTitle = 'Corrected staff event';

    const response = await request(app)
      .patch(`/api/events/${rejectedEvent._id}/review-content`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({
        language: 'en',
        content: {
          title: correctedTitle,
          location: rejectedEvent.location.en,
          description: rejectedEvent.description.en,
          registration: rejectedEvent.registration?.en || '',
        },
      })
      .expect(200);

    assert.equal(response.body.event.status, 'pending');
    assert.equal(response.body.event.rejectionReason, '');
    assert.equal(response.body.event.title.en, correctedTitle);

    const revision = await ContentRevision.findOne({
      contentType: 'event',
      contentId: rejectedEvent._id,
      actor: editor._id,
      language: 'en',
    }).lean();
    assert.equal(revision.after.title, correctedTitle);
  });

  test('lets editors correct published content and exposes its staff revision history', async () => {
    const editor = await createUser({ role: 'editor' });
    const editorSession = await login(editor);
    const now = new Date();
    const event = await Event.create({
      ...eventPayload(),
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });
    const missingFrenchLastPost = await LastPostMessage.create({
      submitter: {
        rank: 'Captain',
        firstName: 'Editor',
        lastName: 'Example',
        email: 'editor@example.test',
      },
      deceased: {
        fullRank: 'Corporal',
        firstName: 'French',
        surname: 'Missing',
      },
      messageLanguage: 'en',
      messages: {
        en: 'This Last Post notice is intentionally missing its French public copy.',
        fr: '',
      },
      status: 'pending',
      createdBy: editor._id,
    });
    const missingEnglishRetirementBase = retirementPayload();
    const missingEnglishRetirement = await RetirementMessage.create({
      ...missingEnglishRetirementBase,
      retiree: {
        ...missingEnglishRetirementBase.retiree,
        firstName: 'English',
        lastName: 'Missing',
      },
      message: translatedMessage('French-only content workspace'),
      messageLanguage: 'fr',
      messages: {
        en: '',
        fr: translatedMessage('French-only content workspace'),
      },
      status: 'pending',
      createdBy: editor._id,
      publicationConsent: { confirmed: true, confirmedAt: now },
      memberReviewConfirmation: { confirmed: true, confirmedAt: now },
    });
    const retirementBase = retirementPayload();
    const retirementMessage = await RetirementMessage.create({
      ...retirementBase,
      messages: {
        en: retirementBase.message,
        fr: translatedMessage('Retirement original French'),
      },
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
      publicationConsent: { confirmed: true, confirmedAt: now },
      memberReviewConfirmation: { confirmed: true, confirmedAt: now },
    });
    const retirementComment = await RetirementComment.create({
      retirementMessage: retirementMessage._id,
      author: editor._id,
      body: 'Published retirement comment before a staff correction.',
      status: 'published',
      publishedBy: editor._id,
      publishedAt: now,
    });
    const lastPost = await LastPostMessage.create({
      submitter: {
        rank: 'Captain',
        firstName: 'Editor',
        lastName: 'Example',
        email: 'editor@example.test',
      },
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Published',
        surname: 'Notice',
      },
      messageLanguage: 'en',
      messages: {
        en: 'Published Last Post notice before a staff correction.',
        fr: 'Avis du Dernier appel publié avant une correction.',
      },
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });

    const eventChanges = {
      title: 'Published event correction',
      location: 'Ottawa, Ontario',
      description: 'Published event description corrected by a staff editor.',
      registration: 'Register with the branch office.',
    };
    const retirementCorrection = translatedMessage('Retirement staff correction');
    const lastPostCorrection = 'Published Last Post notice corrected by staff.';
    const commentCorrection = 'Published retirement comment corrected by staff.';

    await request(app)
      .patch(`/api/events/${event._id}/review-content`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({
        language: 'en',
        content: eventChanges,
        note: 'Corrected public details',
      })
      .expect(200);
    await request(app)
      .patch(`/api/retirement-messages/${retirementMessage._id}/review-content`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({
        language: 'fr',
        message: retirementCorrection,
        note: 'Corrected translation',
      })
      .expect(200);
    await request(app)
      .patch(`/api/last-posts/${lastPost._id}/review-content`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({
        language: 'en',
        message: lastPostCorrection,
        note: 'Corrected memorial copy',
      })
      .expect(200);
    await request(app)
      .patch(`/api/admin/retirement-comments/${retirementComment._id}`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ body: commentCorrection })
      .expect(200);

    const [publicEvent, publicRetirement, publicLastPost] = await Promise.all([
      request(app).get(`/api/events/${event._id}`).expect(200),
      request(app)
        .get(`/api/retirement-messages/${retirementMessage._id}`)
        .expect(200),
      request(app).get(`/api/last-posts/${lastPost._id}`).expect(200),
    ]);
    assert.equal(publicEvent.body.event.description.en, eventChanges.description);
    assert.equal(
      publicRetirement.body.retirementMessage.messages.fr,
      retirementCorrection,
    );
    assert.equal(publicLastPost.body.lastPost.messages.en, lastPostCorrection);

    const workspace = await request(app)
      .get('/api/admin/content?status=published&limit=100')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    const firstWorkspacePage = await request(app)
      .get('/api/admin/content?status=published&limit=1')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(firstWorkspacePage.body.items.length, 1);
    assert.equal(firstWorkspacePage.body.hasMore, true);
    assert.equal(typeof firstWorkspacePage.body.nextCursor, 'string');
    assert.notEqual(firstWorkspacePage.body.nextCursor, '');
    const pagedWorkspaceItemIds = new Set();
    let pagedWorkspace = firstWorkspacePage;
    let reachedFinalWorkspacePage = false;

    for (let page = 0; page < 10; page += 1) {
      assert.equal(pagedWorkspace.body.items.length, 1);
      const item = pagedWorkspace.body.items[0];
      const itemKey = `${item.type}:${item._id}`;
      assert.equal(pagedWorkspaceItemIds.has(itemKey), false);
      pagedWorkspaceItemIds.add(itemKey);

      if (!pagedWorkspace.body.hasMore) {
        assert.equal(pagedWorkspace.body.nextCursor, '');
        reachedFinalWorkspacePage = true;
        break;
      }

      assert.equal(typeof pagedWorkspace.body.nextCursor, 'string');
      assert.notEqual(pagedWorkspace.body.nextCursor, '');
      pagedWorkspace = await request(app)
        .get(
          '/api/admin/content?status=published&limit=1&cursor=' +
            encodeURIComponent(pagedWorkspace.body.nextCursor),
        )
        .set('Authorization', bearer(editorSession.body.token))
        .expect(200);
    }

    assert.equal(reachedFinalWorkspacePage, true);

    const workspaceEvent = workspace.body.items.find(
      (item) => String(item._id) === String(event._id),
    );
    assert.equal(workspaceEvent.type, 'event');
    assert.equal(workspaceEvent.content.title.en, eventChanges.title);
    assert.equal(Object.hasOwn(workspaceEvent.content, 'submitter'), true);
    assert.equal(workspaceEvent.content.submitter.email, 'events@example.test');
    const workspaceComment = workspace.body.items.find(
      (item) => String(item._id) === String(retirementComment._id),
    );
    assert.equal(workspaceComment.type, 'retirementComment');
    assert.equal(workspaceComment.content.body, commentCorrection);
    assert.equal(workspaceComment.content.author.email, editor.email);

    const focusedWorkspace = await request(app)
      .get('/api/admin/content?type=event&id=' + event._id)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(focusedWorkspace.body.items.length, 1);
    assert.equal(String(focusedWorkspace.body.items[0]._id), String(event._id));
    assert.equal(focusedWorkspace.body.hasMore, false);
    assert.equal(focusedWorkspace.body.nextCursor, '');

    const searchedWorkspace = await request(app)
      .get('/api/admin/content?type=event&search=published%20event%20correction')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(searchedWorkspace.body.items.length, 1);
    assert.equal(String(searchedWorkspace.body.items[0]._id), String(event._id));

    const missingEnglishWorkspace = await request(app)
      .get('/api/admin/content?type=retirementMessage&translation=missing-en')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.deepEqual(
      missingEnglishWorkspace.body.items.map((item) => String(item._id)),
      [String(missingEnglishRetirement._id)],
    );

    const missingFrenchWorkspace = await request(app)
      .get('/api/admin/content?type=lastPost&translation=missing-fr')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.deepEqual(
      missingFrenchWorkspace.body.items.map((item) => String(item._id)),
      [String(missingFrenchLastPost._id)],
    );

    const missingAnyWorkspace = await request(app)
      .get('/api/admin/content?translation=missing-any&status=pending')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.deepEqual(
      new Set(missingAnyWorkspace.body.items.map((item) => String(item._id))),
      new Set([
        String(missingEnglishRetirement._id),
        String(missingFrenchLastPost._id),
      ]),
    );

    const commentTranslationWorkspace = await request(app)
      .get('/api/admin/content?type=retirementComment&translation=missing-any')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(commentTranslationWorkspace.body.items.length, 0);

    const untypedFocusedWorkspace = await request(app)
      .get('/api/admin/content?id=' + event._id)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(untypedFocusedWorkspace.body.items.length, 1);
    assert.equal(
      String(untypedFocusedWorkspace.body.items[0]._id),
      String(event._id),
    );

    await request(app)
      .get('/api/admin/content?translation=unknown')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(400);

    await request(app)
      .get('/api/admin/content?cursor=not-a-valid-cursor')
      .set('Authorization', bearer(editorSession.body.token))
      .expect(400);

    const eventHistory = await request(app)
      .get(`/api/admin/content/event/${event._id}/revisions`)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    const retirementHistory = await request(app)
      .get(
        `/api/admin/content/retirementMessage/${retirementMessage._id}/revisions`,
      )
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    const lastPostHistory = await request(app)
      .get(`/api/admin/content/lastPost/${lastPost._id}/revisions`)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);

    assert.equal(eventHistory.body.revisions.length, 1);
    assert.equal(eventHistory.body.revisions[0].status, 'published');
    assert.equal(eventHistory.body.revisions[0].before.title, 'Integration exercise');
    assert.equal(eventHistory.body.revisions[0].after.title, eventChanges.title);
    assert.equal(eventHistory.body.revisions[0].note, 'Corrected public details');
    assert.equal(
      Object.hasOwn(eventHistory.body.revisions[0].actorSnapshot, 'email'),
      false,
    );
    assert.equal(retirementHistory.body.revisions[0].before.message, translatedMessage('Retirement original French'));
    assert.equal(
      retirementHistory.body.revisions[0].after.message,
      retirementCorrection,
    );
    assert.equal(lastPostHistory.body.revisions[0].before.message, 'Published Last Post notice before a staff correction.');
    assert.equal(
      lastPostHistory.body.revisions[0].after.message,
      lastPostCorrection,
    );

    const staffEditAudits = await AuditLog.countDocuments({
      action: 'content.staff_content_updated',
    });
    assert.equal(staffEditAudits, 3);
    const commentEditAudit = await AuditLog.findOne({
      action: 'content.admin_updated',
      target: retirementComment._id,
    }).lean();
    assert.deepEqual(commentEditAudit.metadata.fields, ['body']);
  });

  test('lets reviewers replace or remove submission images from the workspace', async () => {
    const editor = await createUser({ role: 'editor' });
    const editorSession = await login(editor);
    const now = new Date();
    const eventAsset = await MediaAsset.create({
      key: 'images/workspace-event/original.webp',
      url: 'https://cdn.example.test/images/workspace-event/large.webp',
      originalKey: 'images/workspace-event/original.webp',
      originalUrl: 'https://cdn.example.test/images/workspace-event/original.webp',
    });
    const event = await Event.create({
      ...eventPayload(),
      imagePath: 'https://cdn.example.test/images/old-event/large.webp',
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });
    const retirementBase = retirementPayload();
    const retirementMessage = await RetirementMessage.create({
      ...retirementBase,
      photoUrl: 'https://cdn.example.test/images/old-retirement/large.webp',
      photoDisplayUrl:
        'https://cdn.example.test/images/old-retirement/display-4x3.webp',
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
      publicationConsent: { confirmed: true, confirmedAt: now },
      memberReviewConfirmation: { confirmed: true, confirmedAt: now },
    });
    const lastPost = await LastPostMessage.create({
      submitter: {
        rank: 'Captain',
        firstName: 'Editor',
        lastName: 'Example',
        email: 'editor@example.test',
      },
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Image',
        surname: 'Removal',
      },
      messageLanguage: 'en',
      messages: {
        en: 'A published Last Post notice whose image will be removed by a reviewer.',
        fr: 'Un avis du Dernier appel publié dont l’image sera supprimée par le réviseur.',
      },
      imageUrl: 'https://cdn.example.test/images/old-last-post/large.webp',
      imageDisplayUrl:
        'https://cdn.example.test/images/old-last-post/display-4x3.webp',
      status: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });

    await request(app)
      .patch(`/api/admin/events/${event._id}`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ imagePath: eventAsset.url })
      .expect(200);
    await request(app)
      .patch(`/api/admin/retirement-messages/${retirementMessage._id}`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({
        photoUrl: 'https://cdn.example.test/images/new-retirement/large.webp',
        photoDisplayUrl:
          'https://cdn.example.test/images/new-retirement/display-4x3.webp',
      })
      .expect(200);
    await request(app)
      .patch(`/api/admin/last-posts/${lastPost._id}`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ imageUrl: '', imageDisplayUrl: '' })
      .expect(200);

    const [savedEvent, savedRetirement, savedLastPost, linkedAsset] =
      await Promise.all([
        Event.findById(event._id).lean(),
        RetirementMessage.findById(retirementMessage._id).lean(),
        LastPostMessage.findById(lastPost._id).lean(),
        MediaAsset.findById(eventAsset._id).lean(),
      ]);
    assert.equal(savedEvent.imagePath, eventAsset.url);
    assert.equal(
      savedRetirement.photoUrl,
      'https://cdn.example.test/images/new-retirement/large.webp',
    );
    assert.equal(
      savedRetirement.photoDisplayUrl,
      'https://cdn.example.test/images/new-retirement/display-4x3.webp',
    );
    assert.equal(savedLastPost.imageUrl, '');
    assert.equal(savedLastPost.imageDisplayUrl, '');
    assert.equal(linkedAsset.uploadContext.type, 'event');
    assert.equal(String(linkedAsset.uploadContext.sourceId), String(event._id));

    const revisions = await ContentRevision.find({
      contentId: { $in: [event._id, retirementMessage._id, lastPost._id] },
    })
      .sort({ createdAt: 1 })
      .lean();
    assert.deepEqual(
      revisions.map((revision) => revision.fields),
      [['imagePath'], ['photoUrl', 'photoDisplayUrl'], ['imageUrl', 'imageDisplayUrl']],
    );
    assert.equal(revisions[2].after.imageUrl, '');

    const imageAudits = await AuditLog.find({
      action: 'content.admin_updated',
      target: { $in: [event._id, retirementMessage._id, lastPost._id] },
    })
      .sort({ createdAt: 1 })
      .lean();
    assert.equal(imageAudits.length, 3);
  });

  test('lets staff edit hidden public copy without restoring it', async () => {
    const editor = await createUser({ role: 'editor' });
    const editorSession = await login(editor);
    const now = new Date();
    const event = await Event.create({
      ...eventPayload(),
      status: 'hidden',
      hiddenFromStatus: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });
    const retirementBase = retirementPayload();
    const retirementMessage = await RetirementMessage.create({
      ...retirementBase,
      messages: {
        en: retirementBase.message,
        fr: translatedMessage('Hidden retirement message'),
      },
      status: 'hidden',
      hiddenFromStatus: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
      publicationConsent: { confirmed: true, confirmedAt: now },
      memberReviewConfirmation: { confirmed: true, confirmedAt: now },
    });
    const lastPost = await LastPostMessage.create({
      submitter: {
        rank: 'Captain',
        firstName: 'Editor',
        lastName: 'Example',
        email: 'editor@example.test',
      },
      deceased: {
        fullRank: 'Sergeant',
        firstName: 'Hidden',
        surname: 'Notice',
      },
      messageLanguage: 'en',
      messages: {
        en: 'Hidden Last Post notice before a staff correction.',
        fr: 'Avis du Dernier appel retiré avant une correction du personnel.',
      },
      status: 'hidden',
      hiddenFromStatus: 'published',
      createdBy: editor._id,
      publishedBy: editor._id,
      publishedAt: now,
    });

    const eventChanges = {
      title: 'Hidden event correction',
      location: 'Ottawa, Ontario',
      description: 'A staff editor corrected this event while it remains removed.',
      registration: 'Contact the branch office for registration details.',
    };
    const retirementCorrection = translatedMessage(
      'Hidden retirement message correction',
    );
    const lastPostCorrection =
      'Hidden Last Post notice corrected while it remains removed.';

    await Promise.all([
      request(app)
        .patch(`/api/events/${event._id}/review-content`)
        .set('Authorization', bearer(editorSession.body.token))
        .send({ language: 'en', content: eventChanges })
        .expect(200),
      request(app)
        .patch(`/api/retirement-messages/${retirementMessage._id}/review-content`)
        .set('Authorization', bearer(editorSession.body.token))
        .send({ language: 'fr', message: retirementCorrection })
        .expect(200),
      request(app)
        .patch(`/api/last-posts/${lastPost._id}/review-content`)
        .set('Authorization', bearer(editorSession.body.token))
        .send({ language: 'en', message: lastPostCorrection })
        .expect(200),
    ]);

    const [savedEvent, savedRetirementMessage, savedLastPost] =
      await Promise.all([
        Event.findById(event._id).lean(),
        RetirementMessage.findById(retirementMessage._id).lean(),
        LastPostMessage.findById(lastPost._id).lean(),
      ]);

    assert.equal(savedEvent.status, 'hidden');
    assert.equal(savedEvent.hiddenFromStatus, 'published');
    assert.equal(savedEvent.title.en, eventChanges.title);
    assert.equal(savedRetirementMessage.status, 'hidden');
    assert.equal(savedRetirementMessage.hiddenFromStatus, 'published');
    assert.equal(savedRetirementMessage.messages.fr, retirementCorrection);
    assert.equal(savedLastPost.status, 'hidden');
    assert.equal(savedLastPost.hiddenFromStatus, 'published');
    assert.equal(savedLastPost.messages.en, lastPostCorrection);

    const revisions = await ContentRevision.find({
      contentId: { $in: [event._id, retirementMessage._id, lastPost._id] },
    }).lean();
    assert.equal(revisions.length, 3);
    assert.equal(revisions.every((revision) => revision.status === 'hidden'), true);
    assert.equal(
      await AuditLog.countDocuments({ action: 'content.staff_content_updated' }),
      3,
    );
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

  test('exports only published event details as a localized iCalendar attachment', async () => {
    const owner = await createUser({ role: 'editor' });
    const publishedEvent = await Event.create({
      title: { en: 'English planning session', fr: 'Séance de planification' },
      description: {
        en: 'Public English description',
        fr: 'Description française publique',
      },
      registration: { en: 'https://example.test/register' },
      location: { en: 'Public room', fr: 'Salle publique' },
      city: 'Ottawa',
      timezone: 'America/Toronto',
      startDate: new Date('2040-07-18T14:00:00.000Z'),
      endDate: new Date('2040-07-18T16:00:00.000Z'),
      allDay: false,
      status: 'published',
      submitter: { email: 'private-submitter@example.test' },
      createdBy: owner._id,
    });
    const draftEvent = await Event.create({
      title: { en: 'Private draft' },
      startDate: new Date('2040-07-19T12:00:00.000Z'),
      allDay: true,
      status: 'draft',
      createdBy: owner._id,
    });

    const response = await request(app)
      .get(`/api/events/${publishedEvent._id}/calendar.ics?lang=fr`)
      .expect(200);

    assert.match(response.headers['content-type'], /^text\/calendar/);
    assert.equal(
      response.headers['content-disposition'],
      'attachment; filename="cmcen-event.ics"',
    );
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.text, /SUMMARY:Séance de planification\r\n/);
    assert.match(response.text, /DTSTART:20400718T140000Z\r\n/);
    assert.match(response.text, /DTEND:20400718T160000Z\r\n/);
    assert.match(response.text, /LOCATION:Salle publique\\, Ottawa\r\n/);
    assert.doesNotMatch(response.text, /private-submitter@example\.test/);
    assert.doesNotMatch(response.text, /createdBy|submitter|publicationPermission/);

    await request(app)
      .get(`/api/events/${draftEvent._id}/calendar.ics`)
      .expect(404);
  });

  test('prevents unauthorized page management and publishes a bilingual page', async () => {
    const subscriber = await createUser({
      role: 'subscriber',
      notificationState: { lastReadAt: null },
    });
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
      .send({ status: 'published', featureOnHome: true })
      .expect(403);

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

  test('features authorized public pages in the homepage news feed', async () => {
    const administrator = await createUser({ role: 'administrator' });
    const session = await login(administrator);
    const created = await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send({
        title: { en: 'Homepage feature', fr: 'Vedette accueil' },
        slug: 'homepage-feature',
        summary: { en: 'Featured page summary', fr: 'Resume de la vedette' },
        access: { audience: 'public' },
      })
      .expect(201);
    const pageId = created.body.page._id;

    const published = await request(app)
      .patch(`/api/admin/pages/${pageId}/status`)
      .set('Authorization', bearer(session.body.token))
      .send({ status: 'published', featureOnHome: true })
      .expect(200);

    assert.equal(published.body.page.featuredOnHome, true);

    const feed = await request(app).get('/api/news/feed?limit=24').expect(200);
    const featuredItem = feed.body.items.find(
      (item) => String(item._id) === String(pageId),
    );
    assert.equal(featuredItem.type, 'page');
    assert.equal(featuredItem.route, '/pages/homepage-feature');
    assert.equal(featuredItem.title.fr, 'Vedette accueil');
  });

  test('keeps draft-linked navbar items private until the page is published', async () => {
    const editor = await createUser({ role: 'developer' });
    const session = await login(editor);
    const created = await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send({
        title: { en: 'Prepared navigation page' },
        slug: 'prepared-navigation-page',
        blocks: [
          {
            type: 'text',
            body: { en: 'Prepared content.' },
            layout: { span: 99 },
          },
        ],
      })
      .expect(201);

    const pageId = created.body.page._id;
    assert.equal(created.body.page.blocks[0].layout.span, 12);
    assert.equal(created.body.page.blocks[0].layout.column, 1);
    assert.equal(created.body.page.blocks[0].layout.row, 1);
    assert.equal(created.body.page.blocks[0].layout.rowSpan, 3);

    const navigationItem = await request(app)
      .post('/api/admin/navigation-items')
      .set('Authorization', bearer(session.body.token))
      .send({
        group: 'about',
        page: pageId,
        route: '/pages/prepared-navigation-page',
        label: { en: 'Prepared navigation page' },
        visible: true,
      })
      .expect(201);

    await request(app)
      .post('/api/admin/navigation-items')
      .set('Authorization', bearer(session.body.token))
      .send({
        group: 'about',
        page: pageId,
        route: '/pages/prepared-navigation-page',
        label: { en: 'Duplicate navigation page' },
        visible: true,
      })
      .expect(409);

    await request(app)
      .patch(`/api/admin/navigation-items/${navigationItem.body.item._id}`)
      .set('Authorization', bearer(session.body.token))
      .send({
        group: 'news',
        page: pageId,
        route: '/pages/prepared-navigation-page',
        label: { en: 'Prepared navigation page' },
        visible: true,
      })
      .expect(200);

    const whileDraft = await request(app).get('/api/navigation').expect(200);
    assert.equal(
      whileDraft.body.items.some((item) => String(item.page) === String(pageId)),
      false,
    );

    await request(app)
      .patch(`/api/admin/pages/${pageId}/status`)
      .set('Authorization', bearer(session.body.token))
      .send({ status: 'published' })
      .expect(200);

    const oncePublished = await request(app).get('/api/navigation').expect(200);
    assert.equal(
      oncePublished.body.items.some((item) => String(item.page) === String(pageId)),
      true,
    );
  });

  test('keeps divider blocks to one grid row', async () => {
    const editor = await createUser({ role: 'developer' });
    const session = await login(editor);
    const created = await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send({
        title: { en: 'Divider layout' },
        slug: 'divider-layout',
        blocks: [{ type: 'divider', layout: { rowSpan: 8 } }],
      })
      .expect(201);

    const pageId = created.body.page._id;
    assert.equal(created.body.page.blocks[0].layout.rowSpan, 1);

    const updated = await request(app)
      .patch(`/api/admin/pages/${pageId}`)
      .set('Authorization', bearer(session.body.token))
      .send({ blocks: [{ type: 'divider', layout: { rowSpan: 6 } }] })
      .expect(200);

    assert.equal(updated.body.page.blocks[0].layout.rowSpan, 1);
  });

  test('returns a page route for a published page linked to a custom navbar parent', async () => {
    const developer = await createUser({ role: 'developer' });
    const session = await login(developer);
    const created = await request(app)
      .post('/api/admin/pages')
      .set('Authorization', bearer(session.body.token))
      .send({ title: { en: 'Custom navigation page' }, slug: 'custom-navigation-page' })
      .expect(201);
    const pageId = created.body.page._id;

    await request(app)
      .patch(`/api/admin/pages/${pageId}/status`)
      .set('Authorization', bearer(session.body.token))
      .send({ status: 'published' })
      .expect(200);

    await request(app)
      .post('/api/admin/navigation-items')
      .set('Authorization', bearer(session.body.token))
      .send({
        type: 'group',
        group: 'custom',
        label: { en: 'Custom' },
        visible: true,
      })
      .expect(201);

    await request(app)
      .post('/api/admin/navigation-items')
      .set('Authorization', bearer(session.body.token))
      .send({
        group: 'custom',
        page: pageId,
        label: { en: 'Custom navigation page' },
        visible: true,
      })
      .expect(201);

    const navigation = await request(app).get('/api/navigation').expect(200);
    const link = navigation.body.items.find(
      (item) => String(item.page) === String(pageId),
    );
    assert.equal(link.route, '/pages/custom-navigation-page');
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

  test('returns unread published and rejected review results with direct destinations', async () => {
    const message = await submitAndPublishRetirement();
    const subscriber = await createUser({ role: 'subscriber' });
    const reviewer = await createUser({ role: 'editor' });
    const session = await login(subscriber);
    const reviewDate = new Date();
    const comment = await RetirementComment.create({
      retirementMessage: message._id,
      author: subscriber._id,
      body: 'Please correct this rejected integration comment.',
      status: 'rejected',
      rejectionReason: 'Add the missing context.',
      reviewedBy: reviewer._id,
      reviewedAt: reviewDate,
    });
    const event = await Event.create({
      ...eventPayload(),
      createdBy: subscriber._id,
      status: 'published',
      reviewedBy: reviewer._id,
      publishedBy: reviewer._id,
      reviewedAt: reviewDate,
      publishedAt: reviewDate,
    });
    const selfPublishedEvent = await Event.create({
      ...eventPayload({
        title: {
          en: 'Self-published integration exercise',
          fr: 'Exercice d’intégration autopublié',
        },
      }),
      createdBy: subscriber._id,
      status: 'published',
      reviewedBy: subscriber._id,
      publishedBy: subscriber._id,
      reviewedAt: reviewDate,
      publishedAt: reviewDate,
    });

    const profile = await request(app)
      .get('/api/me')
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    assert.deepEqual(profile.body.notifications, {
      count: 2,
      actionCount: 1,
      unreadCount: 1,
    });

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    const notification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(comment._id),
    );
    const publishedNotification = notifications.body.notifications.items.find(
      (item) => String(item.id) === String(event._id),
    );
    const expectedEditHref = `/retirement-message?id=${message._id}&editComment=${comment._id}`;

    assert.equal(notifications.body.notifications.count, 2);
    assert.equal(notifications.body.notifications.actionCount, 1);
    assert.equal(notifications.body.notifications.unreadCount, 1);
    assert.equal(notifications.body.notifications.shouldMarkRead, true);
    assert.match(notifications.body.notifications.readThrough, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(notification.type, 'retirementComment');
    assert.equal(notification.status, 'rejected');
    assert.equal(notification.editHref, expectedEditHref);
    assert.equal(notification.href, expectedEditHref);
    assert.equal(publishedNotification.type, 'event');
    assert.equal(publishedNotification.status, 'published');
    assert.equal(publishedNotification.href, `/event?id=${event._id}`);
    assert.equal(
      notifications.body.notifications.items.some(
        (item) => String(item.id) === String(selfPublishedEvent._id),
      ),
      false,
    );

    const editableComment = await request(app)
      .get(`/api/retirement-messages/comments/${comment._id}/edit`)
      .set('Authorization', bearer(session.body.token))
      .expect(200);

    assert.equal(
      String(editableComment.body.comment.retirementMessage._id),
      String(message._id),
    );
    assert.equal(editableComment.body.comment.status, 'rejected');

    await request(app)
      .post('/api/notifications/read')
      .set('Authorization', bearer(session.body.token))
      .send({ readThrough: notifications.body.notifications.readThrough })
      .expect(200);

    const readNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.equal(readNotifications.body.notifications.count, 1);
    assert.equal(readNotifications.body.notifications.actionCount, 1);
    assert.equal(readNotifications.body.notifications.unreadCount, 0);
    assert.equal(
      String(readNotifications.body.notifications.items[0].id),
      String(comment._id),
    );

    const readAudit = await AuditLog.findOne({
      action: 'user.notifications_read',
      actor: subscriber._id,
    }).lean();
    assert.equal(readAudit.metadata.readThrough, notifications.body.notifications.readThrough);

    await RetirementComment.findByIdAndUpdate(comment._id, {
      status: 'pending',
      rejectionReason: '',
    });

    const resolvedNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearer(session.body.token))
      .expect(200);
    assert.equal(resolvedNotifications.body.notifications.count, 0);
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

  test('creates a positionable 16:9 display crop for news images', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const session = await login(contributor);
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async () => ({});

    try {
      const image = await sharp({
        create: {
          width: 320,
          height: 240,
          channels: 3,
          background: '#336699',
        },
      })
        .png()
        .toBuffer();
      const uploaded = await request(app)
        .post('/api/upload')
        .set('Authorization', bearer(session.body.token))
        .field('uploadSource', 'newsArticle')
        .field('displayAspectRatio', '16:9')
        .field('displayCropX', '0.25')
        .field('displayCropY', '0.75')
        .attach('image', image, {
          filename: 'news.png',
          contentType: 'image/png',
        })
        .expect(201);

      assert.match(uploaded.body.display.url, /\/display-16x9\.webp$/);
      assert.equal(
        Math.round(
          (uploaded.body.display.width / uploaded.body.display.height) * 100,
        ),
        Math.round((16 / 9) * 100),
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

  test('removes content reversibly without deleting attached media', async () => {
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
        message:
          'A Last Post notice with an image that should remain available when the notice is removed.',
        imageUrl: lastPostAsset.url,
        publicationPermissionConfirmed: true,
      })
      .expect(201);
    const lastPost = await LastPostMessage.findOne({
      imageUrl: lastPostAsset.url,
    }).lean();
    assert.equal(lastPost.status, 'pending');

    await Promise.all([
      RetirementMessage.updateOne(
        { _id: retirementMessage._id },
        { $set: { status: 'published', publishedAt: new Date() } },
      ),
      LastPostMessage.updateOne(
        { _id: lastPost._id },
        { $set: { status: 'published', publishedAt: new Date() } },
      ),
    ]);

    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async (command) => {
      sentCommands.push(command);
      return {};
    };

    try {
      await request(app)
        .patch(`/api/admin/events/${event._id}/hide`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);
      await request(app)
        .patch(`/api/admin/retirement-messages/${retirementMessage._id}/hide`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);
      await request(app)
        .patch(`/api/admin/last-posts/${lastPost._id}/hide`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      const [removedEvent, removedRetirementMessage, removedLastPost] =
        await Promise.all([
          Event.findById(event._id).lean(),
          RetirementMessage.findById(retirementMessage._id).lean(),
          LastPostMessage.findById(lastPost._id).lean(),
        ]);

      assert.equal(removedEvent.status, 'hidden');
      assert.equal(removedEvent.hiddenFromStatus, 'published');
      assert.equal(removedRetirementMessage.status, 'hidden');
      assert.equal(removedRetirementMessage.hiddenFromStatus, 'published');
      assert.equal(removedLastPost.status, 'hidden');
      assert.equal(removedLastPost.hiddenFromStatus, 'published');

      await request(app).get(`/api/events/${event._id}`).expect(404);
      assert.equal(
        await RetirementMessage.countDocuments({ _id: retirementMessage._id }),
        1,
      );
      assert.equal(
        await LastPostMessage.countDocuments({ _id: lastPost._id }),
        1,
      );
      assert.equal(await Event.countDocuments({ _id: event._id }), 1);
      assert.equal(await MediaAsset.countDocuments({ _id: eventAsset._id }), 1);
      assert.equal(
        await MediaAsset.countDocuments({ _id: retirementAsset._id }),
        1,
      );
      assert.equal(
        await MediaAsset.countDocuments({ _id: lastPostAsset._id }),
        1,
      );
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'DeleteObjectCommand',
        ).length,
        0,
      );

      const removalAudit = await AuditLog.findOne({
        action: 'content.hidden',
        target: event._id,
      }).lean();
      assert.equal(removalAudit.metadata.previousStatus, 'published');
      assert.equal(removalAudit.metadata.removedByOwner, true);
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('preserves shared media when removed content is retained for restoration', async () => {
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

    await Promise.all([
      Event.updateOne(
        { _id: event._id },
        { $set: { status: 'published', publishedAt: new Date() } },
      ),
      LastPostMessage.updateOne(
        { _id: lastPost._id },
        { $set: { status: 'published', publishedAt: new Date() } },
      ),
    ]);

    const sentCommands = [];
    const originalSend = s3Client.send.bind(s3Client);
    s3Client.send = async (command) => {
      sentCommands.push(command);
      return {};
    };

    try {
      await request(app)
        .patch(`/api/admin/events/${event._id}/hide`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      assert.equal(
        await MediaAsset.countDocuments({ _id: sharedAsset._id }),
        1,
      );
      assert.equal(sentCommands.length, 0);

      await request(app)
        .patch(`/api/admin/last-posts/${lastPost._id}/hide`)
        .set('Authorization', bearer(administratorSession.body.token))
        .expect(200);

      assert.equal(
        await MediaAsset.countDocuments({ _id: sharedAsset._id }),
        1,
      );
      assert.equal(
        sentCommands.filter(
          (command) => command.constructor.name === 'DeleteObjectCommand',
        ).length,
        0,
      );
    } finally {
      s3Client.send = originalSend;
    }
  });

  test('keeps pending content out of the removal workflow', async () => {
    const contributor = await createUser({ role: 'contributor' });
    const editor = await createUser({ role: 'editor' });
    const contributorSession = await login(contributor);
    const editorSession = await login(editor);

    await request(app)
      .post('/api/events')
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(201);
    const event = await Event.findOne({ createdBy: contributor._id }).lean();

    const pendingRemoval = await request(app)
      .patch(`/api/admin/events/${event._id}/hide`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ reason: 'Duplicate submission' })
      .expect(409);
    assert.match(pendingRemoval.body.error, /must be published, rejected, or deleted/u);

    const pendingEvent = await Event.findById(event._id).lean();
    assert.equal(pendingEvent.status, 'pending');

    await Event.updateOne(
      { _id: event._id },
      { $set: { status: 'published', publishedAt: new Date() } },
    );

    await request(app)
      .patch(`/api/admin/events/${event._id}/hide`)
      .set('Authorization', bearer(editorSession.body.token))
      .send({ reason: 'Duplicate submission' })
      .expect(200);

    const removedEvent = await Event.findById(event._id).lean();
    assert.equal(removedEvent.status, 'hidden');
    assert.equal(removedEvent.hiddenFromStatus, 'published');
    assert.equal(removedEvent.hiddenReason, 'Duplicate submission');

    await request(app)
      .patch(`/api/events/${event._id}`)
      .set('Authorization', bearer(contributorSession.body.token))
      .send(eventPayload())
      .expect(404);

    await request(app)
      .patch(`/api/admin/events/${event._id}/restore`)
      .set('Authorization', bearer(contributorSession.body.token))
      .expect(403);

    const restored = await request(app)
      .patch(`/api/admin/events/${event._id}/restore`)
      .set('Authorization', bearer(editorSession.body.token))
      .expect(200);
    assert.equal(restored.body.content.status, 'published');

    const restoredEvent = await Event.findById(event._id).lean();
    assert.equal(restoredEvent.status, 'published');
    assert.equal(restoredEvent.hiddenAt, null);
    assert.equal(restoredEvent.hiddenBy, null);
    assert.equal(restoredEvent.hiddenReason, '');

    const auditActions = await AuditLog.find({ target: event._id })
      .sort({ createdAt: 1 })
      .lean();
    assert.deepEqual(
      auditActions.map((entry) => entry.action),
      ['content.created', 'content.hidden', 'content.restored'],
    );
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
