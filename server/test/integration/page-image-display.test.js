const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
process.env.JWT_SECRET = 'page-display-integration-only';
process.env.NODE_ENV = 'test';
process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.test';
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Page = require('../../models/Page');
const User = require('../../models/User');
const router = require('../../routes/pages');
const app = express();
app.use(express.json());
app.use(router);
let mongo, editorToken, subscriberToken;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  for (const role of ['editor', 'subscriber']) {
    const _id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id,
      username: role,
      email: `${role}@example.test`,
      role,
      sessionVersion: 0,
    });
    const token = jwt.sign(
      { userId: String(_id), sessionVersion: 0 },
      process.env.JWT_SECRET,
    );
    if (role === 'editor') editorToken = token;
    else subscriberToken = token;
  }
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('Page display options retain defaults, validate and round-trip through authorized saves', async () => {
  const payload = {
    title: { en: 'Display contract', fr: 'Contrat' },
    slug: 'display-contract',
    blocks: [
      {
        type: 'image',
        mediaUrl: 'https://cdn.example.test/original.jpg',
        imageFit: 'natural',
        crop: { x: 20, y: 40, zoom: 2, rotate: 90 },
      },
      {
        type: 'heading',
        text: { en: 'Heading', fr: 'Titre' },
        underline: true,
      },
      { type: 'image' },
    ],
  };
  await request(app).post('/api/admin/pages').send(payload).expect(401);
  await request(app)
    .post('/api/admin/pages')
    .set('Authorization', `Bearer ${subscriberToken}`)
    .send(payload)
    .expect(403);
  const created = await request(app)
    .post('/api/admin/pages')
    .set('Authorization', `Bearer ${editorToken}`)
    .send(payload)
    .expect(201);
  const id = created.body.page._id;
  const blocks = created.body.page.blocks;
  assert.equal(blocks[0].imageFit, 'natural');
  assert.equal(blocks[0].crop.zoom, 2);
  assert.equal(blocks[1].underline, true);
  assert.equal(blocks[2].imageFit, 'cover');
  assert.equal(blocks[2].underline, false);
  await request(app)
    .patch(`/api/admin/pages/${id}`)
    .set('Authorization', `Bearer ${subscriberToken}`)
    .send({ blocks })
    .expect(403);
  blocks[0].imageFit = 'unrecognized';
  blocks[1].underline = 'true';
  const updated = await request(app)
    .patch(`/api/admin/pages/${id}`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ blocks })
    .expect(200);
  assert.equal(updated.body.page.blocks[0].imageFit, 'cover');
  assert.equal(updated.body.page.blocks[0].crop.zoom, 2);
  assert.equal(updated.body.page.blocks[1].underline, false);
  blocks[0].imageFit = 'natural';
  blocks[1].underline = true;
  await request(app)
    .patch(`/api/admin/pages/${id}`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ blocks })
    .expect(200);
  const preview = await request(app)
    .get(`/api/admin/pages/${id}/preview`)
    .set('Authorization', `Bearer ${editorToken}`)
    .expect(200);
  assert.equal(preview.body.page.blocks[0].imageFit, 'natural');
  await request(app)
    .patch(`/api/admin/pages/${id}/status`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ status: 'published' })
    .expect(200);
  const publicPage = await request(app)
    .get('/api/pages/display-contract')
    .expect(200);
  assert.equal(publicPage.body.page.blocks[0].imageFit, 'natural');
  assert.equal(publicPage.body.page.blocks[1].underline, true);
  const legacy = new Page({
    title: { en: 'Old' },
    slug: 'old',
    blocks: [{ type: 'image' }, { type: 'heading' }],
  });
  assert.equal(legacy.blocks[0].imageFit, 'cover');
  assert.equal(legacy.blocks[1].underline, false);
  legacy.blocks[0].imageFit = 'unrecognized';
  assert.ok(legacy.validateSync().errors['blocks.0.imageFit']);
});
