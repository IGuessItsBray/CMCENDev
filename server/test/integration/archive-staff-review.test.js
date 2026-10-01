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
const MediaAsset = require('../../models/MediaAsset');
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
  assert.equal(response.body.items[0].checksCompleted, 0);
});

test('page editors can review imported pages and documents only', async () => {
  const editorId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: editorId, username: 'page-editor@example.test',
    email: 'page-editor@example.test', role: 'editor',
    customRoles: [], sessionVersion: 0,
  });
  const editorToken = jwt.sign(
    { userId: String(editorId), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  const header = { Authorization: `Bearer ${editorToken}` };
  const types = await request(app).get('/api/admin/archive-staff-review/types')
    .set(header).expect(200);
  assert.deepEqual(types.body.types, ['page', 'archiveDocument']);
  await request(app).get('/api/admin/archive-staff-review/page').set(header).expect(200);
  await request(app).get('/api/admin/archive-staff-review/archiveDocument').set(header).expect(200);
  await request(app).get('/api/admin/archive-staff-review/newsArticle').set(header).expect(403);
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
  const checkedQueue = await request(app)
    .get('/api/admin/archive-staff-review/newsArticle')
    .set(auth());
  assert.equal(checkedQueue.body.items[0].checksCompleted, 4);
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
  const staleQueue = await request(app)
    .get('/api/admin/archive-staff-review/newsArticle')
    .set(auth());
  assert.equal(staleQueue.body.items[0].checksCompleted, 0);
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

test('newsletter edits preserve block pairs and update the public text', async () => {
  const newsletter = await NewsArticle.create({
    category: 'newsletter',
    layout: 'newsletter',
    title: { en: 'Archive bulletin', fr: 'Bulletin des archives' },
    content: { en: 'Original heading', fr: 'Titre original' },
    newsletterBlocks: {
      en: [{ type: 'heading', text: 'Original heading', pairId: 'heading-1' }],
      fr: [{ type: 'heading', text: 'Titre original', pairId: 'heading-1' }],
    },
    status: 'draft',
    createdBy: reviewer,
    legacy: {
      source,
      sourcePostIds: [456],
      originalStatus: 'publish',
      sourceUrls: [`${source}/bulletin/`],
    },
  });
  const path = `/api/admin/archive-staff-review/newsArticle/${newsletter._id}`;
  const detail = await request(app).get(path).set(auth());
  assert.equal(detail.status, 200);
  assert.equal(detail.body.record.layout, 'newsletter');
  const fields = Object.fromEntries(
    detail.body.record.fields.map((field) => [field.path, field.value]),
  );
  assert.equal(fields['newsletterBlocks.fr'][0].pairId, 'heading-1');
  const changed = await request(app)
    .patch(path)
    .set(auth())
    .send({
      expectedUpdatedAt: detail.body.record.updatedAt,
      changes: {
        'newsletterBlocks.en': [
          { type: 'heading', text: 'Corrected heading', pairId: 'heading-1' },
        ],
      },
    });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const saved = await NewsArticle.findById(newsletter._id);
  assert.equal(saved.newsletterBlocks.en[0].pairId, 'heading-1');
  assert.equal(saved.newsletterBlocks.fr[0].pairId, 'heading-1');
  assert.equal(saved.content.en, 'Corrected heading');
  assert.equal(saved.content.fr, 'Titre original');
});

test('archive reviewer can choose existing media without media administration or replacing rich blocks', async () => {
  const asset = await MediaAsset.create({
    key: 'images/synthetic-crest.webp',
    url: 'https://cdn.example.test/images/synthetic-crest.webp',
    mimeType: 'image/webp',
    displayName: 'Synthetic crest',
  });
  const importedAsset = await MediaAsset.create({
    key: 'images/imported-body/original.webp',
    url: 'https://cdn.example.test/images/imported-body/large.webp',
    mimeType: '',
    inferredName: 'Imported body image',
  });
  const newsletter = await NewsArticle.create({
    category: 'newsletter', layout: 'newsletter',
    title: { en: 'Image choice', fr: 'Choix d’image' },
    content: { en: 'Caption', fr: 'Légende' },
    newsletterBlocks: {
      en: [
        { type: 'figure', image: { url: 'https://example.test/old.webp', alt: 'Original alt' }, caption: 'Original caption', pairId: 'figure-1', sourceRef: 'legacy-asset' },
        { type: 'legacy-rich', html: '<strong>Preserve me</strong>', pairId: 'rich-2' },
      ],
      fr: [{ type: 'heading', text: 'Légende', pairId: 'heading-1' }],
    },
    status: 'draft', createdBy: reviewer,
    legacy: { source, sourcePostIds: [9876], originalStatus: 'publish', sourceUrls: [`${source}/image-choice/`] },
  });
  const mediaPath = '/api/admin/archive-staff-review/media?search=crest';
  assert.equal((await request(app).get(mediaPath)).status, 401);
  const denied = jwt.sign({ userId: String(other), sessionVersion: 0 }, process.env.JWT_SECRET);
  assert.equal((await request(app).get(mediaPath).set('Authorization', `Bearer ${denied}`)).status, 403);
  const listed = await request(app).get(mediaPath).set(auth());
  assert.equal(listed.status, 200);
  assert.equal(listed.body.media.length, 1);
  assert.equal(listed.body.media[0].key, asset.key);
  assert.equal(listed.body.media[0].uploadedBy, undefined);
  const importedList = await request(app).get('/api/admin/archive-staff-review/media?search=Imported%20body').set(auth());
  assert.equal(importedList.status, 200);
  assert.equal(importedList.body.media[0].key, importedAsset.key);
  const path = `/api/admin/archive-staff-review/newsArticle/${newsletter._id}`;
  const detail = await request(app).get(path).set(auth());
  const stamp = detail.body.record.updatedAt;
  const verified = await request(app).put(`${path}/verification`).set(auth()).send({
    expectedUpdatedAt: stamp,
    checks: { source: true, translation: true, categorization: true, media: true },
    note: 'Synthetic source checked',
  });
  assert.equal(verified.status, 200);
  const saved = await request(app).patch(path).set(auth()).send({
    expectedUpdatedAt: stamp,
    changes: {
      'newsletter.headerCrest': true,
      'newsletterBlocks.en': [
        { type: 'figure', image: { url: 'https://example.test/old.webp', alt: 'Updated EN alt' }, caption: 'Updated EN caption', pairId: 'figure-1', sourceRef: 'legacy-asset' },
        { type: 'legacy-rich', html: '<strong>Preserve me</strong>', pairId: 'rich-2' },
      ],
    },
    mediaSelections: [{ language: 'en', index: 0, key: importedAsset.key }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.record.verification, null);
  const updated = await NewsArticle.findById(newsletter._id);
  assert.equal(updated.newsletterBlocks.en[0].image.url, importedAsset.url);
  assert.equal(updated.newsletterBlocks.en[0].image.alt, 'Updated EN alt');
  assert.equal(updated.newsletterBlocks.en[0].caption, 'Updated EN caption');
  assert.equal(updated.newsletter.headerCrest, true);
  assert.equal(updated.newsletterBlocks.en[0].pairId, 'figure-1');
  assert.equal(updated.newsletterBlocks.en[0].sourceRef, 'legacy-asset');
  assert.deepEqual(updated.newsletterBlocks.en[1], { type: 'legacy-rich', html: '<strong>Preserve me</strong>', pairId: 'rich-2' });
  assert.equal((await request(app).patch(path).set(auth()).send({ expectedUpdatedAt: stamp, mediaSelections: [{ language: 'en', index: 0, key: asset.key }] })).status, 409);
  const nextBlocks = JSON.parse(JSON.stringify(updated.newsletterBlocks.en));
  nextBlocks[0].caption = 'Edited caption';
  nextBlocks.push({ type: 'heading', text: 'New heading', pairId: 'heading-3' });
  const textEdit = await request(app).patch(path).set(auth()).send({
    expectedUpdatedAt: saved.body.record.updatedAt,
    changes: { 'newsletterBlocks.en': nextBlocks },
  });
  assert.equal(textEdit.status, 200, JSON.stringify(textEdit.body));
  const afterText = await NewsArticle.findById(newsletter._id);
  assert.deepEqual(afterText.newsletterBlocks.en[1], { type: 'legacy-rich', html: '<strong>Preserve me</strong>', pairId: 'rich-2' });
  assert.equal(afterText.newsletterBlocks.en[0].sourceRef, 'legacy-asset');
  assert.equal(afterText.newsletterBlocks.en[0].caption, 'Edited caption');
  assert.equal(afterText.newsletterBlocks.en[2].text, 'New heading');
});

test('staff review exposes source dates and requires an intentional original or custom date', async () => {
  for (const [id, choice, expected] of [
    [9901, 'original', '2013-08-12T09:00:00.000Z'],
    [9902, 'custom', '2011-04-05T10:00:00.000Z'],
  ]) {
    const item = await NewsArticle.create({
      category: 'news', title: { en: `Dated ${id}`, fr: `Daté ${id}` },
      content: { en: 'Source text', fr: 'Texte source' },
      status: 'draft', createdBy: reviewer,
      legacy: { source, sourcePostIds: [id], originalStatus: 'publish',
        sourceUrls: [`${source}/dated-${id}/`],
        sourceRecords: [{ language: 'en', sourceStatus: 'publish', createdGmt: '2013-08-12 09:00:00' }],
      },
    });
    const path = `/api/admin/archive-staff-review/newsArticle/${item._id}`;
    const detail = await request(app).get(path).set(auth());
    assert.equal(new Date(detail.body.record.publicationDate.originalPublishedAt).toISOString(), '2013-08-12T09:00:00.000Z');
    const stamp = detail.body.record.updatedAt;
    const verified = await request(app).put(`${path}/verification`).set(auth()).send({
      expectedUpdatedAt: stamp,
      checks: { source: true, translation: true, categorization: true, media: true },
      note: 'Source date checked',
    });
    assert.equal(verified.status, 200);
    assert.equal((await request(app).post(`${path}/publish`).set(auth()).send({ expectedUpdatedAt: stamp })).status, 400);
    const published = await request(app).post(`${path}/publish`).set(auth()).send({
      expectedUpdatedAt: stamp,
      publicationDateChoice: choice,
      ...(choice === 'custom' ? { customPublishedAt: expected } : {}),
    });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    const stored = await NewsArticle.findById(item._id);
    assert.equal(stored.publishedAt.toISOString(), expected);
    assert.equal(stored.originalPublishedAt.toISOString(), '2013-08-12T09:00:00.000Z');
    assert.equal(stored.publicationDateChoice, choice);
  }
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
    .send({ expectedUpdatedAt: stamp, publicationDateChoice: 'now' });
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
  const retirementDetail = await request(app)
    .get(`/api/admin/archive-staff-review/retirementMessage/${retirement._id}`)
    .set(auth());
  assert.equal(retirementDetail.status, 200);
  assert.equal(
    retirementDetail.body.record.fields.find(
      (field) => field.path === 'messages.en',
    ).value,
    'An archival retirement notice',
  );
  assert.equal(
    retirementDetail.body.record.fields.find(
      (field) => field.path === 'messages.fr',
    ).value,
    '',
  );
  assert.equal(
    retirementDetail.body.record.source.urls[0],
    `${source}/source-200/`,
  );
  await reviewAndPublish('retirementMessage', retirement);
  const lastPost = await LastPostMessage.create({
    legacy: legacy(201),
    status: 'draft',
    messageLanguage: 'en',
    messages: { en: 'An archival Last Post notice', fr: '' },
  });
  const lastPostDetail = await request(app)
    .get(`/api/admin/archive-staff-review/lastPost/${lastPost._id}`)
    .set(auth());
  assert.equal(lastPostDetail.status, 200);
  assert.equal(
    lastPostDetail.body.record.fields.find(
      (field) => field.path === 'messages.en',
    ).value,
    'An archival Last Post notice',
  );
  assert.equal(
    lastPostDetail.body.record.fields.find(
      (field) => field.path === 'messages.fr',
    ).value,
    '',
  );
  assert.equal(
    lastPostDetail.body.record.source.urls[0],
    `${source}/source-201/`,
  );
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
