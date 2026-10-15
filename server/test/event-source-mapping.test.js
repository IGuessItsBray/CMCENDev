const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mapPublicEventDetails,
} = require('../scripts/migration/lib/event-source-mapping');
const references = {
  wp_terms: [
    { term_id: '1', name: 'News' },
    { term_id: '2', name: 'Vimy &amp; Mess' },
    { term_id: '3', name: 'Organizer' },
  ],
  wp_term_taxonomy: [
    { term_id: '1', taxonomy: 'category' },
    { term_id: '2', taxonomy: 'mec_location' },
    { term_id: '3', taxonomy: 'mec_organizer' },
  ],
  wp_termmeta: [
    { term_id: '2', meta_key: 'address', meta_value: 'Public address' },
    { term_id: '3', meta_key: 'email', meta_value: 'public@example.test' },
  ],
};
const sources = ['en', 'fr'].map((language, index) => ({
  language,
  sourceId: index + 1,
  metadata: [
    { meta_key: 'mec_location_id', meta_value: '2' },
    { meta_key: 'mec_organizer_id', meta_value: '3' },
  ],
}));
test('maps source venue/address and organizer independently of registration activation', () => {
  const before = JSON.stringify({ sources, references });
  const result = mapPublicEventDetails(sources, references);
  assert.equal(result.location.en, 'Vimy & Mess — Public address');
  assert.equal(result.location.fr, result.location.en);
  assert.match(result.registration.en, /Organizer: Organizer/);
  assert.match(result.registration.fr, /Organisateur : Organizer/);
  assert.doesNotMatch(result.registration.en, /public@example/);
  assert.equal(result.rsvpEnabled, false);
  assert.equal(result.sourceReferences[0].venueId, '2');
  assert.equal(JSON.stringify({ sources, references }), before);
});
test('public contact requires explicit source review; non-venue taxonomies are not used', () => {
  const result = mapPublicEventDetails(sources, references, {
    reviewedContactIds: ['3'],
  });
  assert.match(result.registration.en, /public@example.test/);
  const invalid = structuredClone(sources);
  invalid[0].metadata[0].meta_value = '1';
  const held = mapPublicEventDetails(invalid, references);
  assert.equal(held.location.en, '');
  assert.ok(
    held.issues.some((issue) => issue.code === 'unresolved-public-venue'),
  );
  assert.equal(held.rsvpEnabled, false);
});
