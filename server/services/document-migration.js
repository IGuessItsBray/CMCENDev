const crypto = require('node:crypto');
const { EJSON, ObjectId } = require('mongoose').mongo.BSON;
const seed = require('../public/page-content/document-library.json').documents;
const additions = require('../scripts/migration/import/document-catalogue-additions.json');
const oldReceipts =
  require('../scripts/migration/import/document-library-cdn.json').documents;
const newsletterReceipts =
  require('../scripts/migration/import/document-catalogue-newsletter-receipts.json').documents;
const newReceipts =
  require('../scripts/migration/import/document-catalogue-additions-receipts.json').documents;
const { toPublicDocument } = require('./document-catalogue');

function canonical(value) {
  const sort = (value) =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sort(value[key])]),
          )
        : value;
  return JSON.stringify(sort(EJSON.serialize(value, { relaxed: false })));
}
const digest = (value) =>
  crypto.createHash('sha256').update(canonical(value)).digest('hex');
const cards = [...seed, ...additions];

function seedRecord(card) {
  const fingerprint = digest(card);
  const receipts = [
    ...oldReceipts,
    ...newsletterReceipts,
    ...newReceipts,
  ].filter((item) => item.storageKey === card.fileKey);
  return {
    _id: new ObjectId(
      digest(`cmcen-document-catalogue:${card.id}`).slice(0, 24),
    ),
    catalogueId: card.id,
    catalogueOrder: cards.findIndex((item) => item.id === card.id),
    organization: card.organization,
    type: card.type,
    availability: card.fileKey ? 'available' : 'unavailable',
    ...(card.fileKey ? { fileKey: card.fileKey } : {}),
    pageUrl: card.pageUrl || '',
    ...Object.fromEntries(
      ['title', 'description', 'dateLabel', 'languageLabel'].map((field) => [
        field,
        Object.fromEntries(
          ['en', 'fr'].map((language) => [
            language,
            card[language]?.[field] || '',
          ]),
        ),
      ]),
    ),
    status: 'published',
    legacy: {
      catalogueSeed: {
        version: 1,
        id: card.id,
        sha256: fingerprint,
        source: 'version-controlled-document-catalogue',
        receipts: receipts.map((item) => ({
          key: item.storageKey,
          sha256: item.sha256,
          bytes: item.bytes,
          sourceUrls: item.sourceUrls || [],
          sourceName: item.sourceName || '',
          verifiedAt: item.cdnVerifiedAt || item.verifiedAt || '',
        })),
      },
    },
  };
}

function equivalent(record, card) {
  const actual = toPublicDocument(record);
  // URLs are resolved per deployment; identity and aliases are separate from editorial metadata.
  for (const field of ['organization', 'type', 'pageUrl'])
    if ((actual[field] || '') !== (card[field] || '')) return false;
  if ((actual.fileKey || '') !== (card.fileKey || '')) return false;
  return ['en', 'fr'].every(
    (language) => canonical(actual[language]) === canonical(card[language]),
  );
}

function planMigration(existing, indexes = []) {
  const actions = [];
  const conflicts = [];
  for (const card of cards) {
    const expected = seedRecord(card);
    const matches = existing.filter(
      (record) =>
        record.catalogueId === card.id ||
        String(record._id) === String(expected._id) ||
        (card.fileKey && record.fileKey === card.fileKey),
    );
    if (matches.length > 1) {
      conflicts.push({
        catalogueId: card.id,
        reason: 'multiple destination matches',
      });
      continue;
    }
    const record = matches[0];
    if (!record) {
      actions.push({
        action: 'insert',
        catalogueId: card.id,
        document: expected,
      });
      continue;
    }
    if (record.catalogueId && record.catalogueId !== card.id) {
      conflicts.push({
        catalogueId: card.id,
        reason: 'file or identity belongs to another catalogue entry',
      });
      continue;
    }
    if (
      record.legacy?.catalogueSeed?.sha256 ===
        expected.legacy.catalogueSeed.sha256 &&
      record.catalogueId === card.id
    ) {
      actions.push({
        action: 'preserve',
        catalogueId: card.id,
        id: record._id,
        beforeSha256: digest(record),
      });
      continue;
    }
    if (!equivalent(record, card) || record.status !== 'published') {
      conflicts.push({
        catalogueId: card.id,
        reason:
          'existing metadata or visibility differs; preserve staff record',
      });
      continue;
    }
    actions.push({
      action: 'adopt',
      catalogueId: card.id,
      id: record._id,
      beforeSha256: digest(record),
      fields: {
        catalogueId: card.id,
        catalogueOrder: expected.catalogueOrder,
        catalogueAliases: record.sourceId ? [`archive-${record.sourceId}`] : [],
        legacy: {
          ...record.legacy,
          catalogueSeed: expected.legacy.catalogueSeed,
        },
      },
    });
  }
  const duplicateIds = existing
    .map((record) => record.catalogueId)
    .filter(Boolean);
  if (new Set(duplicateIds).size !== duplicateIds.length)
    conflicts.push({ reason: 'duplicate destination catalogue IDs' });
  const sourceIds = existing
    .map((record) => record.sourceId)
    .filter((value) => typeof value === 'number');
  if (new Set(sourceIds).size !== sourceIds.length)
    conflicts.push({ reason: 'duplicate destination source IDs' });
  const legacyIndex = indexes.find(
    (index) =>
      index.key?.sourceId === 1 &&
      Object.keys(index.key).length === 1 &&
      index.unique &&
      !index.partialFilterExpression,
  );
  const plan = {
    version: 1,
    seedCards: seed.length,
    additions: additions.length,
    unavailable: cards.filter((card) => !card.fileKey).map((card) => card.id),
    counts: Object.fromEntries(
      ['insert', 'adopt', 'preserve'].map((action) => [
        action,
        actions.filter((item) => item.action === action).length,
      ]),
    ),
    indexChanges: legacyIndex
      ? [
          {
            action: 'replace',
            name: legacyIndex.name,
            key: { sourceId: 1 },
            partialFilterExpression: { sourceId: { $type: 'number' } },
            unique: true,
          },
        ]
      : [],
    actions,
    conflicts,
    untouchedDynamicRecords: existing.filter(
      (record) =>
        !actions.some(
          (action) =>
            String(action.id || action.document?._id) === String(record._id),
        ),
    ).length,
  };
  return { ...plan, sha256: digest(plan) };
}

async function listIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (error) {
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function applyMigration(collection, plan, expectedDigest) {
  if (plan.sha256 !== expectedDigest || plan.conflicts.length)
    throw new Error('Reviewed conflict-free plan required');
  const current = planMigration(
    await collection.find({}).toArray(),
    await listIndexes(collection),
  );
  if (current.sha256 !== plan.sha256)
    throw new Error('Destination changed; prepare a new preview');
  for (const action of plan.actions)
    if (action.action === 'insert')
      await new (require('../models/ArchiveDocument'))(
        action.document,
      ).validate();
  for (const change of plan.indexChanges)
    await collection.dropIndex(change.name);
  await collection.createIndex(
    { sourceId: 1 },
    {
      unique: true,
      partialFilterExpression: { sourceId: { $type: 'number' } },
    },
  );
  await collection.createIndex(
    { catalogueId: 1 },
    {
      unique: true,
      partialFilterExpression: { catalogueId: { $type: 'string' } },
    },
  );
  for (const action of plan.actions) {
    if (action.action === 'preserve') continue;
    if (action.action === 'insert') {
      await collection.insertOne({
        ...action.document,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      continue;
    }
    const before = await collection.findOne({ _id: action.id });
    if (!before || digest(before) !== action.beforeSha256)
      throw new Error('Staff record changed; stopped without overwrite');
    const filter = {
      _id: before._id,
      ...Object.fromEntries(
        Object.entries(before)
          .filter(([key]) => key !== '_id')
          .map(([key, value]) => [key, { $eq: value }]),
      ),
    };
    filter.catalogueId =
      before.catalogueId === undefined
        ? { $exists: false }
        : { $eq: before.catalogueId };
    const result = await collection.updateOne(filter, { $set: action.fields });
    if (result.matchedCount !== 1)
      throw new Error('Concurrent document edit; stopped');
  }
  const result = planMigration(
    await collection.find({}).toArray(),
    await listIndexes(collection),
  );
  if (result.conflicts.length || result.counts.preserve !== cards.length)
    throw new Error(
      'Post-migration verification failed; inspect backup and prepare a new preview',
    );
  return result;
}

module.exports = {
  cards,
  seedRecord,
  planMigration,
  applyMigration,
  digest,
  listIndexes,
};
