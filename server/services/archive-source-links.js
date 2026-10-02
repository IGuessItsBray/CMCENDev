const ARCHIVE_HOSTS = new Set(['cmcen-rcmce.ca', 'www.cmcen-rcmce.ca']);

function safeArchiveUrl(value) {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !ARCHIVE_HOSTS.has(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname === '/'
    )
      return '';
    return url;
  } catch {
    return '';
  }
}

function getArchiveSourceLinks(content) {
  const legacy = content.legacy || {};
  const links = new Map();
  const conflictingLanguages = new Set();
  const add = (value, language = '') => {
    const url = safeArchiveUrl(value);
    if (!url) return;
    const knownLanguage = ['en', 'fr'].includes(language) ? language : '';
    const prior = links.get(url);
    if (prior?.language && knownLanguage && prior.language !== knownLanguage)
      conflictingLanguages.add(url);
    links.set(url, {
      url,
      language: conflictingLanguages.has(url)
        ? ''
        : knownLanguage || prior?.language || '',
    });
  };
  add(content.migrationSource);
  add(legacy.sourceUrl);
  if (Array.isArray(legacy.sourceUrls))
    legacy.sourceUrls.forEach((url) => add(url));
  if (Array.isArray(legacy.sourceRecords)) {
    for (const record of legacy.sourceRecords) {
      if (!record || typeof record !== 'object') continue;
      add(record.url, record.language);
      add(record.sourceUrl, record.language);
    }
  }
  return [...links.values()];
}

module.exports = { getArchiveSourceLinks, safeArchiveUrl };
