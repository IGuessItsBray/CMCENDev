const HIDDEN_CONTENT_STATUS = 'hidden';

const RESTORABLE_CONTENT_STATUSES = new Set([
  'draft',
  'pending',
  'published',
  'rejected',
]);

function cleanRemovalReason(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 2000);
}

function hideContent(content, { actor, reason } = {}) {
  if (
    !content ||
    content.status === 'pending' ||
    !RESTORABLE_CONTENT_STATUSES.has(content.status)
  ) {
    return null;
  }

  const previousStatus = content.status;
  content.status = HIDDEN_CONTENT_STATUS;
  content.hiddenFromStatus = previousStatus;
  content.hiddenAt = new Date();
  content.hiddenBy = actor?._id || null;
  content.hiddenReason = cleanRemovalReason(reason);

  return {
    previousStatus,
    reason: content.hiddenReason,
  };
}

function restoreContent(content) {
  if (
    !content ||
    content.status !== HIDDEN_CONTENT_STATUS ||
    !RESTORABLE_CONTENT_STATUSES.has(content.hiddenFromStatus)
  ) {
    return null;
  }

  const restoredStatus = content.hiddenFromStatus;
  content.status = restoredStatus;
  content.hiddenFromStatus = '';
  content.hiddenAt = null;
  content.hiddenBy = null;
  content.hiddenReason = '';

  return { restoredStatus };
}

module.exports = {
  HIDDEN_CONTENT_STATUS,
  cleanRemovalReason,
  hideContent,
  restoreContent,
};
