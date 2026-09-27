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

test('discovery review retains every inventoried Heritage source, including placeholders', () => {
  const batches = catalogue.batches.slice(1);
  assert.equal(
    new Set(catalogue.batches.map((b) => b.id)).size,
    catalogue.batches.length,
  );
  for (const batch of batches) {
    assert.equal(
      new Set(batch.items.map((i) => i.id)).size,
      batch.items.length,
    );
    for (const item of batch.items) {
      assert.ok(batch.articles.some((a) => a.key === item.articleKey));
      assert.ok(choices[item.type].includes(item.recommendedChoice));
    }
    for (const article of batch.articles) {
      assert.ok(article.sources.en || article.sources.fr);
      for (const source of [
        ...Object.values(article.sources),
        ...(article.relatedSources || []),
      ].filter(Boolean)) {
        assert.equal(new URL(source.url).protocol, 'https:');
        assert.ok(source.paragraphs.length);
      }
    }
  }
  const heritage = batches.find(
    (b) => b.id === 'heritage-discovery-2026-09-27',
  );
  const ids = heritage.articles.flatMap((a) =>
    Object.values(a.sources)
      .filter(Boolean)
      .map((s) => s.id),
  );
  assert.equal(ids.length, 48);
  assert.equal(new Set(ids).size, 48);
  for (const id of [298191, 298460, 298812, 298806, 298712, 298703, 298673])
    assert.ok(ids.includes(id));
  assert.equal(
    stateOf({ choice: 'exclude', catalogueHash: 'x' }, 'x'),
    'reviewed',
  );
  const batch = structuredClone(batches[0]);
  const item = batch.items.find((i) => i.articleKey === 'wp-345318');
  const before = itemHash(batch, item);
  batch.articles
    .find((a) => a.key === item.articleKey)
    .relatedSources[0].paragraphs.push('New evidence');
  assert.notEqual(itemHash(batch, item), before);
});
