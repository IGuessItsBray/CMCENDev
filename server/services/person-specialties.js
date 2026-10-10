// Authored source text only: never infer a translated specialty from a MOSID.
function cleanTradeRoles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('tradeRoles must be an English/French text object'), { status: 400 });
  }
  const result = {};
  for (const language of ['en', 'fr']) {
    if (value[language] === undefined) continue;
    if (typeof value[language] !== 'string' || value[language].trim().length > 120) {
      throw Object.assign(new Error('tradeRoles must contain text of at most 120 characters per language'), { status: 400 });
    }
    result[language] = value[language].trim();
  }
  return result;
}

module.exports = { cleanTradeRoles };
