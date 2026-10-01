const express = require('express');
const mongoose = require('mongoose');
const documentLibrary = require('../public/page-content/document-library.json');
const { authMiddleware } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { recordContentRevision } = require('../services/content-revisions');
const {
  getPublicationDateInfo,
  selectPublicationDate,
} = require('../services/publication-date');
const { plainText, categories } = require('../public/newsletter-format');
const { EVENT_ORGANIZING_ENTITIES, EVENT_TYPES } = require('../config/content');
const { markContentEdited } = require('../services/content-edit-metadata');
const { cleanBlocks } = require('./pages');
const {
  CHECK_KEYS,
  EDIT_FIELDS,
  SOURCE,
  cleanChanges,
  cleanChecks,
  isArchiveRecord,
} = require('../services/archive-staff-review');
const Verification = require('../models/ArchiveVerification');
const MediaAsset = require('../models/MediaAsset');
const { buildPublicMediaUrl } = require('../services/media-library');

const models = Object.freeze({
  newsArticle: require('../models/NewsArticle'),
  retirementMessage: require('../models/RetirementMessage'),
  lastPost: require('../models/LastPostMessage'),
  event: require('../models/Event'),
  comment: require('../models/Comment'),
  page: require('../models/Page'),
  archiveDocument: require('../models/ArchiveDocument'),
});
const router = express.Router();
router.use(authMiddleware, (req, res, next) => {
  const permissions = getUserPermissions(req.user);
  if (permissions.canVerifyArchive === true) return next();
  if (permissions.canManagePages === true &&
    (req.path === '/types' || /^\/(?:page|archiveDocument)(?:\/|$)/u.test(req.path)))
    return next();
  return res.status(403).json({ error: 'Insufficient permissions' });
});
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function getModel(req, res) {
  const model = models[req.params.type];
  if (!model) res.status(404).json({ error: 'Content type not found' });
  return model;
}

function eligibleQuery(type, status) {
  return {
    'legacy.source': SOURCE,
    status: status === 'all' ? { $in: ['draft', 'published'] } : status,
  };
}

function findTitle(record, type) {
  if (type === 'retirementMessage')
    return (
      [record.retiree?.firstName, record.retiree?.lastName]
        .filter(Boolean)
        .join(' ') || 'Retirement message'
    );
  if (type === 'lastPost')
    return (
      record.title ||
      [record.deceased?.firstName, record.deceased?.surname]
        .filter(Boolean)
        .join(' ') ||
      'Last Post'
    );
  if (type === 'comment') return String(record.body || '').slice(0, 90);
  return record.title?.en || record.title?.fr || 'Untitled';
}

function sourceEvidence(record) {
  const legacy = record.legacy || {};
  const isSourceUrl = (url) =>
    typeof url === 'string' && url.startsWith(`${SOURCE}/`);
  const urls = [
    record.migrationSource,
    legacy.sourceUrl,
    ...(Array.isArray(legacy.sourceUrls) ? legacy.sourceUrls : []),
  ].filter(isSourceUrl);
  const sourceRecords = Array.isArray(legacy.sourceRecords)
    ? legacy.sourceRecords
        .filter((source) => source && typeof source === 'object')
        .map((source) => ({
          id: source.id || source.sourceId || source.postId || null,
          language: source.language || '',
          url: [source.url, source.sourceUrl].find(isSourceUrl) || '',
          title: source.title || '',
          body: source.originalBody || source.body || '',
        }))
    : [];
  return {
    sourceIds:
      (Array.isArray(legacy.sourcePostIds) ? legacy.sourcePostIds : null) ||
      (legacy.wordpressCommentId
        ? [legacy.wordpressCommentId]
        : record.sourceId
          ? [record.sourceId]
          : []),
    urls: [...new Set(urls)],
    sourceRecords,
    originalStatus: legacy.originalStatus || legacy.originalApproval || '',
  };
}

function missingFrenchFields(record, type) {
  const fields = EDIT_FIELDS[type].map(([path]) => path);
  return fields
    .filter((path) => {
      if (!path.endsWith('.en') || !fields.includes(`${path.slice(0, -3)}.fr`))
        return false;
      const english = record.get(path);
      const french = record.get(`${path.slice(0, -3)}.fr`);
      return (
        (Array.isArray(english)
          ? english.length > 0
          : Boolean(String(english || '').trim())) &&
        !(Array.isArray(french)
          ? french.length > 0
          : Boolean(String(french || '').trim()))
      );
    })
    .map((path) => path.slice(0, -3));
}

function serialize(record, type, verification) {
  const fields = EDIT_FIELDS[type].map(([path, label, kind]) => ({
    path,
    label,
    kind,
    value: record.get(path) ?? (['blocks', 'json'].includes(kind) ? [] : kind === 'boolean' ? false : ''),
    ...(kind === 'boolean' ? { options: [
      { value: 'false', label: 'No' }, { value: 'true', label: 'Yes' },
    ] } : {}),
    ...(kind === 'category'
      ? { options: categories.map((value) => ({ value, label: value })) }
      : {}),
    ...(kind === 'organizingEntity'
      ? {
          options: ['', ...EVENT_ORGANIZING_ENTITIES].map((value) => ({
            value,
            label: value || 'Unassigned',
          })),
        }
      : {}),
    ...(kind === 'eventType'
      ? {
          options: ['', ...EVENT_TYPES].map((value) => ({
            value,
            label: value || 'Unassigned',
          })),
        }
      : {}),
    ...(kind === 'organization'
      ? { options: documentLibrary.en.library.organizations }
      : {}),
    ...(kind === 'documentType'
      ? { options: documentLibrary.en.library.types }
      : {}),
  }));
  return {
    id: String(record._id),
    type,
    ...(type === 'newsArticle' ? { layout: record.layout } : {}),
    title: findTitle(record, type),
    status: record.status,
    updatedAt: record.updatedAt,
    previewUrl:
      type === 'newsArticle'
        ? `/news-story?id=${record._id}&preview=1`
        : type === 'page'
          ? `/pages/${encodeURIComponent(record.slug)}?preview=${record._id}`
          : null,
    source: sourceEvidence(record),
    publicationDate: getPublicationDateInfo(record),
    missingFrench: missingFrenchFields(record, type),
    fields,
    verification: verification
      ? {
          checks: verification.checks,
          note: verification.note,
          reviewedAt: verification.reviewedAt,
          reviewedBy: verification.reviewedBy,
          current:
            (record.status === 'published' &&
              Boolean(verification.publishedAt)) ||
            new Date(verification.contentUpdatedAt).getTime() ===
              new Date(record.updatedAt).getTime(),
        }
      : null,
  };
}

async function loadRecord(req, res) {
  const Model = getModel(req, res);
  if (!Model) return null;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ error: 'Imported record not found' });
    return null;
  }
  const record = await Model.findById(req.params.id);
  if (!record || !isArchiveRecord(record, req.params.type)) {
    res.status(404).json({ error: 'Imported record not found' });
    return null;
  }
  return record;
}

function reviewKey(type, id) {
  return `${type}:${id}`;
}

function requireCurrentDraft(record, expectedUpdatedAt, res) {
  if (record.status !== 'draft' || record.scheduledPublishAt) {
    res
      .status(409)
      .json({ error: 'Only unscheduled imported drafts can be reviewed' });
    return false;
  }
  if (
    typeof expectedUpdatedAt !== 'string' ||
    new Date(expectedUpdatedAt).getTime() !==
      new Date(record.updatedAt).getTime()
  ) {
    res
      .status(409)
      .json({ error: 'This draft changed. Reload it before continuing.' });
    return false;
  }
  return true;
}

function fail(res, error) {
  if (error.status === 400 || error.name === 'ValidationError')
    return res.status(400).json({ error: error.message });
  if (error.code === 11000 || error.name === 'VersionError')
    return res
      .status(409)
      .json({ error: 'This draft changed. Reload it before continuing.' });
  console.error('Archive staff review failed:', error.name);
  return res.status(500).json({ error: 'Could not complete archive review' });
}

router.get('/types', (_req, res) => {
  const permissions = getUserPermissions(_req.user);
  res.json({ types: permissions.canVerifyArchive === true
    ? Object.keys(models) : ['page', 'archiveDocument'], checks: CHECK_KEYS });
});

// Archive reviewers may select an existing image without media administration.
// This query never scans storage or creates MediaAsset records.
router.get('/media', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const cursor = Number(req.query.cursor || 0);
  if (search.length > 100 || !Number.isSafeInteger(cursor) || cursor < 0 || cursor > 100000)
    return res.status(400).json({ error: 'Invalid media filter' });
  try {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    // Older imported assets can have an empty MIME type; the news builder
    // recognizes those by their registered image URL as well.
    const image = { $or: [
      { mimeType: /^image\//u },
      { url: /\.(png|jpe?g|webp|gif|avif)(\?|$)/iu },
    ] };
    const filter = search
      ? { $and: [image, { $or: [
          { key: new RegExp(escaped, 'iu') },
          { displayName: new RegExp(escaped, 'iu') },
          { inferredName: new RegExp(escaped, 'iu') },
          { originalName: new RegExp(escaped, 'iu') },
        ] }] }
      : image;
    const found = await MediaAsset.find(filter)
      .select('key url displayName inferredName originalName variants')
      .sort({ createdAt: -1, _id: -1 })
      .skip(cursor).limit(25).lean();
    res.json({ media: found.map((asset) => ({
      key: asset.key,
      url: asset.url || buildPublicMediaUrl(asset.key),
      name: asset.displayName || asset.inferredName || asset.originalName || asset.key,
      variants: asset.variants,
    })), nextCursor: found.length === 25 ? cursor + 25 : null });
  } catch (error) { return fail(res, error); }
});

router.get('/:type', async (req, res) => {
  try {
    const Model = getModel(req, res);
    if (!Model) return;
    const status = req.query.status || 'draft';
    const offset = Number(req.query.offset || 0);
    if (
      !['draft', 'published', 'all'].includes(status) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      return res.status(400).json({ error: 'Invalid queue filter' });
    const candidates = await Model.find(eligibleQuery(req.params.type, status))
      .sort({ updatedAt: -1, _id: -1 })
      .skip(offset)
      .limit(51);
    const eligible = candidates
      .slice(0, 50)
      .filter((record) => isArchiveRecord(record, req.params.type));
    const verifications = await Verification.find({
      _id: {
        $in: eligible.map((record) => reviewKey(req.params.type, record._id)),
      },
    }).lean();
    const byId = new Map(
      verifications.map((verification) => [verification._id, verification]),
    );
    const items = eligible.map((record) => {
      const verification = byId.get(reviewKey(req.params.type, record._id));
      const current =
        record.status === 'published' && Boolean(verification?.publishedAt)
          ? true
          : verification &&
            new Date(verification.contentUpdatedAt).getTime() ===
              new Date(record.updatedAt).getTime();
      return {
        id: String(record._id),
        type: req.params.type,
        title: findTitle(record, req.params.type),
        ...(req.params.type === 'newsArticle' ? { layout: record.layout } : {}),
        status: record.status,
        updatedAt: record.updatedAt,
        checksCompleted: current
          ? CHECK_KEYS.filter((key) => verification.checks?.[key] === true)
              .length
          : 0,
      };
    });
    return res.json({
      items,
      nextOffset: candidates.length > 50 ? offset + 50 : null,
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.get('/:type/:id', async (req, res) => {
  try {
    const record = await loadRecord(req, res);
    if (!record) return;
    const verification = await Verification.findById(
      reviewKey(req.params.type, record._id),
    );
    return res.json({
      record: serialize(record, req.params.type, verification),
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.patch('/:type/:id', async (req, res) => {
  try {
    const record = await loadRecord(req, res);
    if (
      !record ||
      !requireCurrentDraft(record, req.body?.expectedUpdatedAt, res)
    )
      return;
    let changes;
    try {
      const selections = req.body?.mediaSelections || [];
      if (!Array.isArray(selections) || selections.length > 20)
        throw new Error('Invalid media selection');
      changes = req.body?.changes && Object.keys(req.body.changes).length
        ? cleanChanges(req.params.type, req.body.changes, documentLibrary, record)
        : {};
      if (!Object.keys(changes).length && !selections.length)
        throw new Error('Choose fields to update');
      if (selections.length && (req.params.type !== 'newsArticle' || record.layout !== 'newsletter'))
        throw new Error('Newsletter media selection is required');
      for (const selection of selections) {
        if (!['en', 'fr'].includes(selection?.language) ||
          !Number.isSafeInteger(selection?.index) || selection.index < 0 ||
          typeof selection.key !== 'string' || selection.key.length > 500)
          throw new Error('Invalid media selection');
        const path = `newsletterBlocks.${selection.language}`;
        const asset = await MediaAsset.findOne({ key: selection.key, $or: [
          { mimeType: /^image\//u },
          { url: /\.(png|jpe?g|webp|gif|avif)(\?|$)/iu },
        ] }).lean();
        if (!asset) throw new Error('Selected image is not in the media library');
        const blocks = changes[path] || JSON.parse(JSON.stringify(record.get(path) || []));
        const block = blocks[selection.index];
        if (block?.type !== 'figure' || !block.image)
          throw new Error('Selected block is not an image');
        block.image = {
          ...block.image,
          url: asset.url || buildPublicMediaUrl(asset.key),
          key: asset.key,
          variants: Object.fromEntries(
            Object.entries(asset.variants || {})
              .filter(([, variant]) => variant?.url)
              .map(([name, variant]) => [name, {
                url: variant.url, width: variant.width, height: variant.height,
              }]),
          ),
        };
        changes[path] = blocks;
      }
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (req.params.type === 'page' && Object.hasOwn(changes, 'blocks'))
      changes.blocks = cleanBlocks(changes.blocks);
    const editablePaths = Object.keys(changes);
    const before = Object.fromEntries(
      Object.keys(changes).map((key) => [key, record.get(key)]),
    );
    for (const [path, value] of Object.entries(changes))
      record.set(path, value);
    if (req.params.type === 'newsArticle' && record.layout === 'newsletter') {
      for (const language of ['en', 'fr']) {
        if (Object.hasOwn(changes, `newsletterBlocks.${language}`)) {
          const path = `content.${language}`;
          before[path] = record.get(path);
          changes[path] = plainText(record.get(`newsletterBlocks.${language}`));
          record.set(path, changes[path]);
        }
      }
    }
    if (
      req.params.type === 'retirementMessage' &&
      Object.hasOwn(changes, `messages.${record.messageLanguage}`)
    ) {
      before.message = record.message;
      changes.message = record.get(`messages.${record.messageLanguage}`);
      record.message = changes.message;
    }
    markContentEdited(record, req.user);
    if (record.constructor.schema.path('lastEditedAt')) {
      changes.lastEditedAt = record.lastEditedAt;
      changes.lastEditedBy = record.lastEditedBy;
    }
    if (record.constructor.schema.path('updatedBy'))
      changes.updatedBy = req.user._id;
    changes.updatedAt = new Date(
      Math.max(Date.now(), new Date(record.updatedAt).getTime() + 1),
    );
    await record.validate();
    const saved = await models[req.params.type].findOneAndUpdate(
      {
        _id: record._id,
        status: 'draft',
        updatedAt: record.updatedAt,
        __v: record.__v,
      },
      { $set: changes, $inc: { __v: 1 } },
      { returnDocument: 'after', runValidators: true, timestamps: false },
    );
    if (!saved)
      return res
        .status(409)
        .json({ error: 'This draft changed. Reload it before continuing.' });
    if (
      [
        'event',
        'retirementMessage',
        'lastPost',
        'comment',
        'newsArticle',
      ].includes(req.params.type)
    )
      await recordContentRevision({
        contentType: req.params.type,
        content: saved,
        actor: req.user,
        status: saved.status,
        fields: editablePaths,
        before,
        after: Object.fromEntries(
          Object.keys(before).map((key) => [key, saved.get(key)]),
        ),
        note: req.body?.note,
      });
    await writeAuditLog({
      req,
      actor: req.user,
      action: 'archive_staff.content_updated',
      targetType: req.params.type,
      target: saved._id,
      targetSnapshot: {
        title: findTitle(saved, req.params.type),
        status: saved.status,
      },
      metadata: { fields: editablePaths },
    });
    return res.json({ record: serialize(saved, req.params.type, null) });
  } catch (error) {
    return fail(res, error);
  }
});

router.put('/:type/:id/verification', async (req, res) => {
  try {
    const record = await loadRecord(req, res);
    if (
      !record ||
      !requireCurrentDraft(record, req.body?.expectedUpdatedAt, res)
    )
      return;
    let checks;
    try {
      checks = cleanChecks(req.body?.checks);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const note = req.body?.note;
    if (typeof note !== 'string' || note.length > 4000)
      return res.status(400).json({ error: 'Invalid review note' });
    const evidence = sourceEvidence(record);
    if (
      checks.source &&
      !evidence.urls.length &&
      !evidence.sourceRecords.some((item) => item.url || item.body)
    )
      return res.status(409).json({
        error: 'Source evidence is missing; ask the import team to add it',
      });
    if (
      checks.translation &&
      missingFrenchFields(record, req.params.type).length &&
      !note.trim()
    )
      return res.status(400).json({
        error:
          'Note the missing French text before marking translations checked',
      });
    if (
      req.params.type === 'comment' &&
      record.legacy.originalApproval === '0' &&
      !note.trim()
    )
      return res.status(400).json({
        error:
          'Record a publication decision for this originally unapproved comment',
      });
    const now = new Date();
    const verification = await Verification.findByIdAndUpdate(
      reviewKey(req.params.type, record._id),
      {
        $set: {
          contentType: req.params.type,
          contentId: record._id,
          contentUpdatedAt: record.updatedAt,
          checks,
          note: note.trim(),
          reviewedBy: req.user._id,
          reviewedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    await writeAuditLog({
      req,
      actor: req.user,
      action: 'archive_staff.verification_saved',
      targetType: req.params.type,
      target: record._id,
      targetSnapshot: {
        title: findTitle(record, req.params.type),
        status: record.status,
      },
      metadata: { checks },
    });
    return res.json({
      record: serialize(record, req.params.type, verification),
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/:type/:id/publish', async (req, res) => {
  try {
    const record = await loadRecord(req, res);
    if (
      !record ||
      !requireCurrentDraft(record, req.body?.expectedUpdatedAt, res)
    )
      return;
    const verification = await Verification.findById(
      reviewKey(req.params.type, record._id),
    );
    if (
      !verification ||
      new Date(verification.contentUpdatedAt).getTime() !==
        new Date(record.updatedAt).getTime() ||
      CHECK_KEYS.some((key) => verification.checks?.[key] !== true)
    )
      return res.status(409).json({
        error:
          'Complete all checks against the current draft before publishing',
      });
    const type = req.params.type;
    if (
      type === 'newsArticle' &&
      ((!record.title?.en?.trim() && !record.title?.fr?.trim()) ||
        !(record.layout === 'newsletter'
          ? record.newsletterBlocks?.en?.length ||
            record.newsletterBlocks?.fr?.length
          : record.content?.en?.trim() || record.content?.fr?.trim()))
    )
      return res.status(400).json({ error: 'A title and body are required' });
    if (
      type === 'retirementMessage' &&
      !record.messages?.en?.trim() &&
      !record.messages?.fr?.trim()
    )
      return res
        .status(400)
        .json({ error: 'A retirement message is required' });
    if (
      type === 'lastPost' &&
      !record.messages?.en?.trim() &&
      !record.messages?.fr?.trim()
    )
      return res.status(400).json({ error: 'A Last Post notice is required' });
    if (type === 'comment' && !record.body?.trim())
      return res.status(400).json({ error: 'A comment body is required' });
    if (
      type === 'archiveDocument' &&
      !record.title?.en?.trim() &&
      !record.title?.fr?.trim()
    )
      return res.status(400).json({ error: 'A document title is required' });
    if (
      type === 'page' &&
      !record.title?.en?.trim() &&
      !record.title?.fr?.trim()
    )
      return res.status(400).json({ error: 'A page title is required' });
    const now = new Date();
    await record.validate();
    const publishedAt = selectPublicationDate(
      record,
      req.body?.publicationDateChoice,
      now,
      req.body?.customPublishedAt,
    );
    const updates = {
      status: 'published',
      publishedAt,
      publishedBy: req.user._id,
      updatedAt: new Date(
        Math.max(Date.now(), new Date(record.updatedAt).getTime() + 1),
      ),
    };
    if (record.constructor.schema.path('reviewedAt')) {
      updates.reviewedAt = now;
      updates.reviewedBy = req.user._id;
    }
    if (record.constructor.schema.path('updatedBy'))
      updates.updatedBy = req.user._id;
    if (record.constructor.schema.path('publicationDateChoice')) {
      updates.publicationDateChoice = record.publicationDateChoice;
      if (record.originalPublishedAt)
        updates.originalPublishedAt = record.originalPublishedAt;
    }
    const saved = await models[type].findOneAndUpdate(
      {
        _id: record._id,
        status: 'draft',
        updatedAt: record.updatedAt,
        __v: record.__v,
        $or: [
          { scheduledPublishAt: null },
          { scheduledPublishAt: { $exists: false } },
        ],
      },
      { $set: updates, $inc: { __v: 1 } },
      { returnDocument: 'after', runValidators: true, timestamps: false },
    );
    if (!saved)
      return res
        .status(409)
        .json({ error: 'This draft changed. Reload it before continuing.' });
    await Verification.updateOne(
      { _id: verification._id },
      { $set: { publishedAt: now } },
    );
    verification.publishedAt = now;
    await writeAuditLog({
      req,
      actor: req.user,
      action: 'content.published',
      targetType: type,
      target: saved._id,
      targetSnapshot: {
        title: findTitle(saved, type),
        status: saved.status,
        publishedAt,
      },
      metadata: {
        source: 'archive-staff-review',
        checks: verification.checks,
        publicationDateChoice: record.publicationDateChoice || null,
      },
    });
    return res.json({ record: serialize(saved, type, verification) });
  } catch (error) {
    return fail(res, error);
  }
});

module.exports = router;
