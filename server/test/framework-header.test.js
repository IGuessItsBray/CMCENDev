const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { app } = require('../server');
const { getBuildVersion } = require('../services/build-version');

test('does not disclose Express through the X-Powered-By response header', async () => {
  const response = await request(app).get('/api/version').expect(200);

  assert.equal(response.headers['x-powered-by'], undefined);
});

test('returns public running release and commit metadata', async () => {
  const response = await request(app).get('/api/version').expect(200);
  assert.deepEqual(response.body, getBuildVersion());
});
