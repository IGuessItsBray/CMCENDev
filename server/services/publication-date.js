// Original dates are provenance, not the time staff approved publication here.
const publicationDateFields = {
  originalPublishedAt: { type: Date, default: undefined },
  publicationDateChoice: {
    type: String,
    enum: ['original', 'now'],
    default: undefined,
  },
};

function validDate(value, now) {
  if (!value || (typeof value !== 'string' && !(value instanceof Date)))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date <= now ? date : null;
}

function getPublicationDateInfo(content, now = new Date()) {
  const legacy = content.legacy || {};
  const isArchive = Boolean(
    content.originalPublishedAt ||
    legacy.originalPublishedAt ||
    legacy.source ||
    content.migrationSource ||
    content.newsletter?.archived,
  );
  let original = content.originalPublishedAt || legacy.originalPublishedAt;
  if (!original && content.newsletter?.archived && content.newsletter.date)
    original = `${content.newsletter.date}T12:00:00.000Z`;
  if (!original && legacy.originalStatus === 'publish') {
    const records = Array.isArray(legacy.sourceRecords)
      ? legacy.sourceRecords
      : [];
    const record =
      records.find((r) => r.language === (content.messageLanguage || 'en')) ||
      records[0];
    if (record?.sourceStatus === 'publish')
      original =
        record.publishedAt ||
        (record.createdGmt && `${record.createdGmt.replace(' ', 'T')}Z`);
  }
  // WordPress exposes approved comments using their original comment date.
  // An unapproved comment has no original public date to offer.
  if (!original && legacy.wordpressCommentId && legacy.originalApproval === '1')
    original = content.createdAt;
  return { isArchive, originalPublishedAt: validDate(original, now) };
}

function selectPublicationDate(content, choice, now = new Date()) {
  const info = getPublicationDateInfo(content, now);
  const fail = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
  };
  if (choice !== undefined && !['original', 'now'].includes(choice))
    fail('Publication date choice must be original or now');
  if (info.isArchive && choice === undefined)
    fail(
      'Choose the original publication date or the current publication time',
    );
  if (choice === 'original' && !info.originalPublishedAt)
    fail('No original publication date is available');
  if (info.originalPublishedAt)
    content.originalPublishedAt = info.originalPublishedAt;
  if (info.isArchive || choice !== undefined)
    content.publicationDateChoice = choice;
  return choice === 'original' ? info.originalPublishedAt : now;
}

module.exports = {
  publicationDateFields,
  getPublicationDateInfo,
  selectPublicationDate,
};
