const express = require('express');
const NewsArticle = require('../models/NewsArticle');
const Page = require('../models/Page');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { canViewPage } = require('./pages');
const { getPublicationDateInfo } = require('../services/publication-date');
const { plainText } = require('../public/newsletter-format');
const router = express.Router();

function card(record, type) {
  const provenance = getPublicationDateInfo(record);
  // Archive dates must come from the source, never the import/publication time.
  const date = provenance.isArchive
    ? provenance.originalPublishedAt
    : record.publishedAt;
  const image = record.blocks?.find((block) => block.type === 'image');
  return {
    id: String(record._id),
    type,
    title: record.title,
    excerpt:
      type === 'page'
        ? record.summary
        : Object.fromEntries(
            ['en', 'fr'].map((lang) => [
              lang,
              (record.layout === 'newsletter'
                ? plainText(record.newsletterBlocks?.[lang])
                : record.content?.[lang] || ''
              ).slice(0, 250),
            ]),
          ),
    imageUrl:
      type === 'page'
        ? image?.mediaVariants?.medium?.url || image?.mediaUrl || ''
        : record.imageDisplayUrl || record.imageUrl || '',
    archive: provenance.isArchive,
    year:
      date && Number.isFinite(new Date(date).getTime())
        ? new Date(date).getUTCFullYear()
        : null,
    url:
      type === 'page'
        ? `/pages/${encodeURIComponent(record.slug)}`
        : `/news-story?id=${encodeURIComponent(String(record._id))}`,
  };
}

router.get('/', optionalAuthMiddleware, async (req, res) => {
  const limit = Number(req.query.limit ?? 24);
  const offset = Number(req.query.offset ?? 0);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 48 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    return res.status(400).json({ error: 'Invalid pagination' });
  }
  // Personalized responses must not be shared between authenticated visitors.
  res.set('Cache-Control', 'private, no-store');
  try {
    const [articles, pages] = await Promise.all([
      NewsArticle.find({ status: 'published', category: 'history-heritage' })
        .select(
          'title content newsletterBlocks layout newsletter imageUrl imageDisplayUrl publishedAt originalPublishedAt legacy migrationSource',
        )
        .lean(),
      Page.find({ status: 'published', category: 'history-heritage' })
        .select(
          'title summary slug blocks access publishedAt originalPublishedAt legacy',
        )
        .lean(),
    ]);
    const records = [
      ...articles.map((record) => ({ record, type: 'article' })),
      ...pages
        .filter((record) => canViewPage(record, req.user))
        .map((record) => ({ record, type: 'page' })),
    ].sort(
      (a, b) =>
        new Date(b.record.publishedAt || 0) -
          new Date(a.record.publishedAt || 0) ||
        String(b.record._id).localeCompare(String(a.record._id)),
    );
    return res.json({
      items: records
        .slice(offset, offset + limit)
        .map(({ record, type }) => card(record, type)),
      hasMore: records.length > offset + limit,
    });
  } catch (error) {
    console.error('Heritage feed failed:', error);
    return res.status(500).json({ error: 'Could not load heritage content' });
  }
});
module.exports = router;
