const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { before, after, test } = require('node:test');

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'audit-hardening-test-only',
  APP_BASE_URL: 'http://localhost:3000',
  DISABLE_EMAIL_SENDING: 'false',
  TRUST_PROXY: '127.0.0.1,::1',
  MINIO_ENDPOINT: 'http://127.0.0.1:9000',
  MINIO_BUCKET_NAME: 'test',
  MINIO_ACCESS_KEY: 'test',
  MINIO_SECRET_KEY: 'test',
  CDN_PUBLIC_BASE_URL: 'https://cdn.example.test/test',
});
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const User = require('../../models/User');
const Comment = require('../../models/Comment');
const RetirementMessage = require('../../models/RetirementMessage');
const Event = require('../../models/Event');
const EventRsvp = require('../../models/EventRsvp');
const AuditLog = require('../../models/AuditLog');
const Role = require('../../models/Role');
const { createSessionToken } = require('../../services/auth-session');
const {
  authMiddleware,
  optionalAuthMiddleware,
  authOrTempMiddleware,
} = require('../../middleware/auth');
const { writeAuditLog } = require('../../services/audit-log');
let mongo;
let sequence = 0;
const password = 'Memorable-Security-Phrase!';
async function createUser(overrides = {}) {
  sequence += 1;
  return User.create({
    username: `audit-${sequence}@example.test`,
    email: `audit-${sequence}@example.test`,
    accountName: 'Public Member',
    firstName: 'Public',
    lastName: 'Member',
    password,
    ...overrides,
  });
}
const auth = (user) => `Bearer ${createSessionToken(user)}`;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const memberFields = {
  firstName: 'Public',
  lastName: 'Member',
  addressLine1: '1 Example St',
  city: 'Ottawa',
  country: 'Canada',
  stateProvince: 'Ontario',
  postalCode: 'K1A 0A1',
  status: 'regular',
  affiliationElement: 'army',
};
function assertSafeProfile(profile) {
  for (const key of [
    'password',
    'passwordReset',
    'invitation',
    'emailVerification',
    'sessionVersion',
    'totp',
    'twoFactor',
    'webauthn',
    'notificationState',
    'webauthnRegistrationChallenge',
    'webauthnAuthenticationChallenge',
  ]) {
    assert.equal(Object.hasOwn(profile, key), false, key);
  }
  assert.equal(profile.firstName, 'Public');
  assert.equal(profile.mfa.hasTotp, false);
  assert.ok(profile.permissions);
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('anonymous published comments expose only public author identity', async () => {
  const user = await createUser({ role: 'developer' });
  const parentId = new mongoose.Types.ObjectId();
  await RetirementMessage.collection.insertOne({
    _id: parentId,
    status: 'published',
  });
  await Comment.create({
    parentType: 'retirement',
    parentId,
    author: user._id,
    body: 'Published comment',
    status: 'published',
  });
  const response = await request(app)
    .get(`/api/comments/on/retirement/${parentId}`)
    .expect(200);
  const author = response.body.comments[0].author;
  assert.deepEqual(
    Object.keys(author).sort(),
    ['_id', 'accountName', 'firstName', 'lastName'].sort(),
  );
  assert.equal(JSON.stringify(response.body).includes(user.email), false);
  assert.equal(author.firstName, user.firstName);
});

test('all bearer paths reject refresh, untyped and wrong-purpose JWTs; access and revocation work', async () => {
  const user = await createUser();
  const probe = express();
  for (const [path, middleware] of [
    ['required', authMiddleware],
    ['optional', optionalAuthMiddleware],
    ['temporary', authOrTempMiddleware],
  ]) {
    probe.get(`/${path}`, middleware, (req, res) =>
      res.json({ authenticated: Boolean(req.user) }),
    );
  }
  for (const tokenType of ['refresh', 'reset', undefined]) {
    const token = jwt.sign(
      {
        userId: user._id,
        sessionVersion: 0,
        ...(tokenType ? { tokenType } : {}),
      },
      process.env.JWT_SECRET,
    );
    for (const path of ['required', 'optional', 'temporary']) {
      const result = await request(probe)
        .get(`/${path}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(path === 'optional' ? 200 : 401);
      if (path === 'optional') assert.equal(result.body.authenticated, false);
    }
  }
  for (const path of ['required', 'optional', 'temporary']) {
    const result = await request(probe)
      .get(`/${path}`)
      .set('Authorization', auth(user))
      .expect(200);
    assert.equal(result.body.authenticated, true);
    await request(probe)
      .get(`/${path}`)
      .set('Authorization', 'Bearer invalid')
      .expect(path === 'optional' ? 200 : 401);
  }
  const token = createSessionToken(user);
  assert.equal(jwt.decode(token).tokenType, 'access');
  // Existing refresh cookies can replace pre-patch untyped access tokens.
  const refresh = jwt.sign(
    { userId: user._id, sessionVersion: 0, tokenType: 'refresh' },
    process.env.JWT_SECRET,
  );
  const refreshed = await request(app)
    .post('/api/session/refresh')
    .set('Cookie', `cmcen_refresh=${refresh}`)
    .expect(200);
  assert.equal(jwt.decode(refreshed.body.token).tokenType, 'access');
  await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
  for (const path of ['required', 'optional', 'temporary']) {
    const result = await request(probe)
      .get(`/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(path === 'optional' ? 200 : 401);
    if (path === 'optional') assert.equal(result.body.authenticated, false);
  }
  await request(app)
    .post('/api/session/refresh')
    .set('Cookie', `cmcen_refresh=${refresh}`)
    .expect(401);
});

test('activation and guest upgrade responses exclude selected credentials and internal state', async () => {
  const invitationToken = 'synthetic-invitation-token';
  const invited = await createUser({
    accountType: 'invited',
    invitation: {
      tokenHash: hash(invitationToken),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const activated = await request(app)
    .post('/api/register')
    .send({
      email: invited.email,
      invitationToken,
      password,
      passwordConfirmation: password,
      sessionCookieConsent: true,
    })
    .expect(201);
  assertSafeProfile(activated.body.user);
  const ghost = await createUser({ accountType: 'ghost', role: 'ghost' });
  const upgraded = await request(app)
    .post('/api/ghost/upgrade')
    .set('Authorization', auth(ghost))
    .send({
      ...memberFields,
      password,
      passwordConfirmation: password,
    })
    .expect(200);
  assertSafeProfile(upgraded.body.user);
  assert.equal(
    (await User.findById(ghost._id).select('+password')).password.startsWith(
      '$2',
    ),
    true,
  );
});

test('every password boundary rejects short, non-string and over-byte-limit inputs without consuming recovery state', async () => {
  const invitationToken = 'weak-password-invitation';
  const invited = await createUser({
    accountType: 'invited',
    invitation: {
      tokenHash: hash(invitationToken),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const ghost = await createUser({ accountType: 'ghost', role: 'ghost' });
  const resetToken = 'synthetic-reset-token';
  const resetUser = await createUser({
    passwordReset: {
      tokenHash: hash(resetToken),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const before = await User.findById(resetUser._id).select('+password').lean();
  for (const weak of ['short', 'a'.repeat(73), '😀'.repeat(19), 123456789012]) {
    const credentials = { password: weak, passwordConfirmation: weak };
    await request(app)
      .post('/api/register')
      .send({ ...memberFields, email: 'new@example.test', ...credentials })
      .expect(400);
    await request(app)
      .post('/api/register')
      .send({ email: invited.email, invitationToken, ...credentials })
      .expect(400);
    await request(app)
      .post('/api/ghost/upgrade')
      .set('Authorization', auth(ghost))
      .send({ ...memberFields, ...credentials })
      .expect(400);
    await request(app)
      .post('/api/password-reset/confirm')
      .set('X-Forwarded-For', `198.51.100.${sequence++}`)
      .send({ token: resetToken, ...credentials })
      .expect(400);
  }
  assert.equal(await User.countDocuments({ email: 'new@example.test' }), 0);
  assert.equal((await User.findById(invited._id)).accountType, 'invited');
  assert.equal((await User.findById(ghost._id)).accountType, 'ghost');
  assert.equal(
    (await User.findById(resetUser._id).select('+password')).password,
    before.password,
  );
  const valid = '😀'.repeat(18); // Exactly 72 UTF-8 bytes.
  await request(app)
    .post('/api/password-reset/confirm')
    .send({ token: resetToken, password: valid, passwordConfirmation: valid })
    .expect(200);
  const updated = await User.findById(resetUser._id).select(
    '+password +passwordReset.tokenHash',
  );
  assert.equal(updated.passwordReset.tokenHash, '');
  assert.equal(updated.sessionVersion, 1);
  assert.equal(
    await require('bcryptjs').compare(valid, updated.password),
    true,
  );
});

test('profile allowlist preserves populated roles and editable owner fields', async () => {
  const role = await Role.create({
    name: '', // Authorized blank names still display through the role slug.
    slug: 'audit-reader',
    color: '#123456',
    permissions: ['audit.view'],
  });
  const user = await createUser({
    profileComplete: false,
    biography: 'Private owner biography',
    websiteUrl: 'https://example.test/profile',
    socialLinks: { facebook: 'https://www.facebook.com/example' },
    address: {
      line1: '1 Owner Street',
      city: 'Ottawa',
      country: 'Canada',
      stateProvince: 'Ontario',
      postalCode: 'K1A 0A1',
    },
    customRoles: [role._id],
    contentAreas: ['news'],
  });
  const response = await request(app)
    .get('/api/me')
    .set('Authorization', auth(user))
    .expect(200);
  assertSafeProfile(response.body);
  assert.equal(response.body.profileComplete, false);
  assert.equal(response.body.biography, user.biography);
  assert.equal(response.body.websiteUrl, user.websiteUrl);
  assert.equal(response.body.socialLinks.facebook, user.socialLinks.facebook);
  assert.equal(response.body.address.line1, user.address.line1);
  assert.deepEqual(response.body.contentAreas, ['news']);
  assert.deepEqual(response.body.customRoles, [
    {
      _id: String(role._id),
      name: role.name,
      slug: role.slug,
      color: role.color,
      permissions: ['audit.view'],
    },
  ]);
  assert.equal(response.body.permissions.canViewAuditLog, true);
});

test('existing passwords outside the new enrollment policy still authenticate', async () => {
  for (const existingPassword of ['old', '😀'.repeat(19)]) {
    const user = await createUser({ password: existingPassword });
    const response = await request(app)
      .post('/api/login')
      .send({
        username: user.username,
        password: existingPassword,
        sessionCookieConsent: true,
      })
      .expect(200);
    assert.equal(jwt.decode(response.body.token).tokenType, 'access');
    await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${response.body.token}`)
      .expect(200);
  }
});

test('pending TOTP cannot complete temporary login; authenticated setup confirms, active login succeeds', async () => {
  const user = await createUser({
    webauthn: [{ credentialID: 'synthetic', publicKey: 'synthetic' }],
  });
  await request(app).post('/api/mfa/totp/setup').expect(401);
  const setup = await request(app)
    .post('/api/mfa/totp/setup')
    .set('Authorization', auth(user))
    .expect(200);
  const secret = new URL(setup.body.otpauth_url).searchParams.get('secret');
  let saved = await User.findById(user._id);
  assert.equal(saved.totp.secret, '');
  assert.equal(saved.totp.pendingSecret, secret);
  const pendingLogin = await request(app)
    .post('/api/login')
    .send({ username: user.username, password, sessionCookieConsent: true })
    .expect(200);
  assert.deepEqual(pendingLogin.body.methods, ['webauthn']);
  const tempToken = pendingLogin.body.tempToken;
  const token = speakeasy.totp({ secret, encoding: 'base32' });
  await request(app)
    .post('/api/mfa/totp/verify')
    .send({ tempToken, token })
    .expect(400);
  saved = await User.findById(user._id);
  assert.equal(saved.totp.enabled, false);
  assert.equal(saved.twoFactor.tempToken, tempToken);
  assert.equal(saved.twoFactor.destructiveVerifiedAt, null);
  await request(app)
    .post('/api/mfa/totp/verify')
    .set('Authorization', auth(user))
    .send({ token })
    .expect(200);
  saved = await User.findById(user._id);
  assert.equal(saved.totp.secret, secret);
  assert.equal(saved.totp.pendingSecret, '');
  const completed = await request(app)
    .post('/api/mfa/totp/verify')
    .send({ tempToken, token })
    .expect(200);
  assert.equal(jwt.decode(completed.body.token).tokenType, 'access');
  await request(app)
    .get('/api/me')
    .set('Authorization', `Bearer ${completed.body.token}`)
    .expect(200);
  await request(app)
    .get('/api/mfa/totp/qrcode')
    .set('Authorization', auth(user))
    .expect(403);
  await request(app)
    .post('/api/mfa/totp/setup')
    .set('Authorization', auth(user))
    .expect(409);
  assert.equal((await User.findById(user._id)).twoFactor.tempToken, '');
  assert.equal(
    JSON.stringify(await AuditLog.find({}).lean()).includes(secret),
    false,
  );
});

test('legacy disabled TOTP seed is setup-only and pending cancellation clears enrollment', async () => {
  const secret = speakeasy.generateSecret().base32;
  const tempToken = 'legacy-temp';
  const user = await createUser({
    totp: { secret, enabled: false },
    twoFactor: { tempToken, tempExpires: new Date(Date.now() + 60000) },
  });
  const token = speakeasy.totp({ secret, encoding: 'base32' });
  await request(app)
    .post('/api/mfa/totp/verify')
    .send({ tempToken, token })
    .expect(400);
  await request(app)
    .post('/api/mfa/totp/verify')
    .set('Authorization', auth(user))
    .send({ token })
    .expect(200);
  const fresh = await createUser();
  await request(app)
    .post('/api/mfa/totp/setup')
    .set('Authorization', auth(fresh))
    .expect(200);
  await request(app)
    .delete('/api/mfa/totp')
    .set('Authorization', auth(fresh))
    .expect(200);
  const cancelled = await User.findById(fresh._id);
  assert.equal(cancelled.totp.secret, '');
  assert.equal(cancelled.totp.pendingSecret, '');
});

test('all CSV exports neutralize formula-leading user data', async () => {
  const user = await createUser({ role: 'administrator', firstName: '=1+1' });
  const users = await request(app)
    .get('/api/admin/users/export?format=csv')
    .set('Authorization', auth(user))
    .expect(200);
  assert.ok(users.text.includes("'=1+1"));
  const eventId = new mongoose.Types.ObjectId();
  await Event.collection.insertOne({
    _id: eventId,
    createdBy: user._id,
    rsvpEnabled: true,
  });
  await EventRsvp.create({
    event: eventId,
    user: user._id,
    response: 'accepted',
    firstName: '@SUM(A1)',
    phone: '+15550123',
  });
  const rsvps = await request(app)
    .get(`/api/events/${eventId}/rsvps.csv`)
    .set('Authorization', auth(user))
    .expect(200);
  assert.ok(rsvps.text.includes("'@SUM(A1)"));
  assert.ok(rsvps.text.includes("'+15550123"));
  await AuditLog.create({
    action: 'user.updated',
    targetType: 'user',
    targetSnapshot: { accountName: '-1+1' },
  });
  const audit = await request(app)
    .get('/api/audit-logs/export.csv')
    .set('Authorization', auth(user))
    .expect(200);
  assert.ok(audit.text.includes("'-1+1"));
});

test('MFA reset protects higher roles regardless of custom permission grants', async () => {
  const permission = await Role.create({
    name: 'MFA support',
    slug: 'mfa-support',
    permissions: ['users.mfa_reset'],
  });
  const administrator = await createUser({
    role: 'administrator',
    customRoles: [permission._id],
  });
  const developer = await createUser({ role: 'developer' });
  const delegated = await createUser({ customRoles: [permission._id] });
  const denied = await createUser();
  const secret = speakeasy.generateSecret().base32;
  for (const role of ['administrator', 'developer']) {
    const target = await createUser({ role, totp: { enabled: true, secret } });
    for (const actor of [administrator, delegated, denied]) {
      await request(app)
        .patch(`/api/admin/users/${target._id}/mfa-reset`)
        .set('Authorization', auth(actor))
        .send({ role: 'developer' })
        .expect(403);
      assert.equal((await User.findById(target._id)).totp.secret, secret);
    }
    assert.equal(
      await AuditLog.countDocuments({
        action: 'user.mfa_reset',
        target: target._id,
      }),
      0,
    );
    await request(app)
      .patch(`/api/admin/users/${target._id}/mfa-reset`)
      .set('Authorization', auth(developer))
      .expect(200);
    assert.equal((await User.findById(target._id)).totp.secret, '');
    assert.equal(
      await AuditLog.countDocuments({
        action: 'user.mfa_reset',
        target: target._id,
      }),
      1,
    );
  }
  for (const actor of [administrator, delegated]) {
    const target = await createUser({
      role: 'editor',
      totp: { enabled: true, secret },
    });
    await request(app)
      .patch(`/api/admin/users/${target._id}/mfa-reset`)
      .expect(401);
    await request(app)
      .patch(`/api/admin/users/${target._id}/mfa-reset`)
      .set('Authorization', auth(denied))
      .expect(403);
    await request(app)
      .patch(`/api/admin/users/${target._id}/mfa-reset`)
      .set('Authorization', auth(actor))
      .expect(200);
    assert.equal((await User.findById(target._id)).totp.enabled, false);
  }
  for (const actor of [administrator, developer]) {
    await request(app)
      .patch(`/api/admin/users/${actor._id}/mfa-reset`)
      .set('Authorization', auth(actor))
      .expect(400);
  }
});

test('MFA reset cannot cross a concurrent promotion into a protected role', async (t) => {
  const administrator = await createUser({ role: 'administrator' });
  const secret = speakeasy.generateSecret().base32;
  const target = await createUser({
    role: 'editor',
    totp: { enabled: true, secret },
  });
  const original = User.findOneAndUpdate;
  t.mock.method(User, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args);
    if (String(args[0]._id) === String(target._id)) {
      const execute = query.exec;
      query.exec = async function (...options) {
        await User.collection.updateOne(
          { _id: target._id },
          { $set: { role: 'developer' } },
        );
        return execute.apply(this, options);
      };
    }
    return query;
  });
  await request(app)
    .patch(`/api/admin/users/${target._id}/mfa-reset`)
    .set('Authorization', auth(administrator))
    .expect(404);
  const saved = await User.findById(target._id);
  assert.equal(saved.role, 'developer');
  assert.equal(saved.totp.secret, secret);
  assert.equal(
    await AuditLog.countDocuments({
      action: 'user.mfa_reset',
      target: target._id,
    }),
    0,
  );
});

test('audit client IP obeys Express proxy trust and rejects forged or malformed header values', async () => {
  const probe = express();
  probe.get('/', async (req, res) => {
    await writeAuditLog({
      req,
      action: 'user.ip_probe',
      targetType: 'user',
      metadata: { probe: true },
    });
    res.end();
  });
  for (const [trust, forwarded, expected] of [
    [false, '203.0.113.4', '127.0.0.1'],
    [['127.0.0.1', '::1'], '203.0.113.4, 2001:db8::5', '2001:db8::5'],
    [['127.0.0.1', '::1'], '999.999.999.999', undefined],
  ]) {
    probe.set('trust proxy', trust);
    await request(probe)
      .get('/')
      .set('X-Forwarded-For', forwarded)
      .set('CF-Connecting-IP', '192.0.2.9')
      .set('X-Real-IP', '192.0.2.10')
      .expect(200);
    const log = await AuditLog.findOne({ action: 'user.ip_probe' })
      .sort({ _id: -1 })
      .lean();
    assert.equal(log.metadata.ipAddress, expected);
    if (expected) assert.deepEqual(log.metadata.ipAddresses, [expected]);
  }
});
