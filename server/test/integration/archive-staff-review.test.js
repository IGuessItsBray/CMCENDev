const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');

process.env.JWT_SECRET = 'archive-staff-integration-secret';
process.env.NODE_ENV = 'test';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_PUBLIC_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'integration-test';
process.env.MINIO_SECRET_KEY = 'integration-test';
process.env.MINIO_BUCKET_NAME = 'integration-test';
process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.test/integration-test';

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const router = require('../../routes/archive-staff-review');
const pageContent = require('../../routes/page-content');
const newsRoutes = require('../../routes/news');
const pageRoutes = require('../../routes/pages');
const NewsArticle = require('../../models/NewsArticle');
const ArchiveDocument = require('../../models/ArchiveDocument');
const RetirementMessage = require('../../models/RetirementMessage');
const LastPostMessage = require('../../models/LastPostMessage');
const Event = require('../../models/Event');
const Comment = require('../../models/Comment');
const Page = require('../../models/Page');
const Verification = require('../../models/ArchiveVerification');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const Role = require('../../models/Role');

const app = express();
app.use(express.json());
app.use('/api/admin/archive-staff-review', router);
app.use(pageContent);
app.use('/api/news', newsRoutes);
app.use(pageRoutes);

let mongo;
let reviewer;
let other;
let article;
let ordinaryArticle;
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });
const source = 'https://cmcen-rcmce.ca';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const roleId = new mongoose.Types.ObjectId();
  reviewer = new mongoose.Types.ObjectId();
  other = new mongoose.Types.ObjectId();
  await Role.collection.insertOne({
    _id: roleId,
    name: 'Archive verifier',
    slug: 'archive-verifier',
    permissions: ['archive.verify'],
  });
  await User.collection.insertMany([
    {
      _id: reviewer,
      username: 'reviewer@example.test',
      email: 'reviewer@example.test',
      role: 'subscriber',
      customRoles: [roleId],
      sessionVersion: 0,
    },
    {
      _id: other,
      username: 'other@example.test',
      email: 'other@example.test',
      role: 'subscriber',
      customRoles: [],
      sessionVersion: 0,
    },
  ]);
  token = jwt.sign(
    { userId: String(reviewer), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  article = await NewsArticle.create({
    category: 'news',
    title: { en: 'Imported article', fr: '' },
    content: { en: 'Full original article', fr: '' },
    createdBy: reviewer,
    status: 'draft',
    legacy: {
      source,
      sourcePostIds: [123],
      originalStatus: 'publish',
      sourceUrls: [`${source}/imported-article/`],
    },
    migrationSource: `${source}/imported-article/`,
  });
  ordinaryArticle = await NewsArticle.create({
    category: 'news',
    title: { en: 'Ordinary draft', fr: '' },
    content: { en: 'Do not expose', fr: '' },
    createdBy: reviewer,
    status: 'draft',
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('authentication and archive role are required', async () => {
  const path = '/api/admin/archive-staff-review/newsArticle';
  assert.equal((await request(app).get(path)).status, 401);
  const otherToken = jwt.sign(
    { userId: String(other), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  assert.equal(
    (await request(app).get(path).set('Authorization', `Bearer ${otherToken}`))
      .status,
    403,
  );
  const response = await request(app).get(path).set(auth());
  assert.equal(response.status, 200);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].title, 'Imported article');
});

test('draft preview access is scoped to imported records', async () => {
  const allowed = await request(app)
    .get(`/api/news/${article._id}/preview`)
    .set(auth());
  assert.equal(allowed.status, 200);
  const denied = await request(app)
    .get(`/api/news/${ordinaryArticle._id}/preview`)
    .set(auth());
  assert.equal(denied.status, 404);
  const page = await Page.create({
    legacy: {
      source,
      sourcePostIds: [205],
      originalStatus: 'publish',
      sourceUrls: [`${source}/source-205/`],
    },
    status: 'draft',
    slug: 'archive-preview-page',
    title: { en: 'Archive preview' },
  });
  const pageAllowed = await request(app)
    .get(`/api/admin/pages/${page._id}/preview`)
    .set(auth());
  assert.equal(pageAllowed.status, 200);
  const ordinary = await Page.create({
    status: 'draft',
    slug: 'ordinary-preview-page',
    title: { en: 'Ordinary preview' },
  });
  const pageDenied = await request(app)
    .get(`/api/admin/pages/${ordinary._id}/preview`)
    .set(auth());
  assert.equal(pageDenied.status, 404);
});

test('only imported drafts can be edited and checks become stale after a correction', async () => {
  const path = `/api/admin/archive-staff-review/newsArticle/${article._id}`;
  const detail = await request(app).get(path).set(auth());
  assert.equal(detail.status, 200);
  assert.equal(
    detail.body.record.source.urls[0],
    `${source}/imported-article/`,
  );
  const stamp = detail.body.record.updatedAt;
  const checks = {
    source: true,
    translation: true,
    categorization: true,
    media: true,
  };
  const verified = await request(app)
    .put(`${path}/verification`)
    .set(auth())
    .send({
      expectedUpdatedAt: stamp,
      checks,
      note: 'English only in the source',
    });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.record.verification.current, true);
  const invalid = await request(app)
    .patch(path)
    .set(auth())
    .send({ expectedUpdatedAt: stamp, changes: { status: 'published' } });
  assert.equal(invalid.status, 400);
  const edited = await request(app)
    .patch(path)
    .set(auth())
    .send({
      expectedUpdatedAt: stamp,
      changes: { 'content.en': 'Complete corrected article' },
    });
  assert.equal(edited.status, 200);
  const publish = await request(app).post(`${path}/publish`).set(auth()).send({
    expectedUpdatedAt: edited.body.record.updatedAt,
    publicationDateChoice: 'now',
  });
  assert.equal(publish.status, 409);
  const reverified = await request(app)
    .put(`${path}/verification`)
    .set(auth())
    .send({
      expectedUpdatedAt: edited.body.record.updatedAt,
      checks,
      note: 'Compared with source',
    });
  assert.equal(reverified.status, 200);
  const published = await request(app)
    .post(`${path}/publish`)
    .set(auth())
    .send({
      expectedUpdatedAt: edited.body.record.updatedAt,
      publicationDateChoice: 'now',
    });
  assert.equal(published.status, 200);
  assert.equal(published.body.record.status, 'published');
  assert.equal(
    (await NewsArticle.findById(article._id)).content.en,
    'Complete corrected article',
  );
  assert.equal(
    (await Verification.findById(`newsArticle:${article._id}`))
      .publishedAt instanceof Date,
    true,
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'content.published',
      targetType: 'newsArticle',
      target: article._id,
    }),
    1,
  );
});

test('imported document stays outside the public library until publication', async () => {
  const document = await ArchiveDocument.create({
    sourceId: 987,
    legacy: {
      source,
      originalStatus: 'publish',
      sourceUrl: `${source}/file/`,
      sourcePostIds: [987],
    },
    organization: 'branch',
    type: 'policy',
    fileKey: 'documents/library/archive-test.pdf',
    title: { en: 'Archive test document', fr: '' },
    description: { en: 'Original document', fr: '' },
  });
  const libraryPath = '/page-content/document-library.json';
  const beforeLibrary = await request(app).get(libraryPath);
  assert.equal(beforeLibrary.status, 200);
  assert.equal(
    beforeLibrary.body.documents.some((item) => item.id === 'archive-987'),
    false,
  );
  const path = `/api/admin/archive-staff-review/archiveDocument/${document._id}`;
  const detail = await request(app).get(path).set(auth());
  const stamp = detail.body.record.updatedAt;
  const verified = await request(app)
    .put(`${path}/verification`)
    .set(auth())
    .send({
      expectedUpdatedAt: stamp,
      checks: {
        source: true,
        translation: true,
        categorization: true,
        media: true,
      },
      note: 'PDF checked',
    });
  assert.equal(verified.status, 200);
  const published = await request(app)
    .post(`${path}/publish`)
    .set(auth())
    .send({ expectedUpdatedAt: stamp });
  assert.equal(published.status, 200);
  const afterLibrary = await request(app).get(libraryPath);
  assert.equal(afterLibrary.status, 200);
  assert.equal(
    afterLibrary.body.documents.some((item) => item.id === 'archive-987'),
    true,
  );
});

test('source and missing-French checks require evidence and a note', async () => {
  const withoutSource = await NewsArticle.create({
    category: 'news',
    title: { en: 'No source link' },
    content: { en: 'Imported text' },
    createdBy: reviewer,
    status: 'draft',
    legacy: { source, sourcePostIds: [900], originalStatus: 'publish' },
  });
  const sourcePath = `/api/admin/archive-staff-review/newsArticle/${withoutSource._id}`;
  const sourceDetail = await request(app).get(sourcePath).set(auth());
  const checks = {
    source: true,
    translation: true,
    categorization: true,
    media: true,
  };
  const sourceResponse = await request(app)
    .put(`${sourcePath}/verification`)
    .set(auth())
    .send({
      expectedUpdatedAt: sourceDetail.body.record.updatedAt,
      checks,
      note: 'French source was absent',
    });
  assert.equal(sourceResponse.status, 409);

  const needsFrench = await ArchiveDocument.create({
    sourceId: 901,
    legacy: {
      source,
      originalStatus: 'publish',
      sourceUrl: `${source}/source-901/`,
    },
    organization: 'branch',
    type: 'policy',
    fileKey: 'documents/library/needs-french.pdf',
    title: { en: 'English title', fr: '' },
  });
  const frenchPath = `/api/admin/archive-staff-review/archiveDocument/${needsFrench._id}`;
  const frenchDetail = await request(app).get(frenchPath).set(auth());
  const frenchResponse = await request(app)
    .put(`${frenchPath}/verification`)
    .set(auth())
    .send({
      expectedUpdatedAt: frenchDetail.body.record.updatedAt,
      checks,
      note: '',
    });
  assert.equal(frenchResponse.status, 400);
});

test('the restricted path publishes every other imported draft type', async () => {
  async function reviewAndPublish(type, record) {
    const path = `/api/admin/archive-staff-review/${type}/${record._id}`;
    const detail = await request(app).get(path).set(auth());
    assert.equal(detail.status, 200, `${type}: ${JSON.stringify(detail.body)}`);
    const stamp = detail.body.record.updatedAt;
    const verification = await request(app)
      .put(`${path}/verification`)
      .set(auth())
      .send({
        expectedUpdatedAt: stamp,
        checks: {
          source: true,
          translation: true,
          categorization: true,
          media: true,
        },
        note: 'Compared with published source; no French counterpart.',
      });
    assert.equal(
      verification.status,
      200,
      `${type}: ${JSON.stringify(verification.body)}`,
    );
    const publication = await request(app)
      .post(`${path}/publish`)
      .set(auth())
      .send({
        expectedUpdatedAt: stamp,
        publicationDateChoice: 'now',
      });
    assert.equal(
      publication.status,
      200,
      `${type}: ${JSON.stringify(publication.body)}`,
    );
    assert.equal(publication.body.record.status, 'published');
  }
  const legacy = (id) => ({
    source,
    sourcePostIds: [id],
    originalStatus: 'publish',
    submissionMetadata: 'historically-unknown',
    sourceUrls: [`${source}/source-${id}/`],
  });
  const retirement = await RetirementMessage.create({
    legacy: legacy(200),
    status: 'draft',
    messageLanguage: 'en',
    messages: { en: 'An archival retirement notice', fr: '' },
    message: 'An archival retirement notice',
  });
  await reviewAndPublish('retirementMessage', retirement);
  const lastPost = await LastPostMessage.create({
    legacy: legacy(201),
    status: 'draft',
    messageLanguage: 'en',
    messages: { en: 'An archival Last Post notice', fr: '' },
  });
  await reviewAndPublish('lastPost', lastPost);
  const event = await Event.create({
    legacy: legacy(202),
    status: 'draft',
    title: { en: 'Archive event' },
    startDate: new Date('2025-01-01'),
  });
  await reviewAndPublish('event', event);
  const comment = await Comment.create({
    legacy: {
      source,
      wordpressCommentId: 203,
      originalApproval: '1',
      sourceUrl: `${source}/source-200/#comment-203`,
    },
    parentType: 'retirement',
    parentId: retirement._id,
    status: 'draft',
    body: 'Original archive comment',
  });
  await reviewAndPublish('comment', comment);
  const page = await Page.create({
    legacy: legacy(204),
    status: 'draft',
    slug: 'archive-review-test-page',
    title: { en: 'Archive page' },
    blocks: [],
  });
  await reviewAndPublish('page', page);
});
