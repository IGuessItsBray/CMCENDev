const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  LEGACY_SUBMITTER_RANK,
  MISSING_DECEASED_RANK,
  normalizeDeceasedRank
} = require('../scripts/migration/lib/legacy-rank');

test('preserves a rank extracted from a legacy Last Post title', () => {
  assert.equal(normalizeDeceasedRank('LIEUTENANT COLONEL'), 'LIEUTENANT COLONEL');
});

test('supplies required rank values for rankless legacy Last Post records', () => {
  assert.equal(normalizeDeceasedRank(''), MISSING_DECEASED_RANK);
  assert.equal(normalizeDeceasedRank('   '), MISSING_DECEASED_RANK);
  assert.equal(LEGACY_SUBMITTER_RANK, 'Legacy importer');
});
