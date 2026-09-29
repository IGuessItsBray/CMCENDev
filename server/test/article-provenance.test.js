const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planArticleProvenance,
} = require('../scripts/migration/lib/article-provenance');
const mappings =
  require('../scripts/migration/ledger/confirmed-imports.json').articles;
const articles = mappings.map((m) => ({
  _id: m.destinationId,
  migrationSource: m.sourceUrl,
  title: 'Edited title',
  status: 'draft',
}));

test('all 16 confirmed mappings produce explicit IDs without changing content', () => {
  const before = JSON.stringify(articles);
  const plans = planArticleProvenance(articles, mappings);
  assert.equal(plans.length, 16);
  plans.forEach((p) =>
    assert.deepEqual(p.legacy.sourcePostIds, [p.mapping.sourceId]),
  );
  assert.equal(JSON.stringify(articles), before);
  assert.ok(
    planArticleProvenance(
      plans.map((p) => ({ ...p.article, legacy: p.legacy })),
      mappings,
    ).every((p) => !p.change),
  );
});

test('missing records, mismatched URLs, duplicates and conflicting provenance stop the plan', () => {
  assert.throws(() => planArticleProvenance(articles.slice(1), mappings));
  assert.throws(() =>
    planArticleProvenance(
      [
        { ...articles[0], migrationSource: 'https://example.com/' },
        ...articles.slice(1),
      ],
      mappings,
    ),
  );
  assert.throws(() =>
    planArticleProvenance(articles, [...mappings, mappings[0]]),
  );
  assert.throws(() =>
    planArticleProvenance(
      [
        { ...articles[0], legacy: { sourcePostIds: [1] } },
        ...articles.slice(1),
      ],
      mappings,
    ),
  );
});
