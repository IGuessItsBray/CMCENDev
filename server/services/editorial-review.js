const { writeAuditLog } = require('./audit-log');

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

function applyEditorialReviewTransition({
  content,
  action,
  reviewerId,
  rejectionReason,
  scheduledPublishAt = null,
  publishedRejectionReason = null,
  now = new Date(),
}) {
  if (action === 'cancel-schedule') {
    const cancelledScheduledPublishAt = content.scheduledPublishAt;
    content.scheduledPublishAt = null;
    content.scheduledBy = null;
    content.scheduledAt = null;
    content.reviewedBy = null;
    content.reviewedAt = null;
    content.updatedBy = reviewerId;

    return {
      auditAction: 'content.publish_schedule_cancelled',
      auditMetadata: {
        source: 'review',
        scheduledPublishAt: cancelledScheduledPublishAt,
      },
      scheduledPublishAt: null,
    };
  }

  if (action === 'reject') {
    content.status = 'rejected';
    content.rejectionReason = rejectionReason;
    content.publishedBy = null;
    content.publishedAt = null;
    content.scheduledPublishAt = null;
    content.scheduledBy = null;
    content.scheduledAt = null;
  }

  if (action === 'publish') {
    const isScheduled = Boolean(scheduledPublishAt);
    content.rejectionReason = publishedRejectionReason;
    content.scheduledPublishAt = scheduledPublishAt;
    content.scheduledBy = isScheduled ? reviewerId : null;
    content.scheduledAt = isScheduled ? now : null;
    content.status = isScheduled ? 'pending' : 'published';
    content.publishedBy = isScheduled ? null : reviewerId;
    content.publishedAt = isScheduled ? null : now;
  }

  content.updatedBy = reviewerId;
  content.reviewedBy = reviewerId;
  content.reviewedAt = now;

  const isScheduled = action === 'publish' && Boolean(scheduledPublishAt);
  const isRejected = action === 'reject';

  return {
    auditAction: isRejected
      ? 'content.rejected'
      : isScheduled
        ? 'content.publish_scheduled'
        : 'content.published',
    auditMetadata: {
      source: 'review',
      ...(isScheduled ? { scheduledPublishAt } : {}),
      ...(isRejected ? { rejectionReason: content.rejectionReason } : {}),
    },
    scheduledPublishAt: isScheduled ? scheduledPublishAt : null,
  };
}

async function performEditorialReviewTransition({
  req,
  content,
  action,
  reviewerId,
  rejectionReason,
  scheduledPublishAt,
  publishedRejectionReason,
  targetType,
  getSnapshot,
  now,
}) {
  const transition = applyEditorialReviewTransition({
    content,
    action,
    reviewerId,
    rejectionReason,
    scheduledPublishAt,
    publishedRejectionReason,
    now,
  });

  await content.save();

  await writeAuditLog({
    req,
    action: transition.auditAction,
    actor: req.user,
    targetType,
    target: content._id,
    targetSnapshot: getSnapshot(content),
    metadata: transition.auditMetadata,
  });

  return transition;
}

module.exports = {
  applyEditorialReviewTransition,
  getScheduledPublicationDate,
  performEditorialReviewTransition,
};
