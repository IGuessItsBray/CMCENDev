const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  catalogue,
  choices,
  itemHash,
  stateOf,
  summary,
} = require('../services/archive-review');

test('remaining inventory keeps unique sources in seven decision-only categories', () => {
  const batches = catalogue.batches.filter((b) =>
    b.id.startsWith('remaining-'),
  );
  assert.equal(batches.length, 7);
  const existingIds = new Set(
    catalogue.batches
      .filter((b) => !b.id.startsWith('remaining-'))
      .flatMap((b) => b.articles)
      .flatMap((a) => [
        ...Object.values(a.sources),
        ...(a.relatedSources || []),
      ])
      .filter(Boolean)
      .map((s) => s.id),
  );
  const ids = [];
  for (const batch of batches) {
    assert.equal(summary(batch, new Map()).counts.pending, batch.items.length);
    for (const item of batch.items) {
      assert.equal(item.type, 'disposition');
      const article = batch.articles.find((a) => a.key === item.articleKey);
      assert.equal(
        item.recommendedChoice,
        article.languagePairConflict ? 'defer' : 'research',
      );
    }
    for (const article of batch.articles) {
      for (const source of [
        ...Object.values(article.sources),
        ...article.relatedSources,
      ].filter(Boolean)) {
        if (source.languageLinkCandidate) {
          assert.equal(source.id, undefined);
          assert.equal(new URL(source.url).protocol, 'https:');
          continue;
        }
        assert.ok(!existingIds.has(source.id));
        assert.ok(['en', 'fr', 'und'].includes(source.language));
        assert.equal(new URL(source.url).protocol, 'https:');
        ids.push(source.id);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  const inventoryIds =
    require('../data/archive-review/remaining-2026-09-28.json').sourceInventoryIds;
  assert.equal(inventoryIds.length, 1353);
  for (const id of inventoryIds)
    assert.ok(existingIds.has(id) || ids.includes(id));
});

test('language-switcher counterparts share the existing Dennison review item', () => {
  const batch = catalogue.batches.find(
    (b) => b.id === 'last-post-discovery-2026-09-27',
  );
  const article = batch.articles.find((a) => a.key === 'wp-313269');
  assert.equal(article.sources.en.id, 313269);
  assert.equal(article.sources.fr.id, 313271);
  assert.equal(article.languagePairEvidence.kind, 'legacy-language-switcher');
  assert.ok(
    !catalogue.batches
      .filter((b) => b.id.startsWith('remaining-'))
      .some((b) =>
        b.articles.some((a) =>
          Object.values(a.sources).some((s) => s?.id === 313271),
        ),
      ),
  );
});

test('archive catalogue preserves the 16 real sources and 21 independently reviewed issues', () => {
  const batch = catalogue.batches[0];
  assert.equal(batch.articles.length, 16);
  assert.equal(batch.items.length, 21);
  assert.equal(
    batch.articles.filter((article) => article.sources.fr).length,
    8,
  );
  assert.equal(new Set(batch.items.map((item) => item.id)).size, 21);
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
    21,
  );
});

test('comment review exposes redacted evidence and content decisions only', () => {
  const batch = catalogue.batches.find(
    (entry) => entry.id === 'comment-exceptions-2026-09-28',
  );
  assert.ok(batch);
  const serialized = JSON.stringify(batch);
  assert.doesNotMatch(serialized, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(
    serialized,
    /"(?:user_email|user_pass|session_tokens|emailHash|wordpressUserId)"/,
  );
  for (const item of batch.items) {
    assert.equal(item.type, 'disposition');
    assert.ok(choices[item.type].includes(item.recommendedChoice));
    for (const field of ['question', 'recommendation', 'rationale']) {
      assert.ok(item[field].en);
      assert.ok(item[field].fr);
    }
  }
  assert.equal(summary(batch, new Map()).counts.pending, batch.items.length);
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
