const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { router, backups } = require('../routes/admin-backups');

test('all backup operations require authentication and exact developer role', async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'backup-test-signing-secret';
  t.after(() => {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  let role = 'administrator';
  t.mock.method(User, 'findById', () => ({
    select: () => ({
      populate: async () => ({
        role,
        sessionVersion: 0,
        customRoles: [{ permissions: ['backups.manage'] }],
      }),
    }),
  }));
  t.mock.method(backups, 'status', async () => ({ enabled: false }));
  t.mock.method(backups, 'configure', async () => ({ enabled: true }));
  t.mock.method(backups, 'run', async () => ({ id: 'complete' }));
  const app = express();
  app.use(express.json());
  app.use('/api/admin/backups', router);
  const token = jwt.sign(
    { userId: 'test', sessionVersion: 0 },
    process.env.JWT_SECRET,
  );
  const endpoints = [
    ['get', ''],
    ['patch', '/schedule'],
    ['post', '/run'],
    ['get', '/backup-1-0123456789abcdef/mongo.enc'],
  ];
  for (const [method, endpoint] of endpoints) {
    assert.equal(
      (await request(app)[method](`/api/admin/backups${endpoint}`)).status,
      401,
    );
    for (role of ['subscriber', 'editor', 'administrator']) {
      assert.equal(
        (
          await request(app)
            [method](`/api/admin/backups${endpoint}`)
            .set('Authorization', `Bearer ${token}`)
        ).status,
        403,
      );
    }
  }
  role = 'developer';
  const response = await request(app)
    .get('/api/admin/backups')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/backups/schedule')
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true, intervalMinutes: 60 })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/backups/run')
        .set('Authorization', `Bearer ${token}`)
        .send({})
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/admin/backups/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ uri: 'custom' })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .get('/api/admin/backups/invalid/mongo.enc')
        .set('Authorization', `Bearer ${token}`)
    ).status,
    404,
  );
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'backup-download-'),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'mongo.enc');
  await fs.writeFile(filename, 'encrypted bytes');
  t.mock.method(backups, 'filePath', () => filename);
  const audits = [];
  t.mock.method(AuditLog, 'create', async (event) => audits.push(event));
  const download = await request(app)
    .get('/api/admin/backups/backup-1-0123456789abcdef/mongo.enc')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers['cache-control'], 'no-store');
  assert.match(download.headers['content-disposition'], /attachment/u);
  assert.equal(audits[0].action, 'backup.downloaded');
});
