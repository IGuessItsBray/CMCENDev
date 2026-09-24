const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const request = require('supertest');
const content = require('../public/page-content/leadership.json');
const router = require('../routes/page-content');

test('public leadership content resolves both languages per deployment without mutating source', async () => {
  const originalBase = process.env.CDN_PUBLIC_BASE_URL;
  const snapshot = JSON.stringify(content);
  const app = express();
  app.use(router);
  try {
    for (const base of [
      'https://media.example.ca',
      'https://cdn.example.ca/bucket/',
    ]) {
      process.env.CDN_PUBLIC_BASE_URL = base;
      const response = await request(app)
        .get('/page-content/leadership.json')
        .expect(200);
      assert.equal(response.headers['cache-control'], 'no-cache');
      for (const lang of ['en', 'fr']) {
        for (const [i, section] of content[lang].sections.entries()) {
          for (const [j, card] of section.cards.entries()) {
            const actual = response.body[lang].sections[i].cards[j];
            assert.deepEqual(
              actual,
              card.imageKey
                ? {
                    ...card,
                    image: `${base.replace(/\/+$/u, '')}/${card.imageKey}`,
                  }
                : card,
            );
          }
        }
      }
    }
    assert.equal(JSON.stringify(content), snapshot);
  } finally {
    if (originalBase === undefined) delete process.env.CDN_PUBLIC_BASE_URL;
    else process.env.CDN_PUBLIC_BASE_URL = originalBase;
  }
});

test('shared resolver handles nested media keys while preserving other values', () => {
  const { buildPublicMediaUrl } = require('../services/media-library');
  const input = {
    blocks: [
      { nested: { imageKey: 'images/a portrait.jpg', image: 'old' } },
      { image: '/assets/images/logo.png' },
      { image: 'https://external.example/image.jpg', imageKey: '' },
    ],
    text: 'unchanged',
    empty: null,
    document: { fileKey: 'documents/example.pdf' },
  };
  const snapshot = JSON.stringify(input);
  const result = router.resolveMedia(input);
  assert.equal(
    result.blocks[0].nested.image,
    buildPublicMediaUrl('images/a portrait.jpg'),
  );
  assert.deepEqual(result.blocks.slice(1), input.blocks.slice(1));
  assert.equal(result.text, input.text);
  assert.equal(result.empty, null);
  assert.equal(
    result.document.fileUrl,
    buildPublicMediaUrl('documents/example.pdf'),
  );
  assert.equal(JSON.stringify(input), snapshot);
});

test('shared route serves existing public files unchanged and rejects unknown or traversal paths', async () => {
  const app = express();
  app.use(router);
  const fs = require('node:fs');
  const path = require('node:path');
  const directory = path.join(__dirname, '../public/page-content');
  for (const filename of fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'leadership.json')) {
    const response = await request(app)
      .get(`/page-content/${filename}`)
      .expect(200);
    assert.deepEqual(
      response.body,
      router.resolveMedia(
        JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8')),
      ),
    );
  }
  for (const filename of [
    'missing.json',
    '.env',
    '..%2F..%2Fpackage.json',
    '%2Fetc%2Fpasswd',
    'constructor',
  ]) {
    await request(app).get(`/page-content/${filename}`).expect(404);
  }
});
