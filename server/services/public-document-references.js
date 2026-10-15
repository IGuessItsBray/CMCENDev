const { getMediaKeyFromValue } = require('./media-library');
const { canViewPage } = require('../routes/pages');
const {
  receipts,
  linkValues,
  referenceValues,
  visibleReference,
  staticReferenceCorpus,
} = require('./document-usage');

function localizedTitle(record, fallback) {
  if (typeof record.title === 'string')
    return { en: record.title, fr: record.title };
  return {
    en: record.title?.en || record.title?.fr || fallback,
    fr: record.title?.fr || record.title?.en || fallback,
  };
}

// One inverted index per response; neither original bodies nor pageUrl are references.
function publicReferenceMap(documents, groups, staticCorpus = [], awards = []) {
  const keys = new Set(
    documents
      .filter((d) => d.fileKey && d.availability !== 'unavailable')
      .map((d) => d.fileKey),
  );
  const aliases = new Map();
  for (const receipt of receipts) {
    if (!keys.has(receipt.storageKey)) continue;
    for (const value of [
      receipt.fileUrl,
      receipt.sourceName ? `/documents/${receipt.sourceName}` : '',
      ...(receipt.sourceUrls || []),
    ])
      if (value) aliases.set(value.split(/[?#]/u)[0], receipt.storageKey);
  }
  const result = new Map();
  function add(values, reference) {
    for (const value of values) {
      if (typeof value !== 'string') continue;
      const raw = value.trim().split(/[?#]/u)[0];
      if (raw.startsWith('//')) continue;
      let key = aliases.get(raw);
      if (!key) {
        try {
          key = getMediaKeyFromValue(raw);
        } catch {
          continue;
        }
      }
      if (!keys.has(key)) continue;
      if (!result.has(key)) result.set(key, new Map());
      result.get(key).set(reference.href, reference);
    }
  }
  for (const [type, records] of Object.entries(groups)) {
    for (const record of records) {
      // Apply again after the DB filter: this function must be safe for any caller.
      if (
        record.status !== 'published' ||
        (type === 'page' && !canViewPage(record, undefined))
      )
        continue;
      const reference = visibleReference(type, record, undefined);
      if (!reference) continue;
      add(referenceValues(type, record), {
        href: reference.href,
        title: localizedTitle(record, reference.title),
      });
    }
  }
  for (const item of staticCorpus) {
    if (item.reference.status === 'published')
      add(item.values, {
        href: item.reference.href,
        title: item.reference.title,
      });
  }
  for (const award of awards) {
    if (award.published !== true) continue;
    add(award.links?.flatMap((link) => linkValues(link)) || [], {
      href: '/awards',
      title: { en: 'Awards', fr: 'Prix' },
    });
  }
  return new Map(
    [...result].map(([key, references]) => [key, [...references.values()]]),
  );
}

async function publicDocumentReferences(documents) {
  const definitions = {
    newsArticle: ['NewsArticle', 'title status newsletterBlocks content'],
    page: ['Page', 'title slug status access blocks'],
    event: ['Event', 'title status formattedBody description'],
    retirementMessage: [
      'RetirementMessage',
      'title retiree status formattedBody messages message',
    ],
    lastPost: [
      'LastPostMessage',
      'title deceased status formattedBody messages message',
    ],
  };
  const [entries, corpus, awards] = await Promise.all([
    Promise.all(
      Object.entries(definitions).map(async ([type, [name, fields]]) => [
        type,
        await require(`../models/${name}`)
          .find({ status: 'published' })
          .select(fields)
          .lean(),
      ]),
    ),
    staticReferenceCorpus(),
    require('../models/ProfessionalAward')
      .find({ published: true })
      .select('published links')
      .lean(),
  ]);
  return publicReferenceMap(
    documents,
    Object.fromEntries(entries),
    corpus,
    awards,
  );
}

module.exports = { publicReferenceMap, publicDocumentReferences };
