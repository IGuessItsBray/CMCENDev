const assert = require('node:assert/strict');
const { test, before, beforeEach, after } = require('node:test');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-document-upload-test-secret';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'test';
process.env.MINIO_SECRET_KEY = 'test';
process.env.MINIO_BUCKET_NAME = 'test';
process.env.CDN_PUBLIC_BASE_URL = 'https://media.example.test';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { PDFDocument } = require('pdf-lib');
const UploadedDocument = require('../../models/UploadedDocument');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AuditLog = require('../../models/AuditLog');
const NewsArticle = require('../../models/NewsArticle');
const s3 = require('../../storage');
const { MAX_DOCUMENT_BYTES } = require('../../services/document-upload');
const app = express();
app.use(express.json());
app.use('/api', require('../../routes/uploads'));
app.use('/api/news', require('../../routes/news'));
let mongo, pdf, editor, tokens, calls, originalSend;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await UploadedDocument.init();
  const document = await PDFDocument.create();
  document.addPage();
  pdf = Buffer.from(await document.save());
  originalSend = s3.send;
});
beforeEach(async () => {
  await Promise.all([
    UploadedDocument.deleteMany({}),
    User.deleteMany({}),
    Role.deleteMany({}),
    AuditLog.deleteMany({}),
    NewsArticle.deleteMany({}),
  ]);
  calls = [];
  s3.send = async (command) => {
    calls.push(command);
    return {};
  };
  tokens = {};
  for (const role of ['subscriber', 'contributor', 'editor']) {
    const _id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id,
      username: `docs-${role}`,
      email: `${role}@example.test`,
      role,
      sessionVersion: 0,
    });
    tokens[role] = jwt.sign(
      { userId: String(_id), sessionVersion: 0, tokenType: 'access' },
      process.env.JWT_SECRET,
    );
    if (role === 'editor') editor = _id;
  }
});
after(async () => {
  s3.send = originalSend;
  await mongoose.disconnect();
  await mongo?.stop();
});
function upload(token = tokens.editor, bytes = pdf, options = {}) {
  let req = request(app).post('/api/documents');
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (options.confirm !== false) req = req.field('publicConfirmed', 'true');
  return req.attach('document', bytes, {
    filename: options.name || '77-line.pdf',
    contentType: options.type || 'application/pdf',
  });
}

test('requires authenticated staff with both upload and editorial permissions', async () => {
  for (const method of ['get', 'post']) {
    await request(app)[method]('/api/documents').expect(401);
    for (const role of ['subscriber', 'contributor'])
      await request(app)
        [method]('/api/documents')
        .set('Authorization', `Bearer ${tokens[role]}`)
        .expect(403);
  }
  assert.equal(calls.length, 0);
  await User.updateOne({ _id: editor }, { $set: { sessionVersion: 1 } });
  await upload().expect(401);
});

test('stores a validated public PDF with generated key and audit record, and lists it for reuse', async () => {
  const result = await upload(tokens.editor, pdf, {
    name: '../../newsletter.pdf',
  }).expect(201);
  assert.match(
    result.body.url,
    /^https:\/\/media\.example\.test\/documents\/uploads\/[a-f0-9-]+\.pdf$/,
  );
  assert.equal(result.body.pages, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].constructor.name, 'PutObjectCommand');
  assert.equal(calls[0].input.ContentType, 'application/pdf');
  assert.match(calls[0].input.ContentDisposition, /^attachment;/);
  assert.doesNotMatch(calls[0].input.Key, /newsletter|\.\./);
  const saved = await UploadedDocument.findById(result.body.id);
  assert.equal(String(saved.uploadedBy), String(editor));
  assert.ok(saved.publicConfirmedAt);
  const log = await AuditLog.findOne({ action: 'media.document_uploaded' });
  assert.equal(String(log.target), result.body.id);
  assert.equal(log.metadata.publicConfirmed, true);
  const listing = await request(app)
    .get('/api/documents')
    .set('Authorization', `Bearer ${tokens.editor}`)
    .expect(200);
  assert.equal(listing.headers['cache-control'], 'no-store');
  assert.equal(listing.body.documents[0].url, result.body.url);
  assert.equal(listing.body.documents[0].uploadedBy, undefined);
  assert.equal(listing.body.nextCursor, '');
  assert.equal(await NewsArticle.countDocuments(), 0);
  const article = await request(app)
    .post('/api/news')
    .set('Authorization', `Bearer ${tokens.editor}`)
    .send({
      layout: 'newsletter',
      category: 'newsletter',
      status: 'draft',
      title: { en: '77 Line' },
      newsletter: { language: 'en' },
      newsletterBlocks: {
        en: [
          {
            type: 'document',
            label: 'Read the 77 Line newsletter (PDF)',
            href: result.body.url,
          },
        ],
        fr: [],
      },
    })
    .expect(201);
  assert.equal(article.body.article.status, 'draft');
  assert.equal(
    article.body.article.newsletterBlocks.en[0].href,
    result.body.url,
  );
});

test('custom editorial roles still need their separate media upload grant', async () => {
  const custom = new mongoose.Types.ObjectId();
  await Role.collection.insertOne({
    _id: custom,
    name: 'Document staff',
    slug: 'document-staff',
    permissions: ['news.manage'],
  });
  const member = await User.findOne({ role: 'subscriber' });
  await User.updateOne(
    { _id: member._id },
    { $set: { customRoles: [custom] } },
  );
  await upload(tokens.subscriber).expect(403);
  await Role.updateOne(
    { _id: custom },
    { $set: { permissions: ['news.manage', 'media.upload'] } },
  );
  await upload(tokens.subscriber).expect(201);
});

test('two concurrent uploads are bounded and a storage failure releases its slot', async () => {
  const waiting = [];
  let ready;
  const bothStarted = new Promise((resolve) => {
    ready = resolve;
  });
  s3.send = (command) => {
    calls.push(command);
    return new Promise((resolve) => {
      waiting.push(resolve);
      if (waiting.length === 2) ready();
    });
  };
  const pending = [
    upload().then((result) => result),
    upload().then((result) => result),
  ];
  try {
    await Promise.race([
      bothStarted,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Uploads did not reach storage')),
          5000,
        ),
      ),
    ]);
    const busy = await upload().expect(429);
    assert.equal(busy.headers['retry-after'], '5');
  } finally {
    waiting.forEach((resolve) => resolve({}));
    await Promise.all(pending);
  }
  s3.send = async () => {
    throw new Error('simulated storage failure');
  };
  await upload().expect(500);
  assert.equal(await UploadedDocument.countDocuments(), 2);
  s3.send = async () => ({});
  await upload().expect(201);
});

test('rejects unconfirmed, malformed, mismatched, oversized and active PDFs with no storage writes', async () => {
  await upload(tokens.editor, pdf, { confirm: false }).expect(400);
  await upload(tokens.editor, pdf, { type: 'text/html' }).expect(422);
  await upload(tokens.editor, pdf, { name: 'newsletter.exe' }).expect(422);
  await upload(tokens.editor, Buffer.from('%PDF-1.7 not really')).expect(422);
  await upload(tokens.editor, Buffer.alloc(MAX_DOCUMENT_BYTES + 1)).expect(413);
  const active = await PDFDocument.create();
  active.addPage();
  active.addJavaScript('bad', 'app.alert("bad")');
  await upload(tokens.editor, Buffer.from(await active.save())).expect(422);
  assert.equal(calls.length, 0);
  assert.equal(await UploadedDocument.countDocuments(), 0);
  // Rejected requests release their bounded upload slots.
  await upload().expect(201);
});

test('cleans up the stored object when metadata persistence fails', async () => {
  const create = UploadedDocument.create;
  UploadedDocument.create = async () => {
    throw new Error('simulated persistence failure');
  };
  try {
    await upload().expect(500);
  } finally {
    UploadedDocument.create = create;
  }
  assert.deepEqual(
    calls.map((command) => command.constructor.name),
    ['PutObjectCommand', 'DeleteObjectCommand'],
  );
  assert.equal(calls[0].input.Key, calls[1].input.Key);
  assert.equal(await UploadedDocument.countDocuments(), 0);
  assert.equal(await AuditLog.countDocuments(), 0);
});

test('lists more than fifty documents without skipping or repeating and rejects malformed cursor', async () => {
  await UploadedDocument.insertMany(
    Array.from({ length: 52 }, (_, index) => ({
      key: `documents/uploads/${index.toString(16)}.pdf`,
      name: `File ${index}.pdf`,
      size: 10,
      pages: 1,
      uploadedBy: editor,
      publicConfirmedAt: new Date(),
    })),
  );
  const first = await request(app)
    .get('/api/documents')
    .set('Authorization', `Bearer ${tokens.editor}`)
    .expect(200);
  assert.equal(first.body.documents.length, 50);
  const second = await request(app)
    .get(`/api/documents?cursor=${first.body.nextCursor}`)
    .set('Authorization', `Bearer ${tokens.editor}`)
    .expect(200);
  assert.equal(second.body.documents.length, 2);
  assert.equal(
    new Set(
      [...first.body.documents, ...second.body.documents].map((doc) => doc.id),
    ).size,
    52,
  );
  assert.equal(second.body.nextCursor, '');
  await request(app)
    .get('/api/documents?cursor=../../bad')
    .set('Authorization', `Bearer ${tokens.editor}`)
    .expect(400);
});
