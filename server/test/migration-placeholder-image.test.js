const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CANONICAL_CREST_URL, isPlaceholderImage } = require('../scripts/migration/lib/placeholder-image');

test('recognizes each known legacy placeholder family', () => {
  [
    'legacy/current-site/retirements/cmcen-crest-snip-1.png',
    'legacy/current-site/last-post/jimmy-statue.jpg',
    'https://example.test/images/canada-flag.jpg',
    'https://example.test/images/td-insurance.png',
    'https://cdn.corebot.ca/cmcen-demo/images/064b615c-38c3-4946-a82f-48116a9d9a55/large.webp'
  ].forEach(value => assert.equal(isPlaceholderImage(value), true));
});

test('does not replace a normal subject photo', () => {
  assert.equal(isPlaceholderImage('legacy/current-site/last-post/22169-harry-jestin/original.png'), false);
  assert.equal(CANONICAL_CREST_URL, 'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp');
});
