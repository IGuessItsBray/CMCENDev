function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanLocalizedText(value) {
  return {
    en: cleanString(value?.en),
    fr: cleanString(value?.fr),
  };
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function parseAffirmativeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getValidationErrorMessage(error) {
  return Object.values(error.errors || {})
    .map((item) => item.message)
    .join(', ');
}

module.exports = {
  cleanLocalizedText,
  cleanString,
  getValidationErrorMessage,
  parseAffirmativeBoolean,
  parseBoolean,
  parseDateOnly,
};
