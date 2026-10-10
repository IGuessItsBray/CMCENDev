const assert = require('node:assert/strict');

// Parse only the suffix of an explicitly reviewed name, never guess a person's
// name/rank or translate a specialty from its MOSID.
function titleTradeRole(title) {
  assert.equal(typeof title, 'string', 'A retained source title is required');
  const match = title.match(/[-–—]\s*(\d{5}(?:-\d{2})?(?:\s*,\s*[^\r\n]+)?)\s*$/u);
  const value = match ? match[1].trim() : '';
  assert(value.length <= 120, 'Source specialty exceeds the model limit');
  return value;
}

function parseNoticeTitleSuffix(title, reviewedName) {
  assert.equal(typeof title, 'string', 'A retained source title is required');
  assert(typeof reviewedName === 'string' && reviewedName.trim(), 'A reviewed source name is required');
  const name = reviewedName.trim();
  const start = title.indexOf(name);
  assert(start !== -1 && title.indexOf(name, start + name.length) === -1,
    'Source name/title mismatch requires review');
  assert((start === 0 || /[\s,–—-]/u.test(title[start - 1])) &&
    (start + name.length === title.length || /[\s,–—-]/u.test(title[start + name.length])),
  'Source name/title boundary mismatch requires review');
  const tail = title.slice(start + name.length).trim().replace(/^,\s*/u, '');
  const split = tail.match(/^(.*?)\s*[-–—]\s*(\d{5}(?:-\d{2})?(?:\s*,\s*[^\r\n]+)?)\s*$/u);
  const postNominals = (split ? split[1] : tail).trim().replace(/,\s*$/u, '');
  assert(!/\d{5}|[-–—]/u.test(postNominals),
    'Ambiguous title suffix requires review; specialty cannot become post-nominals');
  assert(postNominals.length <= 120, 'Source post-nominals exceed the model limit');
  const tradeRole = split ? split[2].trim() : '';
  assert(tradeRole.length <= 120, 'Source specialty exceeds the model limit');
  return { postNominals, tradeRole };
}

function prepareRetirementIdentity(retiree, sourceRecords, primaryLanguage = 'en') {
  assert(['en', 'fr'].includes(primaryLanguage), 'Unsupported primary language');
  assert(Array.isArray(sourceRecords), 'Retained bilingual source records required');
  assert(sourceRecords.every(s => ['en', 'fr'].includes(s.language)) &&
    new Set(sourceRecords.map(s => s.language)).size === sourceRecords.length,
  'Source languages must be unique');
  const primary = sourceRecords.find(s => s.language === primaryLanguage);
  assert(primary, 'Primary source title is required');
  const suffix = parseNoticeTitleSuffix(primary.title,
    [retiree.firstName, retiree.lastName].filter(Boolean).join(' '));
  const tradeRoles = Object.fromEntries(sourceRecords.map(source =>
    [source.language, titleTradeRole(source.title)]));
  // Rank/name differences remain explicitly reviewed input and source provenance.
  // This is a pure preparation function, never an update of an existing record.
  return { ...retiree, ...suffix, tradeRoles };
}

module.exports = { titleTradeRole, parseNoticeTitleSuffix, prepareRetirementIdentity };
