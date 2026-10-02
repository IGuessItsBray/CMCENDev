const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');

process.env.JWT_SECRET = 'content-preview-test-secret';
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
const User = require('../../models/User');
require('../../models/Role');
const RetirementMessage = require('../../models/RetirementMessage');
const LastPostMessage = require('../../models/LastPostMessage');

const app = express();
app.use(express.json());
app.use(
  '/api/retirement-messages',
  require('../../routes/retirement-messages'),
);
app.use('/api/last-posts', require('../../routes/last-posts'));

let mongo;
let editorToken;
let readerToken;
let retirementId;
let lastPostId;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const editorId = new mongoose.Types.ObjectId();
  const readerId = new mongoose.Types.ObjectId();
  await User.collection.insertMany([
    {
      _id: editorId,
      username: 'editor@example.test',
      email: 'editor@example.test',
      role: 'editor',
      sessionVersion: 0,
    },
    {
      _id: readerId,
      username: 'reader@example.test',
      email: 'reader@example.test',
      role: 'subscriber',
      sessionVersion: 0,
    },
  ]);
  editorToken = jwt.sign(
    { userId: String(editorId), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  readerToken = jwt.sign(
    { userId: String(readerId), sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  retirementId = new mongoose.Types.ObjectId();
  lastPostId = new mongoose.Types.ObjectId();
  await RetirementMessage.collection.insertOne({
    _id: retirementId,
    status: 'draft',
    retiree: { firstName: 'Synthetic', lastName: 'Retiree' },
    messageLanguage: 'en',
    messages: { en: 'Saved retirement draft', fr: 'Brouillon enregistré' },
    submitter: { email: 'private@example.test' },
  });
  await LastPostMessage.collection.insertOne({
    _id: lastPostId,
    status: 'pending',
    deceased: { firstName: 'Synthetic', surname: 'Member' },
    messageLanguage: 'en',
    messages: { en: 'Saved notice draft', fr: 'Avis enregistré' },
    submitter: { email: 'private@example.test' },
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

for (const [base, id, key, expected] of [
  [
    '/api/retirement-messages',
    () => retirementId,
    'retirementMessage',
    'Saved retirement draft',
  ],
  ['/api/last-posts', () => lastPostId, 'lastPost', 'Saved notice draft'],
]) {
  test(`${base} restricts saved preview while public detail stays unpublished`, async () => {
    const url = `${base}/${id()}`;
    await request(app).get(url).expect(404);
    await request(app).get(`${url}/preview`).expect(401);
    await request(app)
      .get(`${url}/preview`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(403);
    const preview = await request(app)
      .get(`${url}/preview`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
    assert.equal(preview.headers['cache-control'], 'no-store');
    assert.equal(preview.body[key].messages.en, expected);
    assert.equal(
      JSON.stringify(preview.body).includes('private@example.test'),
      false,
    );
  });
}
