const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const request = require('supertest');
const router = require('../routes/public-media');

test('public media redirects preserve keys and base paths without accepting another destination', async () => {
  const before = process.env.CDN_PUBLIC_BASE_URL;
  const app = express();
  app.use(router);
  try {
    process.env.CDN_PUBLIC_BASE_URL = 'https://media.example.test/bucket/';
    const logo = await request(app).get('/images/logo.png').expect(302);
    assert.equal(logo.headers.location, '/assets/images/logo.png');
    const frame = await request(app)
      .get('/images/leadership/princess-anne-laurel-frame.svg')
      .expect(302);
    assert.equal(
      frame.headers.location,
      '/assets/images/leadership/princess-anne-laurel-frame.svg',
    );
    const response = await request(app)
      .get('/documents/a%20file.pdf')
      .expect(302);
    assert.equal(
      response.headers.location,
      'https://media.example.test/bucket/documents/a%20file.pdf',
    );
    assert.equal(response.headers['cache-control'], 'no-cache');
    await request(app).get('/images/%2Fexternal.example').expect(400);
    await request(app).get('/images/%00bad').expect(400);
    const injected = await request(app)
      .get('/images/a.jpg?url=https://evil.example')
      .expect(302);
    assert.equal(
      injected.headers.location,
      'https://media.example.test/bucket/images/a.jpg',
    );
    process.env.CDN_PUBLIC_BASE_URL = '/media';
    await request(app).get('/images/a.jpg').expect(503);
  } finally {
    if (before === undefined) delete process.env.CDN_PUBLIC_BASE_URL;
    else process.env.CDN_PUBLIC_BASE_URL = before;
  }
});
