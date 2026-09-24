const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  collectMediaReferences,
} = require('../scripts/migration/lib/media-url-plan');

test('image moves retain source keys and preserve suffixes without moving documents', () => {
  const from = 'https://old.example/bucket';
  const to = 'https://new.example';
  const input = {
    oldPortrait: `${from}/association/portraits/a.webp?v=2#view`,
    oldFavicon: `${from}/favicon_crest.png`,
    leadership: { imageKey: 'images/leadership/portraits/b.jpg' },
    html: '/images/association/portraits/c.webp',
    document: { fileKey: 'documents/report.pdf' },
    alreadyMoved: `${from}/images/association/portraits/d.webp`,
  };
  const result = collectMediaReferences(input, from, to);
  assert.deepEqual(
    result.map(({ sourceKey, key }) => [sourceKey, key]),
    [
      ['association/portraits/a.webp', 'images/association/portraits/a.webp'],
      ['favicon_crest.png', 'images/favicon_crest.png'],
      ['leadership/portraits/b.jpg', 'images/leadership/portraits/b.jpg'],
      ['association/portraits/c.webp', 'images/association/portraits/c.webp'],
      ['documents/report.pdf', 'documents/report.pdf'],
      [
        'images/association/portraits/d.webp',
        'images/association/portraits/d.webp',
      ],
    ],
  );
  assert.equal(
    result[0].proposedUrl,
    `${to}/images/association/portraits/a.webp?v=2#view`,
  );
  assert.equal(result[1].proposedUrl, `${to}/images/favicon_crest.png`);
});

test('migration plan finds nested and embedded media while retaining provenance and other hosts', () => {
  const from = 'https://old.example/bucket';
  const input = {
    imageUrl: `${from}/images/a.jpg`,
    content: { en: `<img src="${from}/images/b.jpg">` },
    links: ['/documents/a.pdf'],
    nested: { fileKey: 'documents/b.pdf' },
    sourceUrl: `${from}/history.jpg`,
    legacy: { url: `${from}/history.jpg` },
    unrelated: 'https://other.example/images/c.jpg',
  };
  const snapshot = JSON.stringify(input);
  const result = collectMediaReferences(input, from, 'https://new.example');
  assert.deepEqual(
    result.map((item) => item.key),
    ['images/a.jpg', 'images/b.jpg', 'documents/a.pdf', 'documents/b.pdf'],
  );
  assert.equal(result[0].proposedUrl, 'https://new.example/images/a.jpg');
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(
    collectMediaReferences(
      '/api/admin/media/bulk-delete /api/admin/media/${key}',
      from,
      'https://new.example',
    ),
    [],
  );
});
