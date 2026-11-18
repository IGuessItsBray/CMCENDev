'use strict';
const ARCHIVE_HOSTS = new Set([
  'cmcen-rcmce.ca',
  'www.cmcen-rcmce.ca',
  'archive.cmcen-rcmce.ca',
]);
const DISPLAY_ARCHIVE_ORIGIN = 'https://archive.cmcen-rcmce.ca';
function numericPostRoute(parsed) {
  if (parsed.pathname !== '/' || parsed.hash) return null;
  const entries = [...parsed.searchParams];
  if (
    entries.length !== 1 ||
    entries[0][0] !== 'p' ||
    !/^[1-9][0-9]*$/.test(entries[0][1])
  )
    return null;
  const id = Number(entries[0][1]);
  return Number.isSafeInteger(id) ? id : null;
}
function safeArchiveUrl(value, expectedSourceId) {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (/[\\\u0000-\u0020]/u.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !ARCHIVE_HOSTS.has(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      return '';
    if (parsed.pathname === '/') {
      const id = numericPostRoute(parsed);
      if (
        id === null ||
        (expectedSourceId !== undefined && id !== Number(expectedSourceId))
      )
        return '';
    }
    return url;
  } catch {
    return '';
  }
}
function displayArchiveUrl(value, expectedSourceId) {
  const safe = safeArchiveUrl(value, expectedSourceId);
  if (!safe) return '';
  const u = new URL(safe),
    target = new URL(DISPLAY_ARCHIVE_ORIGIN);
  target.pathname = u.pathname;
  target.search = u.search;
  target.hash = u.hash;
  return target.href;
}
function getArchiveSourceLinks(content) {
  const legacy = content.legacy || {},
    links = new Map(),
    conflictingLanguages = new Set();
  const ids = new Set(
    [
      ...(legacy.sourcePostIds || []),
      ...(legacy.sourceRecords || []).filter(Boolean).map((r) => r.sourceId),
      legacy.postId,
      legacy.sourcePostId,
      legacy.wordpressPostId,
    ]
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0),
  );
  const add = (value, language = '', sourceId) => {
    const url = displayArchiveUrl(value, sourceId);
    if (!url) return;
    const parsed = new URL(url);
    if (parsed.pathname === '/' && !ids.has(numericPostRoute(parsed))) return;
    const known = ['en', 'fr'].includes(language) ? language : '',
      prior = links.get(url);
    if (prior?.language && known && prior.language !== known)
      conflictingLanguages.add(url);
    links.set(url, {
      url,
      language: conflictingLanguages.has(url)
        ? ''
        : known || prior?.language || '',
    });
  };
  add(content.migrationSource);
  add(legacy.sourceUrl);
  if (Array.isArray(legacy.sourceUrls))
    legacy.sourceUrls.forEach((url) => add(url));
  if (Array.isArray(legacy.sourceRecords))
    for (const r of legacy.sourceRecords) {
      if (!r || typeof r !== 'object') continue;
      add(r.url, r.language, r.sourceId);
      add(r.sourceUrl, r.language, r.sourceId);
    }
  return [...links.values()];
}
module.exports = {
  getArchiveSourceLinks,
  safeArchiveUrl,
  displayArchiveUrl,
  numericPostRoute,
};
