const express = require('express');
const mongoose = require('mongoose');
const NewsArticle = require('../models/NewsArticle');
const LastPostMessage = require('../models/LastPostMessage');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');
const {
  cleanLocalizedText,
  cleanString,
} = require('../services/content-utils');
const {
  linkMediaAssetToSource,
  deleteContentMediaAssets,
} = require('../services/media-assets');

const router = express.Router();
const MAX_ARTICLES = 48;
const DEFAULT_NEWS_IMAGE_URL =
  'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp';

function isValidImageUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isDefaultNewsImage(value) {
  return cleanString(value) === DEFAULT_NEWS_IMAGE_URL;
}

function getNewsSnapshot(article) {
  const title = article.title?.en || article.title?.fr || 'Untitled news story';
  return {
    title: cleanString(title),
    status: article.status,
    publishedAt: article.publishedAt || null,
  };
}

function serializeArticle(article) {
  return {
    _id: article._id,
    title: cleanLocalizedText(article.title),
    content: cleanLocalizedText(article.content),
    imageUrl: cleanString(article.imageUrl) || DEFAULT_NEWS_IMAGE_URL,
    imageDisplayUrl:
      cleanString(article.imageDisplayUrl) ||
      cleanString(article.imageUrl) ||
      DEFAULT_NEWS_IMAGE_URL,
    status: article.status,
    publishedAt: article.publishedAt || null,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}

function getPayload(body = {}) {
  return {
    title: cleanLocalizedText(body.title),
    content: cleanLocalizedText(body.content),
    imageUrl: cleanString(body.imageUrl) || DEFAULT_NEWS_IMAGE_URL,
    imageDisplayUrl:
      cleanString(body.imageDisplayUrl) ||
      cleanString(body.imageUrl) ||
      DEFAULT_NEWS_IMAGE_URL,
    status: cleanString(body.status) === 'draft' ? 'draft' : 'published',
  };
}

function validatePayload(payload) {
  if (!payload.title.en || !payload.title.fr) {
    return 'English and French titles are required';
  }
  if (!payload.content.en || !payload.content.fr) {
    return 'English and French story content is required';
  }
  if (payload.title.en.length > 240 || payload.title.fr.length > 240) {
    return 'News titles must be 240 characters or fewer';
  }
  if (payload.content.en.length > 20000 || payload.content.fr.length > 20000) {
    return 'News story content must be 20000 characters or fewer';
  }
  if (!isValidImageUrl(payload.imageUrl)) {
    return 'The image URL must begin with http:// or https://';
  }
  if (!isValidImageUrl(payload.imageDisplayUrl)) {
    return 'The display image URL must begin with http:// or https://';
  }
  return '';
}

async function linkArticleImage(article) {
  if (isDefaultNewsImage(article.imageUrl)) {
    return;
  }

  await linkMediaAssetToSource({
    mediaUrl: article.imageUrl,
    sourceType: 'newsArticle',
    context: 'news-story',
    sourceModel: 'NewsArticle',
    sourceId: article._id,
    sourceField: 'imageUrl',
    sourceUrl: `/news-story?id=${encodeURIComponent(String(article._id))}`,
    inferredName: article.title.en || article.title.fr,
  });
}

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 24, 1),
      MAX_ARTICLES,
    );
    const articles = await NewsArticle.find({ status: 'published' })
      .sort({ publishedAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    return res.json({ articles: articles.map(serializeArticle) });
  } catch (error) {
    console.error('Could not load news stories:', error);
    return res.status(500).json({ error: 'Could not load news stories' });
  }
});

router.get('/feed', async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      24,
    );
    const [articles, lastPosts] = await Promise.all([
      NewsArticle.find({ status: 'published' })
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      LastPostMessage.find({ status: 'published' })
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
    ]);
    const items = [
      ...articles.map((article) => ({
        type: 'news',
        _id: article._id,
        title: cleanLocalizedText(article.title),
        content: cleanLocalizedText(article.content),
        imageUrl:
          cleanString(article.imageDisplayUrl) ||
          cleanString(article.imageUrl) ||
          DEFAULT_NEWS_IMAGE_URL,
        publishedAt: article.publishedAt,
      })),
      ...lastPosts.map((post) => ({
        type: 'lastPost',
        _id: post._id,
        title: {
          en:
            [
              post.deceased?.fullRank,
              post.deceased?.firstName,
              post.deceased?.surname,
            ]
              .filter(Boolean)
              .join(' ') || 'In Memoriam',
          fr:
            [
              post.deceased?.fullRank,
              post.deceased?.firstName,
              post.deceased?.surname,
            ]
              .filter(Boolean)
              .join(' ') || 'En mémoire',
        },
        content: cleanLocalizedText(post.messages),
        imageUrl: cleanString(post.imageDisplayUrl || post.imageUrl),
        publishedAt: post.publishedAt,
      })),
    ]
      .sort(
        (first, second) =>
          new Date(second.publishedAt) - new Date(first.publishedAt),
      )
      .slice(0, limit);
    return res.json({ items });
  } catch (error) {
    console.error('Could not load news feed:', error);
    return res.status(500).json({ error: 'Could not load news feed' });
  }
});

router.get(
  '/manage',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      const articles = await NewsArticle.find({})
        .sort({ updatedAt: -1, _id: -1 })
        .limit(MAX_ARTICLES)
        .lean();
      return res.json({ articles: articles.map(serializeArticle) });
    } catch (error) {
      console.error('Could not load managed news stories:', error);
      return res.status(500).json({ error: 'Could not load news stories' });
    }
  },
);

router.get('/:articleId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.articleId)) {
      return res.status(404).json({ error: 'News story not found' });
    }

    const article = await NewsArticle.findOne({
      _id: req.params.articleId,
      status: 'published',
    }).lean();
    if (!article)
      return res.status(404).json({ error: 'News story not found' });

    return res.json({ article: serializeArticle(article) });
  } catch (error) {
    console.error('Could not load news story:', error);
    return res.status(500).json({ error: 'Could not load news story' });
  }
});

router.post(
  '/',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      const payload = getPayload(req.body);
      const validationError = validatePayload(payload);
      if (validationError)
        return res.status(400).json({ error: validationError });
      const now = new Date();
      const article = await NewsArticle.create({
        ...payload,
        createdBy: req.user._id,
        publishedBy: payload.status === 'published' ? req.user._id : null,
        publishedAt: payload.status === 'published' ? now : null,
      });
      await linkArticleImage(article);
      await writeAuditLog({
        req,
        action: 'content.created',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: getNewsSnapshot(article),
        metadata: { status: article.status },
      });
      if (article.status === 'published') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'newsArticle',
          target: article._id,
          targetSnapshot: getNewsSnapshot(article),
          metadata: { source: 'create' },
        });
      }
      return res.status(201).json({ article: serializeArticle(article) });
    } catch (error) {
      console.error('Could not create news story:', error);
      return res.status(500).json({ error: 'Could not create news story' });
    }
  },
);

router.patch(
  '/:articleId',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId))
        return res.status(404).json({ error: 'News story not found' });
      const article = await NewsArticle.findById(req.params.articleId);
      if (!article)
        return res.status(404).json({ error: 'News story not found' });
      const previousStatus = article.status;
      const payload = getPayload(req.body);
      const validationError = validatePayload(payload);
      if (validationError)
        return res.status(400).json({ error: validationError });
      Object.assign(article, payload);
      if (payload.status === 'published' && previousStatus !== 'published') {
        article.publishedAt = new Date();
        article.publishedBy = req.user._id;
      }
      if (payload.status === 'draft') {
        article.publishedAt = null;
        article.publishedBy = null;
      }
      await article.save();
      await linkArticleImage(article);
      await writeAuditLog({
        req,
        action: 'content.updated',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: getNewsSnapshot(article),
        metadata: { previousStatus, status: article.status },
      });
      if (previousStatus !== article.status) {
        await writeAuditLog({
          req,
          action:
            article.status === 'published'
              ? 'content.published'
              : 'content.unpublished',
          actor: req.user,
          targetType: 'newsArticle',
          target: article._id,
          targetSnapshot: getNewsSnapshot(article),
          metadata: { source: 'update' },
        });
      }
      return res.json({ article: serializeArticle(article) });
    } catch (error) {
      console.error('Could not update news story:', error);
      return res.status(500).json({ error: 'Could not update news story' });
    }
  },
);

router.delete(
  '/:articleId',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId))
        return res.status(404).json({ error: 'News story not found' });
      const article = await NewsArticle.findById(req.params.articleId);
      if (!article)
        return res.status(404).json({ error: 'News story not found' });
      await NewsArticle.deleteOne({ _id: article._id });
      if (!isDefaultNewsImage(article.imageUrl)) {
        await deleteContentMediaAssets({
          mediaUrls: [article.imageUrl],
          source: { type: 'newsArticle', id: article._id },
        });
      }
      await writeAuditLog({
        req,
        action: 'content.deleted',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: getNewsSnapshot(article),
      });
      return res.json({ message: 'News story deleted' });
    } catch (error) {
      console.error('Could not delete news story:', error);
      return res.status(500).json({ error: 'Could not delete news story' });
    }
  },
);

module.exports = router;
