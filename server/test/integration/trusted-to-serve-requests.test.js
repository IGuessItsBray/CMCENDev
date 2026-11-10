const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, test, mock } = require('node:test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'trusted-request-test-secret';
process.env.DISABLE_EMAIL_SENDING = 'true';
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../models/User');
const Role = require('../../models/Role');
const CertificateRequest = require('../../models/CertificateRequest');
const AuditLog = require('../../models/AuditLog');
const awards = require('../../services/trusted-to-serve-documents');
const generate = mock.method(awards, 'generateTrustedToServe', async () =>
  Buffer.from('%PDF-test'),
);
const app = express();
app.use(express.json());
app.use(
  '/api/certificate-requests',
  require('../../routes/certificate-requests'),
);
const base = '/api/certificate-requests';
let mongo;
const users = {},
  tokens = {};
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await CertificateRequest.init();
  const custom = new mongoose.Types.ObjectId();
  await Role.collection.insertOne({
    _id: custom,
    name: 'Submit certificates',
    permissions: ['certificates.submit'],
  });
  for (const role of [
    'contributor',
    'subscriber',
    'editor',
    'ghost',
    'custom',
    'incomplete',
  ]) {
    const id = new mongoose.Types.ObjectId();
    users[role] = id;
    await User.collection.insertOne({
      _id: id,
      username: role,
      firstName: 'Profile',
      lastName: 'Person',
      email: `${role}@example.test`,
      currentUnit: role === 'incomplete' ? '' : 'Unit',
      role: ['custom', 'incomplete'].includes(role)
        ? role === 'custom'
          ? 'subscriber'
          : 'contributor'
        : role,
      customRoles: role === 'custom' ? [custom] : [],
      sessionVersion: 0,
    });
    tokens[role] = jwt.sign(
      { userId: String(id), tokenType: 'access', sessionVersion: 0 },
      process.env.JWT_SECRET,
    );
  }
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await mongo?.stop();
});
const payload = () => ({
  award: {
    firstName: 'Alex',
    lastName: 'Example',
    fullRankEn: 'Captain',
    postNominals: 'CD',
    presentationDate: '2026-12-01',
    frPronoun: 'il',
    reviewed: true,
  },
  neededByDate: '2026-11-25',
  mailingAddress: {
    line1: '1 Test St',
    city: 'Ottawa',
    province: 'ON',
    postalCode: 'K1A 0A1',
    country: 'Canada',
  },
  requesterRelationship: 'Supervisor',
  requestId: randomUUID(),
});
const post = (body, role = 'contributor') =>
  request(app)
    .post(`${base}/trusted-to-serve`)
    .set('Authorization', `Bearer ${tokens[role]}`)
    .send(body);
const retirementPayload = () => {
  const { award: _award, ...delivery } = payload();
  return {
    ...delivery,
    retirement: {
      firstName: 'Alex',
      lastName: 'Example',
      fullRankEn: 'Captain',
      postNominals: 'CD',
      rankLanguage: 'en',
      ceBranchEnrollmentDate: '2000-01-01',
      releaseDate: '2026-12-01',
      familyMembers: [
        { fullName: 'Pat Example', memberRelationshipToRecipient: 'partner' },
      ],
      reviewed: true,
    },
    lastUnit: 'Test unit',
    tradeRole: 'Signals',
    dwdParadeRequested: false,
  };
};
const postRetirement = (body, role = 'contributor') =>
  request(app)
    .post(`${base}/retirement`)
    .set('Authorization', `Bearer ${tokens[role]}`)
    .send(body);

test('standalone retirement validates delivery, stores family and service data, and fulfills without a retirement message', async () => {
  const body = retirementPayload();
  const response = await postRetirement(body).expect(201);
  const id = response.body.certificateRequest.id;
  const saved = await CertificateRequest.findById(id).lean();
  assert.equal(saved.certificateType, 'retirement');
  assert.equal(saved.source.type, 'retirementCertificate');
  assert.equal(String(saved.source.id), id);
  assert.equal(saved.member.tradeRole, 'Signals');
  assert.equal(saved.member.dwdParadeRequested, false);
  assert.equal(saved.familyMembers[0].fullName, 'Pat Example');
  assert.equal(saved.trustedToServe, undefined);
  assert.equal(
    (await postRetirement(body).expect(200)).body.certificateRequest.id,
    id,
  );
  assert.equal(
    await AuditLog.countDocuments({
      target: id,
      action: 'content.certificate_request_submitted',
    }),
    1,
  );
  const auth = { Authorization: `Bearer ${tokens.editor}` };
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'ready_to_mail', printedCertificateKeys: ['member'] })
    .expect(400);
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({
      status: 'ready_to_mail',
      printedCertificateKeys: ['member', 'family:0'],
    })
    .expect(200);
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'mailed' })
    .expect(200);
  const award = payload();
  award.requestId = body.requestId;
  await post(award).expect(409);
  assert.equal(
    await mongoose.connection.collection('retirementmessages').countDocuments(),
    0,
  );
});

test('retirement permissions, field validation, profile safety and cross-type concurrency', async () => {
  await request(app)
    .post(`${base}/retirement`)
    .send(retirementPayload())
    .expect(401);
  await postRetirement(retirementPayload(), 'subscriber').expect(403);
  await postRetirement(retirementPayload(), 'custom').expect(201);
  await postRetirement(retirementPayload(), 'incomplete').expect(422);
  for (const change of [
    (p) => {
      p.retirement.reviewed = false;
    },
    (p) => {
      p.lastUnit = '';
    },
    (p) => {
      delete p.tradeRole;
    },
    (p) => {
      p.dwdParadeRequested = 'false';
    },
    (p) => {
      p.retirement.releaseDate = '1999-01-01';
    },
    (p) => {
      p.retirement.familyMembers[0].memberRelationshipToRecipient = 'invalid';
    },
    (p) => {
      p.retirement.firstName = 'A'.repeat(100);
      p.retirement.lastName = 'B'.repeat(100);
    },
    (p) => {
      p.requester = { email: 'spoof@example.test' };
    },
  ]) {
    const body = retirementPayload();
    change(body);
    await postRetirement(body).expect(422);
  }
  const retirement = retirementPayload(),
    award = payload();
  award.requestId = retirement.requestId;
  const results = await Promise.all([postRetirement(retirement), post(award)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const options = await request(app)
    .get(`${base}/options`)
    .set('Authorization', `Bearer ${tokens.contributor}`)
    .expect(200);
  assert.ok(options.body.wordings.length);
  await request(app)
    .get(`${base}/options`)
    .set('Authorization', `Bearer ${tokens.subscriber}`)
    .expect(403);
});

test('authentication and separate built-in/custom submit permissions protect private worklist', async () => {
  await request(app)
    .post(`${base}/trusted-to-serve`)
    .send(payload())
    .expect(401);
  await post(payload(), 'subscriber').expect(403);
  for (const role of ['contributor', 'editor', 'ghost', 'custom'])
    await post(payload(), role).expect(201);
  await request(app)
    .get(base)
    .set('Authorization', `Bearer ${tokens.contributor}`)
    .expect(403);
});

test('valid request stores normalized award, authenticated contact, pending state and one audit', async () => {
  const body = payload();
  body.award.firstName = ' Alex ';
  const response = await post(body).expect(201);
  const saved = await CertificateRequest.findById(
    response.body.certificateRequest.id,
  ).lean();
  assert.equal(saved.member.fullName, 'Alex Example');
  assert.equal(saved.requester.email, 'contributor@example.test');
  assert.equal(saved.requester.firstName, 'Profile');
  assert.equal(saved.source.type, 'trustedToServe');
  assert.equal(String(saved.source.id), String(saved._id));
  assert.equal(saved.status, 'pending');
  assert.equal(saved.member.releaseDate, undefined);
  assert.equal(saved.trustedToServe.reviewed, undefined);
  assert.equal(saved.submissionKey, undefined);
  assert.equal(saved.submissionFingerprint, undefined);
  assert.equal(
    await AuditLog.countDocuments({
      target: saved._id,
      action: 'content.certificate_request_submitted',
    }),
    1,
  );
  const queue = await request(app)
    .get(base)
    .set('Authorization', `Bearer ${tokens.editor}`)
    .expect(200);
  assert.ok(
    queue.body.certificateRequests.every(
      (item) =>
        !('submissionKey' in item) && !('submissionFingerprint' in item),
    ),
  );
});

test('invalid fields, review, dates, spoofed contact and incomplete profile do not create requests', async () => {
  const count = await CertificateRequest.countDocuments();
  for (const change of [
    (p) => {
      p.award.reviewed = false;
    },
    (p) => {
      p.award.frPronoun = 'guess';
    },
    (p) => {
      p.award.fullRankEn = 'Civilian';
    },
    (p) => {
      p.neededByDate = '2026-02-30';
    },
    (p) => {
      p.mailingAddress.city = '';
    },
    (p) => {
      p.requester = { email: 'spoof@example.test' };
    },
    (p) => {
      p.requestId = 'bad';
    },
    (p) => {
      p.requesterRelationship = '';
    },
  ]) {
    const body = payload();
    change(body);
    await post(body).expect(422);
  }
  const incomplete = await post(payload(), 'incomplete').expect(422);
  assert.equal(incomplete.body.code, 'certificate_request_profile_incomplete');
  assert.deepEqual(incomplete.body.missingFields, ['unit']);
  assert.equal(await CertificateRequest.countDocuments(), count);
});

test('idempotency supports retry, conflict, per-user isolation and concurrent duplicates', async () => {
  const body = payload();
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => post(body)),
  );
  assert.deepEqual(
    responses.map((r) => r.status).sort(),
    [200, 200, 200, 200, 201],
  );
  assert.equal(
    new Set(responses.map((r) => r.body.certificateRequest.id)).size,
    1,
  );
  const id = responses[0].body.certificateRequest.id;
  assert.equal(
    await AuditLog.countDocuments({
      target: id,
      action: 'content.certificate_request_submitted',
    }),
    1,
  );
  const changed = structuredClone(body);
  changed.neededByDate = '2026-11-26';
  assert.equal(
    (await post(changed).expect(409)).body.code,
    'certificate_request_idempotency_conflict',
  );
  await post(body, 'ghost').expect(201);
});

test('saved PDF is private, management-only, reviewed, immutable and audited; fulfillment uses member key', async () => {
  const body = payload();
  const created = await post(body).expect(201);
  const id = created.body.certificateRequest.id;
  const url = `${base}/${id}/trusted-to-serve.pdf?download=1`;
  for (const [role, status] of [
    [null, 401],
    ['contributor', 403],
  ]) {
    const call = request(app).post(url).send({ reviewed: true });
    if (role) call.set('Authorization', `Bearer ${tokens[role]}`);
    assert.equal(
      (await call.expect(status)).headers['cache-control'],
      'private, no-store',
    );
  }
  const auth = { Authorization: `Bearer ${tokens.editor}` };
  await request(app).post(url).set(auth).send({}).expect(422);
  await request(app)
    .post(url)
    .set(auth)
    .send({ reviewed: true, firstName: 'Spoof' })
    .expect(422);
  const pdf = await request(app)
    .post(url)
    .set(auth)
    .send({ reviewed: true })
    .expect(200);
  assert.equal(pdf.headers['cache-control'], 'private, no-store');
  assert.match(pdf.headers['content-type'], /application\/pdf/u);
  assert.equal(generate.mock.calls.at(-1).arguments[0].firstName, 'Alex');
  assert.equal((await CertificateRequest.findById(id)).status, 'pending');
  assert.equal(
    await AuditLog.countDocuments({
      target: id,
      action: 'content.certificate_request_trusted_to_serve_generated',
    }),
    1,
  );
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'mailed' })
    .expect(409);
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'ready_to_mail', printedCertificateKeys: [] })
    .expect(400);
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'ready_to_mail', printedCertificateKeys: ['member'] })
    .expect(200);
  await request(app)
    .patch(`${base}/${id}/status`)
    .set(auth)
    .send({ status: 'mailed' })
    .expect(200);
  assert.equal(
    (await post(body).expect(200)).body.certificateRequest.status,
    'mailed',
  );
});

test('full award name limits survive fulfillment; retirement requirements remain enforced', async () => {
  const body = payload();
  body.award.firstName = 'A'.repeat(100);
  body.award.lastName = 'B'.repeat(100);
  const created = await post(body).expect(201);
  await request(app)
    .patch(`${base}/${created.body.certificateRequest.id}/status`)
    .set('Authorization', `Bearer ${tokens.editor}`)
    .send({ status: 'ready_to_mail', printedCertificateKeys: ['member'] })
    .expect(200);
  const saved = await CertificateRequest.findById(
    created.body.certificateRequest.id,
  );
  saved.certificateType = 'retirement';
  const error = saved.validateSync();
  for (const field of [
    'tradeRole',
    'rankLanguage',
    'lastUnit',
    'releaseDate',
    'ceBranchEnrollmentDate',
    'dwdParadeRequested',
  ])
    assert.ok(error.errors[`member.${field}`], field);
});
