const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const RetirementMessage = require('../models/RetirementMessage');
const User = require('../models/User');
const { writeAuditLog } = require('./audit-log');
const {
  getEventSnapshot,
  getLastPostMessageSnapshot,
  getRetirementMessageSnapshot,
} = require('./content-snapshots');

const SCHEDULED_PUBLICATION_INTERVAL_MS = 30 * 1000;
const MAX_PUBLICATIONS_PER_TICK = 100;

function getScheduledPublicationDate(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;

  const scheduledPublishAt = new Date(value);
  if (
    Number.isNaN(scheduledPublishAt.getTime()) ||
    scheduledPublishAt.getTime() <= now.getTime()
  ) {
    return undefined;
  }

  return scheduledPublishAt;
}

const scheduledContentTypes = [
  {
    Model: Event,
    targetType: 'event',
    getSnapshot: getEventSnapshot,
  },
  {
    Model: RetirementMessage,
    targetType: 'retirementMessage',
    getSnapshot: getRetirementMessageSnapshot,
  },
  {
    Model: LastPostMessage,
    targetType: 'lastPost',
    getSnapshot: getLastPostMessageSnapshot,
  },
];

async function publishOneScheduledContent({
  Model,
  targetType,
  getSnapshot,
  now,
}) {
  const scheduled = await Model.findOne({
    status: 'pending',
    scheduledPublishAt: { $ne: null, $lte: now },
  }).sort({ scheduledPublishAt: 1, _id: 1 });

  if (!scheduled) return false;

  const scheduledPublishAt = scheduled.scheduledPublishAt;
  const scheduledBy = scheduled.scheduledBy || null;
  const published = await Model.findOneAndUpdate(
    {
      _id: scheduled._id,
      status: 'pending',
      scheduledPublishAt,
    },
    {
      $set: {
        status: 'published',
        rejectionReason: '',
        reviewedBy: scheduled.reviewedBy || scheduledBy,
        reviewedAt: scheduled.reviewedAt || now,
        updatedBy: scheduledBy,
        publishedBy: scheduledBy,
        publishedAt: now,
        scheduledPublishAt: null,
        scheduledBy: null,
        scheduledAt: null,
      },
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
  getScheduledPublicationDate,
  publishDueContent,
  startScheduledPublicationScheduler,
};
