const Document = require('../models/ArchiveDocument');
const labels = require('../public/page-content/document-library.json');
const { buildPublicMediaUrl } = require('./media-library');
const seedIds = [
  ...labels.documents,
  ...require('../scripts/migration/import/document-catalogue-additions.json'),
].map((card) => card.id);

function catalogueId(record) {
  return (
    record.catalogueId ||
    (record.sourceId ? `archive-${record.sourceId}` : String(record._id))
  );
}

function toPublicDocument(record) {
  return {
    id: catalogueId(record),
    organization: record.organization,
    type: record.type,
    ...(record.catalogueAliases?.length
      ? { aliases: record.catalogueAliases }
      : {}),
    ...(record.fileKey && record.availability !== 'unavailable'
      ? {
          fileKey: record.fileKey,
          fileUrl: buildPublicMediaUrl(record.fileKey),
        }
      : {}),
    pageUrl: record.pageUrl || '',
    ...Object.fromEntries(
      ['en', 'fr'].map((language) => [
        language,
        Object.fromEntries(
          ['title', 'description', 'dateLabel', 'languageLabel'].map(
            (field) => [field, record[field]?.[language] || ''],
          ),
        ),
      ]),
    ),
  };
}

async function publicDocuments() {
  // A fresh or interrupted migration must never appear as an empty/partial library.
  // Check presence independently of status so intentional staff draft changes survive.
  const present = await Document.countDocuments({
    catalogueId: { $in: seedIds },
  });
  if (present !== seedIds.length)
    throw new Error('Document catalogue migration incomplete');
  const documents = await Document.find({ status: 'published' })
    .sort({ sourceId: 1, _id: 1 })
    .lean();
  documents.sort(
    (left, right) =>
      (left.catalogueOrder ?? Infinity) - (right.catalogueOrder ?? Infinity) ||
      String(left._id).localeCompare(String(right._id)),
  );
  const references =
    await require('./public-document-references').publicDocumentReferences(
      documents,
    );
  return documents.map((record) => {
    const card = toPublicDocument(record);
    // Keep historical/related links in storage and staff views, never public navigation.
    delete card.pageUrl;
    card.references =
      record.availability === 'unavailable'
        ? []
        : references.get(record.fileKey) || [];
    card.referenceCount = card.references.length;
    // Explicitly reviewed HTML rendition, bound to the original file identity.
    if (
      card.id === 'ce-senate-charter-2020' &&
      record.availability !== 'unavailable' &&
      record.fileKey ===
        'documents/library/ce-senate-charter-2020-f589195882e2.pdf'
    )
      card.htmlVersionUrl = '/about-family#charterContent';
    return card;
  });
}

module.exports = {
  catalogueId,
  toPublicDocument,
  publicDocuments,
  labels: { en: labels.en, fr: labels.fr },
};
