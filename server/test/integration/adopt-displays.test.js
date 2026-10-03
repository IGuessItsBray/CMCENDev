const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
process.env.JWT_SECRET = 'adopt-integration-secret';
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
const router = require('../../routes/adopt-displays');
const AdoptDisplay = require('../../models/AdoptDisplay');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AuditLog = require('../../models/AuditLog');
const MediaAsset = require('../../models/MediaAsset');
const { deleteContentMediaAsset } = require('../../services/media-assets');
const adminRouter = require('../../routes/admin');
const app = express();
app.use(express.json());
app.use('/api', router);
app.use('/api/admin', adminRouter);
let mongo, manager, denied, auth;
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
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
  const role = await Role.create({
    name: 'Display manager',
    slug: 'display-manager',
    permissions: ['adopt_displays.manage'],
  });
  manager = new mongoose.Types.ObjectId();
  denied = new mongoose.Types.ObjectId();
  await User.collection.insertMany([
    {
      _id: manager,
      username: 'manager@example.test',
      email: 'manager@example.test',
      role: 'subscriber',
      customRoles: [role._id],
      sessionVersion: 0,
    },
    {
      _id: denied,
      username: 'denied@example.test',
      email: 'denied@example.test',
      role: 'editor',
      customRoles: [],
      sessionVersion: 0,
    },
  ]);
  auth = `Bearer ${jwt.sign({ userId: String(manager), sessionVersion: 0 }, process.env.JWT_SECRET)}`;
});
const payload = () => ({
  title: { en: 'Radio display', fr: 'Exposition radio' },
  displayNumber: '7',
  description: { en: 'Reviewed description', fr: 'Description vérifiée' },
});
test('all administrative operations require the dedicated permission', async () => {
  const token = `Bearer ${jwt.sign({ userId: String(denied) }, process.env.JWT_SECRET)}`;
  const id = new mongoose.Types.ObjectId();
  for (const [method, path] of [
    ['get', ''],
    ['post', ''],
    ['patch', `/${id}`],
    ['delete', `/${id}`],
  ]) {
    await request(app)
      [method]('/api/admin/adopt-displays' + path)
      .send(payload())
      .expect(401);
    await request(app)
      [method]('/api/admin/adopt-displays' + path)
      .set('Authorization', token)
      .send(payload())
      .expect(403);
  }
  await request(app)
    .get('/api/admin/adopt-displays')
    .set('Authorization', auth)
    .expect(200);
});
test('draft default, duplicate numbers, bilingual editing, publication, unpublication and deletion are audited', async () => {
  const first = await request(app)
    .post('/api/admin/adopt-displays')
    .set('Authorization', auth)
    .send(payload())
    .expect(201);
  const second = await request(app)
    .post('/api/admin/adopt-displays')
    .set('Authorization', auth)
    .send(payload())
    .expect(201);
  assert.notEqual(first.body.display._id, second.body.display._id);
  assert.equal(first.body.display.published, false);
  assert.deepEqual(
    (await request(app).get('/api/adopt-displays')).body.displays,
    [],
  );
  const id = first.body.display._id,
    endpoint = `/api/admin/adopt-displays/${id}`;
  await request(app)
    .patch(endpoint)
    .set('Authorization', auth)
    .send({
      published: true,
      availability: { en: 'Contact Foundation', fr: 'Contactez la Fondation' },
      expiry: { en: 'Confirm date', fr: 'Confirmez la date' },
    })
    .expect(200);
  const visible = (await request(app).get('/api/adopt-displays').expect(200))
    .body.displays;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].title.fr, 'Exposition radio');
  assert.equal(visible[0].createdBy, undefined);
  assert.equal(visible[0].updatedBy, undefined);
  assert.equal(
    (await AdoptDisplay.findById(id)).createdBy.toString(),
    manager.toString(),
  );
  assert.equal(
    (
      await request(app)
        .get('/api/admin/adopt-displays')
        .set('Authorization', auth)
    ).body.displays.length,
    2,
  );
  await request(app)
    .patch(endpoint)
    .set('Authorization', auth)
    .send({ published: false })
    .expect(200);
  assert.equal(
    (await request(app).get('/api/adopt-displays')).body.displays.length,
    0,
  );
  await request(app).delete(endpoint).set('Authorization', auth).expect(200);
  assert.equal(await AdoptDisplay.findById(id), null);
  assert.deepEqual(
    (await AuditLog.find({ target: id }).sort({ createdAt: 1 })).map(
      (log) => log.action,
    ),
    [
      'adopt_display.created',
      'adopt_display.updated',
      'adopt_display.updated',
      'adopt_display.deleted',
    ],
  );
});
test('invalid IDs, publication state, empty titles, text limits and unsafe URLs are rejected', async () => {
  for (const method of ['patch', 'delete'])
    await request(app)
      [method]('/api/admin/adopt-displays/invalid')
      .set('Authorization', auth)
      .send({})
      .expect(404);
  for (const invalid of [
    { title: { en: '', fr: '' } },
    { published: 'true' },
    { imageUrl: 'javascript:alert(1)' },
    { imageUrl: 'https://user:password@example.test/x' },
    { displayNumber: 'x'.repeat(81) },
    { recognition: { en: {} } },
  ]) {
    await request(app)
      .post('/api/admin/adopt-displays')
      .set('Authorization', auth)
      .send({ ...payload(), ...invalid })
      .expect(400);
  }
  await request(app)
    .patch(`/api/admin/adopt-displays/${new mongoose.Types.ObjectId()}`)
    .set('Authorization', auth)
    .send({ published: true })
    .expect(404);
  assert.equal(await AdoptDisplay.countDocuments(), 0);
});
test('media referenced by a draft display cannot be deleted as an orphan', async () => {
  const url = 'https://cdn.example.test/integration-test/images/display.webp';
  await MediaAsset.collection.insertOne({
    key: 'images/display.webp',
    url,
    originalUrl: url,
  });
  const display = await AdoptDisplay.create({ ...payload(), imageUrl: url });
  const result = await deleteContentMediaAsset({
    mediaUrl: url,
    source: { type: 'mediaManager' },
  });
  assert.equal(result.status, 'shared');
  const developer = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: developer,
    email: 'developer@example.test',
    username: 'developer@example.test',
    role: 'developer',
  });
  const token = `Bearer ${jwt.sign({ userId: String(developer) }, process.env.JWT_SECRET)}`;
  await request(app)
    .post('/api/admin/media/bulk-delete')
    .set('Authorization', token)
    .send({ keys: ['images/display.webp'] })
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.skipped.length, 1);
      assert.equal(response.body.deleted.length, 0);
    });
  assert.equal(await MediaAsset.countDocuments(), 1);
  assert.ok(await AdoptDisplay.findById(display._id));
});
