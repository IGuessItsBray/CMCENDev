const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { before, after, test } = require('node:test');

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'security-regression-test-only',
  APP_BASE_URL: 'http://localhost:3000',
  DISABLE_EMAIL_SENDING: 'false',
  TRUST_PROXY: '127.0.0.1,::1',
  API_RATE_LIMIT_MAX: '10000',
  LOGIN_RATE_LIMIT_MAX: '6',
  LOGIN_ACCOUNT_RATE_LIMIT_MAX: '3',
  GHOST_REQUEST_RATE_LIMIT_MAX: '6',
  GHOST_REQUEST_EMAIL_RATE_LIMIT_MAX: '3',
  MINIO_ENDPOINT: 'http://127.0.0.1:9000',
  MINIO_BUCKET_NAME: 'test',
  MINIO_ACCESS_KEY: 'test',
  MINIO_SECRET_KEY: 'test',
  CDN_PUBLIC_BASE_URL: 'https://cdn.example.test/test',
});
const mongoose = require('mongoose');
const request = require('supertest');
const sharp = require('sharp');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');
const MediaAsset = require('../../models/MediaAsset');
const { createSessionToken } = require('../../services/auth-session');
const s3Client = require('../../storage');
const { MAX_IMAGE_BYTES } = require('../../services/media-sanitization');
let mongo;
let sequence = 0;
const password = 'Regression-Password-1!';
async function createUser(overrides = {}) {
  sequence += 1;
  return User.create({
    username: `security-${sequence}@example.test`,
    email: `security-${sequence}@example.test`,
    password,
    ...overrides,
  });
}
function postLogin(username, ip, suppliedPassword = 'wrong') {
  return request(app)
    .post('/api/login')
    .set('X-Forwarded-For', ip)
    .send({ username, password: suppliedPassword, sessionCookieConsent: true });
}
function postGhost(email, ip) {
  return request(app)
    .post('/api/ghost/request')
    .set('X-Forwarded-For', ip)
    .send({ email });
}
function attachImage(token, buffer, contentType = 'image/png') {
  return request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('image', buffer, { filename: 'image.png', contentType });
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

test('login account throttle spans IPs and normalized identifiers before bcrypt/audit writes', async () => {
  const user = await createUser();
  const unknown = await postLogin(
    'unknown@example.test',
    '198.51.100.1',
  ).expect(401);
  for (const [index, username] of [
    user.username,
    user.username.toUpperCase(),
    ` ${user.username} `,
  ].entries()) {
    const invalid = await postLogin(username, `198.51.100.${index + 2}`).expect(
      401,
    );
    assert.deepEqual(invalid.body, unknown.body);
  }
  const audits = await AuditLog.countDocuments({
    action: 'user.login_rejected',
  });
  const limited = await postLogin(
    user.username,
    '198.51.100.5',
    password,
  ).expect(429);
  assert.ok(limited.headers['retry-after']);
  assert.equal(
    await AuditLog.countDocuments({ action: 'user.login_rejected' }),
    audits,
  );
  const normal = await createUser();
  const successful = await postLogin(
    normal.username,
    '198.51.100.6',
    password,
  ).expect(200);
  assert.ok(successful.body.token);
});

test('login IP throttle survives identifier rotation and direct requests ignore spoofed IPs', async () => {
  app.set('trust proxy', false);
  try {
    for (let i = 0; i < 6; i += 1) {
      await postLogin(
        `rotation-${i}@example.test`,
        `203.0.113.${i + 1}`,
      ).expect(401);
    }
    await postLogin('rotation-last@example.test', '203.0.113.100').expect(429);
  } finally {
    app.set('trust proxy', ['127.0.0.1', '::1']);
  }
});

test('rejects login query operators and invalid input without querying accounts', async () => {
  const response = await request(app)
    .post('/api/login')
    .set('X-Forwarded-For', '198.51.100.20')
    .send({ username: { $ne: null }, password: 'wrong' })
    .expect(401);
  assert.deepEqual(response.body, { error: 'Invalid credentials' });
});

test('guest request responses conceal members and guests and leave member credentials unchanged', async () => {
  const member = await createUser();
  const guest = await createUser({ accountType: 'ghost', role: 'ghost' });
  const beforeMember = await User.collection.findOne({ _id: member._id });
  const responses = [];
  for (const [index, email] of [
    member.email,
    guest.email,
    'new-guest@example.test',
  ].entries()) {
    responses.push(
      await postGhost(email, `198.51.100.${30 + index}`).expect(200),
    );
  }
  assert.equal(new Set(responses.map(({ body }) => body.message)).size, 1);
  for (const { body } of responses) {
    assert.deepEqual(Object.keys(body).sort(), [
      'email',
      'message',
      'verificationToken',
    ]);
    assert.match(body.verificationToken, /^[a-f0-9]{64}$/u);
  }
  assert.deepEqual(
    await User.collection.findOne({ _id: member._id }),
    beforeMember,
  );
  await request(app)
    .post('/api/ghost/confirm')
    .send({
      verificationToken: responses[0].body.verificationToken,
      code: '123456',
      firstName: 'Test',
    })
    .expect(400);
  for (const { body } of responses.slice(1)) {
    const stored = await User.findOne({ email: body.email }).select(
      '+emailVerification.tempTokenHash',
    );
    assert.equal(stored.accountType, 'ghost');
    assert.equal(
      stored.emailVerification.tempTokenHash,
      crypto.createHash('sha256').update(body.verificationToken).digest('hex'),
    );
  }
});

test('guest limits cover normalized email across IPs and rotating emails from one IP', async () => {
  const email = 'limited-guest@example.test';
  for (const [index, value] of [
    email,
    email.toUpperCase(),
    ` ${email} `,
  ].entries()) {
    await postGhost(value, `198.51.100.${40 + index}`).expect(200);
  }
  await postGhost(email, '198.51.100.43').expect(429);
  const persisted = await User.countDocuments();
  for (let i = 0; i < 6; i += 1) {
    await postGhost(`guest-rotation-${i}@example.test`, '198.51.100.50').expect(
      200,
    );
  }
  await postGhost('guest-rotation-final@example.test', '198.51.100.50').expect(
    429,
  );
  assert.equal(await User.countDocuments(), persisted + 6);
  await postGhost({ $ne: null }, '198.51.100.51').expect(400);
});

test('guest username collisions return the same response without altering another account', async () => {
  const member = await createUser({ username: 'collision@example.test' });
  const previous = await User.collection.findOne({ _id: member._id });
  const result = await postGhost(
    'collision@example.test',
    '198.51.100.60',
  ).expect(200);
  assert.match(result.body.verificationToken, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    await User.collection.findOne({ _id: member._id }),
    previous,
  );
  assert.equal(
    await User.countDocuments({ email: 'collision@example.test' }),
    0,
  );
});

test('upload authorization and resource limits reject unsafe input before storage', async (t) => {
  let writes = 0;
  t.mock.method(s3Client, 'send', async () => {
    writes += 1;
    return {};
  });
  const contributor = await createUser({ role: 'contributor' });
  const subscriber = await createUser();
  const token = createSessionToken(contributor);
  await request(app).post('/api/upload').expect(401);
  await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${createSessionToken(subscriber)}`)
    .expect(403);
  await attachImage(token, Buffer.alloc(MAX_IMAGE_BYTES + 1)).expect(413);
  await attachImage(token, Buffer.from('svg'), 'image/svg+xml').expect(422);
  await attachImage(token, Buffer.from('corrupt')).expect(400);
  await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'multipart/form-data; boundary=broken')
    .send(
      Buffer.from(
        '--broken\r\nContent-Disposition: form-data; name="image"; filename="image.png"\r\nContent-Type: image/png\r\n\r\npartial',
      ),
    )
    .expect(400);
  const bomb = await sharp({
    create: { width: 6000, height: 5000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  await attachImage(token, bomb).expect(422);
  const extraFields = request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`);
  for (let i = 0; i < 17; i += 1) extraFields.field(`field${i}`, 'value');
  await extraFields.expect(413);
  await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`)
    .field('sourceName', 'x'.repeat(4097))
    .expect(413);
  await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`)
    .field('x'.repeat(101), 'value')
    .expect(413);
  await request(app)
    .post('/api/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('image', Buffer.from('a'), 'a.png')
    .attach('image', Buffer.from('b'), 'b.png')
    .expect(413);
  assert.equal(writes, 0);
  assert.equal(await MediaAsset.countDocuments(), 0);
});

test('limits uploads before buffering and releases slots after processing or failure', async (t) => {
  const contributor = await createUser({ role: 'contributor' });
  const token = createSessionToken(contributor);
  const png = await sharp({
    create: { width: 20, height: 10, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  let release;
  let ready;
  let writes = 0;
  const storageGate = new Promise((resolve) => {
    release = resolve;
  });
  const uploadsReady = new Promise((resolve) => {
    ready = resolve;
  });
  t.mock.method(s3Client, 'send', async () => {
    writes += 1;
    if (writes === 2) ready();
    await storageGate;
    return {};
  });
  const first = attachImage(token, png)
    .expect(201)
    .then((response) => response);
  const second = attachImage(token, png)
    .expect(201)
    .then((response) => response);
  try {
    await uploadsReady;
    const busy = await attachImage(token, png).expect(429);
    assert.equal(busy.headers['retry-after'], '5');
  } finally {
    release();
    await Promise.all([first, second]);
  }
  await attachImage(token, Buffer.from('bad')).expect(400);
  const valid = await attachImage(token, png).expect(201);
  assert.ok(valid.body.variants.large.url);
  assert.equal(await MediaAsset.countDocuments(), 3);
  assert.equal(await AuditLog.countDocuments({ action: 'media.uploaded' }), 3);
});

test('aborted multipart uploads release capacity and do not write objects', async (t) => {
  const http = require('node:http');
  const { once } = require('node:events');
  const user = await createUser({ role: 'contributor' });
  const token = createSessionToken(user);
  let writes = 0;
  t.mock.method(s3Client, 'send', async () => {
    writes += 1;
    return {};
  });
  let client;
  let resolveClosed;
  const server = http.createServer((req, res) => {
    // The multipart parser resumes the stream only after authorization and reservation.
    req.once('resume', () => client.destroy());
    res.once('close', () => resolveClosed());
    app(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (let i = 0; i < 3; i += 1) {
      const closed = new Promise((resolve) => {
        resolveClosed = resolve;
      });
      client = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        method: 'POST',
        path: '/api/upload',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data; boundary=aborted',
          'Content-Length': '10000',
        },
      });
      client.on('error', () => {});
      client.write(
        '--aborted\r\nContent-Disposition: form-data; name="image"; filename="image.png"\r\nContent-Type: image/png\r\n\r\npartial',
      );
      await closed;
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(writes, 0);
  const png = await sharp({
    create: { width: 10, height: 10, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  await attachImage(token, png).expect(201);
});
