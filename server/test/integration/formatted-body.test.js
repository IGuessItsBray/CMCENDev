const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
process.env.JWT_SECRET = 'formatted-body-local-test-secret';
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
const ContentRevision = require('../../models/ContentRevision');
const { fromText } = require('../../public/body-content');
const app = express();
app.use(express.json());
for (const route of ['events', 'last-posts', 'retirement-messages']) app.use(`/api/${route}`, require(`../../routes/${route}`));
let mongo, editorToken, readerToken;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const users = ['editor', 'subscriber'].map((role) => ({ _id: new mongoose.Types.ObjectId(), role, sessionVersion: 0, email: `${role}@example.test`, username: `${role}@example.test` }));
  await User.collection.insertMany(users);
  [editorToken, readerToken] = users.map((u) => jwt.sign({ userId: String(u._id), sessionVersion: 0 }, process.env.JWT_SECRET));
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

for (const [name, route, field, responseKey] of [
  ['Event', 'events', 'description', 'event'],
  ['LastPostMessage', 'last-posts', 'messages', 'lastPost'],
  ['RetirementMessage', 'retirement-messages', 'messages', 'retirementMessage'],
]) {
  test(`${name} single message formatting validates safely and preserves status, revisions and independent translation`, async () => {
    const Model = require(`../../models/${name}`);
    const doc = await Model.create({ title: name === 'Event' ? { en: 'Title', fr: 'Titre' } : 'Title', startDate: new Date(), status: 'pending', messageLanguage: 'en', message: 'English', [field]: { en: 'English', fr: 'French' }, legacy: { source: 'https://cmcen-rcmce.ca', sourcePostIds: [1], originalStatus: 'publish', submissionMetadata: 'historically-unknown' }, formattedBody: { en: { version: 1, text: 'English', blocks: [{ type: 'paragraph', align: 'center', children: [{ type: 'underline', children: ['English'] }] }] }, fr: { version: 1, text: 'French', blocks: fromText('French') } } });
    const url = `/api/${route}/${doc._id}`;
    const payload = (language, text, blocks) => ({ language, ...(field === 'description' ? { content: { title: 'Title', location: '', registration: '', description: text } } : { message: text }), ...(blocks === undefined ? {} : { blocks }) });
    await request(app).patch(`${url}/review-content`).send(payload('en', 'English')).expect(401);
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${readerToken}`).send(payload('en', 'English')).expect(403);
    const blocks = [{ type: 'paragraph', align: 'center', children: [{ type: 'underline', children: ['English'] }] }];
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('en', 'Other', blocks)).expect(400);
    assert.equal(await ContentRevision.countDocuments({ contentId: doc._id }), 0);
    for (const type of ['figure', 'document', 'heading', 'list']) await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('en', 'English', [{ type }])).expect(400);
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('en', 'English', [{ type: 'paragraph', children: [{ type: 'link', href: 'javascript:alert(1)', children: ['English'] }] }])).expect(400);
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('en', 'English', blocks)).expect(name === 'Event' ? 400 : 200);
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('en', 'English')).expect(200);
    let saved = await Model.findById(doc._id).lean();
    assert.equal(saved.status, 'pending');
    assert.equal(saved.formattedBody.en.blocks[0].align, 'center');
    assert.equal(saved.formattedBody.fr.text, 'French');
    const revision = await ContentRevision.findOne({ contentId: doc._id }).lean();
    assert.deepEqual(revision.after.formattedBody.blocks, blocks);
    await request(app).get(url).expect(404);
    // Hidden stays hidden, and an older plain edit permanently clears only FR.
    await Model.updateOne({ _id: doc._id }, { $set: { status: 'hidden' } });
    await request(app).patch(`${url}/review-content`).set('Authorization', `Bearer ${editorToken}`).send(payload('fr', 'Staff French edit')).expect(200);
    saved = await Model.findById(doc._id).lean();
    assert.equal(saved.status, 'hidden');
    assert.equal(saved.formattedBody.fr, undefined);
    assert.equal(saved.formattedBody.en.text, 'English');
    await Model.updateOne({ _id: doc._id }, { $set: { status: 'published' } });
    const publicResult = await request(app).get(url).expect(200);
    assert.equal(publicResult.body[responseKey].formattedBody.en.text, 'English');
    assert.equal(publicResult.body[responseKey].formattedBody.fr, undefined);
  });
  test(`${name} inline-only media is protected as a content reference`, async () => {
    const Model = require(`../../models/${name}`);
    const url = `https://cdn.example.test/integration-test/images/${name}.png`;
    const doc = await Model.create({ title: name === 'Event' ? { en: 'Title' } : 'Title', startDate: new Date(), messageLanguage: 'en', legacy: { source: 'https://cmcen-rcmce.ca', sourcePostIds: [1], originalStatus: 'publish', submissionMetadata: 'historically-unknown' }, [field]: { en: url }, formattedBody: { en: { version: 1, text: url, blocks: [{ type: 'paragraph', children: [{ type: 'link', href: url, children: [url] }] }] } } });
    const { getContentMediaReferences } = require('../../services/media-assets');
    const refs = await getContentMediaReferences(new Set([url]));
    assert(refs.some((ref) => ref.id === String(doc._id) && ref.field === 'formattedBody.en.blocks.0.children.0.href'));
  });
  if (name !== 'Event') test(`${name} colored legacy nodes save without color while EN/FR underline, links and source text survive`, async () => {
    const Model = require(`../../models/${name}`);
    const doc = await Model.create({ title: 'Title', status: 'pending', messageLanguage: 'en', message: 'Mixed Case', messages: { en: 'Mixed Case', fr: 'Détails' }, legacy: { source: 'https://cmcen-rcmce.ca', sourcePostIds: [1], originalStatus: 'publish', submissionMetadata: 'historically-unknown' } });
    for (const language of ['en', 'fr']) {
      const text = language === 'en' ? 'Mixed Case' : 'Détails';
      const blocks = [{ type: 'paragraph', children: [{ type: 'color', color: 'blue', children: [{ type: 'underline', children: [{ type: 'link', href: 'https://example.test/CasePath', children: [text] }] }] }] }];
      await request(app).patch(`/api/${route}/${doc._id}/review-content`).set('Authorization', `Bearer ${editorToken}`).send({ language, message: text, blocks }).expect(200);
      const saved = await Model.findById(doc._id).lean(), node = saved.formattedBody[language].blocks[0].children[0];
      assert.equal(saved.messages[language], text); assert.equal(node.type, 'underline');
      assert.equal(node.children[0].href, 'https://example.test/CasePath'); assert.equal(node.children[0].children[0], text);
      assert.equal(saved.status, 'pending');
      if (language === 'fr') assert.equal(saved.formattedBody.en.blocks[0].children[0].type, 'underline');
    }
  });
}
