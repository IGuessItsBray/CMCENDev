const MISSING_DECEASED_RANK = 'Rank not provided';
const LEGACY_SUBMITTER_RANK = 'Legacy importer';

function normalizeDeceasedRank(value) {
  const rank = String(value || '').trim();
  return rank || MISSING_DECEASED_RANK;
}

module.exports = {
  LEGACY_SUBMITTER_RANK,
  MISSING_DECEASED_RANK,
  normalizeDeceasedRank
};
