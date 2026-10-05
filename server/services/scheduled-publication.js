const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const RetirementMessage = require('../models/RetirementMessage');
const NewsArticle = require('../models/NewsArticle');
const User = require('../models/User');
const { getPublicationDateInfo } = require('./publication-date');
const { writeAuditLog } = require('./audit-log');
const {
  getEventSnapshot,
  getLastPostMessageSnapshot,
  getRetirementMessageSnapshot,
} = require('./content-snapshots');

const SCHEDULED_PUBLICATION_INTERVAL_MS = 30 * 1000;
const MAX_PUBLICATIONS_PER_TICK = 100;

const scheduledContentTypes = [
  {
    Model: NewsArticle,
    targetType: 'newsArticle',
    publicationFilter: {
      $or: [
        { layout: { $ne: 'newsletter' }, 'title.en': /\S/u, 'title.fr': /\S/u,
          'content.en': /\S/u, 'content.fr': /\S/u },
        { layout: 'newsletter', 'newsletter.language': 'en', 'title.en': /\S/u, 'content.en': /\S/u },
        { layout: 'newsletter', 'newsletter.language': 'fr', 'title.fr': /\S/u, 'content.fr': /\S/u },
      ],
    },
    unpublishedStatus: 'draft',
    getSnapshot: (article) => ({
      title: article.title?.en || article.title?.fr || 'Untitled news story',
      status: article.status,
      publishedAt: article.publishedAt,
    }),
  },
  {
    Model: Event,
    targetType: 'event',
    publicationFilter: { $or: [{ 'title.en': /\S/u }, { 'title.fr': /\S/u }] },
    unpublishedStatus: { $in: ['draft', 'pending'] },
    getSnapshot: getEventSnapshot,
  },
  {
    Model: RetirementMessage,
    targetType: 'retirementMessage',
    publicationFilter: { 'messages.en': /\S/u, 'messages.fr': /\S/u },
    unpublishedStatus: { $in: ['draft', 'pending'] },
    getSnapshot: getRetirementMessageSnapshot,
  },
  {
    Model: LastPostMessage,
    targetType: 'lastPost',
    publicationFilter: { 'messages.en': /\S/u, 'messages.fr': /\S/u },
    unpublishedStatus: { $in: ['draft', 'pending'] },
    getSnapshot: getLastPostMessageSnapshot,
  },
];

async function publishOneScheduledContent({
  Model,
  targetType,
  getSnapshot,
  unpublishedStatus = 'pending',
  publicationFilter = {},
  now,
}) {
  const scheduled = await Model.findOne({
    ...publicationFilter,
    status: unpublishedStatus,
    scheduledPublishAt: { $ne: null, $lte: now },
  }).sort({ scheduledPublishAt: 1, _id: 1 });

  if (!scheduled) return false;

  const scheduledPublishAt = scheduled.scheduledPublishAt;
  const scheduledBy = scheduled.scheduledBy || null;
  const publishedAt =
    scheduled.publicationDateChoice === 'original'
      ? getPublicationDateInfo(scheduled, now).originalPublishedAt
      : now;
  // Never silently substitute today if a saved original-date choice is invalid.
  if (!publishedAt)
    throw new Error('Scheduled content has no valid original publication date');
  const published = await Model.findOneAndUpdate(
    {
      ...publicationFilter,
      _id: scheduled._id,
      status: scheduled.status,
      scheduledPublishAt,
      ...(targetType === 'newsArticle' ? { __v: scheduled.__v } : {}),
    },
    {
      $set: {
        status: 'published',
        ...(targetType === 'newsArticle'
          ? {}
          : {
              rejectionReason: '',
              reviewedBy: scheduled.reviewedBy || scheduledBy,
              reviewedAt: scheduled.reviewedAt || now,
              updatedBy: scheduledBy,
            }),
        publishedBy: scheduledBy,
        publishedAt,
        scheduledPublishAt: null,
        scheduledBy: null,
        scheduledAt: null,
      },
      ...(targetType === 'newsArticle' ? { $inc: { __v: 1 } } : {}),
    },
    { returnDocument: 'after' },
  );

  if (!published) return true;

  const actor = scheduledBy
    ? await User.findById(scheduledBy)
        .select('username email accountName role')
        .lean()
    : null;

  await writeAuditLog({
    action: 'content.published',
    actor: actor || scheduledBy,
    targetType,
    target: published._id,
    targetSnapshot: getSnapshot(published),
    metadata: {
      source: 'scheduled-publication',
      publicationDateChoice: scheduled.publicationDateChoice,
      publishedAt,
      scheduledPublishAt,
    },
  });

  return true;
}

async function publishDueContent(now = new Date()) {
  let publishedCount = 0;

  for (let attempts = 0; attempts < MAX_PUBLICATIONS_PER_TICK; attempts += 1) {
    let foundScheduledContent = false;

    for (const contentType of scheduledContentTypes) {
      const processed = await publishOneScheduledContent({
        ...contentType,
        now,
      });
      foundScheduledContent ||= processed;
      if (processed) publishedCount += 1;
    }

    if (!foundScheduledContent) break;
  }

  return publishedCount;
}

function startScheduledPublicationScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await publishDueContent();
    } catch (error) {
      console.error('Scheduled publication job failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, SCHEDULED_PUBLICATION_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

module.exports = {
  publishDueContent,
  startScheduledPublicationScheduler,
};
