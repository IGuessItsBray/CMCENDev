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
const { getSeed, leadershipLeaders } = require('../../services/organization-content');
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
  const leaders = roster();
  leaders[0].imageKey = 'images/new-leader.webp';
  const path = '/api/organization-content/manage/leadership';
  await request(app)
    .put(path)
    .set('Authorization', auth)
    .send({ leaders, version: 0 })
    .expect(400);
  await MediaAsset.create({
    key: 'images/new-leader.webp',
    mimeType: 'image/webp',
    variants: {
      medium: { key: 'images/portrait/medium.webp', width: 900 },
      thumb: { key: 'images/portrait/thumb.webp', width: 400 },
      large: { key: 'images/portrait/large.webp', width: 900 },
      hero: { key: 'images/../invalid.webp', width: 2200 },
    },
  });
  await request(app)
    .put(path)
    .set('Authorization', auth)
    .send({ leaders, version: 0 })
    .expect(200);
  const publicPage = await request(app)
    .get('/page-content/leadership.json')
    .expect(200);
  for (const language of ['en', 'fr']) {
    const cards = publicPage.body[language].sections[0].cards;
    assert.match(cards[0].image, /images\/new-leader.webp$/u);
    assert.deepEqual(cards[0].imageVariants, [
      { width: 400, url: `${process.env.CDN_PUBLIC_BASE_URL}/images/portrait/thumb.webp` },
      { width: 900, url: `${process.env.CDN_PUBLIC_BASE_URL}/images/portrait/large.webp` },
    ]);
    assert.equal(cards[1].imageVariants, undefined);
  }
  const { deleteContentMediaAsset } = require('../../services/media-assets');
  const result = await deleteContentMediaAsset({
    mediaUrl: 'images/new-leader.webp',
    source: { type: 'other', id: 'other' },
  });
  assert.equal(result.status, 'shared');
  assert.equal(result.references[0].type, 'leadership');
});

function roster(leaders = leadershipLeaders()) {
  return leaders.map(({ id, name, imageKey }) => ({ id, name, imageKey }));
}

test('shared name uses the same value in both locales without overwriting fixed copy', async () => {
  const url = '/api/organization-content/manage/leadership';
  const baseline = getSeed('leadership');
  const old = structuredClone(baseline);
  old.en.heading = 'Former override';
  await OrganizationContent.create({ key: 'leadership', content: old, revision: 1 });
  const loaded = await request(app).get(url).set('Authorization', auth).expect(200);
  assert.equal(loaded.body.content.en.heading, baseline.en.heading);
  assert.equal(loaded.body.leaders[0].conflict, undefined);
  const leaders = roster(loaded.body.leaders);
  leaders[0].name = 'New name';
  await request(app).put(url).set('Authorization', auth).send({ leaders, version: 1 }).expect(200);
  const stored = await OrganizationContent.findOne({ key: 'leadership' }).lean();
  assert.deepEqual(stored.content.en, old.en);
  assert.deepEqual(stored.content.fr, old.fr);
  const publicPage = await request(app).get('/page-content/leadership.json').expect(200);
  for (const language of ['en', 'fr']) {
    const card = publicPage.body[language].sections[0].cards[0];
    assert.equal(card.name, 'New name');
    assert.equal(card.rank, baseline[language].sections[0].cards[0].rank);
    assert.equal(card.role, baseline[language].sections[0].cards[0].role);
    assert.equal(publicPage.body[language].heading, baseline[language].heading);
  }
  await request(app).put(url).set('Authorization', auth).send({ leaders, version: 1 }).expect(409);
  const log = await AuditLog.findOne({ action: 'page.leadership.updated' }).lean();
  assert.equal(log.metadata.after.fr.sections[0].cards[0].name, 'New name');
  leaders[0].rank = 'Forbidden';
  await request(app).put(url).set('Authorization', auth).send({ leaders, version: 2 }).expect(400);
  assert.equal((await OrganizationContent.findOne({ key: 'leadership' }).lean()).revision, 2);
});

test('divergent saved pairs remain public and intact until an explicit resolution', async () => {
  const url = '/api/organization-content/manage/leadership';
  const old = getSeed('leadership');
  const english = old.en.sections[0].cards[0];
  const french = old.fr.sections[0].cards[0];
  english.name = 'Former English name';
  french.name = 'Former French name';
  french.imageKey = 'images/alternate.webp';
  await OrganizationContent.create({ key: 'leadership', content: old, revision: 1 });
  const loaded = await request(app).get(url).set('Authorization', auth).expect(200);
  assert.deepEqual(loaded.body.leaders[0].conflict, {
    en: { name: english.name, imageKey: english.imageKey },
    fr: { name: french.name, imageKey: french.imageKey },
  });
  assert.match(loaded.body.portraitUrls[french.imageKey], /alternate\.webp$/u);
  const before = await request(app).get('/page-content/leadership.json').expect(200);
  assert.equal(before.body.fr.sections[0].cards[0].name, french.name);
  assert.equal(before.body.en.sections[0].cards[0].name, english.name);
  const leaders = roster(loaded.body.leaders);
  await request(app).put(url).set('Authorization', auth).send({ leaders, version: 1 }).expect(409);
  Object.assign(leaders[0], { ...loaded.body.leaders[0].conflict.fr, resolveConflict: true });
  const saved = await request(app).put(url).set('Authorization', auth).send({ leaders, version: 1 }).expect(200);
  assert.equal(saved.body.leaders[0].conflict, undefined);
  const after = await request(app).get('/page-content/leadership.json').expect(200);
  for (const language of ['en', 'fr']) {
    const card = after.body[language].sections[0].cards[0];
    assert.equal(card.name, french.name);
    assert.equal(card.imageKey, french.imageKey);
  }
  const stored = await OrganizationContent.findOne({ key: 'leadership' }).lean();
  assert.deepEqual(stored.content.en, old.en);
  assert.deepEqual(stored.content.fr, old.fr);
});

test('localized biographies are editable and explicitly clear defaults without reviving legacy text', async () => {
  const url = '/api/organization-content/manage/leadership';
  const old = getSeed('leadership');
  old.fr.sections[0].cards[2].bio = 'Historical French copy';
  delete old.en.sections[0].cards[2].bio;
  old.en.sections[0].cards[2].bioKey = 'old-key';
  old.en.bios = { 'old-key': 'Historical English copy' };
  await OrganizationContent.create({ key: 'leadership', content: old, revision: 1 });
  const loaded = await request(app).get(url).set('Authorization', auth).expect(200);
  const leader = loaded.body.leaders.find(({ id }) => id === '0:2');
  assert.ok(leader.bios.en.length);
  assert.ok(leader.bios.fr.length);
  assert.deepEqual(leader.legacyBios, { en: 'Historical English copy', fr: 'Historical French copy' });
  const leaders = roster(loaded.body.leaders);
  const edited = leaders.find(({ id }) => id === leader.id);
  edited.bios = { en: '', fr: 'Nouveau texte.\n\nAutre paragraphe.' };
  const saved = await request(app).put(url).set('Authorization', auth).send({ leaders, version: 1 }).expect(200);
  assert.deepEqual(saved.body.leaders.find(({ id }) => id === leader.id).bios, edited.bios);
  const page = await request(app).get('/page-content/leadership.json').expect(200);
  assert.equal(page.body.en.sections[0].cards[2].bio, '');
  assert.equal(page.body.fr.sections[0].cards[2].bio, edited.bios.fr);
  const stored = await OrganizationContent.findOne({ key: 'leadership' }).lean();
  assert.deepEqual(stored.content.bioOverrides, { [leader.id]: edited.bios });
  assert.equal(stored.content.fr.sections[0].cards[2].bio, 'Historical French copy');
  const audit = await AuditLog.findOne({ action: 'page.leadership.updated' }).lean();
  assert.equal(audit.metadata.after.fr.sections[0].cards[2].bio, edited.bios.fr);
  delete edited.bios;
  await request(app).put(url).set('Authorization', auth).send({ leaders, version: 2 }).expect(200);
  const after = await OrganizationContent.findOne({ key: 'leadership' }).lean();
  assert.deepEqual(after.content.bioOverrides, stored.content.bioOverrides);
});

test('biography updates reject oversize, malformed and control-character values without writes', async () => {
  const url = '/api/organization-content/manage/leadership';
  for (const bios of [{ en: 'a'.repeat(30001), fr: '' }, { en: '', fr: '\u0000' }, { en: '' }, null]) {
    const leaders = roster();
    leaders[0].bios = bios;
    await request(app).put(url).set('Authorization', auth).send({ leaders, version: 0 }).expect(400);
  }
  assert.equal(await OrganizationContent.countDocuments(), 0);
});

test('biography accepts the exact 30,000-character limit', async () => {
  const leaders = roster();
  leaders[0].bios = { en: 'é'.repeat(30000), fr: '' };
  const saved = await request(app)
    .put('/api/organization-content/manage/leadership')
    .set('Authorization', auth)
    .send({ leaders, version: 0 })
    .expect(200);
  assert.equal(saved.body.leaders[0].bios.en, leaders[0].bios.en);
});
