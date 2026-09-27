const express = require('express');
const { authMiddleware, requireExactRole } = require('../middleware/auth');
const Decision = require('../models/ArchiveReviewDecision');
const NewsArticle = require('../models/NewsArticle');
const { writeAuditLog } = require('../services/audit-log');
const {
  catalogue,
  choices,
  getBatch,
  getItem,
  getArticle,
  itemHash,
  stateOf,
  summary,
} = require('../services/archive-review');
const router = express.Router();
router.use(authMiddleware, requireExactRole('developer'));
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

async function decisionsFor(batchId) {
  const rows = await Decision.find({ batchId }).select('-history').lean();
  return new Map(rows.map((row) => [row.itemId, row]));
}
function select(req, res) {
  const batch = getBatch(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: 'Batch not found' });
    return null;
  }
  const item = getItem(batch, req.params.itemId);
  if (req.params.itemId && !item) {
    res.status(404).json({ error: 'Review item not found' });
    return null;
  }
  return { batch, item };
}

router.get('/', async (_req, res) => {
  const batches = await Promise.all(
    catalogue.batches.map(async (batch) =>
      summary(batch, await decisionsFor(batch.id)),
    ),
  );
  res.json({ batches });
});
router.get('/:batchId/items', async (req, res) => {
  const selected = select(req, res);
  if (!selected) return;
  const { batch } = selected;
  const {
    state = 'all',
    type = 'all',
    category = 'all',
    search = '',
    offset = '0',
  } = req.query;
  if (
    ![state, type, category, search, offset].every(
      (value) => typeof value === 'string',
    ) ||
    !['all', 'pending', 'approved', 'reviewed', 'deferred'].includes(state) ||
    !['all', ...Object.keys(choices)].includes(type) ||
    search.length > 200 ||
    !/^\d{1,6}$/.test(offset) ||
    !['all', ...batch.articles.map((article) => article.category)].includes(
      category,
    )
  ) {
    return res.status(400).json({ error: 'Invalid review filters' });
  }
  const decisions = await decisionsFor(batch.id);
  const items = batch.items
    .map((item) => {
      const article = getArticle(batch, item),
        hash = itemHash(batch, item),
        decision = decisions.get(item.id);
      return {
        id: item.id,
        articleKey: item.articleKey,
        title: article.title,
        category: article.category,
        type: item.type,
        question: item.question,
        state: stateOf(decision, hash),
        stale: Boolean(decision && decision.catalogueHash !== hash),
      };
    })
    .filter(
      (item) =>
        (state === 'all' || item.state === state) &&
        (type === 'all' || item.type === type) &&
        (category === 'all' || item.category === category) &&
        JSON.stringify([item.title, item.question])
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const start = Number(offset),
    page = items.slice(start, start + 50);
  res.json({
    batch: summary(batch, decisions),
    items: page,
    total: items.length,
    nextOffset: start + page.length < items.length ? start + page.length : null,
  });
});
router.get('/:batchId/items/:itemId', async (req, res) => {
  const selected = select(req, res);
  if (!selected) return;
  const { batch, item } = selected,
    article = getArticle(batch, item),
    hash = itemHash(batch, item);
  const decision = await Decision.findById(`${batch.id}:${item.id}`).lean();
  const destination = await NewsArticle.findOne({
    migrationSource: article.sources.en.url,
  })
    .select('_id status updatedAt title.fr content.fr newsletterBlocks.fr')
    .lean();
  res.json({
    item,
    article,
    catalogueHash: hash,
    choices: choices[item.type],
    state: stateOf(decision, hash),
    stale: Boolean(decision && decision.catalogueHash !== hash),
    decision: decision || null,
    destination: destination
      ? {
          id: String(destination._id),
          status: destination.status,
          updatedAt: destination.updatedAt,
          hasFrench: Boolean(
            destination.title?.fr ||
            destination.content?.fr ||
            destination.newsletterBlocks?.fr?.length,
          ),
        }
      : null,
  });
});
router.put('/:batchId/items/:itemId/decision', async (req, res) => {
  const selected = select(req, res);
  if (!selected) return;
  const { batch, item } = selected,
    hash = itemHash(batch, item);
  const { choice, note, revision, catalogueHash } = req.body || {};
  if (
    !choices[item.type].includes(choice) ||
    typeof note !== 'string' ||
    note.length > 4000 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision > 100000 ||
    typeof catalogueHash !== 'string' ||
    (choice === 'custom' && !note.trim())
  ) {
    return res.status(400).json({ error: 'Invalid review decision' });
  }
  if (catalogueHash !== hash)
    return res.status(409).json({
      error: 'Review evidence changed. Reload this item before deciding.',
    });
  const key = `${batch.id}:${item.id}`;
  const at = new Date(),
    cleanNote = note.trim();
  const entry = {
    choice,
    note: cleanNote,
    revision: revision + 1,
    actor: req.user._id,
    actorName: req.user.accountName || req.user.username,
    at,
  };
  let saved;
  try {
    if (revision === 0) {
      saved = await Decision.create({
        _id: key,
        batchId: batch.id,
        itemId: item.id,
        catalogueHash: hash,
        choice,
        note: cleanNote,
        revision: 1,
        history: [entry],
      });
    } else {
      saved = await Decision.findOneAndUpdate(
        { _id: key, revision },
        {
          $set: { catalogueHash: hash, choice, note: cleanNote },
          $inc: { revision: 1 },
          $push: { history: entry },
        },
        { returnDocument: 'after', runValidators: true },
      );
    }
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  if (!saved)
    return res.status(409).json({
      error: 'Another reviewer saved a decision. Reload before saving again.',
    });
  await writeAuditLog({
    req,
    action: 'archive_review.decision_saved',
    actor: req.user,
    targetType: 'archiveReviewDecision',
    targetSnapshot: { batchId: batch.id, itemId: item.id },
    metadata: { choice, revision: saved.revision, catalogueHash: hash },
  });
  res.json({ decision: saved, state: stateOf(saved, hash) });
});
router.use((error, _req, res, _next) => {
  console.error('Archive review request failed:', error.name);
  res.status(500).json({ error: 'Could not complete archive review request' });
});
module.exports = router;
