const express = require('express');
const { buildPublicMediaUrl } = require('../services/media-library');
const { markContentEdited } = require('../services/content-edit-metadata');
const mongoose = require('mongoose');
const NewsArticle = require('../models/NewsArticle');
const LastPostMessage = require('../models/LastPostMessage');
const Page = require('../models/Page');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');
const { recordContentRevision } = require('../services/content-revisions');
const { getScheduledPublicationDate } = require('../services/editorial-review');
const {
  hideContent,
  restoreContent,
} = require('../services/content-lifecycle');
const {
  cleanLocalizedText,
  cleanString,
} = require('../services/content-utils');
const {
  linkMediaAssetToSource,
  deleteContentMediaAssets,
} = require('../services/media-assets');

const {
  imageUrls,
  plainText,
  displayDate,
} = require('../public/newsletter-format');
const {
  normalizeBlocks,
  publicDateStages,
} = require('../services/newsletter-content');
const MediaAsset = require('../models/MediaAsset');
const router = express.Router();
const MAX_ARTICLES = 48;
const DEFAULT_NEWS_IMAGE_URL = buildPublicMediaUrl(
  'images/branch-crest/large.webp',
);

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
    scheduledPublishAt: article.scheduledPublishAt || null,
  };
}

function getNewsRevisionSnapshot(article) {
  return {
    layout: article.layout || 'standard',
    newsletter: article.newsletter?.toObject?.() || article.newsletter || {},
    title: cleanLocalizedText(article.title),
    content: cleanLocalizedText(article.content),
    newsletterBlocks: article.newsletterBlocks?.toObject?.() ||
      article.newsletterBlocks || { en: [], fr: [] },
    imageUrl: cleanString(article.imageUrl),
    imageDisplayUrl: cleanString(article.imageDisplayUrl),
    status: cleanString(article.status),
  };
}

async function recordNewsArticleRevisions({ article, before, actor, note }) {
  const after = getNewsRevisionSnapshot(article);

  for (const language of ['en', 'fr']) {
    const languageBefore = {
      title: before.title[language],
      content: before.content[language],
      blocks: before.newsletterBlocks[language] || [],
    };
    const languageAfter = {
      title: after.title[language],
      content: after.content[language],
      blocks: after.newsletterBlocks[language] || [],
    };
    const fields = Object.keys(languageAfter).filter(
      (field) =>
        JSON.stringify(languageBefore[field]) !==
        JSON.stringify(languageAfter[field]),
    );

    if (fields.length) {
      await recordContentRevision({
        contentType: 'newsArticle',
        content: article,
        actor,
        status: article.status,
        language,
        fields,
        before: languageBefore,
        after: languageAfter,
        note,
      });
    }
  }

  const detailsBefore = {
    layout: before.layout,
    newsletter: before.newsletter,
    imageUrl: before.imageUrl,
    imageDisplayUrl: before.imageDisplayUrl,
    status: before.status,
  };
  const detailsAfter = {
    layout: after.layout,
    newsletter: after.newsletter,
    imageUrl: after.imageUrl,
    imageDisplayUrl: after.imageDisplayUrl,
    status: after.status,
  };
  const detailFields = Object.keys(detailsAfter).filter(
    (field) =>
      JSON.stringify(detailsBefore[field]) !==
      JSON.stringify(detailsAfter[field]),
  );

  if (detailFields.length) {
    await recordContentRevision({
      contentType: 'newsArticle',
      content: article,
      actor,
      status: article.status,
      fields: detailFields,
      before: detailsBefore,
      after: detailsAfter,
      note,
    });
  }
}

function serializeArticle(article) {
  return {
    excerpt: Object.fromEntries(
      ['en', 'fr'].map((language) => [
        language,
        (article.layout === 'newsletter'
          ? plainText(article.newsletterBlocks?.[language])
          : article.content?.[language] || ''
        ).slice(0, 500),
      ]),
    ),
    _id: article._id,
    displayDate: displayDate(article),
    newsletterBlocks: article.newsletterBlocks || { en: [], fr: [] },
    layout: article.layout || 'standard',
    newsletter: article.newsletter?.toObject?.() || article.newsletter || {},
    title: cleanLocalizedText(article.title),
    content: cleanLocalizedText(article.content),
    imageUrl: cleanString(article.imageUrl) || DEFAULT_NEWS_IMAGE_URL,
    imageDisplayUrl:
      cleanString(article.imageDisplayUrl) ||
      cleanString(article.imageUrl) ||
      DEFAULT_NEWS_IMAGE_URL,
    status: article.status,
    publishedAt: article.publishedAt || null,
    scheduledPublishAt: article.scheduledPublishAt || null,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}

function getPayload(
  body = {},
  { preserveHiddenStatus = false, existing = {} } = {},
) {
  return {
    layout: body.layout ?? existing.layout ?? 'standard',
    newsletterBlocks: body.newsletterBlocks ??
      existing.newsletterBlocks ?? { en: [], fr: [] },
    newsletter: Object.fromEntries(
      [
        'author',
        'issue',
        'kicker',
        'date',
        'language',
        'sourceUrl',
        'headerCrest',
        'archived',
      ].map((key) => [
        key,
        body.newsletter?.[key] ??
          existing.newsletter?.[key] ??
          (['headerCrest', 'archived'].includes(key)
            ? false
            : key === 'language'
              ? 'en'
              : ''),
      ]),
    ),
    title: cleanLocalizedText(body.title),
    content: cleanLocalizedText(body.content),
    imageUrl: cleanString(body.imageUrl) || DEFAULT_NEWS_IMAGE_URL,
    imageDisplayUrl:
      cleanString(body.imageDisplayUrl) ||
      cleanString(body.imageUrl) ||
      DEFAULT_NEWS_IMAGE_URL,
    status: preserveHiddenStatus
      ? 'hidden'
      : cleanString(body.status) === 'draft'
        ? 'draft'
        : 'published',
  };
}

function validatePayload(payload) {
  if (!['standard', 'newsletter'].includes(payload.layout || 'standard'))
    return 'Invalid article layout';
  if (payload.layout === 'newsletter') {
    try {
      payload.newsletterBlocks = Object.fromEntries(
        ['en', 'fr'].map((language) => [
          language,
          normalizeBlocks(payload.newsletterBlocks?.[language] || []),
        ]),
      );
      payload.content = Object.fromEntries(
        ['en', 'fr'].map((language) => [
          language,
          plainText(payload.newsletterBlocks[language]),
        ]),
      );
    } catch {
      return 'Invalid newsletter blocks';
    }
  }
  const metadata = payload.newsletter || {};
  if (!['en', 'fr'].includes(metadata.language))
    return 'Choose English or French';
  for (const [key, limit] of Object.entries({
    author: 240,
    issue: 240,
    kicker: 120,
    date: 10,
    sourceUrl: 2000,
  })) {
    if (typeof metadata[key] !== 'string' || metadata[key].length > limit)
      return 'Invalid newsletter metadata';
  }
  if (typeof metadata.headerCrest !== 'boolean') return 'Invalid crest setting';
  if (typeof metadata.archived !== 'boolean') return 'Invalid archive setting';
  if (metadata.archived && !metadata.date)
    return 'Archived issues require their original publication date';
  if (
    metadata.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date) ||
      Number.isNaN(Date.parse(metadata.date)) ||
      new Date(metadata.date).toISOString().slice(0, 10) !== metadata.date)
  )
    return 'Invalid original publication date';
  if (metadata.sourceUrl && !isValidImageUrl(metadata.sourceUrl))
    return 'Invalid source URL';
  if (
    payload.layout === 'newsletter' &&
    (!payload.title[metadata.language] || !payload.content[metadata.language])
  )
    return 'Title and content are required in the original language';
  if (payload.layout !== 'newsletter') {
    payload.newsletter.archived = false;
    payload.newsletterBlocks = { en: [], fr: [] };
  }
  if (
    payload.layout !== 'newsletter' &&
    (!payload.title.en || !payload.title.fr)
  ) {
    return 'English and French titles are required';
  }
  if (
    payload.layout !== 'newsletter' &&
    (!payload.content.en || !payload.content.fr)
  ) {
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
  for (const mediaUrl of imageUrls(article)) {
    await linkMediaAssetToSource({
      mediaUrl,
      sourceType: 'newsArticle',
      context: 'newsletter',
      sourceModel: 'NewsArticle',
      sourceId: article._id,
      sourceField: 'content',
      sourceUrl: `/news-story?id=${article._id}`,
      inferredName: article.title.en || article.title.fr,
    });
  }
  if (isDefaultNewsImage(article.imageUrl)) return;

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
    const articles = await NewsArticle.aggregate([
      { $match: { status: 'published' } },
      ...publicDateStages,
      { $limit: limit },
    ]);
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
    const [articles, lastPosts, featuredPages] = await Promise.all([
      NewsArticle.find({
        status: 'published',
        'newsletter.archived': { $ne: true },
      })
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      LastPostMessage.find({ status: 'published' })
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      Page.find({
        status: 'published',
        featuredOnHome: true,
        $or: [
          { 'access.audience': 'public' },
          { 'access.audience': { $exists: false } },
          { access: { $exists: false } },
        ],
      })
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
    ]);
    const items = [
      ...articles.map((article) => ({
        type: 'news',
        _id: article._id,
        layout: article.layout || 'standard',
        newsletter:
          article.newsletter?.toObject?.() || article.newsletter || {},
        title: cleanLocalizedText(article.title),
        content: Object.fromEntries(
          ['en', 'fr'].map((language) => [
            language,
            article.layout === 'newsletter'
              ? plainText(article.newsletterBlocks?.[language])
              : article.content?.[language] || '',
          ]),
        ),
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
      ...featuredPages.map((page) => ({
        type: 'page',
        _id: page._id,
        title: cleanLocalizedText(page.title),
        content: cleanLocalizedText(page.summary),
        imageUrl: '',
        route: `/pages/${page.slug}`,
        publishedAt: page.publishedAt,
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

router.get(
  '/media',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    const limit = Number(req.query.limit || 24);
    const offset = Number(req.query.cursor || 0);
    const search = String(req.query.search || '');
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 60 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      search.length > 120
    )
      return res.status(400).json({ error: 'Invalid media query' });
    const pattern = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    const filter = {
      $and: [
        {
          $or: [
            { mimeType: /^image\// },
            { url: /\.(png|jpe?g|webp|gif|avif)(\?|$)/i },
          ],
        },
        {
          $or: ['key', 'displayName', 'inferredName', 'originalName'].map(
            (key) => ({ [key]: pattern }),
          ),
        },
      ],
    };
    try {
      const media = await MediaAsset.find(filter)
        .select(
          'key url width height variants displayName inferredName originalName',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit + 1)
        .lean();
      return res.json({
        media: media.slice(0, limit),
        nextCursor: media.length > limit ? String(offset + limit) : '',
      });
    } catch {
      return res.status(500).json({ error: 'Could not load article media' });
    }
  },
);

router.get(
  '/:articleId/preview',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId))
        return res.status(404).json({ error: 'News story not found' });
      const article = await NewsArticle.findById(req.params.articleId).lean();
      if (!article)
        return res.status(404).json({ error: 'News story not found' });
      res.set('Cache-Control', 'no-store');
      return res.json({ article: serializeArticle(article) });
    } catch {
      return res.status(500).json({ error: 'Could not load news preview' });
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
  '/:articleId/publication',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId)) {
        return res.status(404).json({ error: 'News story not found' });
      }
      const { action } = req.body || {};
      if (!['publish', 'cancel-schedule'].includes(action)) {
        return res
          .status(400)
          .json({ error: 'Unsupported publication action' });
      }
      const now = new Date();
      const scheduledPublishAt = getScheduledPublicationDate(
        req.body?.scheduledPublishAt,
        now,
      );
      if (action === 'publish' && scheduledPublishAt === undefined) {
        return res
          .status(400)
          .json({ error: 'Choose a future publication date and time' });
      }
      const article = await NewsArticle.findById(req.params.articleId);
      if (!article)
        return res.status(404).json({ error: 'News story not found' });
      if (article.status !== 'draft') {
        return res.status(409).json({
          error: 'Only draft news stories can be published or scheduled',
        });
      }
      const previousSchedule = article.scheduledPublishAt;
      const before = getNewsRevisionSnapshot(article);
      if (action === 'cancel-schedule' && !previousSchedule) {
        return res
          .status(409)
          .json({ error: 'This news story is not scheduled' });
      }
      if (action === 'publish') {
        const validationError = validatePayload(article);
        if (validationError)
          return res.status(400).json({ error: validationError });
      }
      const schedule = action === 'publish' ? scheduledPublishAt : null;
      const publishNow = action === 'publish' && !schedule;
      article.status = publishNow ? 'published' : 'draft';
      article.publishedAt = publishNow ? now : null;
      article.publishedBy = publishNow ? req.user._id : null;
      article.scheduledPublishAt = schedule;
      article.scheduledBy = schedule ? req.user._id : null;
      article.scheduledAt = schedule ? now : null;
      await article.save();
      await recordNewsArticleRevisions({ article, before, actor: req.user });
      await writeAuditLog({
        req,
        actor: req.user,
        action:
          action === 'cancel-schedule'
            ? 'content.publish_schedule_cancelled'
            : schedule
              ? 'content.publish_scheduled'
              : 'content.published',
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: getNewsSnapshot(article),
        metadata: {
          source: 'publication',
          scheduledPublishAt: schedule || previousSchedule || null,
        },
      });
      return res.json({ article: serializeArticle(article) });
    } catch (error) {
      if (error.name === 'VersionError') {
        return res.status(409).json({
          error: 'This story changed. Reload it before trying again.',
        });
      }
      console.error('Could not change news publication:', error);
      return res
        .status(500)
        .json({ error: 'Could not change news publication' });
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
      const before = getNewsRevisionSnapshot(article);
      const payload = getPayload(req.body, {
        preserveHiddenStatus: article.status === 'hidden',
        existing: article,
      });
      const validationError = validatePayload(payload);
      if (validationError)
        return res.status(400).json({ error: validationError });
      Object.assign(article, payload);
      markContentEdited(article, req.user);
      if (payload.status === 'published' && previousStatus !== 'published') {
        article.publishedAt = new Date();
        article.publishedBy = req.user._id;
      }
      if (payload.status !== 'draft') {
        article.scheduledPublishAt = null;
        article.scheduledBy = null;
        article.scheduledAt = null;
      }
      if (payload.status === 'draft') {
        article.publishedAt = null;
        article.publishedBy = null;
      }
      await article.save();
      await linkArticleImage(article);
      await recordNewsArticleRevisions({
        article,
        before,
        actor: req.user,
        note: req.body?.revisionNote,
      });
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
      if (error.name === 'VersionError') {
        return res.status(409).json({
          error: 'This story changed. Reload it before trying again.',
        });
      }
      console.error('Could not update news story:', error);
      return res.status(500).json({ error: 'Could not update news story' });
    }
  },
);

router.patch(
  '/:articleId/hide',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId)) {
        return res.status(404).json({ error: 'News story not found' });
      }

      const article = await NewsArticle.findById(req.params.articleId);
      if (!article) {
        return res.status(404).json({ error: 'News story not found' });
      }
      if (article.status !== 'published') {
        return res.status(409).json({
          error: 'Only published news stories can be removed from public view',
        });
      }

      const snapshot = getNewsSnapshot(article);
      const removal = hideContent(article, {
        actor: req.user,
        reason: req.body?.reason,
      });
      if (!removal) {
        return res.status(409).json({
          error: 'News story is already removed or cannot be removed',
        });
      }

      await article.save();
      await writeAuditLog({
        req,
        action: 'content.hidden',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: snapshot,
        metadata: {
          previousStatus: removal.previousStatus,
          reason: removal.reason,
        },
      });

      return res.json({
        message: 'News story removed from public view',
        article: serializeArticle(article),
      });
    } catch (error) {
      console.error('Could not remove news story from public view:', error);
      return res
        .status(500)
        .json({ error: 'Could not remove news story from public view' });
    }
  },
);

router.patch(
  '/:articleId/restore',
  authMiddleware,
  requirePermission('canManageNews'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.articleId)) {
        return res.status(404).json({ error: 'News story not found' });
      }

      const article = await NewsArticle.findById(req.params.articleId);
      if (!article) {
        return res.status(404).json({ error: 'News story not found' });
      }

      const snapshot = getNewsSnapshot(article);
      const restoration = restoreContent(article);
      if (!restoration || restoration.restoredStatus !== 'published') {
        return res.status(409).json({
          error: 'News story is not available to restore',
        });
      }

      await article.save();
      await writeAuditLog({
        req,
        action: 'content.restored',
        actor: req.user,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: snapshot,
        metadata: { restoredStatus: restoration.restoredStatus },
      });

      return res.json({
        message: 'News story restored',
        article: serializeArticle(article),
      });
    } catch (error) {
      console.error('Could not restore news story:', error);
      return res.status(500).json({ error: 'Could not restore news story' });
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
