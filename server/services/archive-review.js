const crypto = require('crypto');
const catalogue = require('../data/archive-review/pilot-2026-09-26.json');

// Choices describe review decisions only. None execute article or media writes.
const common = ['custom', 'defer'];
const choices = {
  pairing: ['pair', 'separate', ...common],
  discovery: ['research', 'leave-incomplete', ...common],
  translation: ['keep-source', 'request-edit', ...common],
  attachment: ['include', 'skip', ...common],
  provenance: ['accept-source-url', 'research', ...common],
  layout: ['keep-layouts', 'align-layouts', ...common],
};
const approved = new Set([
  'pair',
  'include',
  'accept-source-url',
  'keep-layouts',
]);

function getBatch(id) {
  return catalogue.batches.find((batch) => batch.id === id);
}
function getItem(batch, id) {
  return batch?.items.find((item) => item.id === id);
}
function getArticle(batch, item) {
  return batch.articles.find((article) => article.key === item.articleKey);
}
function itemHash(batch, item) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ item, article: getArticle(batch, item) }))
    .digest('hex');
}
function stateOf(decision, hash) {
  if (!decision || decision.catalogueHash !== hash) return 'pending';
  if (decision.choice === 'defer') return 'deferred';
  return approved.has(decision.choice) ? 'approved' : 'reviewed';
}
function summary(batch, decisions) {
  const counts = { pending: 0, approved: 0, reviewed: 0, deferred: 0 };
  for (const item of batch.items) {
    counts[stateOf(decisions.get(item.id), itemHash(batch, item))] += 1;
  }
  return {
    id: batch.id,
    title: batch.title,
    description: batch.description,
    auditedAt: batch.auditedAt,
    articleCount: batch.articles.length,
    itemCount: batch.items.length,
    counts,
  };
}

module.exports = {
  catalogue,
  choices,
  getBatch,
  getItem,
  getArticle,
  itemHash,
  stateOf,
  summary,
};
