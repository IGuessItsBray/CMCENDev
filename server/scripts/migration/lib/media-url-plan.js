// Preserve provenance and historical snapshots. A plan is for review, not a
// blanket string-replacement operation over the database.
const PRESERVE = new Set([
  'legacy',
  'migrationSource',
  'sourceUrl',
  'fileMetadata',
  'imageMetadata',
  'before',
  'after',
]);

// Explicit legacy-to-canonical storage mappings, not runtime URL rewrites.
const IMAGE_KEY_MOVES = [
  ['leadership/portraits/', 'images/leadership/portraits/'],
  ['association/portraits/', 'images/association/portraits/'],
  ['favicon_crest.png', 'images/favicon_crest.png'],
];

function destinationKey(key) {
  for (const [source, target] of IMAGE_KEY_MOVES) {
    if (source.endsWith('/') ? key.startsWith(source) : key === source) {
      return target + key.slice(source.length);
    }
  }
  return key;
}

function legacySourceKey(key) {
  for (const [source, target] of IMAGE_KEY_MOVES) {
    if (target.endsWith('/') ? key.startsWith(target) : key === target) {
      return source + key.slice(target.length);
    }
  }
  return key;
}

function collectMediaReferences(value, from, to, field = '', results = []) {
  const source = from.replace(/\/+$/u, '') + '/';
  const target = to.replace(/\/+$/u, '') + '/';
  if (typeof value === 'string') {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(`${escaped}([^\\s"'<>\\x60)]+)`, 'gu');
    for (const match of value.matchAll(pattern)) {
      const sourceKey = match[1].split(/[?#]/u)[0];
      const key = destinationKey(sourceKey);
      results.push({
        field,
        key,
        sourceKey,
        currentUrl: match[0],
        proposedUrl: target + key + match[1].slice(sourceKey.length),
      });
    }
    // Portable HTML references also identify objects that must be copied.
    for (const match of value.matchAll(
      /(?<![\w/])\/((?:images|documents)\/[^\s"'<>` )$]+)/gu,
    )) {
      const rawKey = match[1].split(/[?#]/u)[0];
      const key = destinationKey(rawKey);
      results.push({
        field,
        key,
        sourceKey: legacySourceKey(key),
        proposedUrl: target + key + match[1].slice(rawKey.length),
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectMediaReferences(item, from, to, `${field}[${index}]`, results),
    );
  } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [name, item] of Object.entries(value)) {
      if (PRESERVE.has(name)) continue;
      const child = field ? `${field}.${name}` : name;
      if (
        ['imageKey', 'fileKey'].includes(name) &&
        typeof item === 'string' &&
        item
      ) {
        const key = destinationKey(item);
        results.push({
          field: child,
          key,
          sourceKey: legacySourceKey(key),
          proposedUrl: target + key,
        });
      } else collectMediaReferences(item, from, to, child, results);
    }
  }
  return results;
}

module.exports = { collectMediaReferences };
