const assert = require('node:assert/strict');
const test = require('node:test');
const { getArchiveSourceLinks } = require('../services/archive-source-links');

test('keeps paired originals separate only when source records identify their languages', () => {
  const english = 'https://cmcen-rcmce.ca/old-story/';
  const french = 'https://cmcen-rcmce.ca/fr/ancienne-histoire/';
  assert.deepEqual(
    getArchiveSourceLinks({
      migrationSource: english,
      legacy: {
        sourceUrls: [english, french],
        sourceRecords: [
          { language: 'en', url: english },
          { language: 'fr', sourceUrl: french },
        ],
      },
    }),
    [
      { url: english, language: 'en' },
      { url: french, language: 'fr' },
    ],
  );
});

test('unmapped source URLs remain generic and missing URLs stay unavailable', () => {
  const url = 'https://cmcen-rcmce.ca/fr/saved-slug/';
  assert.deepEqual(getArchiveSourceLinks({ legacy: { sourceUrls: [url] } }), [
    { url, language: '' },
  ]);
  assert.deepEqual(
    getArchiveSourceLinks({ legacy: { sourcePostIds: [123] } }),
    [],
  );
  assert.deepEqual(
    getArchiveSourceLinks({ legacy: { sourceRecords: [{ language: 'en' }] } }),
    [],
  );
});

test('rejects unsafe URLs and conflicting language tags across content types', () => {
  const valid = 'http://cmcen-rcmce.ca/source-story/';
  for (const type of [
    'event',
    'retirementMessage',
    'lastPost',
    'comment',
    'newsArticle',
  ]) {
    const content = {
      type,
      migrationSource: 'javascript:alert(1)',
      legacy: {
        sourceUrl: 'https://cmcen-rcmce.ca.evil.test/story/',
        sourceUrls: [
          'https://other.example/story/',
          'https://user@cmcen-rcmce.ca/story/',
          'https://cmcen-rcmce.ca/',
          valid,
        ],
        sourceRecords: [
          { language: 'en', url: valid },
          { language: 'fr', url: valid },
        ],
      },
    };
    assert.deepEqual(getArchiveSourceLinks(content), [
      { url: valid, language: '' },
    ]);
  }
});
