const { withBundledCertificateFonts } = require('../helpers/certificate-fonts');
const assert = require('node:assert/strict');
const { before, after, test, mock } = require('node:test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'certificate-document-test-secret';
process.env.DISABLE_EMAIL_SENDING = 'true';
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../models/User');
require('../../models/Role');
const CertificateRequest = require('../../models/CertificateRequest');
const AuditLog = require('../../models/AuditLog');
const documents = require('../../services/certificate-documents');
const awards = require('../../services/trusted-to-serve-documents');
const originalAwardGenerate = awards.generateTrustedToServe;
const awardGenerate = mock.method(
  awards,
  'generateTrustedToServe',
  originalAwardGenerate,
);
const {
  memberRequest,
  syntheticMemberPdf,
  syntheticFamilyPdf,
} = require('../helpers/certificate-document');

// Intercept only the generation boundary; authentication, permissions, MongoDB,
// routing, response headers and auditing remain real. No font bypass exists in
// application configuration. The form mechanics have separate template tests.
const originalGenerate = documents.generateMemberCertificate;
const generate = mock.method(
  documents,
  'generateMemberCertificate',
  originalGenerate,
);
const originalFamily = documents.generateFamilyCertificate;
const familyGenerate = mock.method(
  documents,
  'generateFamilyCertificate',
  originalFamily,
);
const originalPacket = documents.generateCertificatePacket;
const packetGenerate = mock.method(
  documents,
  'generateCertificatePacket',
  originalPacket,
);
const app = express();
app.use(express.json());
app.use(
  '/api/certificate-requests',
  require('../../routes/certificate-requests'),
);
app.use(express.static(require('node:path').join(__dirname, '../../public')));
let mongo, editorToken, readerToken, id;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const editor = new mongoose.Types.ObjectId(),
    reader = new mongoose.Types.ObjectId();
  await User.collection.insertMany([
    {
      _id: editor,
      username: 'certificate-editor',
      role: 'editor',
      sessionVersion: 0,
    },
    {
      _id: reader,
      username: 'certificate-reader',
      role: 'subscriber',
      sessionVersion: 0,
    },
  ]);
  const token = (userId) =>
    jwt.sign(
      { userId: String(userId), tokenType: 'access', sessionVersion: 0 },
      process.env.JWT_SECRET,
    );
  editorToken = token(editor);
  readerToken = token(reader);
  id = new mongoose.Types.ObjectId();
  await CertificateRequest.collection.insertOne({
    _id: id,
    ...memberRequest(),
    status: 'pending',
    familyMembers: [
      {
        fullName: 'Synthetic family',
        relationship: 'partner',
        memberRelationshipToRecipient: 'partner',
      },
    ],
  });
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await mongo?.stop();
});
const url = () => `/api/certificate-requests/${id}/member.pdf`;

test('unauthenticated/forbidden requests cannot invoke generation and private errors are not cached', async () => {
  const count = generate.mock.callCount();
  for (const [token, status] of [
    [null, 401],
    [readerToken, 403],
  ]) {
    const call = request(app).get(url());
    if (token) call.set('Authorization', `Bearer ${token}`);
    const response = await call.expect(status);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
  assert.equal(generate.mock.callCount(), count);
});

test('IDs, nonexistent requests, download options and unsupported types are validated', async () => {
  const auth = { Authorization: `Bearer ${editorToken}` };
  await request(app)
    .get('/api/certificate-requests/bad-id/member.pdf')
    .set(auth)
    .expect(404);
  await request(app)
    .get(
      `/api/certificate-requests/${new mongoose.Types.ObjectId()}/member.pdf`,
    )
    .set(auth)
    .expect(404);
  await request(app).get(`${url()}?download=anything`).set(auth).expect(400);
  await CertificateRequest.collection.updateOne(
    { _id: id },
    { $set: { certificateType: 'award' } },
  );
  await request(app).get(url()).set(auth).expect(422);
  await CertificateRequest.collection.updateOne(
    { _id: id },
    { $set: { certificateType: 'retirement' } },
  );
});

test('missing fonts return a safe 503 with no document, generation audit or status side effects', async () => {
  const before = await CertificateRequest.findById(id).lean();
  const script = process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH,
    bell = process.env.CERTIFICATE_BELL_MT_BOLD_PATH;
  process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH =
    '/missing-cmcen-font/ScriptMTBold.ttf';
  process.env.CERTIFICATE_BELL_MT_BOLD_PATH =
    '/missing-cmcen-font/bellmtbold.ttf';
  try {
    const response = await request(app)
      .get(url())
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(503);
    assert.equal(response.body.code, 'certificate_fonts_unavailable');
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /\/Users\/|\.ttf|stack/u,
    );
    assert.deepEqual(await CertificateRequest.findById(id).lean(), before);
    assert.equal(
      await AuditLog.countDocuments({
        action: 'content.certificate_request_member_generated',
      }),
      0,
    );
  } finally {
    if (script === undefined)
      delete process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH;
    else process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH = script;
    if (bell === undefined) delete process.env.CERTIFICATE_BELL_MT_BOLD_PATH;
    else process.env.CERTIFICATE_BELL_MT_BOLD_PATH = bell;
  }
});

test('repeated inline/attachment responses audit generation without marking any recipient printed or mailed', async () => {
  const before = await CertificateRequest.findById(id).lean();
  generate.mock.mockImplementation((certificateRequest) =>
    syntheticMemberPdf(certificateRequest),
  );
  try {
    for (const download of ['', '?download=1', '?download=1']) {
      const response = await request(app)
        .get(url() + download)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);
      assert.match(response.headers['content-type'], /^application\/pdf/);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.match(
        response.headers['content-disposition'],
        download ? /^attachment;/ : /^inline;/,
      );
      assert.ok(response.body.subarray(0, 5).equals(Buffer.from('%PDF-')));
    }
    assert.deepEqual(await CertificateRequest.findById(id).lean(), before);
    assert.equal(
      await AuditLog.countDocuments({
        action: 'content.certificate_request_member_generated',
        target: id,
      }),
      3,
    );
    assert.equal(
      await AuditLog.countDocuments({ action: /printed|mailed/ }),
      0,
    );
  } finally {
    generate.mock.mockImplementation(originalGenerate);
  }
});

test('bundled fonts generate a real flattened member PDF through the protected route without configuration', () =>
  withBundledCertificateFonts(async () => {
    const before = await CertificateRequest.findById(id).lean();
    const response = await request(app)
      .get(url())
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
    const { PDFDocument, PDFName } = require('pdf-lib');
    const output = await PDFDocument.load(response.body);
    assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
    assert.equal(output.getPage(0).node.Annots()?.size() || 0, 0);
    assert.deepEqual(await CertificateRequest.findById(id).lean(), before);
  }));

test('family/packet routes enforce authorization, indices and complete explicit wording without generation side effects', async () => {
  const familyUrl = `/api/certificate-requests/${id}/family/0.pdf`,
    packetUrl = `/api/certificate-requests/${id}/packet.pdf`;
  for (const target of [familyUrl, packetUrl]) {
    for (const [token, status] of [
      [null, 401],
      [readerToken, 403],
    ]) {
      const call = request(app).post(target).send({ wording: 'husband' });
      if (token) call.set('Authorization', `Bearer ${token}`);
      const response = await call.expect(status);
      assert.equal(response.headers['cache-control'], 'private, no-store');
    }
  }
  const auth = { Authorization: `Bearer ${editorToken}` };
  for (const index of ['-1', '1', '0.5', '01', '99999999999999999999']) {
    await request(app)
      .post(`/api/certificate-requests/${id}/family/${index}.pdf`)
      .set(auth)
      .send({ wording: 'husband' })
      .expect(404);
  }
  await request(app)
    .post('/api/certificate-requests/invalid/packet.pdf')
    .set(auth)
    .send({ familyWordings: [] })
    .expect(404);
  await request(app)
    .post(familyUrl)
    .set(auth)
    .send({ wording: 'guess' })
    .expect(422);
  await request(app)
    .post(packetUrl)
    .set(auth)
    .send({ familyWordings: [] })
    .expect(422);
  await request(app)
    .post(familyUrl + '?download=bad')
    .set(auth)
    .send({ wording: 'husband' })
    .expect(400);
  assert.equal(familyGenerate.mock.callCount(), 0);
  assert.equal(packetGenerate.mock.callCount(), 0);
  const list = await request(app)
    .get('/api/certificate-requests')
    .set(auth)
    .expect(200);
  assert.equal(list.body.familyWordingOptions.length, 19);
  assert.equal(
    list.body.familyWordingOptions.some((item) => item.key === 'member_name'),
    false,
  );
  assert.equal(
    list.body.certificateRequests[0].familyMembers[0]
      .memberRelationshipToRecipient,
    'partner',
  );
});

test('family/packet output supports repeated previews/downloads, audits choices and never updates requests', async () => {
  const before = await CertificateRequest.findById(id).lean();
  familyGenerate.mock.mockImplementation((record, index, options) =>
    syntheticFamilyPdf(record, index, options),
  );
  packetGenerate.mock.mockImplementation(async (record, options) =>
    documents.assembleCertificatePacket([
      await syntheticMemberPdf(record),
      await syntheticFamilyPdf(record, 0, {
        certificateDate: options.certificateDate,
      }),
    ]),
  );
  try {
    for (const kind of ['family/0', 'packet']) {
      for (const disposition of ['', '?download=1', '?download=1']) {
        const body = { certificateDate: '2026-08-02' };
        const response = await request(app)
          .post(`/api/certificate-requests/${id}/${kind}.pdf${disposition}`)
          .set('Authorization', `Bearer ${editorToken}`)
          .send(body)
          .expect(200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        assert.match(
          response.headers['content-disposition'],
          disposition ? /^attachment;/ : /^inline;/,
        );
        const output = await require('pdf-lib').PDFDocument.load(response.body);
        assert.equal(output.getPageCount(), kind === 'packet' ? 2 : 1);
      }
    }
    assert.deepEqual(await CertificateRequest.findById(id).lean(), before);
    const audits = await AuditLog.find({
      target: id,
      action: {
        $in: [
          'content.certificate_request_family_generated',
          'content.certificate_request_packet_generated',
        ],
      },
    }).lean();
    assert.equal(audits.length, 6);
    for (const audit of audits) {
      assert.deepEqual(audit.metadata.wordings, ['partner']);
      assert.equal(audit.metadata.certificateDate, '2026-08-02');
    }
    assert.equal(
      await AuditLog.countDocuments({ action: /printed|mailed/ }),
      0,
    );
  } finally {
    familyGenerate.mock.mockImplementation(originalFamily);
    packetGenerate.mock.mockImplementation(originalPacket);
  }
});

test('missing family fonts fail safely and the configured route uses exact family fonts', async () => {
  const italic = process.env.CERTIFICATE_BELL_MT_ITALIC_PATH;
  process.env.CERTIFICATE_BELL_MT_ITALIC_PATH =
    '/missing-cmcen-font/bellmtitalic.ttf';
  try {
    const response = await request(app)
      .post(`/api/certificate-requests/${id}/family/0.pdf`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({})
      .expect(503);
    assert.equal(response.body.code, 'certificate_fonts_unavailable');
  } finally {
    if (italic === undefined)
      delete process.env.CERTIFICATE_BELL_MT_ITALIC_PATH;
    else process.env.CERTIFICATE_BELL_MT_ITALIC_PATH = italic;
  }
  {
    await request(app)
      .post(`/api/certificate-requests/${id}/family/0.pdf`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({})
      .expect(200);
  }
});

test('award generation enforces permissions, explicit wording, input validation and review before download', async () => {
  const target = '/api/certificate-requests/trusted-to-serve.pdf';
  const input = {
    firstName: 'Alex',
    lastName: 'Tremblay',
    fullRankEn: 'Aviator',
    postNominals: '',
    rankEn: 'Aviator',
    rankFr: 'Aviateur',
    presentationDate: '2026-11-13',
    frPronoun: 'il',
    frRankGrammar: 'elided',
  };
  for (const [token, status] of [
    [null, 401],
    [readerToken, 403],
  ]) {
    const call = request(app).post(target).send(input);
    if (token) call.set('Authorization', `Bearer ${token}`);
    const response = await call.expect(status);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
  const auth = { Authorization: `Bearer ${editorToken}` };
  await request(app)
    .post(target)
    .set(auth)
    .send({ ...input, frPronoun: '' })
    .expect(422);
  await request(app)
    .post(target)
    .set(auth)
    .send({ ...input, presentationDate: '2026-02-30' })
    .expect(422);
  const review = await request(app)
    .post(target + '?download=1')
    .set(auth)
    .send(input)
    .expect(422);
  assert.equal(review.body.code, 'award_review_required');
  await request(app)
    .post(target + '?download=bad')
    .set(auth)
    .send(input)
    .expect(400);
  assert.equal(awardGenerate.mock.callCount(), 0);
});

test('repeated award previews/downloads audit safe details without creating requests or changing fulfillment', async () => {
  const before = await CertificateRequest.find({}).lean();
  awardGenerate.mock.mockImplementation(async (input) => {
    const document = await awards.loadAwardMaster();
    const { StandardFonts } = require('pdf-lib');
    return awards.renderTrustedToServe(
      document,
      awards.getTrustedToServeData(input),
      {
        body: await document.embedFont(StandardFonts.TimesRomanItalic),
        script: await document.embedFont(StandardFonts.Helvetica),
      },
    );
  });
  try {
    for (const query of ['', '?download=1', '?download=1']) {
      const response = await request(app)
        .post('/api/certificate-requests/trusted-to-serve.pdf' + query)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          firstName: 'Émilie',
          lastName: 'D’Amour',
          fullRankEn: 'Corporal',
          postNominals: 'CD',
          rankEn: 'Corporal',
          rankFr: 'Caporale',
          presentationDate: '2028-02-29',
          frPronoun: 'elle',
          frRankGrammar: 'feminine',
          reviewed: query !== '',
        })
        .expect(200);
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.match(response.headers['content-type'], /^application\/pdf/u);
      assert.match(
        response.headers['content-disposition'],
        query ? /^attachment;/u : /^inline;/u,
      );
      assert.equal(
        (
          await require('pdf-lib').PDFDocument.load(response.body)
        ).getPageCount(),
        1,
      );
    }
    assert.deepEqual(await CertificateRequest.find({}).lean(), before);
    const audits = await AuditLog.find({
      action: 'content.trusted_to_serve_generated',
    }).lean();
    assert.equal(audits.length, 3);
    for (const audit of audits) {
      assert.equal(audit.metadata.presentationDate, '2028-02-29');
      assert.equal(audit.metadata.frPronoun, 'elle');
      assert.doesNotMatch(JSON.stringify(audit.metadata), /Émilie|D’Amour/u);
    }
  } finally {
    awardGenerate.mock.mockImplementation(originalAwardGenerate);
  }
});

test('award missing-font errors are private and recover with configured exact fonts', async () => {
  const body = {
    firstName: 'Alex',
    lastName: 'Tremblay',
    fullRankEn: 'Aviator',
    postNominals: '',
    rankEn: 'Aviator',
    rankFr: 'Aviateur',
    presentationDate: '2026-11-13',
    frPronoun: 'il',
    frRankGrammar: 'elided',
  };
  const saved = process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH;
  process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH =
    '/missing-cmcen-font/ScriptMTBold.ttf';
  try {
    const response = await request(app)
      .post('/api/certificate-requests/trusted-to-serve.pdf')
      .set('Authorization', `Bearer ${editorToken}`)
      .send(body)
      .expect(503);
    assert.equal(response.body.code, 'certificate_fonts_unavailable');
    assert.doesNotMatch(JSON.stringify(response.body), /\/Users\/|stack/u);
  } finally {
    if (saved === undefined) delete process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH;
    else process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH = saved;
  }
  await request(app)
    .post('/api/certificate-requests/trusted-to-serve.pdf')
    .set('Authorization', `Bearer ${editorToken}`)
    .send(body)
    .expect(200);
});

test('approved template and private font paths are unavailable through static routes', async () => {
  for (const target of [
    '/private/certificates/retirement-member.pdf',
    '/private/certificates/branch-leader-signature.png',
    '/private/certificates/retirement-family.pdf',
    '/private/certificates/trusted-to-serve-master.pdf',
    '/private/certificates/fonts/ScriptMTBold.ttf',
    '/private/certificates/fonts/bellmtbold.ttf',
    '/private/certificates/fonts/bellmtitalic.ttf',
    '/private/certificates/fonts/bellmt.ttf',
    '/private/certificates/fonts/NOTICE.md',
    '/services/certificate-documents.js',
  ]) {
    await request(app).get(target).expect(404);
  }
});

test('manual member retirement generation validates and audits document-only previews/downloads with no public or fulfillment mutations', async () => {
  const target = '/api/certificate-requests/retirement.pdf';
  const input = {
    firstName: 'Émilie',
    lastName: 'D’Amour',
    fullRankEn: 'Warrant Officer',
    rankLanguage: 'fr',
    postNominals: '',
    ceBranchEnrollmentDate: '1984-02-29',
    releaseDate: '2026-08-01',
  };
  const before = await CertificateRequest.find({}).lean();
  const RetirementMessage = require('../../models/RetirementMessage');
  const posts = await RetirementMessage.countDocuments();
  const statusAudits = await AuditLog.countDocuments({
    action: /printed|mailed/,
  });
  const count = generate.mock.callCount();
  for (const [token, status] of [
    [null, 401],
    [readerToken, 403],
  ]) {
    const call = request(app).post(target).send(input);
    if (token) call.set('Authorization', `Bearer ${token}`);
    const response = await call.expect(status);
    assert.equal(response.headers['cache-control'], 'private, no-store');
  }
  assert.equal(generate.mock.callCount(), count);
  const auth = { Authorization: `Bearer ${editorToken}` };
  for (const change of [
    { firstName: '' },
    { fullRankEn: 'invented' },
    { rankLanguage: 'xx' },
    { ceBranchEnrollmentDate: '1985-02-29' },
    { ceBranchEnrollmentDate: '2027-01-01' },
    { releaseDate: '' },
    { postNominals: 'not a decoration' },
    { reviewed: 'true' },
    { cafEnrollmentDate: '1970-01-01' },
    { ceBranchEnrollmentDate: ['1984-02-29'] },
  ])
    await request(app)
      .post(target)
      .set(auth)
      .send({ ...input, ...change })
      .expect(422);
  await request(app)
    .post(target + '?download=2')
    .set(auth)
    .send(input)
    .expect(400);
  const review = await request(app)
    .post(target + '?download=1')
    .set(auth)
    .send(input)
    .expect(422);
  assert.equal(review.body.code, 'certificate_review_required');
  await withBundledCertificateFonts(async () => {
    for (const [query, extra] of [
      ['', {}],
      ['?download=1', { reviewed: true, postNominals: 'MMM, CD' }],
      ['', {}],
    ]) {
      const response = await request(app)
        .post(target + query)
        .set(auth)
        .send({ ...input, ...extra })
        .expect(200);
      assert.equal(response.headers['content-type'], 'application/pdf');
      assert.equal(response.headers['cache-control'], 'private, no-store');
      assert.match(
        response.headers['content-disposition'],
        query ? /attachment/u : /inline/u,
      );
      assert.equal(
        (
          await require('pdf-lib').PDFDocument.load(response.body)
        ).getPageCount(),
        1,
      );
    }
  });
  const familyMembers = [
    {
      fullName: 'Camille Bélanger',
      relationship: 'wife',
      memberRelationshipToRecipient: 'husband',
    },
    {
      fullName: 'Alexandra D’Amour-Lévesque',
      relationship: 'mother',
      memberRelationshipToRecipient: 'daughter',
    },
  ];
  const {
    getManualRetirementRequest,
  } = require('../../services/manual-retirement-certificate');
  const manual = getManualRetirementRequest({ ...input, familyMembers });
  assert.equal(
    documents.getFamilyCertificateData(manual, 0).isoDate,
    '2026-08-01',
  );
  for (const bad of [
    { familyMembers: [{ ...familyMembers[0], relationship: 'invented' }] },
    {
      familyMembers: [
        { ...familyMembers[0], memberRelationshipToRecipient: '' },
      ],
    },
    { familyMembers: [{ ...familyMembers[0], relationship: 'other' }] },
    { documentKind: 'invented' },
    { documentKind: 'packet', familyIndex: 0 },
  ])
    await request(app)
      .post(target + '?download=1')
      .set(auth)
      .send({ ...input, reviewed: true, ...bad })
      .expect(422);
  for (const familyIndex of [-1, 2])
    await request(app)
      .post(target + '?download=1')
      .set(auth)
      .send({
        ...input,
        familyMembers,
        documentKind: 'family',
        familyIndex,
        reviewed: true,
      })
      .expect(404);
  for (const [documentKind, extra, pages] of [
    ['family', { familyIndex: 1 }, 1],
    ['packet', {}, 3],
    ['member', {}, 1],
  ]) {
    const response = await request(app)
      .post(target + '?download=1')
      .set(auth)
      .send({ ...input, familyMembers, documentKind, reviewed: true, ...extra })
      .expect(200);
    assert.equal(
      (await require('pdf-lib').PDFDocument.load(response.body)).getPageCount(),
      pages,
    );
  }
  const packetCall = packetGenerate.mock.calls.at(-1).arguments[0];
  assert.equal(packetCall.member.fullName, 'Émilie D’Amour');
  assert.deepEqual(
    packetCall.familyMembers.map((family) => family.fullName),
    familyMembers.map((family) => family.fullName),
  );
  assert.deepEqual(await CertificateRequest.find({}).lean(), before);
  assert.equal(await RetirementMessage.countDocuments(), posts);
  assert.equal(
    await AuditLog.countDocuments({ action: /printed|mailed/ }),
    statusAudits,
  );
  const audits = await AuditLog.find({
    action: 'content.manual_retirement_generated',
  }).lean();
  assert.equal(audits.length, 6);
  assert.doesNotMatch(
    JSON.stringify(audits.map((value) => value.metadata)),
    /Émilie|D’Amour/u,
  );
});
