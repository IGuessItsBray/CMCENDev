const { categories, plainText } = require('../public/newsletter-format');
const { normalizeBlocks, preserveNewsletterBlocks } = require('./newsletter-content');
const { EVENT_ORGANIZING_ENTITIES, EVENT_TYPES } = require('../config/content');

const SOURCE = 'https://cmcen-rcmce.ca';
const CHECK_KEYS = Object.freeze([
  'source',
  'translation',
  'categorization',
  'media',
]);

const EDIT_FIELDS = Object.freeze({
  newsArticle: [
    ['title.en', 'English title', 'text', 240],
    ['title.fr', 'French title', 'text', 240],
    ['content.en', 'English body', 'long', 20000],
    ['content.fr', 'French body', 'long', 20000],
    ['newsletterBlocks.en', 'English newsletter blocks', 'blocks'],
    ['newsletterBlocks.fr', 'French newsletter blocks', 'blocks'],
    ['category', 'Category', 'category'],
    ['newsletter.headerCrest', 'Show cover in article header', 'boolean'],
    ['imageUrl', 'Original image URL', 'url'],
    ['imageDisplayUrl', 'Display image URL', 'url'],
  ],
  retirementMessage: [
    ['retiree.rank', 'Rank', 'text', 40],
    ['retiree.ranks.en', 'English rank', 'text', 40],
    ['retiree.ranks.fr', 'French rank', 'text', 40],
    ['retiree.firstName', 'First name', 'text', 80],
    ['retiree.lastName', 'Last name', 'text', 80],
    ['retiree.tradeRole', 'Trade or role', 'text', 120],
    ['messages.en', 'English message', 'long', 30000],
    ['messages.fr', 'French message', 'long', 30000],
    ['photoUrl', 'Original photo URL', 'url'],
    ['photoDisplayUrl', 'Display photo URL', 'url'],
  ],
  lastPost: [
    ['title', 'Internal title', 'text', 240],
    ['deceased.fullRank', 'Rank', 'text', 80],
    ['deceased.ranks.en', 'English rank', 'text', 80],
    ['deceased.ranks.fr', 'French rank', 'text', 80],
    ['deceased.firstName', 'First name', 'text', 80],
    ['deceased.surname', 'Surname', 'text', 80],
    ['messages.en', 'English notice', 'long', 30000],
    ['messages.fr', 'French notice', 'long', 30000],
    ['imageUrl', 'Original image URL', 'url'],
    ['imageDisplayUrl', 'Display image URL', 'url'],
  ],
  event: [
    ['title.en', 'English title', 'text', 500],
    ['title.fr', 'French title', 'text', 500],
    ['description.en', 'English description', 'long', 30000],
    ['description.fr', 'French description', 'long', 30000],
    ['location.en', 'English location', 'text', 500],
    ['location.fr', 'French location', 'text', 500],
    ['city', 'City', 'text', 200],
    ['organizingEntity', 'Organizing entity', 'organizingEntity'],
    ['eventType', 'Event type', 'eventType'],
    ['startDate', 'Start date', 'date'],
    ['endDate', 'End date', 'date'],
    ['imagePath', 'Image URL', 'url'],
  ],
  comment: [['body', 'Comment', 'long', 10000]],
  page: [
    ['title.en', 'English title', 'text', 500],
    ['title.fr', 'French title', 'text', 500],
    ['summary.en', 'English summary', 'long', 4000],
    ['summary.fr', 'French summary', 'long', 4000],
    ['blocks', 'Page blocks', 'json'],
  ],
  archiveDocument: [
    ['title.en', 'English title', 'text', 500],
    ['title.fr', 'French title', 'text', 500],
    ['description.en', 'English description', 'long', 4000],
    ['description.fr', 'French description', 'long', 4000],
    ['dateLabel.en', 'English date label', 'text', 240],
    ['dateLabel.fr', 'French date label', 'text', 240],
    ['languageLabel.en', 'English language label', 'text', 240],
    ['languageLabel.fr', 'French language label', 'text', 240],
    ['organization', 'Organization', 'organization'],
    ['type', 'Document type', 'documentType'],
    ['fileKey', 'Document media key', 'fileKey'],
    ['pageUrl', 'Page URL', 'pageUrl'],
  ],
});

function hasSourceIdentity(record, type) {
  const legacy = record?.legacy;
  if (legacy?.source !== SOURCE) return false;
  if (type === 'comment')
    return (
      Number.isSafeInteger(legacy.wordpressCommentId) &&
      legacy.wordpressCommentId > 0
    );
  if (type === 'archiveDocument')
    return Number.isSafeInteger(record.sourceId) && record.sourceId > 0;
  return (
    Array.isArray(legacy.sourcePostIds) &&
    legacy.sourcePostIds.length > 0 &&
    legacy.sourcePostIds.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

function isArchiveRecord(record, type) {
  if (!hasSourceIdentity(record, type)) return false;
  if (type === 'comment')
    return (
      record.legacy.originalApproval === '1' ||
      (record.legacy.originalApproval === '0' &&
        record.legacy.importReview?.decision === 'preserve-as-draft')
    );
  return (
    record.legacy.originalStatus === 'publish' ||
    (type === 'newsArticle' &&
      record.legacy.originalStatus == null &&
      typeof record.migrationSource === 'string' &&
      record.migrationSource.startsWith(`${SOURCE}/`))
  );
}

function validateField(kind, raw, maximum, documentLibrary) {
  if (kind === 'boolean') {
    if (typeof raw !== 'boolean') throw new Error('Expected a true or false value');
    return raw;
  }
  if (kind === 'blocks') return normalizeBlocks(raw);
  if (kind === 'json') {
    if (!Array.isArray(raw) || raw.length > 80)
      throw new Error('Invalid page blocks');
    if (JSON.stringify(raw).length > 200000)
      throw new Error('Page blocks are too large');
    return raw;
  }
  if (kind === 'date') {
    if (raw === '' || raw === null) return null;
    if (typeof raw !== 'string' || Number.isNaN(new Date(raw).getTime()))
      throw new Error('Invalid date');
    return new Date(raw);
  }
  if (typeof raw !== 'string') throw new Error('Expected text');
  const value = raw.trim();
  if (maximum && value.length > maximum) throw new Error('Text is too long');
  if (kind === 'category' && !categories.includes(value))
    throw new Error('Invalid category');
  if (
    kind === 'organizingEntity' &&
    !['', ...EVENT_ORGANIZING_ENTITIES].includes(value)
  )
    throw new Error('Invalid organizing entity');
  if (kind === 'eventType' && !['', ...EVENT_TYPES].includes(value))
    throw new Error('Invalid event type');
  if (
    kind === 'organization' &&
    !documentLibrary.en.library.organizations.some(
      (item) => item.value === value,
    )
  )
    throw new Error('Invalid organization');
  if (
    kind === 'documentType' &&
    !documentLibrary.en.library.types.some((item) => item.value === value)
  )
    throw new Error('Invalid document type');
  if (
    kind === 'fileKey' &&
    !/^documents\/[a-zA-Z0-9/_-]+\.(pdf|docx)$/u.test(value)
  )
    throw new Error('Invalid document media key');
  if (kind === 'pageUrl' && value && !/^\/[a-zA-Z0-9/_#?=&.-]*$/u.test(value))
    throw new Error('Invalid page URL');
  if (kind === 'url' && value) {
    if (
      value.startsWith('/') &&
      !value.startsWith('//') &&
      /^\/[a-zA-Z0-9/_#?=&.%+-]*$/u.test(value)
    )
      return value;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') throw new Error('Invalid URL');
    } catch {
      throw new Error('Invalid URL');
    }
  }
  return value;
}

function cleanChanges(type, changes, documentLibrary, originalRecord) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes))
    throw new Error('Changes must be an object');
  const fields = EDIT_FIELDS[type];
  if (!fields) throw new Error('Unsupported content type');
  const byPath = new Map(fields.map((field) => [field[0], field]));
  const entries = Object.entries(changes);
  if (!entries.length || entries.length > fields.length)
    throw new Error('Choose fields to update');
  return Object.fromEntries(
    entries.map(([path, raw]) => {
      const field = byPath.get(path);
      if (!field) throw new Error('Unsupported field');
      return [path,
        field[2] === 'blocks' && originalRecord?.layout === 'newsletter'
          ? preserveNewsletterBlocks(raw, originalRecord.get(path))
          : validateField(field[2], raw, field[3], documentLibrary)];
    }),
  );
}

function cleanChecks(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !CHECK_KEYS.includes(key)) ||
    CHECK_KEYS.some((key) => typeof value[key] !== 'boolean')
  )
    throw new Error('Complete the verification checks');
  return Object.fromEntries(CHECK_KEYS.map((key) => [key, value[key]]));
}

module.exports = {
  SOURCE,
  CHECK_KEYS,
  EDIT_FIELDS,
  isArchiveRecord,
  cleanChanges,
  cleanChecks,
};
