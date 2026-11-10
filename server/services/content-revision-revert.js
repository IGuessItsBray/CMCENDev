const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { isIP } = require('node:net');
const ContentRevision = require('../models/ContentRevision');
const AuditLog = require('../models/AuditLog');
const { recordContentRevision } = require('./content-revisions');
const { snapshotUser } = require('./audit-log');
const { markContentEdited } = require('./content-edit-metadata');
const { hasText, requiresTextForSave } = require('./save-validation');

const EDITABLE_STATUSES = {
  event: ['pending', 'published', 'hidden'],
  retirementMessage: ['draft', 'pending', 'published', 'hidden'],
  lastPost: ['draft', 'pending', 'published', 'hidden'],
  comment: ['draft', 'pending', 'published', 'rejected', 'hidden'],
  newsArticle: ['draft', 'published', 'hidden'],
};
const LOCALIZED_FIELDS = {
  event: ['title', 'location', 'description', 'registration'],
  retirementMessage: ['messages'],
  lastPost: ['messages'],
  newsArticle: ['title', 'content'],
};
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

function getContentVersion(content) {
  if (!(content.updatedAt instanceof Date) || !Number.isFinite(content.updatedAt.getTime())) return null;
  return createHash('sha256').update(JSON.stringify([
    String(content._id), content.updatedAt.toISOString(), content.__v ?? null,
  ])).digest('hex');
}

function unavailable(revertReason) {
  return { canRevert: false, revertReason };
}

// Only public plain-text paths can be restored. Never spread snapshots into a
// document or accept restored values from the client. Unchanged snapshot fields
// are checked too: an older revision must not overwrite newer related changes.
function getRevisionRevertPlan(content, revision, actor) {
  const type = revision.contentType;
  const language = revision.language || '';
  if (String(revision.contentId) !== String(content._id)) return unavailable('Revision does not belong to this content.');
  if (!['staff_content_updated', 'staff_content_reverted'].includes(revision.action) ||
      (revision.revertState && revision.revertState !== 'applied'))
    return unavailable('This revision is not a completed content change.');
  if (!getContentVersion(content)) return unavailable('This legacy item has no current version. Save it in the editor first.');
  if (!EDITABLE_STATUSES[type]?.includes(content.status)) return unavailable('Content cannot be edited in its current status.');
  if (!['', 'en', 'fr'].includes(language) || !isObject(revision.before) || !isObject(revision.after) ||
      !Array.isArray(revision.fields) || !revision.fields.length ||
      revision.fields.some((field) => typeof field !== 'string' || !owns(revision.before, field) || !owns(revision.after, field)))
    return unavailable('This revision is missing a complete before-and-after snapshot.');

  const before = revision.before;
  const after = revision.after;
  const snapshotFields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changedFields = snapshotFields.filter((field) => !isDeepStrictEqual(before[field], after[field]));
  if (!changedFields.length) return unavailable('This revision contains no text change to revert.');
  if (changedFields.some((field) => !revision.fields.includes(field)))
    return unavailable('This revision does not identify every changed field.');

  const set = {};
  const checks = {};
  for (const field of snapshotFields) {
    if (!owns(before, field) || !owns(after, field)) return unavailable('This revision is missing a complete before-and-after snapshot.');
    const changed = changedFields.includes(field);
    if (field === 'formattedBody' || field === 'blocks') {
      if (changed) return unavailable('Formatting and embedded media changes must be restored in the editor.');
      if (!language || (field === 'blocks' && type !== 'newsArticle') ||
          (field === 'formattedBody' && !['event', 'retirementMessage', 'lastPost'].includes(type)))
        return unavailable('This revision contains unsupported formatting data.');
      const path = field === 'blocks' ? `newsletterBlocks.${language}` : `formattedBody.${language}`;
      const current = get(content, path) ?? (field === 'blocks' ? [] : null);
      if (!isDeepStrictEqual(current, after[field])) return unavailable('Content has changed since this revision.');
      checks[path] = get(content, path);
      continue;
    }

    let paths;
    if (type === 'comment' && field === 'body' && !language) paths = [[field, before[field], after[field]]];
    else if (['retirementMessage', 'lastPost'].includes(type) && field === 'message' && language)
      paths = [[`messages.${language}`, before[field], after[field]]];
    else if (LOCALIZED_FIELDS[type]?.includes(field)) {
      if (language) paths = [[`${field}.${language}`, before[field], after[field]]];
      else {
        if (![before[field], after[field]].every((value) => isObject(value) &&
            Object.keys(value).every((key) => ['en', 'fr'].includes(key)) &&
            ['en', 'fr'].every((key) => typeof value[key] === 'string')))
          return unavailable('This revision is missing complete language snapshots.');
        paths = ['en', 'fr'].map((lang) => [`${field}.${lang}`, before[field][lang], after[field][lang]]);
      }
    } else return unavailable('Only plain-text revisions can be reverted here. Restore status, media, personal details, and other metadata in the editor.');

    for (const [path, oldValue, newValue] of paths) {
      if (typeof oldValue !== 'string' || typeof newValue !== 'string' || oldValue !== oldValue.trim())
        return unavailable('This revision does not contain safely restorable text.');
      const current = get(content, path);
      if ((current ?? '') !== newValue) return unavailable('Content has changed since this revision.');
      checks[path] = current;
      if (oldValue === newValue) continue;
      const lang = path.split('.')[1];
      const isBody = path.startsWith('description.') || path.startsWith('messages.');
      if (isBody) {
        const formattedPath = `formattedBody.${lang}`;
        if (get(content, formattedPath)) return unavailable('This body has formatting. Restore it in the editor to keep text and formatting consistent.');
        checks[formattedPath] = get(content, formattedPath);
      }
      if (type === 'newsArticle' && path.startsWith('content.')) {
        if (content.layout === 'newsletter' || content.newsletterBlocks?.[lang]?.length)
          return unavailable('Newsletter body changes must be restored in the editor to keep blocks and text consistent.');
        checks.layout = content.layout;
        checks[`newsletterBlocks.${lang}`] = content.newsletterBlocks?.[lang];
      }
      if (type === 'newsArticle') {
        const fieldName = path.split('.')[0];
        const limit = fieldName === 'title' ? 240 : 20000;
        if (oldValue.length > limit) return unavailable('The recorded news text exceeds the current editor limits.');
        const requiredLanguage = content.layout !== 'newsletter' || content.newsletter?.language === lang;
        if (!oldValue && requiredLanguage && requiresTextForSave(actor, newValue))
          return unavailable('Reverting would remove required news title or story text.');
      }
      set[path] = oldValue;
    }
  }

  // The old single-language alias is still used by legacy public consumers.
  // Keep it consistent, without modifying the other language or contact data.
  if (type === 'retirementMessage') {
    const path = `messages.${content.messageLanguage}`;
    if (owns(set, path)) {
      if (content.message !== get(content, path)) return unavailable('Legacy message text is inconsistent. Review it in the editor first.');
      checks.message = content.message;
      checks.messageLanguage = content.messageLanguage;
      set.message = set[path];
    }
  }
  const nextTitle = { ...content.title };
  for (const lang of ['en', 'fr']) if (owns(set, `title.${lang}`)) nextTitle[lang] = set[`title.${lang}`];
  if (type === 'event' && !hasText(nextTitle) && requiresTextForSave(actor, content.title))
    return unavailable('Reverting would remove the required event title.');
  if (type === 'comment' && owns(set, 'body') && !hasText(set.body) && requiresTextForSave(actor, content.body))
    return unavailable('Reverting would remove the required comment text.');
  return { canRevert: true, revertReason: '', set, checks, changedFields };
}

function failure(status, message, details = {}) {
  return Object.assign(new Error(message), { status, ...details });
}

async function revertContentRevision({ Model, content, revision, version, actor, req }) {
  if (version !== getContentVersion(content)) throw failure(409, 'Content changed. Reload its history before reverting.');
  if (await ContentRevision.exists({ contentType: revision.contentType, contentId: content._id, revertState: 'pending' }))
    throw failure(409, 'An earlier revert needs review before another revert can run.');
  const plan = getRevisionRevertPlan(content, revision, actor);
  if (!plan.canRevert) throw failure(409, plan.revertReason);

  // Run the real model validators before journaling, but persist only the
  // explicit allowlist. Validation hooks must not change unrelated fields.
  const candidate = Model.hydrate(content);
  for (const [path, value] of Object.entries(plan.set)) candidate.set(path, value);
  try {
    await candidate.validate();
    for (const [path, value] of Object.entries(plan.set)) {
      if (!isDeepStrictEqual(candidate.get(path), value)) throw new Error('Snapshot requires normalization');
    }
  } catch {
    throw failure(409, 'The recorded text no longer passes content validation. Review it in the editor.');
  }

  const now = new Date(Math.max(Date.now(), content.updatedAt.getTime() + 1));
  const nextVersion = getContentVersion({ ...content, updatedAt: now, __v: (content.__v || 0) + 1 });
  const reverse = await recordContentRevision({
    contentType: revision.contentType, content, actor, status: content.status,
    language: revision.language || '', fields: plan.changedFields,
    before: revision.after, after: revision.before,
    revertedRevisionId: revision._id, revertState: 'pending', revertVersion: nextVersion,
  });
  let audit;
  try {
    const ip = String(req?.ip || '').replace(/^::ffff:/u, '').replace(/^::1$/u, '127.0.0.1');
    // Unlike the best-effort general audit helper, failure here prevents a
    // content write. Both durable records exist before the compare-and-swap.
    audit = await AuditLog.create({
      action: 'content.revert_requested', actor: actor._id, actorSnapshot: snapshotUser(actor),
      targetType: revision.contentType, target: content._id,
      targetSnapshot: { status: content.status },
      metadata: {
        revisionId: String(reverse._id), revertedRevisionId: String(revision._id),
        language: revision.language || '', fields: plan.changedFields,
        before: revision.after, after: revision.before, outcome: 'pending',
        previousVersion: version, version: nextVersion,
        ...(isIP(ip) ? { ipAddress: ip, ipAddresses: [ip] } : {}),
      },
    });
  } catch (error) {
    await ContentRevision.updateOne({ _id: reverse._id }, { $set: { revertState: 'failed' } });
    throw error;
  }

  const filter = { _id: content._id, updatedAt: content.updatedAt, status: content.status,
    __v: content.__v === undefined ? { $exists: false } : content.__v };
  for (const [path, value] of Object.entries(plan.checks)) filter[path] = value === undefined ? { $exists: false } : { $eq: value };
  const metadata = {};
  markContentEdited(metadata, actor, now);
  const set = { ...plan.set, ...metadata, updatedAt: now };
  if (Model.schema.path('updatedBy')) set.updatedBy = actor._id;
  let updated;
  try {
    updated = await Model.updateOne(filter, { $set: set, $inc: { __v: 1 } }, { timestamps: false, runValidators: true });
  } catch (error) {
    // A lost database reply can mean the CAS succeeded. Keep the durable
    // pending records and do not guess, roll back, or retry the content write.
    console.error('Content revert outcome needs review:', reverse._id, error);
    throw failure(503, 'The revert outcome could not be confirmed. Reload and ask an administrator to review it before retrying.',
      { contentChanged: null, revisionId: String(reverse._id) });
  }
  const applied = updated.modifiedCount === 1;
  try {
    const auditResult = await AuditLog.updateOne({ _id: audit._id }, { $set: {
      action: applied ? 'content.reverted' : 'content.revert_conflicted',
      'metadata.outcome': applied ? 'applied' : 'conflict',
    } });
    if (auditResult.matchedCount !== 1) throw new Error('Revert audit record is missing');
    const revisionResult = await ContentRevision.updateOne({ _id: reverse._id }, { $set: { revertState: applied ? 'applied' : 'conflict' } });
    if (revisionResult.matchedCount !== 1) throw new Error('Revert revision is missing');
  } catch (error) {
    console.error('Content revert journal needs review:', reverse._id, error);
    throw failure(503, applied
      ? 'Content was reverted, but history finalization failed. Reload and ask an administrator to review it.'
      : 'Content was not reverted, but history finalization failed. Reload and ask an administrator to review it.',
    { contentChanged: applied, revisionId: String(reverse._id) });
  }
  if (!applied) throw failure(409, 'Content changed. Reload its history before reverting.');
  return { message: 'Content revision reverted', revisionId: String(reverse._id), version: nextVersion };
}

module.exports = { getContentVersion, getRevisionRevertPlan, revertContentRevision };
