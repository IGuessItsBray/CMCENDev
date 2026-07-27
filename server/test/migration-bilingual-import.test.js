const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildCandidates,
  getImageUrl,
  getPageContent,
  parseSubject,
} = require('../scripts/migration/lib/bilingual-import');

test('builds a single bilingual candidate from an inventory pair', () => {
  const candidates = buildCandidates({
    pairs: [
      {
        contentType: 'retirement',
        pairing: 'alternate-link',
        en: {
          language: 'en',
          url: 'https://example.test/en',
          title: 'Retirement - Captain Jane Doe',
        },
        fr: {
          language: 'fr',
          url: 'https://example.test/fr',
          title: 'Retraite - Capitaine Jane Doe',
        },
      },
    ],
    unpaired: [],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].needsTranslation, false);
  assert.equal(candidates[0].sources.length, 2);
  assert.equal(candidates[0].identity.rank, 'CAPTAIN');
  assert.equal(candidates[0].identity.lastName, 'Doe');
});

test('marks English-only inventory records as needing translation', () => {
  const candidates = buildCandidates({
    pairs: [],
    unpaired: [
      {
        contentType: 'last-post',
        language: 'en',
        url: 'https://example.test/lp/jane-doe',
        title: 'Last Post - Jane Doe',
      },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].needsTranslation, true);
  assert.equal(candidates[0].identity.confidence, 'manual-review');
});

test('extracts entry content and its first source image from a legacy page', () => {
  const html =
    '<div class="entry-content"><p>Hello <strong>world</strong>.</p><img src="/image.jpg"></div>';
  assert.equal(getPageContent(html), 'Hello world .');
  assert.equal(
    getImageUrl(html, 'https://example.test/post'),
    'https://example.test/image.jpg',
  );
  assert.equal(
    parseSubject('Last Post - Major Jane Doe', 'last-post').rank,
    'MAJOR',
  );
});

test('extracts Divi post content used by the production legacy pages', () => {
  const html =
    '<div class="et_pb_module et_pb_post_content et_pb_post_content_0_tb_body"><p>Legacy body.</p></div>';
  assert.equal(getPageContent(html), 'Legacy body.');
});

test('parses abbreviated ranks and removes legacy title suffixes', () => {
  assert.deepEqual(
    parseSubject(
      'RETIREMENT ANNOUNCEMENT – MWO CHERYL ZOURDOUMIS',
      'retirement',
    ),
    {
      rank: 'MWO',
      firstName: 'CHERYL',
      lastName: 'ZOURDOUMIS',
      confidence: 'title',
    },
  );
  assert.deepEqual(
    parseSubject(
      'RETIREMENT – LIEUTENANT-COLONEL, DANIEL J. THIBODEAU, CD – 00341, SIGS',
      'retirement',
    ),
    {
      rank: 'LIEUTENANT-COLONEL',
      firstName: 'J.',
      lastName: 'THIBODEAU',
      confidence: 'title',
    },
  );
});
