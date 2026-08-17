const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const XLSX = require('xlsx');
const {
  parseComments,
  readWorkbookInventory,
} = require('../scripts/migration/lib/workbook-inventory');
const {
  buildDocument,
  buildRecordFilter,
} = require('../scripts/migration/lib/workbook-import');
const { isImageLikeUrl } = require('../scripts/migration/lib/workbook-media');

function addSheet(workbook, name, rows) {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
}

function writeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcen-workbook-'));
  const inputPath = path.join(directory, 'inventory.xlsx');
  const workbook = XLSX.utils.book_new();

  addSheet(workbook, 'Inventory', [
    [
      'record_id',
      'type',
      'record_class',
      'rank',
      'first_name',
      'last_name',
      'trade',
      'date',
      'source_title_english',
      'source_title_french',
      'source_post_ids',
      'media_count',
      'comment_count',
      'notes',
    ],
    [
      1,
      'retirement',
      'person',
      'Major',
      'Alex',
      'Example',
      'SIGS',
      '2026-08-01',
      'Retirement - Major Alex Example',
      'Retraite - Major Alex Example',
      '101 | 102',
      2,
      1,
      '',
    ],
    [
      2,
      'last-post',
      'person',
      'Captain',
      'Jean',
      'Example',
      '',
      '2026-08-02',
      'Captain Jean Example',
      'Capitaine Jean Example',
      '103',
      0,
      0,
      '',
    ],
  ]);
  addSheet(workbook, 'English Messages', [
    [
      'record_id',
      'type',
      'date',
      'source_title',
      'message_english',
      'source_url',
      'media_links',
    ],
    [
      1,
      'retirement',
      '2026-08-01',
      'Retirement - Major Alex Example',
      'English retirement message.',
      'https://example.test/?p=101',
      'https://example.test/alex.jpg',
    ],
    [2, 'last-post', '2026-08-02', 'Captain Jean Example', '', '', ''],
  ]);
  addSheet(workbook, 'French Messages', [
    [
      'record_id',
      'type',
      'date',
      'source_title',
      'message_french',
      'source_url',
      'media_links',
    ],
    [
      1,
      'retirement',
      '2026-08-01',
      'Retraite - Major Alex Example',
      'Message de retraite français.',
      'https://example.test/?p=102',
      'https://example.test/alex.jpg',
    ],
    [
      2,
      'last-post',
      '2026-08-02',
      'Capitaine Jean Example',
      'Message de dernier appel.',
      'https://example.test/?p=103',
      'https://example.test/notice.pdf',
    ],
  ]);
  addSheet(workbook, 'Media & Comments', [
    [
      'record_id',
      'source_post_ids',
      'translation_group',
      'media_links',
      'comments',
      'notes',
    ],
    [
      1,
      '101 | 102',
      'group-1',
      'https://example.test/alex.jpg | https://example.test/letter.pdf',
      '2026-08-01 12:00:00 — Pat: Congratulations!',
      '',
    ],
    [2, '103', 'group-2', 'NULL', '', ''],
  ]);

  XLSX.writeFile(workbook, inputPath);
  return { directory, inputPath };
}

test('reads cleaned workbook records into import candidates', () => {
  const fixture = writeFixture();

  try {
    const inventory = readWorkbookInventory(fixture.inputPath);

    assert.deepEqual(inventory.summary, {
      records: 2,
      bilingual: 1,
      needsTranslation: 1,
      retirements: 1,
      lastPosts: 1,
      sourcePostIds: 3,
    });
    assert.deepEqual(inventory.candidates[0].sourcePostIds, [101, 102]);
    assert.equal(inventory.candidates[0].bilingual, true);
    assert.deepEqual(inventory.candidates[0].mediaLinks, [
      'https://example.test/alex.jpg',
      'https://example.test/letter.pdf',
    ]);
    assert.equal(inventory.candidates[0].comments[0].authorName, 'Pat');
    assert.equal(inventory.candidates[1].primaryLanguage, 'fr');
    assert.equal(inventory.candidates[1].needsTranslation, true);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('builds published bilingual and pending single-language documents', () => {
  const legacyUser = { _id: 'legacy-user' };
  const mediaResult = {
    assets: [],
    failures: [],
    primaryAsset: {
      key: 'legacy/asset.webp',
      url: 'https://cdn.example.test/asset.webp',
      display: { url: 'https://cdn.example.test/display.webp' },
    },
  };
  const candidate = {
    recordId: 5,
    type: 'retirement',
    recordClass: 'person',
    publishedDate: '2026-08-01',
    sourcePostIds: [101, 102],
    translationGroup: 'group-5',
    identity: {
      rank: 'Major',
      firstName: 'Alex',
      lastName: 'Example',
      trade: 'SIGS',
    },
    titles: {
      en: 'Retirement - Major Alex Example',
      fr: 'Retraite - Major Alex Example',
    },
    messages: {
      en: 'English retirement message.',
      fr: 'Message de retraite français.',
    },
    primaryLanguage: 'en',
    bilingual: true,
    sourceUrls: {
      en: 'https://example.test/?p=101',
      fr: 'https://example.test/?p=102',
    },
    mediaLinks: [],
    notes: '',
  };

  const published = buildDocument(candidate, mediaResult, legacyUser);
  assert.equal(published.status, 'published');
  assert.equal(published.photoUrl, 'https://cdn.example.test/asset.webp');
  assert.deepEqual(buildRecordFilter(candidate), {
    $or: [
      { 'legacy.source': 'workbook-bilingual-inventory', 'legacy.recordId': 5 },
      { 'legacy.wordpressPostId': { $in: [101, 102] } },
      { 'legacy.postId': { $in: [101, 102] } },
    ],
  });

  candidate.bilingual = false;
  const pending = buildDocument(candidate, mediaResult, legacyUser);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.publishedAt, null);
});

test('parses stored comments and avoids non-image files during upload', () => {
  assert.equal(
    parseComments('2026-08-01 12:00:00 — Pat: Congratulations!')[0].parsed,
    true,
  );
  assert.equal(parseComments('unstructured note')[0].parsed, false);
  assert.equal(isImageLikeUrl('https://example.test/photo.jpg'), true);
  assert.equal(isImageLikeUrl('https://example.test/document.pdf'), false);
});
