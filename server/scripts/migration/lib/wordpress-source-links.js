const assert = require('node:assert/strict');
const { safeArchiveUrl } = require('../../../services/archive-source-links');

// Explicit source metadata, never a URL guessed from a slug or translation ID.
function retainWordPressSourceLinks(batch, metadata) {
  assert(Array.isArray(batch.items) && !batch.groups, 'Use an unpinned batch');
  const byId = new Map();
  for (const post of metadata) {
    assert(
      Number.isSafeInteger(post.id) && !byId.has(post.id),
      'Duplicate source metadata',
    );
    byId.set(post.id, post);
  }
  const result = structuredClone(batch);
  for (const item of result.items) {
    const records = item.document.legacy?.sourceRecords;
    assert(
      Array.isArray(records) && records.length === item.sources.length,
      'Source records required',
    );
    const seen = new Set();
    for (const record of records) {
      const source = item.sources.find((s) => s.id === record.sourceId);
      assert(
        source &&
          source.language === record.language &&
          ['en', 'fr'].includes(record.language),
        'Source ID/language mismatch',
      );
      assert(!seen.has(record.sourceId), 'Duplicate source record');
      seen.add(record.sourceId);
      const post = byId.get(record.sourceId);
      assert(
        post && post.slug === record.slug && post.status === 'publish',
        'Missing or conflicting verified source metadata',
      );
      assert(
        !post.language || post.language === record.language,
        'Verified source language mismatch',
      );
      assert(
        safeArchiveUrl(post.link) === post.link,
        'Unsafe source permalink',
      );
      for (const key of ['url', 'sourceUrl']) {
        assert(
          record[key] == null ||
            record[key] === '' ||
            record[key] === post.link,
          'Existing source URL conflicts',
        );
      }
      record.url = post.link;
    }
  }
  return result;
}

function assertRetainedSourceLinks(batch) {
  for (const item of batch.items) {
    const records = item.document.legacy?.sourceRecords;
    assert(
      Array.isArray(records) && records.length === item.sources.length,
      'Verified source records and URLs are required before freezing',
    );
    const seen = new Set();
    for (const record of records) {
      const source = item.sources.find((s) => s.id === record.sourceId);
      assert(
        source &&
          source.language === record.language &&
          !seen.has(record.sourceId),
        'Source ID/language mismatch',
      );
      seen.add(record.sourceId);
      assert(
        record.url && safeArchiveUrl(record.url) === record.url,
        'Verified source URLs are required before freezing',
      );
    }
  }
}

module.exports = { retainWordPressSourceLinks, assertRetainedSourceLinks };
