const fs = require('node:fs/promises');
const path = require('node:path');
const { getMediaKeyFromValue } = require('./media-library');
const { getUserPermissions } = require('../config/permissions');
const { canViewPage } = require('../routes/pages');
const { mediaReferences } = require('../public/body-content');
const oldReceipts =
  require('../scripts/migration/import/document-library-cdn.json').documents;
const newsletterReceipts =
  require('../scripts/migration/import/document-catalogue-newsletter-receipts.json').documents;
const newReceipts =
  require('../scripts/migration/import/document-catalogue-additions-receipts.json').documents;

function documentKey(value, document) {
  if (typeof value !== 'string' || !document.fileKey) return '';
  const raw = value.trim();
  // Historical aliases are exact verified receipt URLs/names, never arbitrary same-name URLs.
  for (const receipt of [
    ...oldReceipts,
    ...newsletterReceipts,
    ...newReceipts,
  ]) {
    if (receipt.storageKey !== document.fileKey) continue;
    if (
      [
        receipt.fileUrl,
        receipt.sourceName ? `/documents/${receipt.sourceName}` : '',
        ...(receipt.sourceUrls || []),
      ]
        .filter(Boolean)
        .includes(raw.split(/[?#]/u)[0])
    )
      return document.fileKey;
  }
  try {
    if (raw.startsWith('//')) return '';
    const key = getMediaKeyFromValue(raw.split(/[?#]/u)[0]);
    return key === document.fileKey ? key : '';
  } catch {
    return '';
  }
}

function linkValues(value) {
  const links = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/href\s*=\s*["']([^"']+)["']/giu))
        links.push(match[1].replace(/&amp;/gu, '&'));
      for (const match of value.matchAll(
        /(?:https?:\/\/|\/documents\/)[^\s<>"']+/gu,
      ))
        links.push(match[0]);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const key of ['href', 'url', 'mediaKey', 'mediaUrl', 'fileKey'])
        if (typeof value[key] === 'string') links.push(value[key]);
      for (const key of [
        'en',
        'fr',
        'blocks',
        'children',
        'items',
        'columns',
        'body',
        'text',
      ])
        visit(value[key]);
    }
  };
  visit(value);
  return links;
}

function visibleReference(type, record, user) {
  const permissions = getUserPermissions(user || { role: 'visitor' });
  const id = encodeURIComponent(String(record._id));
  const published = record.status === 'published';
  const title =
    record.title?.en ||
    record.title?.fr ||
    (typeof record.title === 'string' ? record.title : '') ||
    [
      record.retiree?.firstName,
      record.retiree?.lastName,
      record.deceased?.firstName,
      record.deceased?.surname,
    ]
      .filter(Boolean)
      .join(' ') ||
    type;
  if (type === 'page') {
    // Even page managers do not receive restricted titles unless the page access policy permits them.
    if (!canViewPage(record, user)) return null;
    if (published)
      return {
        type,
        id: String(record._id),
        title,
        status: record.status,
        href: `/pages/${record.slug}`,
      };
    if (record.status === 'draft' && permissions.canManagePages)
      return {
        type,
        id: String(record._id),
        title,
        status: record.status,
        href: `/page?preview=${id}`,
      };
    if (
      record.status === 'draft' &&
      permissions.canVerifyArchive &&
      require('./archive-staff-review').isArchiveRecord(record, type)
    )
      return {
        type,
        id: String(record._id),
        title,
        status: record.status,
        href: `/archive-staff-review?type=page&id=${id}`,
      };
    return null;
  }
  const publicRoutes = {
    newsArticle: 'news-story',
    event: 'event',
    retirementMessage: 'retirement-message',
    lastPost: 'last-post-message',
  };
  if (published)
    return {
      type,
      id: String(record._id),
      title,
      status: record.status,
      href: `/${publicRoutes[type]}?id=${id}`,
    };
  const canEdit =
    type === 'newsArticle'
      ? permissions.canManageNews
      : permissions.canReviewAndPublish;
  if (canEdit && ['draft', 'pending', 'hidden'].includes(record.status))
    return {
      type,
      id: String(record._id),
      title,
      status: record.status,
      href:
        type === 'newsArticle'
          ? `/dashboard-next?area=articles&id=${id}`
          : `/content-workspace?id=${id}`,
    };
  if (
    permissions.canVerifyArchive &&
    record.status === 'draft' &&
    require('./archive-staff-review').isArchiveRecord(record, type)
  )
    return {
      type,
      id: String(record._id),
      title,
      status: record.status,
      href: `/archive-staff-review?type=${type}&id=${id}`,
    };
  return null;
}

function referencesFor(document, groups, user) {
  const references = new Map();
  for (const [type, records] of Object.entries(groups))
    for (const record of records) {
      const reference = visibleReference(type, record, user);
      if (!reference) continue;
      const values =
        type === 'page'
          ? linkValues(record.blocks)
          : type === 'newsArticle'
            ? [
                ...linkValues(record.newsletterBlocks),
                ...linkValues(record.content),
              ]
            : [
                ...mediaReferences(record).map((item) => item.url),
                ...linkValues(
                  record.messages || record.description || record.message,
                ),
              ];
      if (values.some((value) => documentKey(value, document)))
        references.set(`${type}:${record._id}`, reference);
    }
  return [...references.values()];
}

async function staticReferences(document) {
  const references = [];
  const directory = path.join(__dirname, '../public');
  for (const page of require('../routes/search').staticPages) {
    if (page.path === '/document-library') continue;
    const html = await fs.readFile(path.join(directory, page.file), 'utf8');
    const values = linkValues(html);
    // Static editorial JSON is wired by an explicit data-static-page attribute.
    for (const [, name] of html.matchAll(
      /data-static-page=["']([a-z0-9-]+)["']/gu,
    )) {
      const content = JSON.parse(
        await fs.readFile(
          path.join(directory, 'page-content', `${name}.json`),
          'utf8',
        ),
      );
      const walk = (value) => {
        if (typeof value === 'string') values.push(value, ...linkValues(value));
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object')
          Object.values(value).forEach(walk);
      };
      walk(content);
    }
    if (values.some((value) => documentKey(value, document)))
      references.push({
        type: 'static',
        id: page.path,
        title: page.title.en || page.title.fr,
        status: 'published',
        href: page.path,
      });
  }
  return references;
}

async function documentUsage(document, user) {
  if (!document.fileKey || document.availability === 'unavailable')
    return { count: 0, references: [] };
  const names = {
    newsArticle: 'NewsArticle',
    page: 'Page',
    event: 'Event',
    retirementMessage: 'RetirementMessage',
    lastPost: 'LastPostMessage',
  };
  const projections = {
    newsArticle:
      'title status newsletterBlocks content legacy.source legacy.sourcePostIds legacy.originalStatus',
    page: 'title slug status access blocks legacy.source legacy.sourcePostIds legacy.originalStatus',
    event:
      'title status formattedBody description legacy.source legacy.sourcePostIds legacy.originalStatus',
    retirementMessage:
      'title retiree status formattedBody messages message legacy.source legacy.sourcePostIds legacy.originalStatus',
    lastPost:
      'title deceased status formattedBody messages legacy.source legacy.sourcePostIds legacy.originalStatus',
  };
  const groups = Object.fromEntries(
    await Promise.all(
      Object.entries(names).map(async ([type, model]) => [
        type,
        await require(`../models/${model}`)
          .find({})
          .select(projections[type])
          .lean(),
      ]),
    ),
  );
  const references = [
    ...referencesFor(document, groups, user),
    ...(await staticReferences(document)),
  ];
  return { count: references.length, references };
}

module.exports = {
  documentKey,
  linkValues,
  referencesFor,
  documentUsage,
  visibleReference,
};
