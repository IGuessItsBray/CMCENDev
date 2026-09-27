const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  catalogue,
  choices,
  itemHash,
  stateOf,
  summary,
} = require('../services/archive-review');

test('archive catalogue preserves the 16 real sources and 22 independently reviewed issues', () => {
  const batch = catalogue.batches[0];
  assert.equal(batch.articles.length, 16);
  assert.equal(batch.items.length, 22);
  assert.equal(
    batch.articles.filter((article) => article.sources.fr).length,
    8,
  );
  assert.equal(new Set(batch.items.map((item) => item.id)).size, 22);
  for (const article of batch.articles) {
    for (const source of Object.values(article.sources).filter(Boolean)) {
      assert.equal(new URL(source.url).hostname, 'cmcen-rcmce.ca');
      assert.ok(source.paragraphs.length);
      for (const url of [...source.images, ...source.documents])
        assert.equal(new URL(url).protocol, 'https:');
    }
  }
  for (const item of batch.items) {
    assert.ok(
      batch.articles.some((article) => article.key === item.articleKey),
    );
    assert.ok(choices[item.type].includes(item.recommendedChoice));
    for (const key of ['question', 'recommendation', 'rationale'])
      for (const language of ['en', 'fr']) assert.ok(item[key][language]);
  }
});

test('changed evidence reopens review while retaining the existing decision', () => {
  const batch = structuredClone(catalogue.batches[0]);
  const item = batch.items[0];
  const hash = itemHash(batch, item);
  const decision = { choice: 'pair', catalogueHash: hash };
  assert.equal(stateOf(decision, hash), 'approved');
  assert.equal(stateOf({ ...decision, choice: 'defer' }, hash), 'deferred');
  assert.equal(stateOf({ ...decision, choice: 'custom' }, hash), 'reviewed');
  batch.articles[0].sources.en.paragraphs.push('Changed source');
  assert.notEqual(itemHash(batch, item), hash);
  assert.equal(stateOf(decision, itemHash(batch, item)), 'pending');
  assert.equal(
    summary(batch, new Map([[item.id, decision]])).counts.pending,
    22,
  );
});
