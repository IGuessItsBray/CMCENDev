const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
process.env.JWT_SECRET = 'organization-integration-secret';
process.env.NODE_ENV = 'test';
process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
process.env.MINIO_ACCESS_KEY = 'integration-test';
process.env.MINIO_SECRET_KEY = 'integration-test';
process.env.MINIO_BUCKET_NAME = 'integration-test';
process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.test/integration-test';
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const OrganizationContent = require('../../models/OrganizationContent');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AuditLog = require('../../models/AuditLog');
const MediaAsset = require('../../models/MediaAsset');
const { getSeed } = require('../../services/organization-content');
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(
  '/api/organization-content',
  require('../../routes/organization-content'),
);
app.use(require('../../routes/page-content'));
let mongo, auth;
before(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { args: ['--nounixsocket'] },
  });
  await mongoose.connect(mongo.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
  const role = await Role.create({
    name: 'Leadership editor',
    slug: 'leadership-editor',
    permissions: ['leadership.manage'],
  });
  const id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: id,
    username: 'association',
    email: 'association@example.test',
    role: 'subscriber',
    contentAreas: [],
    customRoles: [role._id],
    sessionVersion: 0,
  });
  auth = `Bearer ${jwt.sign({ userId: String(id), sessionVersion: 0, tokenType: 'access' }, process.env.JWT_SECRET)}`;
});

test('requires dedicated permission and cannot expose organization builders', async () => {
  await request(app).get('/api/organization-content/manage').expect(401);
  const listed = await request(app).get('/api/organization-content/manage').set('Authorization', auth).expect(200);
  assert.deepEqual(listed.body.resources.map((resource) => resource.key), ['leadership']);
  await request(app).get('/api/organization-content/manage/about-branch').set('Authorization', auth).expect(404);
  await MediaAsset.create({key: 'images/portrait.webp', mimeType: 'image/webp', displayName: 'Special Portrait'});
  const images = await request(app).get('/api/organization-content/media?q=special').set('Authorization', auth).expect(200);
  assert.equal(images.body.media[0].key, 'images/portrait.webp');
  await User.updateOne({ username: 'association' }, { $set: { customRoles: [], contentAreas: ['branch'] } });
  await request(app).get('/api/organization-content/manage/leadership').set('Authorization', auth).expect(403);
  await request(app).get('/api/organization-content/media').set('Authorization', auth).expect(403);
});
test('leadership replacements validate uploaded portraits and prevent their deletion', async () => {
  await User.updateOne(
    { username: 'association' },
    { $set: { role: 'administrator' } },
  );
  const content = getSeed('leadership');
  content.en.sections[0].cards[0].imageKey = 'images/new-leader.webp';
  const path = '/api/organization-content/manage/leadership';
  await request(app)
    .put(path)
    .set('Authorization', auth)
    .send({ content, version: 0 })
    .expect(400);
  await MediaAsset.create({
    key: 'images/new-leader.webp',
    mimeType: 'image/webp',
  });
  await request(app)
    .put(path)
    .set('Authorization', auth)
    .send({ content, version: 0 })
    .expect(200);
  const publicPage = await request(app)
    .get('/page-content/leadership.json')
    .expect(200);
  assert.match(
    publicPage.body.en.sections[0].cards[0].image,
    /images\/new-leader.webp$/u,
  );
  const { deleteContentMediaAsset } = require('../../services/media-assets');
  const result = await deleteContentMediaAsset({
    mediaUrl: 'images/new-leader.webp',
    source: { type: 'other', id: 'other' },
  });
  assert.equal(result.status, 'shared');
  assert.equal(result.references[0].type, 'leadership');
});

test('leadership public copy stays bundled and staff cannot overwrite fixed fields', async () => {
  await User.updateOne({ username: 'association' }, { $set: { role: 'administrator' } });
  const old = getSeed('leadership');
  old.en.heading = 'Former override';
  await OrganizationContent.create({ key: 'leadership', content: old, revision: 1 });
  const url = '/api/organization-content/manage/leadership';
  const loaded = await request(app).get(url).set('Authorization', auth).expect(200);
  assert.equal(loaded.body.content.en.heading, getSeed('leadership').en.heading);
  const changed = loaded.body.content;
  changed.fr.sections[0].cards[0].name = 'New name';
  await request(app).put(url).set('Authorization', auth).send({ content: changed, version: 1 }).expect(200);
  const stored = await OrganizationContent.findOne({ key: 'leadership' }).lean();
  assert.equal(stored.content.en.heading, 'Former override');
  const publicPage = await request(app).get('/page-content/leadership.json').expect(200);
  assert.equal(publicPage.body.en.heading, getSeed('leadership').en.heading);
  const next = await request(app).get(url).set('Authorization', auth).expect(200);
  next.body.content.fr.sections[0].cards[0].rank = 'Forbidden';
  await request(app).put(url).set('Authorization', auth).send({ content: next.body.content, version: 2 }).expect(400);
  const log = await AuditLog.findOne({action: 'page.leadership.updated'}).lean();
  assert.equal(log.metadata.before.fr.sections[0].cards[0].name, old.fr.sections[0].cards[0].name);
  assert.equal(log.metadata.after.fr.sections[0].cards[0].name, 'New name');
  await request(app).put(url).set('Authorization', auth).send({ content: changed, version: 1 }).expect(409);
  assert.equal((await OrganizationContent.findOne({ key: 'leadership' }).lean()).revision, 2);
});
