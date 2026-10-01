// Original dates are provenance, not the time staff approved publication here.
const publicationDateFields = {
  originalPublishedAt: { type: Date, default: undefined },
  publicationDateChoice: {
    type: String,
    enum: ['original', 'now', 'custom'],
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
  let source = original ? 'importer' : null;
  if (!original && content.newsletter?.archived && content.newsletter.date) {
    original = `${content.newsletter.date}T12:00:00.000Z`;
    source = 'newsletter';
  }
  if (!original && legacy.originalStatus === 'publish') {
    const records = Array.isArray(legacy.sourceRecords)
      ? legacy.sourceRecords
      : [];
    const record =
      records.find((r) => r.language === (content.messageLanguage || 'en')) ||
      records[0];
    if (record?.sourceStatus === 'publish') {
      original =
        record.publishedAt ||
        (record.createdGmt && `${record.createdGmt.replace(' ', 'T')}Z`);
      if (original) source = 'sourceRecord';
    }
  }
  const originalPublishedAt = validDate(original, now);
  return {
    isArchive,
    originalPublishedAt,
    source: originalPublishedAt ? source : null,
  };
}

function selectPublicationDate(content, choice, now = new Date(), customDate) {
  const info = getPublicationDateInfo(content, now);
  const fail = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
  };
  if (choice !== undefined && !['original', 'now', 'custom'].includes(choice))
    fail('Publication date choice must be original, now, or custom');
  if (info.isArchive && choice === undefined)
    fail('Choose an original, current, or custom publication date');
  if (choice === 'original' && !info.originalPublishedAt)
    fail('No original publication date is available');
  if (choice === 'custom' && !validDate(customDate, now))
    fail('Choose a valid custom publication date no later than now');
  if (choice !== 'custom' && customDate !== undefined)
    fail('Custom publication date requires the custom choice');
  if (info.originalPublishedAt)
    content.originalPublishedAt = info.originalPublishedAt;
  if (info.isArchive || choice !== undefined)
    content.publicationDateChoice = choice;
  return choice === 'original'
    ? info.originalPublishedAt
    : choice === 'custom'
      ? validDate(customDate, now)
      : now;
}

module.exports = {
  publicationDateFields,
  getPublicationDateInfo,
  selectPublicationDate,
};
