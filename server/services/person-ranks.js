// Optional authored translations; never infer a translation from a legacy rank.
function cleanRanks(value = {}, maxLength = 80) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ['en', 'fr'].some(
      (language) =>
        value[language] !== undefined &&
        (typeof value[language] !== 'string' ||
          value[language].trim().length > maxLength),
    )
  ) {
    throw Object.assign(
      new Error('ranks must be an English/French text object'),
      { status: 400 },
    );
  }
  return {
    en: String(value.en || '').trim(),
    fr: String(value.fr || '').trim(),
  };
}

function getPersonRank(person = {}, legacyField = 'rank', language = 'en') {
  const ranks = person.ranks || {};
  return String(
    ranks[language] || person[legacyField] || ranks.en || ranks.fr || '',
  ).trim();
}

module.exports = { cleanRanks, getPersonRank };
