const express = require('express');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const crypto = require('crypto');
const {
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const User = require('../models/User');
const Role = require('../models/Role');
const MediaAsset = require('../models/MediaAsset');
const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const NewsArticle = require('../models/NewsArticle');
const Page = require('../models/Page');
const ContentRevision = require('../models/ContentRevision');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const WeeklyBriefRun = require('../models/WeeklyBriefRun');
const NewsBlast = require('../models/NewsBlast');
const { USER_ROLES } = require('../config/roles');
const {
  PERMISSION_CATALOG,
  normalizePermissionKeys,
  getUserPermissions,
} = require('../config/permissions');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog, snapshotUser } = require('../services/audit-log');
const {
  cleanLocalizedText,
  cleanString,
} = require('../services/content-utils');
const { isEmailSendingDisabled, sendMail } = require('../services/mailer');
const {
  createUnsubscribeToken,
  getCaslSenderInfo,
} = require('../services/weekly-brief');
const {
  buildPublicMediaUrl,
  getMediaKeyFromValue,
} = require('../services/media-library');
const {
  getEventSnapshot,
  getEventTitle,
  getLastPostMessageSnapshot,
  getRetirementCommentSnapshot,
  getRetirementCommentTitle,
  getRetirementMessageSnapshot,
  getRetirementMessageTitle,
} = require('../services/content-snapshots');
const {
  hideContent,
  restoreContent,
} = require('../services/content-lifecycle');
const { recordContentRevision } = require('../services/content-revisions');
const { linkMediaAssetToSource } = require('../services/media-assets');
const s3Client = require('../storage');

const router = express.Router();

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function applyAdminStringFields(document, updates, fieldNames, changedFields) {
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(updates, fieldName)) continue;
    if (typeof updates[fieldName] !== 'string') {
      return `${fieldName} must be a string`;
    }
    document[fieldName] = cleanString(updates[fieldName]);
    changedFields.push(fieldName);
  }
  return '';
}

function applyAdminLocalizedFields(
  document,
  updates,
  fieldNames,
  changedFields,
) {
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(updates, fieldName)) continue;
    if (!isPlainObject(updates[fieldName])) {
      return `${fieldName} must be an English/French text object`;
    }
    document[fieldName] = cleanLocalizedText(updates[fieldName]);
    changedFields.push(fieldName);
  }
  return '';
}

function getLastPostAdminSnapshot(lastPost) {
  const deceased = lastPost.deceased || {};
  const name = [deceased.fullRank, deceased.firstName, deceased.surname]
    .filter(Boolean)
    .join(' ');
  return { title: name || 'In Memoriam', status: lastPost.status };
}

function getNewsAdminSnapshot(article) {
  return {
    title: article.title?.en || article.title?.fr || 'Untitled news story',
    status: article.status,
    publishedAt: article.publishedAt || null,
  };
}

function getAdminContentMediaDetails(targetType, document) {
  if (targetType === 'event') {
    return {
      fields: ['imagePath'],
      values: { imagePath: cleanString(document.imagePath) },
      mediaUrl: cleanString(document.imagePath),
      sourceType: 'event',
      context: 'event',
      sourceModel: 'Event',
      sourceField: 'imagePath',
      sourceUrl: `/event?id=${encodeURIComponent(String(document._id))}`,
      inferredName: getEventTitle(document),
    };
  }

  if (targetType === 'retirementMessage') {
    return {
      fields: ['photoUrl', 'photoDisplayUrl'],
      values: {
        photoUrl: cleanString(document.photoUrl),
        photoDisplayUrl: cleanString(document.photoDisplayUrl),
      },
      mediaUrl: cleanString(document.photoUrl),
      sourceType: 'retirementMessage',
      context: 'retirement-message',
      sourceModel: 'RetirementMessage',
      sourceField: 'photoUrl',
      sourceUrl: `/retirement-message?id=${encodeURIComponent(String(document._id))}`,
      inferredName: getRetirementMessageTitle(document),
    };
  }

  if (targetType === 'lastPost') {
    return {
      fields: ['imageUrl', 'imageDisplayUrl'],
      values: {
        imageUrl: cleanString(document.imageUrl),
        imageDisplayUrl: cleanString(document.imageDisplayUrl),
      },
      mediaUrl: cleanString(document.imageUrl),
      sourceType: 'lastPostMessage',
      context: 'last-post',
      sourceModel: 'LastPostMessage',
      sourceField: 'imageUrl',
      sourceUrl: `/last-post-message?id=${encodeURIComponent(String(document._id))}`,
      inferredName: getLastPostMessageTitle(document),
    };
  }

  return null;
}

async function saveAdminContentEdit({
  req,
  res,
  model,
  id,
  targetType,
  notFoundMessage,
  applyUpdates,
  getSnapshot,
  responseKey,
}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ error: notFoundMessage });
  }

  const document = await model.findById(id);
  if (!document) return res.status(404).json({ error: notFoundMessage });

  const mediaBefore = getAdminContentMediaDetails(targetType, document);
  const changedFields = [];
  const validationError = applyUpdates(document, req.body, changedFields);
  if (validationError) return res.status(400).json({ error: validationError });
  if (!changedFields.length) {
    return res
      .status(400)
      .json({ error: 'Provide at least one editable field' });
  }

  if (document.schema.path('updatedBy')) {
    document.updatedBy = req.user._id;
  }
  await document.save();

  const mediaAfter = getAdminContentMediaDetails(targetType, document);
  if (mediaBefore && mediaAfter) {
    const mediaFields = mediaAfter.fields.filter(
      (field) => mediaBefore.values[field] !== mediaAfter.values[field],
    );

    if (mediaFields.length) {
      if (mediaAfter.mediaUrl) {
        await linkMediaAssetToSource({
          mediaUrl: mediaAfter.mediaUrl,
          sourceType: mediaAfter.sourceType,
          context: mediaAfter.context,
          sourceModel: mediaAfter.sourceModel,
          sourceId: document._id,
          sourceField: mediaAfter.sourceField,
          sourceUrl: mediaAfter.sourceUrl,
          inferredName: mediaAfter.inferredName,
        });
      }

      await recordContentRevision({
        contentType: targetType,
        content: document,
        actor: req.user,
        status: document.status,
        fields: mediaFields,
        before: mediaBefore.values,
        after: mediaAfter.values,
      });
    }
  }

  await writeAuditLog({
    req,
    action: 'content.admin_updated',
    actor: req.user,
    targetType,
    target: document._id,
    targetSnapshot: getSnapshot(document),
    metadata: { fields: changedFields, source: 'admin-content-edit' },
  });

  return res.json({
    message: 'Content updated',
    [responseKey]: document,
  });
}

const CONTENT_AREAS = Object.freeze([
  'general',
  'branch',
  'association',
  'foundation',
  'museum',
]);

const DEVELOPER_CONFIRMATION = 'DEVELOPER';
const DEFAULT_MEDIA_PAGE_SIZE = 100;
const MAX_MEDIA_PAGE_SIZE = 500;
const MAX_MEDIA_LIST_OBJECTS = 5000;
const DEFAULT_USER_PAGE_SIZE = 50;
const MAX_USER_PAGE_SIZE = 100;
const LEGACY_GHOST_EMAIL_SUFFIX = /@cmcen\.local$/i;
const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_INVITATION_MESSAGE_LENGTH = 2000;
const USER_EXPORT_FORMATS = Object.freeze(['csv', 'pdf']);
const USER_EXPORT_FILTER_OPTIONS = Object.freeze({
  roles: USER_ROLES,
  accountTypes: ['member', 'ghost', 'invited'],
});
const USER_EXPORT_FIELDS = Object.freeze([
  ['id', 'User ID'],
  ['accountType', 'Account type'],
  ['username', 'Username'],
  ['email', 'Email'],
  ['accountName', 'Account name'],
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['rank', 'Rank'],
  ['postNominals', 'Post-nominals'],
  ['company', 'Company'],
  ['status', 'Status'],
  ['affiliationElement', 'Affiliation element'],
  ['trade', 'Trade'],
  ['tradeOther', 'Trade other'],
  ['currentUnit', 'Current unit'],
  ['preferredLanguage', 'Preferred language'],
  ['role', 'Role'],
  ['customRoles', 'Custom roles'],
  ['contentAreas', 'Content areas'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['addressCity', 'City'],
  ['addressStateProvince', 'State/province'],
  ['addressPostalCode', 'Postal code'],
  ['addressCountry', 'Country'],
  ['emailVerificationRequired', 'Email verification required'],
  ['emailVerified', 'Email verified'],
  ['emailVerifiedAt', 'Email verified at'],
  ['mfaEnabled', 'MFA enabled'],
  ['totpEnabled', 'TOTP enabled'],
  ['totpAppName', 'TOTP app name'],
  ['passkeyCount', 'Passkey count'],
  ['passkeyLabels', 'Passkey labels'],
  ['passkeyMetadata', 'Passkey metadata'],
  ['createdAt', 'Created at'],
  ['updatedAt', 'Updated at'],
]);

function verifyDestructiveTotp(user, code) {
  if (!user?.totp?.secret || user.totp.enabled !== true) return false;

  return speakeasy.totp.verify({
    secret: user.totp.secret,
    encoding: 'base32',
    token: String(code || '').replace(/\D/gu, ''),
    window: Number(process.env.TOTP_WINDOW || 2),
  });
}

function hasFreshDestructivePasskeyVerification(user) {
  const verifiedAt = user?.twoFactor?.destructiveVerifiedAt;
  return (
    verifiedAt && Date.now() - new Date(verifiedAt).getTime() <= 5 * 60 * 1000
  );
}

// GET /api/admin/review-counts
// Return the current moderation workload without loading each submission.
router.get(
  '/review-counts',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const [events, retirementMessages, lastPosts, comments] =
        await Promise.all([
          Event.countDocuments({ status: 'pending' }),
          RetirementMessage.countDocuments({ status: 'pending' }),
          LastPostMessage.countDocuments({ status: 'pending' }),
          RetirementComment.countDocuments({ status: 'pending' }),
        ]);

      res.json({
        events,
        retirementMessages,
        lastPosts,
        comments,
      });
    } catch (error) {
      console.error('Could not load review submission counts:', error);
      res.status(500).json({
        error: 'Could not load review submission counts',
      });
    }
  },
);

const REVISION_CONTENT_MODELS = Object.freeze({
  event: Event,
  retirementMessage: RetirementMessage,
  lastPost: LastPostMessage,
  retirementComment: RetirementComment,
  newsArticle: NewsArticle,
});

const REVIEW_CONTENT_WORKSPACE_TYPES = Object.freeze([
  'event',
  'retirementMessage',
  'lastPost',
  'retirementComment',
]);
const CONTENT_WORKSPACE_TYPES = Object.freeze([
  ...REVIEW_CONTENT_WORKSPACE_TYPES,
  'newsArticle',
]);
const CONTENT_WORKSPACE_STATUSES = Object.freeze([
  'draft',
  'pending',
  'published',
  'rejected',
  'hidden',
]);
const CONTENT_WORKSPACE_TRANSLATION_FILTERS = Object.freeze([
  'all',
  'missing-any',
  'missing-en',
  'missing-fr',
]);
const CONTENT_WORKSPACE_SEARCH_MAX_LENGTH = 120;

function requireContentWorkspaceAccess(req, res, next) {
  const permissions = getUserPermissions(req.user);

  if (
    permissions.canReviewAndPublish !== true &&
    permissions.canManageNews !== true
  ) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  req.permissions = permissions;
  next();
}

function getPermittedContentWorkspaceTypes(permissions) {
  return [
    ...(permissions.canReviewAndPublish === true
      ? REVIEW_CONTENT_WORKSPACE_TYPES
      : []),
    ...(permissions.canManageNews === true ? ['newsArticle'] : []),
  ];
}

function getContentWorkspaceLimit(value) {
  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit < 1) return 50;
  return Math.min(limit, 100);
}

function encodeContentWorkspaceCursor(cursors) {
  const serializedCursors = {};

  Object.entries(cursors || {}).forEach(([type, cursor]) => {
    if (
      !CONTENT_WORKSPACE_TYPES.includes(type) ||
      type === 'all' ||
      !cursor ||
      !mongoose.Types.ObjectId.isValid(cursor.id)
    ) {
      return;
    }

    const updatedAt = new Date(cursor.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return;

    serializedCursors[type] = {
      id: String(cursor.id),
      updatedAt: updatedAt.toISOString(),
    };
  });

  return Buffer.from(JSON.stringify({ cursors: serializedCursors })).toString(
    'base64url',
  );
}

function decodeContentWorkspaceCursor(value) {
  const cursor = cleanString(value);

  if (!cursor) return {};

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );

    if (!isPlainObject(decoded) || !isPlainObject(decoded.cursors)) {
      return undefined;
    }

    const cursors = {};

    for (const [type, entry] of Object.entries(decoded.cursors)) {
      if (
        !CONTENT_WORKSPACE_TYPES.includes(type) ||
        type === 'all' ||
        !isPlainObject(entry) ||
        !mongoose.Types.ObjectId.isValid(entry.id)
      ) {
        return undefined;
      }

      const updatedAt = new Date(entry.updatedAt);
      if (Number.isNaN(updatedAt.getTime())) return undefined;

      cursors[type] = {
        id: new mongoose.Types.ObjectId(entry.id),
        updatedAt,
      };
    }

    return cursors;
  } catch (error) {
    return undefined;
  }
}

function getContentWorkspaceCursorFilter(cursor) {
  if (!cursor) return {};

  return {
    $or: [
      { updatedAt: { $lt: cursor.updatedAt } },
      {
        updatedAt: cursor.updatedAt,
        _id: { $lt: cursor.id },
      },
    ],
  };
}

function getContentWorkspaceNextCursor(cursors, items) {
  const nextCursors = { ...cursors };

  items.forEach((item) => {
    const updatedAt = new Date(item.updatedAt);

    if (
      !CONTENT_WORKSPACE_TYPES.includes(item.type) ||
      item.type === 'all' ||
      !mongoose.Types.ObjectId.isValid(item._id) ||
      Number.isNaN(updatedAt.getTime())
    ) {
      return;
    }

    nextCursors[item.type] = {
      id: item._id,
      updatedAt,
    };
  });

  return encodeContentWorkspaceCursor(nextCursors);
}

function cleanContentWorkspaceSearch(value) {
  return String(value || '')
    .trim()
    .slice(0, CONTENT_WORKSPACE_SEARCH_MAX_LENGTH);
}

function getContentWorkspaceSearchFilter(type, searchPattern) {
  if (!searchPattern) return {};

  const searchFields = {
    event: [
      'title.en',
      'title.fr',
      'location.en',
      'location.fr',
      'description.en',
      'description.fr',
      'registration.en',
      'registration.fr',
      'city',
      'provinceRegion',
      'organizingEntity',
      'eventType',
    ],
    retirementMessage: [
      'retiree.rank',
      'retiree.firstName',
      'retiree.lastName',
      'retiree.postNominals',
      'retiree.tradeRole',
      'messages.en',
      'messages.fr',
    ],
    lastPost: [
      'title',
      'slug',
      'deceased.fullRank',
      'deceased.firstName',
      'deceased.surname',
      'deceased.postNominal',
      'messages.en',
      'messages.fr',
    ],
    retirementComment: ['body'],
    newsArticle: ['title.en', 'title.fr', 'content.en', 'content.fr'],
  }[type];

  return searchFields
    ? { $or: searchFields.map((field) => ({ [field]: searchPattern })) }
    : {};
}

function getContentWorkspaceTranslationFilter(type, translation) {
  const languages = {
    'missing-any': ['en', 'fr'],
    'missing-en': ['en'],
    'missing-fr': ['fr'],
  }[translation];
  const localizedFields = {
    event: ['title', 'location', 'description', 'registration'],
    retirementMessage: ['messages'],
    lastPost: ['messages'],
    newsArticle: ['title', 'content'],
  }[type];

  if (!languages || !localizedFields) return {};

  return {
    $or: localizedFields.flatMap((field) =>
      languages.map((language) => {
        const sourceLanguage = language === 'en' ? 'fr' : 'en';

        return {
          [`${field}.${language}`]: { $in: ['', null] },
          [`${field}.${sourceLanguage}`]: {
            $exists: true,
            $nin: ['', null],
          },
        };
      }),
    ),
  };
}

function getContentWorkspaceRecordFilter(
  contentFilter,
  type,
  searchPattern,
  translation,
) {
  const filters = [
    contentFilter,
    getContentWorkspaceSearchFilter(type, searchPattern),
    getContentWorkspaceTranslationFilter(type, translation),
  ].filter((filter) => Object.keys(filter).length);

  return filters.length === 1 ? filters[0] : { $and: filters };
}

function toContentWorkspaceItem(type, content) {
  const base = {
    _id: content._id,
    type,
    status: content.status,
    hiddenFromStatus: content.hiddenFromStatus || '',
    rejectionReason: content.rejectionReason || '',
    updatedAt: content.updatedAt,
    createdAt: content.createdAt,
  };

  if (type === 'event') {
    return {
      ...base,
      title: getEventTitle(content),
      content: {
        title: content.title || {},
        location: content.location || {},
        description: content.description || {},
        registration: content.registration || {},
        city: content.city || '',
        provinceRegion: content.provinceRegion || '',
        organizingEntity: content.organizingEntity || '',
        eventType: content.eventType || '',
        timezone: content.timezone || '',
        startDate: content.startDate || null,
        endDate: content.endDate || null,
        allDay: content.allDay === true,
        rsvpEnabled: content.rsvpEnabled === true,
        rsvpDeadline: content.rsvpDeadline || null,
        imagePath: content.imagePath || '',
        contentArea: content.contentArea || 'general',
        submitter: content.submitter || {},
        publicationPermission: content.publicationPermission || {},
        createdBy: content.createdBy || null,
      },
    };
  }

  if (type === 'retirementMessage') {
    return {
      ...base,
      title: getRetirementMessageTitle(content),
      content: {
        messages: content.messages || {},
        messageLanguage: content.messageLanguage || '',
        retiree: content.retiree || {},
        photoUrl: content.photoUrl || '',
        photoDisplayUrl: content.photoDisplayUrl || '',
        submitter: content.submitter || {},
        publicationConsent: content.publicationConsent || {},
        memberReviewConfirmation: content.memberReviewConfirmation || {},
        createdBy: content.createdBy || null,
      },
    };
  }

  if (type === 'lastPost') {
    return {
      ...base,
      title: getLastPostMessageTitle(content),
      content: {
        messages: content.messages || {},
        messageLanguage: content.messageLanguage || '',
        deceased: content.deceased || {},
        title: content.title || '',
        slug: content.slug || '',
        imageUrl: content.imageUrl || '',
        imageDisplayUrl: content.imageDisplayUrl || '',
        photoUrl: content.photoUrl || '',
        submitter: content.submitter || {},
        publicationPermission: content.publicationPermission || {},
        createdBy: content.createdBy || null,
      },
    };
  }

  if (type === 'newsArticle') {
    return {
      ...base,
      title: content.title?.en || content.title?.fr || 'Untitled news story',
      content: {
        title: content.title || {},
        content: content.content || {},
        imageUrl: content.imageUrl || '',
        imageDisplayUrl: content.imageDisplayUrl || '',
        createdBy: content.createdBy || null,
        publishedBy: content.publishedBy || null,
        publishedAt: content.publishedAt || null,
      },
    };
  }

  return {
    ...base,
    title: getRetirementCommentTitle(content),
    content: {
      body: content.body || '',
      author: content.author || null,
      createdAt: content.createdAt || null,
      retirementMessage: content.retirementMessage
        ? {
            _id: content.retirementMessage._id,
            title: getRetirementMessageTitle(content.retirementMessage),
          }
        : null,
    },
  };
}

// GET /api/admin/content
// Return a staff-only cross-content workspace, including submission metadata
// needed to review the record without returning to the legacy review page.
// Search and bilingual-completion filters are applied before each content type
// is limited so staff can find records beyond the first mixed result set.
router.get(
  '/content',
  authMiddleware,
  requireContentWorkspaceAccess,
  async (req, res) => {
    try {
      const type = String(req.query.type || 'all');
      const status = String(req.query.status || 'all');
      const translation = String(req.query.translation || 'all');
      const search = cleanContentWorkspaceSearch(req.query.search);
      const contentId = String(req.query.id || '').trim();
      const limit = getContentWorkspaceLimit(req.query.limit);
      const cursors = decodeContentWorkspaceCursor(req.query.cursor);

      if (type !== 'all' && !CONTENT_WORKSPACE_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Unsupported content type' });
      }

      const permittedTypes = getPermittedContentWorkspaceTypes(req.permissions);
      if (type !== 'all' && !permittedTypes.includes(type)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      if (status !== 'all' && !CONTENT_WORKSPACE_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Unsupported content status' });
      }

      if (!CONTENT_WORKSPACE_TRANSLATION_FILTERS.includes(translation)) {
        return res
          .status(400)
          .json({ error: 'Unsupported translation status' });
      }

      if (contentId && !mongoose.Types.ObjectId.isValid(contentId)) {
        return res.status(400).json({ error: 'Invalid content ID' });
      }

      if (cursors === undefined) {
        return res
          .status(400)
          .json({ error: 'Invalid content workspace cursor' });
      }

      const contentFilter = {
        ...(status === 'all' ? {} : { status }),
        ...(contentId ? { _id: contentId } : {}),
      };
      const searchPattern = search
        ? new RegExp(escapeRegex(search), 'i')
        : null;
      const types = (type === 'all' ? permittedTypes : [type]).filter(
        (contentType) =>
          translation === 'all' || contentType !== 'retirementComment',
      );
      const getWorkspaceFilter = (contentType) =>
        getContentWorkspaceRecordFilter(
          {
            ...contentFilter,
            ...getContentWorkspaceCursorFilter(cursors[contentType]),
          },
          contentType,
          searchPattern,
          translation,
        );
      const queries = [];

      if (types.includes('event')) {
        queries.push(
          Event.find(getWorkspaceFilter('event'))
            .select(
              'title location description registration city provinceRegion organizingEntity eventType timezone startDate endDate allDay rsvpEnabled rsvpDeadline imagePath contentArea submitter publicationPermission createdBy status hiddenFromStatus rejectionReason updatedAt createdAt',
            )
            .populate([
              {
                path: 'createdBy',
                select: 'username accountName firstName lastName email role',
              },
              {
                path: 'publicationPermission.confirmedBy',
                select: 'username accountName firstName lastName email role',
              },
            ])
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
            .then((records) =>
              records.map((record) => toContentWorkspaceItem('event', record)),
            ),
        );
      }

      if (types.includes('retirementMessage')) {
        queries.push(
          RetirementMessage.find(getWorkspaceFilter('retirementMessage'))
            .select(
              'retiree messages messageLanguage photoUrl photoDisplayUrl submitter publicationConsent memberReviewConfirmation createdBy status hiddenFromStatus rejectionReason updatedAt createdAt',
            )
            .populate({
              path: 'createdBy',
              select: 'username accountName firstName lastName email role',
            })
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
            .then((records) =>
              records.map((record) =>
                toContentWorkspaceItem('retirementMessage', record),
              ),
            ),
        );
      }

      if (types.includes('lastPost')) {
        queries.push(
          LastPostMessage.find(getWorkspaceFilter('lastPost'))
            .select(
              'title slug deceased messages messageLanguage imageUrl imageDisplayUrl photoUrl submitter publicationPermission createdBy status hiddenFromStatus rejectionReason updatedAt createdAt',
            )
            .populate([
              {
                path: 'createdBy',
                select: 'username accountName firstName lastName email role',
              },
              {
                path: 'publicationPermission.confirmedBy',
                select: 'username accountName firstName lastName email role',
              },
            ])
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
            .then((records) =>
              records.map((record) =>
                toContentWorkspaceItem('lastPost', record),
              ),
            ),
        );
      }

      if (types.includes('retirementComment')) {
        queries.push(
          RetirementComment.find(getWorkspaceFilter('retirementComment'))
            .select(
              'retirementMessage author body status hiddenFromStatus rejectionReason updatedAt createdAt',
            )
            .populate([
              { path: 'retirementMessage', select: 'retiree' },
              {
                path: 'author',
                select: 'username accountName firstName lastName email role',
              },
            ])
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
            .then((records) =>
              records.map((record) =>
                toContentWorkspaceItem('retirementComment', record),
              ),
            ),
        );
      }

      if (types.includes('newsArticle')) {
        queries.push(
          NewsArticle.find(getWorkspaceFilter('newsArticle'))
            .select(
              'title content imageUrl imageDisplayUrl createdBy publishedBy publishedAt status hiddenFromStatus updatedAt createdAt',
            )
            .populate([
              {
                path: 'createdBy',
                select: 'username accountName firstName lastName email role',
              },
              {
                path: 'publishedBy',
                select: 'username accountName firstName lastName email role',
              },
            ])
            .sort({ updatedAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean()
            .then((records) =>
              records.map((record) =>
                toContentWorkspaceItem('newsArticle', record),
              ),
            ),
        );
      }

      const matchingItems = (await Promise.all(queries))
        .flat()
        .sort(
          (left, right) =>
            new Date(right.updatedAt || right.createdAt || 0) -
            new Date(left.updatedAt || left.createdAt || 0),
        );
      const hasMore = !contentId && matchingItems.length > limit;
      const items = matchingItems.slice(0, limit);

      return res.json({
        items,
        hasMore,
        nextCursor: hasMore
          ? getContentWorkspaceNextCursor(cursors, items)
          : '',
      });
    } catch (error) {
      console.error('Could not load content workspace:', error);
      return res
        .status(500)
        .json({ error: 'Could not load content workspace' });
    }
  },
);

// GET /api/admin/content/:contentType/:contentId/revisions
// Return staff-authored revisions without exposing submitter contact details.
router.get(
  '/content/:contentType/:contentId/revisions',
  authMiddleware,
  requireContentWorkspaceAccess,
  async (req, res) => {
    try {
      const { contentType, contentId } = req.params;
      const Model = REVISION_CONTENT_MODELS[contentType];

      if (!Model) {
        return res.status(400).json({ error: 'Unsupported content type' });
      }

      if (
        !getPermittedContentWorkspaceTypes(req.permissions).includes(
          contentType,
        )
      ) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const exists = await Model.exists({ _id: contentId });

      if (!exists) {
        return res.status(404).json({ error: 'Content not found' });
      }

      const revisions = await ContentRevision.find({
        contentType,
        contentId,
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .lean();

      return res.json({ revisions });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid content ID' });
      }

      console.error('Could not load content revisions:', error);
      return res
        .status(500)
        .json({ error: 'Could not load content revisions' });
    }
  },
);

function cleanContentAreas(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(value.map((area) => String(area || '').trim()).filter(Boolean)),
  ];
}

function normalizeRoleSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanRoleName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanRoleColor(value) {
  const cleanValue = String(value || '').trim();

  return /^#[0-9a-f]{6}$/iu.test(cleanValue) ? cleanValue.toUpperCase() : '';
}

function cleanRoleIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.map((roleId) => String(roleId || '').trim()).filter(Boolean),
    ),
  ];
}

async function validateCustomRoleIds(roleIds) {
  const cleanIds = cleanRoleIds(roleIds);

  if (!cleanIds.length) {
    return {
      roleIds: [],
      roles: [],
    };
  }

  const roles = await Role.find({
    _id: { $in: cleanIds },
  }).select('_id name slug color permissions');

  if (roles.length !== cleanIds.length) {
    return {
      error: 'Invalid custom role provided',
    };
  }

  return {
    roleIds: cleanIds,
    roles,
  };
}

function toAdminRole(role) {
  const plainRole = role.toObject ? role.toObject() : role;

  return {
    _id: plainRole._id,
    name: plainRole.name,
    slug: plainRole.slug,
    description: plainRole.description || '',
    color: plainRole.color || '#4F46E5',
    permissions: plainRole.permissions || [],
    createdAt: plainRole.createdAt,
    updatedAt: plainRole.updatedAt,
  };
}

async function getAdminRoles() {
  const roles = await Role.find({})
    .select('name slug description color permissions createdAt updatedAt')
    .sort({ name: 1 })
    .lean();

  return roles.map(toAdminRole);
}

async function createRoleUpdate(body, actor, { requireName = false } = {}) {
  const source = body || {};
  const update = {};
  let hasEditableUpdate = false;

  if (requireName || Object.prototype.hasOwnProperty.call(source, 'name')) {
    const name = cleanRoleName(source.name);

    if (!name) {
      return { error: 'Role name is required' };
    }

    update.name = name;
    hasEditableUpdate = true;
  }

  if (requireName || Object.prototype.hasOwnProperty.call(source, 'slug')) {
    const slug = normalizeRoleSlug(source.slug || source.name);

    if (!slug) {
      return { error: 'Role slug is required' };
    }

    update.slug = slug;
    hasEditableUpdate = true;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'description')) {
    update.description = String(source.description || '').trim();
    hasEditableUpdate = true;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'color')) {
    const color = cleanRoleColor(source.color);

    if (!color) {
      return { error: 'Role color must be a hex color like #4F46E5' };
    }

    update.color = color;
    hasEditableUpdate = true;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'permissions')) {
    const permissions = normalizePermissionKeys(source.permissions);

    if (permissions.length !== cleanRoleIds(source.permissions).length) {
      return { error: 'Invalid permission provided' };
    }

    update.permissions = permissions;
    hasEditableUpdate = true;
  }

  if (hasEditableUpdate) {
    update.updatedBy = actor?._id || null;
  }

  return {
    update,
    hasEditableUpdate,
  };
}

function validateContentAreas(contentAreas) {
  return contentAreas.every((area) => CONTENT_AREAS.includes(area));
}

function areStringArraysEqual(first = [], second = []) {
  const normalizedFirst = [...first].map(String).sort();
  const normalizedSecond = [...second].map(String).sort();

  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every(
    (value, index) => value === normalizedSecond[index],
  );
}

function getStringArrayDiff(previousValues = [], nextValues = []) {
  const previousSet = new Set((previousValues || []).map(String));
  const nextSet = new Set((nextValues || []).map(String));

  return {
    added: [...nextSet].filter((value) => !previousSet.has(value)).sort(),
    removed: [...previousSet].filter((value) => !nextSet.has(value)).sort(),
  };
}

function getPermissionDetails(permissionKeys = []) {
  const permissionsByKey = new Map(
    PERMISSION_CATALOG.map((permission) => [permission.key, permission]),
  );

  return (permissionKeys || []).map((permissionKey) => {
    const permission = permissionsByKey.get(permissionKey);

    return {
      key: permissionKey,
      label: permission?.label || permissionKey,
      group: permission?.group || '',
      action: permission?.action || '',
    };
  });
}

function getRoleDetailsById(roles = []) {
  const details = new Map();

  roles.forEach((role) => {
    const adminRole = toAdminRole(role);
    details.set(String(adminRole._id), adminRole);
  });

  return details;
}

function getRoleDetails(roleMap, roleIds = []) {
  return (roleIds || [])
    .map((roleId) => roleMap.get(String(roleId)))
    .filter(Boolean);
}

function cleanMediaPageSize(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_MEDIA_PAGE_SIZE;
  }

  return Math.min(Math.max(parsed, 1), MAX_MEDIA_PAGE_SIZE);
}

function cleanUserPageSize(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_USER_PAGE_SIZE;
  }

  return Math.min(Math.max(parsed, 1), MAX_USER_PAGE_SIZE);
}

function getLastPostMessageTitle(message) {
  return (
    message.displayName ||
    message.title ||
    [
      message.deceased?.fullRank,
      message.deceased?.firstName,
      message.deceased?.surname,
      message.deceased?.postNominal,
    ]
      .filter(Boolean)
      .join(' ') ||
    'Last Post notice'
  );
}

function getNewsArticleTitle(article) {
  return article.title?.en || article.title?.fr || 'News story';
}

function getPageTitle(page) {
  return page.title?.en || page.title?.fr || page.slug || 'Page';
}

function getPageMediaReferences(blocks = []) {
  const references = [];
  const addMediaItem = (item, fieldPrefix) => {
    if (!item || typeof item !== 'object') return;

    const values = [item.mediaKey, item.mediaUrl];

    Object.entries(item.mediaVariants || {}).forEach(([, variant]) => {
      values.push(variant?.key, variant?.url);
    });

    references.push([values, fieldPrefix]);
  };

  blocks.forEach((block, blockIndex) => {
    addMediaItem(block, `blocks.${blockIndex}`);
    (block.columns || []).forEach((column, columnIndex) => {
      addMediaItem(column, `blocks.${blockIndex}.columns.${columnIndex}`);
    });
    (block.items || []).forEach((item, itemIndex) => {
      addMediaItem(item, `blocks.${blockIndex}.items.${itemIndex}`);
    });
  });

  return references;
}

function getMediaAttachmentMap(
  events,
  retirementMessages,
  lastPostMessages,
  newsArticles,
  pages,
) {
  const attachmentMap = new Map();

  function addAttachment(key, attachment) {
    if (!key) return;

    if (!attachmentMap.has(key)) {
      attachmentMap.set(key, []);
    }

    const attachments = attachmentMap.get(key);
    if (
      !attachments.some(
        (existing) =>
          existing.type === attachment.type &&
          String(existing._id) === String(attachment._id),
      )
    ) {
      attachments.push(attachment);
    }
  }

  events.forEach((event) => {
    addAttachment(getMediaKeyFromValue(event.imagePath), {
      _id: event._id,
      type: 'event',
      title: getEventTitle(event),
      status: event.status,
      field: 'imagePath',
      href: `/content-workspace?id=${encodeURIComponent(event._id)}`,
    });
  });

  retirementMessages.forEach((message) => {
    addAttachment(getMediaKeyFromValue(message.photoUrl), {
      _id: message._id,
      type: 'retirementMessage',
      title: getRetirementMessageTitle(message),
      status: message.status,
      field: 'photoUrl',
      href: `/retirement-message?id=${encodeURIComponent(message._id)}`,
    });
  });

  lastPostMessages.forEach((message) => {
    const attachment = {
      _id: message._id,
      type: 'lastPostMessage',
      title: getLastPostMessageTitle(message),
      status: message.status,
      field: 'imageUrl',
      href: `/last-post-message?id=${encodeURIComponent(message._id)}`,
    };

    addAttachment(getMediaKeyFromValue(message.imageUrl), attachment);
    addAttachment(getMediaKeyFromValue(message.photoUrl), {
      ...attachment,
      field: 'photoUrl',
    });
  });

  newsArticles.forEach((article) => {
    const attachment = {
      _id: article._id,
      type: 'newsArticle',
      title: getNewsArticleTitle(article),
      status: article.status,
      href: `/news_stories?edit=${encodeURIComponent(article._id)}`,
    };

    addAttachment(getMediaKeyFromValue(article.imageUrl), {
      ...attachment,
      field: 'imageUrl',
    });
    addAttachment(getMediaKeyFromValue(article.imageDisplayUrl), {
      ...attachment,
      field: 'imageDisplayUrl',
    });
  });

  pages.forEach((page) => {
    const attachment = {
      _id: page._id,
      type: 'page',
      title: getPageTitle(page),
      status: page.status,
    };

    getPageMediaReferences(page.blocks).forEach(([values, field]) => {
      values.forEach((value) => {
        addAttachment(getMediaKeyFromValue(value), { ...attachment, field });
      });
    });
  });

  return attachmentMap;
}

function addAttachmentAliases(attachmentMap, aliasKeys) {
  const attachments = aliasKeys.flatMap((key) => attachmentMap.get(key) || []);
  const uniqueAttachments = Array.from(
    new Map(
      attachments.map((attachment) => [
        `${attachment.type}:${attachment._id}`,
        attachment,
      ]),
    ).values(),
  );

  aliasKeys.forEach((key) => {
    if (key && uniqueAttachments.length && !attachmentMap.has(key)) {
      attachmentMap.set(key, uniqueAttachments);
    }
  });
}

function getMediaAssetAttachmentKeys(asset) {
  const originalKey = asset?.originalKey || asset?.key || '';
  const originalMatch = originalKey.match(/^(.*)\/original\.[a-z0-9]+$/iu);
  const generatedVariantKeys = originalMatch
    ? ['thumb', 'medium', 'large', 'hero'].map(
        (name) => `${originalMatch[1]}/${name}.webp`,
      )
    : [];

  return [
    ...new Set(
      [
        asset?.key,
        asset?.originalKey,
        getMediaKeyFromValue(asset?.url),
        getMediaKeyFromValue(asset?.originalUrl),
        asset?.display?.key,
        getMediaKeyFromValue(asset?.display?.url),
        ...Object.values(asset?.variants || {}).flatMap((variant) => [
          variant?.key,
          getMediaKeyFromValue(variant?.url),
        ]),
        ...generatedVariantKeys,
      ].filter(Boolean),
    ),
  ];
}

async function getMediaAttachments() {
  const [events, retirementMessages, lastPostMessages, newsArticles, pages] =
    await Promise.all([
      Event.find({
        imagePath: { $nin: [null, ''] },
      })
        .select('title status imagePath updatedAt createdAt')
        .lean(),
      RetirementMessage.find({
        photoUrl: { $nin: [null, ''] },
      })
        .select('retiree status photoUrl updatedAt createdAt')
        .lean(),
      LastPostMessage.find({
        $or: [
          { imageUrl: { $nin: [null, ''] } },
          { photoUrl: { $nin: [null, ''] } },
        ],
      })
        .select('title deceased status imageUrl photoUrl updatedAt createdAt')
        .lean(),
      NewsArticle.find({
        $or: [
          { imageUrl: { $nin: [null, ''] } },
          { imageDisplayUrl: { $nin: [null, ''] } },
        ],
      })
        .select('title status imageUrl imageDisplayUrl')
        .lean(),
      Page.find({}).select('title slug status blocks').lean(),
    ]);

  return getMediaAttachmentMap(
    events,
    retirementMessages,
    lastPostMessages,
    newsArticles,
    pages,
  );
}

function toAdminMediaItem(object, attachmentMap) {
  const key = object.Key;
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  const variants = processedMatch
    ? {
        thumb: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`),
        medium: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`),
        large: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`),
        hero: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`),
      }
    : {};
  const attachments = attachmentMap.get(key) || [];

  return {
    key,
    url: buildPublicMediaUrl(key),
    variants,
    size: object.Size || 0,
    lastModified: object.LastModified || null,
    eTag: object.ETag ? String(object.ETag).replace(/^"|"$/gu, '') : '',
    attachedPosts: attachments,
    attachedPostCount: attachments.length,
  };
}

function toAdminMediaAssetItem(asset, attachmentMap) {
  const key = asset.key || asset.originalKey;
  const objectKeys = getMediaAssetAttachmentKeys(asset);
  addAttachmentAliases(attachmentMap, objectKeys);
  const attachments = attachmentMap.get(key) || [];

  return {
    key,
    url: asset.url || buildPublicMediaUrl(key),
    variants: asset.variants || {},
    size: asset.size || 0,
    width: asset.width || 0,
    height: asset.height || 0,
    mimeType: asset.mimeType || '',
    name: asset.displayName || asset.originalName || key,
    originalName: asset.originalName || '',
    cdnSlug: asset.cdnSlug || '',
    uuid: asset.uuid || '',
    uploadContext: asset.uploadContext || {},
    inferredName: asset.inferredName || '',
    fileMetadata: asset.fileMetadata || {},
    imageMetadata: asset.imageMetadata || {},
    lastModified: asset.createdAt || asset.updatedAt || null,
    createdAt: asset.createdAt || null,
    updatedAt: asset.updatedAt || null,
    attachedPosts: attachments,
    attachedPostCount: attachments.length,
    objectKeys,
  };
}

function sortAdminMediaItems(items, sortKey) {
  if (sortKey === 'orphaned') {
    return [...items].sort(
      (first, second) =>
        Number(first.attachedPostCount || 0) -
          Number(second.attachedPostCount || 0) ||
        String(first.name || first.key || '').localeCompare(
          String(second.name || second.key || ''),
        ) ||
        String(first.key || '').localeCompare(String(second.key || '')),
    );
  }

  return items;
}

function getMediaSort(value) {
  if (value === 'orphaned') return { createdAt: -1, _id: -1 };
  if (value === 'oldest') return { createdAt: 1, _id: 1 };
  if (value === 'name') return { displayName: 1, createdAt: -1 };
  if (value === 'size') return { size: -1, createdAt: -1 };
  return { createdAt: -1, _id: -1 };
}

function getMediaSortKey(value) {
  return ['newest', 'oldest', 'name', 'size', 'orphaned'].includes(value)
    ? value
    : 'newest';
}

function cleanMediaSearch(value) {
  return String(value || '')
    .trim()
    .slice(0, 120);
}

function getMediaTypeFilter(value) {
  return [
    'all',
    'retirement',
    'last-post',
    'event',
    'page',
    'upload',
    'migration',
    'unattached',
  ].includes(value)
    ? value
    : 'all';
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function matchesMediaType(asset, type) {
  if (type === 'all') return true;
  if (type === 'unattached') return !asset.attachedPostCount;

  const attachmentTypes = new Set(
    (asset.attachedPosts || []).map((attachment) => attachment.type),
  );
  const matchesAttachment = {
    retirement: attachmentTypes.has('retirementMessage'),
    'last-post': attachmentTypes.has('lastPostMessage'),
    event: attachmentTypes.has('event'),
  }[type];
  if (matchesAttachment) return true;

  const uploadType = asset.uploadContext?.type;
  return (
    {
      retirement: uploadType === 'retirementMessage',
      'last-post': uploadType === 'lastPostMessage',
      event: uploadType === 'event',
      page: uploadType === 'pageBuilder',
      upload: uploadType === 'mediaManager' || uploadType === 'directUpload',
      migration: uploadType === 'migration' || uploadType === 'legacyStorage',
    }[type] === true
  );
}

function sortStorageObjectsNewestFirst(objects = []) {
  return [...objects].sort((first, second) => {
    const firstTime = first.LastModified
      ? new Date(first.LastModified).getTime()
      : 0;
    const secondTime = second.LastModified
      ? new Date(second.LastModified).getTime()
      : 0;

    return (
      secondTime - firstTime ||
      String(second.Key || '').localeCompare(String(first.Key || ''))
    );
  });
}

function isVisibleMediaObject(object) {
  const key = String(object?.Key || '');
  return (
    key && (!key.startsWith('images/') || /\/original\.[a-z0-9]+$/iu.test(key))
  );
}

function cleanMediaCursor(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanMediaKeyList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(value.map((key) => String(key || '').trim()).filter(Boolean)),
  ].slice(0, 200);
}

async function listVisibleMediaObjectsNewestFirst() {
  const objects = [];
  let continuationToken;

  do {
    const result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.MINIO_BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    objects.push(...(result.Contents || []).filter(isVisibleMediaObject));
    continuationToken = result.NextContinuationToken;
  } while (continuationToken && objects.length < MAX_MEDIA_LIST_OBJECTS);

  return sortStorageObjectsNewestFirst(objects);
}

function inferVariantsFromStorageKey(key) {
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  return processedMatch
    ? {
        thumb: {
          key: `${processedMatch[1]}/thumb.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`),
          width: 400,
        },
        medium: {
          key: `${processedMatch[1]}/medium.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`),
          width: 900,
        },
        large: {
          key: `${processedMatch[1]}/large.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`),
          width: 1600,
        },
        hero: {
          key: `${processedMatch[1]}/hero.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`),
          width: 2200,
        },
      }
    : {};
}

async function seedMediaAssetsFromStorageIfEmpty() {
  const existingCount = await MediaAsset.estimatedDocumentCount();
  if (existingCount) return;

  const objects = await listVisibleMediaObjectsNewestFirst();
  if (!objects.length) return;

  await MediaAsset.insertMany(
    objects.map((object) => {
      const key = object.Key;
      return {
        key,
        url: buildPublicMediaUrl(key),
        originalKey: key,
        originalUrl: buildPublicMediaUrl(key),
        originalName: key.split('/').pop() || key,
        displayName: key.split('/').pop() || key,
        size: object.Size || 0,
        uploadContext: {
          type: 'legacyStorage',
          context: 'storage-seed',
          label: key.split('/').pop() || key,
        },
        inferredName: key.split('/').pop() || key,
        fileMetadata: {
          originalName: key.split('/').pop() || key,
          size: object.Size || 0,
          storageKey: key,
          lastModified: object.LastModified || null,
        },
        variants: inferVariantsFromStorageKey(key),
        createdAt: object.LastModified || new Date(),
        updatedAt: object.LastModified || new Date(),
      };
    }),
    { ordered: false },
  ).catch((error) => {
    if (error.code !== 11000) throw error;
  });
}

function isSameId(value, userId) {
  return Boolean(value) && String(value) === String(userId);
}

function getUserContentAction(item, userId, createdField = 'createdBy') {
  const created = isSameId(item[createdField], userId);
  const published = isSameId(item.publishedBy, userId);

  if (created && published) return 'posted and published';
  if (published) return 'published';
  return 'posted';
}

function getRetirementMessageUserFilter(user) {
  const userId = user._id || user;
  const email = String(user.email || '')
    .trim()
    .toLowerCase();
  const conditions = [{ createdBy: userId }, { publishedBy: userId }];

  if (email) {
    conditions.push({ 'submitter.email': email });
  }

  return { $or: conditions };
}

async function getUserPostSummary(user) {
  const userId = user._id || user;
  const [
    eventCount,
    retirementMessageCount,
    retirementCommentCount,
    lastPostCount,
  ] = await Promise.all([
    Event.countDocuments({
      $or: [{ createdBy: userId }, { publishedBy: userId }],
    }),
    RetirementMessage.countDocuments(getRetirementMessageUserFilter(user)),
    RetirementComment.countDocuments({
      $or: [{ author: userId }, { publishedBy: userId }],
    }),
    LastPostMessage.countDocuments({ createdBy: userId }),
  ]);

  return {
    events: eventCount,
    retirementMessages: retirementMessageCount,
    retirementComments: retirementCommentCount,
    lastPosts: lastPostCount,
    total:
      eventCount +
      retirementMessageCount +
      retirementCommentCount +
      lastPostCount,
  };
}

function toAdminUser(user, postSummary = null) {
  const plainUser = user.toObject ? user.toObject() : user;
  const customRoles = Array.isArray(plainUser.customRoles)
    ? plainUser.customRoles.map((role) => {
        if (role && typeof role === 'object' && role.name) {
          return toAdminRole(role);
        }

        return role;
      })
    : [];
  const passkeyCount = Array.isArray(plainUser.webauthn)
    ? plainUser.webauthn.filter(
        (credential) => credential?.credentialID && credential?.publicKey,
      ).length
    : 0;
  const hasTotp =
    plainUser.totp?.enabled === true && Boolean(plainUser.totp?.secret);

  return {
    _id: plainUser._id,
    username: plainUser.username,
    email: plainUser.email,
    accountName: plainUser.accountName,
    firstName: plainUser.firstName,
    lastName: plainUser.lastName,
    role: plainUser.role,
    accountType: plainUser.accountType || 'member',
    invitation:
      plainUser.accountType === 'invited'
        ? {
            sentAt: plainUser.invitation?.sentAt || null,
            expiresAt: plainUser.invitation?.expiresAt || null,
            delivery: {
              status: plainUser.invitation?.delivery?.status || 'pending',
              attemptedAt: plainUser.invitation?.delivery?.attemptedAt || null,
              messageId: plainUser.invitation?.delivery?.messageId || '',
              accepted: plainUser.invitation?.delivery?.accepted || [],
              rejected: plainUser.invitation?.delivery?.rejected || [],
              error: plainUser.invitation?.delivery?.error || '',
            },
          }
        : null,
    emailVerification: {
      required: plainUser.emailVerification?.required === true,
      verified: plainUser.emailVerification?.verified === true,
      verifiedAt: plainUser.emailVerification?.verifiedAt || null,
    },
    mfa: {
      hasTotp,
      totpAppName: plainUser.totp?.appName || '',
      passkeyCount,
      methodCount: passkeyCount + (hasTotp ? 1 : 0),
      enabled: hasTotp || passkeyCount > 0,
    },
    customRoles,
    customRoleIds: customRoles.map((role) =>
      typeof role === 'object' ? String(role._id) : String(role),
    ),
    contentAreas: plainUser.contentAreas || [],
    createdAt: plainUser.createdAt,
    updatedAt: plainUser.updatedAt,
    postSummary,
  };
}

function hashInvitationToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

function getBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  return configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/u, '')
    : `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

async function sendInvitationEmail(req, user, token) {
  const activationUrl = `${getBaseUrl(req)}/register?inviteToken=${encodeURIComponent(token)}`;
  const accountName = escapeHtml(user.accountName || user.firstName || 'there');
  const invitationMessage = String(user.invitation?.message || '').trim();
  const emailMessage = invitationMessage
    ? escapeHtml(invitationMessage).replace(/\r?\n/gu, '<br>')
    : 'An admin has created a CMCEN account for you.';

  return sendMail({
    to: user.email,
    subject: 'Activate your CMCEN / RCMCE account',
    html: `
      <p>Hello ${accountName},</p>
      <p>${emailMessage}</p>
      <p><a href="${activationUrl}">Activate your account</a></p>
      <p>This link expires in 7 days. You will set your own password and complete your profile.</p>
    `,
  });
}

function cleanInvitationDeliveryList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function getInvitationDeliveryError(error) {
  const parts = [error?.code, error?.responseCode, error?.message]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return [...new Set(parts)].join(': ').slice(0, 240);
}

function getInvitationDeliveryMetadata(user) {
  const delivery = user?.invitation?.delivery || {};

  return {
    status: delivery.status || 'pending',
    attemptedAt: delivery.attemptedAt || null,
    messageId: delivery.messageId || '',
    accepted: delivery.accepted || [],
    rejected: delivery.rejected || [],
    error: delivery.error || '',
  };
}

async function recordInvitationDelivery(user, result) {
  const attemptedAt = new Date();
  const skipped = result?.mailResult?.skipped === true;
  const succeeded = result?.ok === true && !skipped;
  const mailResult = result?.mailResult || {};

  user.invitation.delivery = {
    status: skipped ? 'skipped' : succeeded ? 'sent' : 'failed',
    attemptedAt,
    messageId: String(mailResult.messageId || '')
      .trim()
      .slice(0, 240),
    accepted: cleanInvitationDeliveryList(mailResult.accepted),
    rejected: cleanInvitationDeliveryList(mailResult.rejected),
    error: skipped
      ? String(mailResult.reason || 'Email delivery is disabled').slice(0, 240)
      : succeeded
        ? ''
        : getInvitationDeliveryError(result?.error),
  };

  if (succeeded) {
    user.invitation.sentAt = attemptedAt;
  }

  await user.save();
  return getInvitationDeliveryMetadata(user);
}

async function deliverInvitation({ req, user, token, actor, action }) {
  try {
    const mailResult = await sendInvitationEmail(req, user, token);
    const delivery = await recordInvitationDelivery(user, {
      ok: true,
      mailResult,
    });

    await writeAuditLog({
      req,
      action,
      actor,
      targetType: 'user',
      target: user._id,
      targetSnapshot: toAdminUser(user),
      metadata: {
        role: user.role,
        delivery,
      },
    });

    return { delivery };
  } catch (error) {
    const delivery = await recordInvitationDelivery(user, {
      ok: false,
      error,
    });

    await writeAuditLog({
      req,
      action: 'user.invitation_delivery_failed',
      actor,
      targetType: 'user',
      target: user._id,
      targetSnapshot: toAdminUser(user),
      metadata: {
        invitationAction: action,
        role: user.role,
        delivery,
      },
    });

    return { delivery, error };
  }
}

function getMfaAuditSnapshot(user) {
  const plainUser = user.toObject ? user.toObject() : user;
  const passkeyCount = Array.isArray(plainUser.webauthn)
    ? plainUser.webauthn.filter(
        (credential) => credential?.credentialID && credential?.publicKey,
      ).length
    : 0;
  const hasTotp =
    plainUser.totp?.enabled === true && Boolean(plainUser.totp?.secret);
  const methods = [hasTotp ? 'totp' : '', passkeyCount ? 'passkey' : ''].filter(
    Boolean,
  );

  return {
    hadTotp: hasTotp,
    totpAppName: plainUser.totp?.appName || '',
    passkeyCount,
    methodCount: passkeyCount + (hasTotp ? 1 : 0),
    methods,
  };
}

function splitExportFilter(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanExportFilter(value, allowedValues) {
  const allowed = new Set(allowedValues);

  return [
    ...new Set(splitExportFilter(value).filter((item) => allowed.has(item))),
  ];
}

function getUserExportCriteria(query = {}) {
  const hasIncludeRoles = Object.prototype.hasOwnProperty.call(
    query,
    'includeRoles',
  );
  const hasIncludeAccountTypes = Object.prototype.hasOwnProperty.call(
    query,
    'includeAccountTypes',
  );
  const includedRoles = cleanExportFilter(
    query.includeRoles,
    USER_EXPORT_FILTER_OPTIONS.roles,
  );
  const includedAccountTypes = cleanExportFilter(
    query.includeAccountTypes,
    USER_EXPORT_FILTER_OPTIONS.accountTypes,
  );
  const filter = {
    email: { $not: LEGACY_GHOST_EMAIL_SUFFIX },
  };

  if (hasIncludeRoles) {
    filter.role = { $in: includedRoles };
  }

  if (hasIncludeAccountTypes) {
    const accountTypeConditions = [];

    if (includedAccountTypes.includes('member')) {
      accountTypeConditions.push(
        { accountType: 'member' },
        { accountType: { $exists: false } },
        { accountType: null },
        { accountType: '' },
      );
    }

    if (includedAccountTypes.includes('ghost')) {
      accountTypeConditions.push({ accountType: 'ghost' });
    }

    if (includedAccountTypes.includes('invited')) {
      accountTypeConditions.push({ accountType: 'invited' });
    }

    filter.$and = [
      ...(filter.$and || []),
      accountTypeConditions.length
        ? { $or: accountTypeConditions }
        : { accountType: { $in: [] } },
    ];
  }

  return {
    filter,
    includedRoles,
    includedAccountTypes,
  };
}

function formatExportDate(value) {
  if (!value) return '';

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatExportBoolean(value) {
  return value === true ? 'Yes' : 'No';
}

function getExportPasskeyLabel(credential, index) {
  return (
    credential?.nickname ||
    credential?.providerName ||
    credential?.credentialDeviceType ||
    `Passkey ${index + 1}`
  );
}

function toUserExportRow(user) {
  const plainUser = user.toObject ? user.toObject() : user;
  const customRoles = Array.isArray(plainUser.customRoles)
    ? plainUser.customRoles
        .map((role) => role?.name || role?.slug || String(role || ''))
        .filter(Boolean)
    : [];
  const passkeys = Array.isArray(plainUser.webauthn)
    ? plainUser.webauthn.filter(
        (credential) => credential?.credentialID && credential?.publicKey,
      )
    : [];
  const totpEnabled =
    plainUser.totp?.enabled === true && Boolean(plainUser.totp?.secret);
  const address = plainUser.address || {};

  return {
    id: String(plainUser._id || ''),
    accountType: plainUser.accountType || 'member',
    username: plainUser.username || '',
    email: plainUser.email || '',
    accountName: plainUser.accountName || '',
    firstName: plainUser.firstName || '',
    lastName: plainUser.lastName || '',
    rank: plainUser.rank || '',
    postNominals: plainUser.postNominals || '',
    company: plainUser.company || '',
    status: plainUser.status || '',
    affiliationElement: plainUser.affiliationElement || '',
    trade: plainUser.trade || '',
    tradeOther: plainUser.tradeOther || '',
    currentUnit: plainUser.currentUnit || '',
    preferredLanguage: plainUser.preferredLanguage || '',
    role: plainUser.role || '',
    customRoles: customRoles.join('; '),
    contentAreas: (plainUser.contentAreas || []).join('; '),
    addressLine1: address.line1 || '',
    addressLine2: address.line2 || '',
    addressCity: address.city || '',
    addressStateProvince: address.stateProvince || '',
    addressPostalCode: address.postalCode || '',
    addressCountry: address.country || '',
    emailVerificationRequired: formatExportBoolean(
      plainUser.emailVerification?.required === true,
    ),
    emailVerified: formatExportBoolean(
      plainUser.emailVerification?.verified === true,
    ),
    emailVerifiedAt: formatExportDate(plainUser.emailVerification?.verifiedAt),
    mfaEnabled: formatExportBoolean(totpEnabled || passkeys.length > 0),
    totpEnabled: formatExportBoolean(totpEnabled),
    totpAppName: plainUser.totp?.appName || '',
    passkeyCount: String(passkeys.length),
    passkeyLabels: passkeys.map(getExportPasskeyLabel).join('; '),
    passkeyMetadata: passkeys
      .map((credential, index) =>
        [
          getExportPasskeyLabel(credential, index),
          credential.transports?.length
            ? `transports=${credential.transports.join('|')}`
            : '',
          credential.credentialDeviceType
            ? `device=${credential.credentialDeviceType}`
            : '',
          credential.authenticatorAttachment
            ? `attachment=${credential.authenticatorAttachment}`
            : '',
          credential.credentialBackedUp === true ? 'backedUp=yes' : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join('; '),
    createdAt: formatExportDate(plainUser.createdAt),
    updatedAt: formatExportDate(plainUser.updatedAt),
  };
}

function escapeCsvValue(value) {
  const text = String(value ?? '');

  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/gu, '""')}"`;
  }

  return text;
}

function buildUsersCsv(rows) {
  const header = USER_EXPORT_FIELDS.map(([, label]) => label);
  const lines = [
    header.map(escapeCsvValue).join(','),
    ...rows.map((row) =>
      USER_EXPORT_FIELDS.map(([key]) => escapeCsvValue(row[key])).join(','),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/gu, '?');
}

function wrapPdfText(value, maxLength = 96) {
  const words = String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .split(' ');
  const lines = [];
  let line = '';

  words.forEach((word) => {
    if (!word) return;

    if (line.length + word.length + 1 > maxLength) {
      if (line) lines.push(line);
      line = word;
      return;
    }

    line = line ? `${line} ${word}` : word;
  });

  if (line) lines.push(line);

  return lines.length ? lines : [''];
}

function addPdfObject(objects, content) {
  objects.push(content);

  return objects.length;
}

function buildSimplePdf(pages) {
  const objects = [];
  const catalogId = addPdfObject(objects, '<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addPdfObject(objects, '');
  const fontId = addPdfObject(
    objects,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );
  const pageIds = [];

  pages.forEach((pageLines) => {
    const streamLines = [
      'BT',
      '/F1 8 Tf',
      '50 760 Td',
      '10 TL',
      ...pageLines.map(
        (line, index) =>
          `${index === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`,
      ),
      'ET',
    ];
    const stream = streamLines.join('\n');
    const contentId = addPdfObject(
      objects,
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = addPdfObject(
      objects,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join(''), 'utf8'));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(chunks.join(''), 'utf8');
}

function buildUsersPdf(
  rows,
  { includedRoles = [], includedAccountTypes = [] } = {},
) {
  const pages = [];
  let lines = [
    'CMCEN User Export',
    `Generated: ${new Date().toISOString()}`,
    `Users included: ${rows.length}`,
    `Included roles: ${includedRoles.join(', ') || 'All'}`,
    `Included account types: ${includedAccountTypes.join(', ') || 'All'}`,
    '',
  ];

  function pushLine(line = '') {
    if (lines.length >= 72) {
      pages.push(lines);
      lines = [];
    }

    lines.push(line);
  }

  rows.forEach((row, index) => {
    pushLine(
      `${index + 1}. ${row.accountName || row.username || row.email || 'Unknown user'}`,
    );
    USER_EXPORT_FIELDS.forEach(([key, label]) => {
      const value = row[key];
      wrapPdfText(`${label}: ${value || ''}`, 100).forEach(pushLine);
    });
    pushLine('');
  });

  if (lines.length) {
    pages.push(lines);
  }

  return buildSimplePdf(
    pages.length
      ? pages
      : [['CMCEN User Export', 'No users matched the selected filters.']],
  );
}

function isSelf(userId, currentUser) {
  return String(userId) === String(currentUser?._id);
}

function requireDeveloperRole(req, res, next) {
  if (req.user?.role !== 'developer') {
    return res.status(403).json({
      error: 'Developer access required to promote administrators to developer',
    });
  }

  next();
}

async function validateStandardRoleChange(userId, currentUser, role) {
  if (!USER_ROLES.includes(role)) {
    return { status: 400, error: 'Invalid role provided' };
  }

  if (role === 'developer') {
    return {
      status: 400,
      error: 'Use the developer promotion flow to assign the developer role',
    };
  }

  const targetUser = await User.findById(userId).select('role');

  if (!targetUser) {
    return { status: 404, error: 'User not found' };
  }

  if (
    (role === 'internal_beta' || targetUser.role === 'internal_beta') &&
    currentUser?.role !== 'developer'
  ) {
    return {
      status: 403,
      error: 'Developer access is required to change the Internal Beta role',
    };
  }

  if (targetUser.role === 'developer') {
    return {
      status: 400,
      error:
        'Developer accounts cannot be changed from the standard role control',
    };
  }

  if (isSelf(userId, currentUser)) {
    return {
      status: 403,
      error: 'You cannot change your own built-in role',
    };
  }

  return { targetUser };
}

// GET /api/admin/roles
// List editable custom roles and the permission catalog.
router.get(
  '/roles',
  authMiddleware,
  requirePermission('canManageRoles'),
  async (req, res) => {
    try {
      res.json({
        permissionCatalog: PERMISSION_CATALOG,
        roles: await getAdminRoles(),
      });
    } catch (err) {
      console.error('Admin role list failed:', err);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  },
);

// POST /api/admin/roles
// Create a custom role.
router.post(
  '/roles',
  authMiddleware,
  requirePermission('canManageRoles'),
  async (req, res) => {
    try {
      const result = await createRoleUpdate(req.body, req.user, {
        requireName: true,
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const role = await Role.create({
        ...result.update,
        createdBy: req.user?._id || null,
      });

      await writeAuditLog({
        req,
        action: 'role.created',
        actor: req.user,
        targetType: 'role',
        target: role._id,
        targetSnapshot: toAdminRole(role),
        metadata: {
          permissions: getPermissionDetails(role.permissions || []),
        },
      });

      if ((role.permissions || []).length) {
        await writeAuditLog({
          req,
          action: 'role.permissions_changed',
          actor: req.user,
          targetType: 'role',
          target: role._id,
          targetSnapshot: toAdminRole(role),
          metadata: {
            previousPermissions: [],
            newPermissions: getPermissionDetails(role.permissions || []),
            addedPermissions: getPermissionDetails(role.permissions || []),
            removedPermissions: [],
          },
        });
      }

      res.status(201).json({
        message: 'Role created',
        role: toAdminRole(role),
        roles: await getAdminRoles(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(409)
          .json({ error: 'A role with that slug already exists' });
      }

      console.error('Admin role create failed:', err);
      res.status(500).json({ error: 'Failed to create role' });
    }
  },
);

// PATCH /api/admin/roles/:roleId
// Update a custom role.
router.patch(
  '/roles/:roleId',
  authMiddleware,
  requirePermission('canManageRoles'),
  async (req, res) => {
    try {
      const result = await createRoleUpdate(req.body, req.user);

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      if (!result.hasEditableUpdate) {
        return res.status(400).json({ error: 'No role updates provided' });
      }

      const previousRole = await Role.findById(req.params.roleId);

      if (!previousRole) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const role = await Role.findByIdAndUpdate(
        req.params.roleId,
        { $set: result.update },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      );
      const previousAdminRole = toAdminRole(previousRole);
      const nextAdminRole = toAdminRole(role);
      const permissionDiff = getStringArrayDiff(
        previousAdminRole.permissions || [],
        nextAdminRole.permissions || [],
      );

      await writeAuditLog({
        req,
        action: 'role.updated',
        actor: req.user,
        targetType: 'role',
        target: role._id,
        targetSnapshot: nextAdminRole,
        metadata: {
          previousRole: previousAdminRole,
          newRole: nextAdminRole,
        },
      });

      if (permissionDiff.added.length || permissionDiff.removed.length) {
        await writeAuditLog({
          req,
          action: 'role.permissions_changed',
          actor: req.user,
          targetType: 'role',
          target: role._id,
          targetSnapshot: nextAdminRole,
          metadata: {
            previousPermissions: getPermissionDetails(
              previousAdminRole.permissions || [],
            ),
            newPermissions: getPermissionDetails(
              nextAdminRole.permissions || [],
            ),
            addedPermissions: getPermissionDetails(permissionDiff.added),
            removedPermissions: getPermissionDetails(permissionDiff.removed),
          },
        });
      }

      res.json({
        message: 'Role updated',
        role: nextAdminRole,
        roles: await getAdminRoles(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(409)
          .json({ error: 'A role with that slug already exists' });
      }

      console.error('Admin role update failed:', err);
      res.status(500).json({ error: 'Failed to update role' });
    }
  },
);

// DELETE /api/admin/roles/:roleId
// DELETE /api/admin/users/:userId
// Delete a user after the acting administrator confirms with MFA.
router.delete(
  '/users/:userId',
  authMiddleware,
  requirePermission('canDeleteAnyUser'),
  async (req, res) => {
    const disposition = String(req.body?.contentDisposition || '').trim();
    const mfaMethod = String(req.body?.mfaMethod || 'totp').trim();

    if (!['keep_and_anonymize', 'delete_all'].includes(disposition)) {
      return res
        .status(400)
        .json({ error: 'Choose whether to keep or delete associated content' });
    }

    const mfaVerified =
      mfaMethod === 'webauthn'
        ? hasFreshDestructivePasskeyVerification(req.user)
        : verifyDestructiveTotp(req.user, req.body?.mfaCode);

    if (!mfaVerified) {
      return res.status(403).json({
        error: 'A recent MFA confirmation is required to delete an account',
      });
    }

    try {
      if (String(req.user._id) === String(req.params.userId)) {
        return res.status(400).json({
          error:
            'Use the self-service account deletion flow for your own account',
        });
      }

      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const targetSnapshot = snapshotUser(user);
      const userId = user._id;
      let deleted = {
        events: 0,
        retirementMessages: 0,
        retirementComments: 0,
        lastPosts: 0,
      };

      if (disposition === 'delete_all') {
        const messages = await RetirementMessage.find({
          createdBy: userId,
        }).select('_id');
        const messageIds = messages.map((message) => message._id);
        const [events, comments, lastPosts] = await Promise.all([
          Event.deleteMany({ createdBy: userId }),
          RetirementComment.deleteMany({ author: userId }),
          LastPostMessage.deleteMany({ createdBy: userId }),
        ]);
        const messageComments = messageIds.length
          ? await RetirementComment.deleteMany({
              retirementMessage: { $in: messageIds },
            })
          : { deletedCount: 0 };
        const messagesResult = await RetirementMessage.deleteMany({
          _id: { $in: messageIds },
        });
        deleted = {
          events: events.deletedCount || 0,
          retirementMessages: messagesResult.deletedCount || 0,
          retirementComments:
            (comments.deletedCount || 0) + (messageComments.deletedCount || 0),
          lastPosts: lastPosts.deletedCount || 0,
        };
      } else {
        await Promise.all([
          Event.updateMany(
            { createdBy: userId },
            { $set: { createdBy: null } },
          ),
          RetirementMessage.updateMany(
            { createdBy: userId },
            { $set: { createdBy: null } },
          ),
          RetirementComment.updateMany(
            { author: userId },
            { $set: { author: null } },
          ),
          LastPostMessage.updateMany(
            { createdBy: userId },
            { $set: { createdBy: null } },
          ),
        ]);
      }

      await user.deleteOne();
      await writeAuditLog({
        req,
        action: 'user.deleted',
        actor: req.user,
        targetType: 'user',
        target: userId,
        targetSnapshot,
        metadata: { contentDisposition: disposition, mfaMethod, deleted },
      });

      return res.json({
        message: 'Account deleted',
        contentDisposition: disposition,
        deleted,
      });
    } catch (error) {
      console.error('Admin account deletion failed:', error);
      return res.status(500).json({ error: 'Could not delete account' });
    }
  },
);

router.delete(
  '/roles/:roleId',
  authMiddleware,
  requirePermission('canManageRoles'),
  async (req, res) => {
    try {
      const role = await Role.findById(req.params.roleId);

      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const updateResult = await User.updateMany(
        { customRoles: role._id },
        { $pull: { customRoles: role._id } },
      );

      await role.deleteOne();

      await writeAuditLog({
        req,
        action: 'role.deleted',
        actor: req.user,
        targetType: 'role',
        target: role._id,
        targetSnapshot: toAdminRole(role),
        metadata: {
          removedFromUserCount: updateResult.modifiedCount || 0,
          permissions: getPermissionDetails(role.permissions || []),
        },
      });

      res.json({
        message: 'Role deleted',
        roles: await getAdminRoles(),
      });
    } catch (err) {
      console.error('Admin role delete failed:', err);
      res.status(500).json({ error: 'Failed to delete role' });
    }
  },
);

// GET /api/admin/media
// List images currently present in object storage with linked post usage.
router.get(
  '/media',
  authMiddleware,
  requirePermission('canViewMediaLibrary'),
  async (req, res) => {
    try {
      const maxKeys = cleanMediaPageSize(req.query.limit);
      const offset = cleanMediaCursor(req.query.cursor);
      const sortKey = getMediaSortKey(req.query.sort);
      const sort = getMediaSort(sortKey);
      const typeFilter = getMediaTypeFilter(req.query.type);
      const search = cleanMediaSearch(req.query.search);
      const searchPattern = search
        ? new RegExp(escapeRegex(search), 'i')
        : null;
      const mediaFilter = searchPattern
        ? {
            $or: [
              { key: searchPattern },
              { originalKey: searchPattern },
              { originalName: searchPattern },
              { displayName: searchPattern },
              { inferredName: searchPattern },
              { cdnSlug: searchPattern },
              { 'uploadContext.label': searchPattern },
            ],
          }
        : {};

      await seedMediaAssetsFromStorageIfEmpty();

      const attachmentMap = await getMediaAttachments();
      const mediaQuery = MediaAsset.find(mediaFilter).sort(sort);
      const requiresInMemoryFiltering =
        sortKey === 'orphaned' || typeFilter !== 'all';
      const mediaAssets = requiresInMemoryFiltering
        ? await mediaQuery.lean()
        : await mediaQuery.skip(offset).limit(maxKeys).lean();
      const sortedMedia = sortAdminMediaItems(
        mediaAssets
          .map((asset) => toAdminMediaAssetItem(asset, attachmentMap))
          .filter((asset) => matchesMediaType(asset, typeFilter)),
        sortKey,
      );
      const media = requiresInMemoryFiltering
        ? sortedMedia.slice(offset, offset + maxKeys)
        : sortedMedia;
      const totalMedia = requiresInMemoryFiltering
        ? sortedMedia.length
        : await MediaAsset.countDocuments(mediaFilter);
      const nextOffset = offset + media.length;

      res.json({
        bucket: process.env.MINIO_BUCKET_NAME || '',
        sort: sortKey,
        type: typeFilter,
        search,
        media,
        nextCursor: nextOffset < totalMedia ? String(nextOffset) : '',
        isTruncated: nextOffset < totalMedia,
      });
    } catch (err) {
      console.error('Admin media list failed:', err);
      res.status(500).json({ error: 'Failed to fetch media library' });
    }
  },
);

// POST /api/admin/media/bulk-delete
// Delete selected unattached object-storage images.
router.post(
  '/media/bulk-delete',
  authMiddleware,
  requirePermission('canDeleteMedia'),
  async (req, res) => {
    try {
      const keys = cleanMediaKeyList(req.body?.keys);

      if (!keys.length) {
        return res
          .status(400)
          .json({ error: 'At least one image key is required' });
      }

      const attachmentMap = await getMediaAttachments();
      const skipped = [];
      const deleted = [];
      const missing = [];

      for (const key of keys) {
        const attachedPosts = attachmentMap.get(key) || [];

        if (attachedPosts.length) {
          skipped.push({ key, attachedPosts });
          continue;
        }

        const mediaAsset = await MediaAsset.findOne({
          $or: [{ key }, { originalKey: key }],
        }).lean();

        if (!mediaAsset) {
          missing.push(key);
          continue;
        }

        const objectKeys = toAdminMediaAssetItem(
          mediaAsset,
          attachmentMap,
        ).objectKeys;

        await Promise.all(
          objectKeys.map((objectKey) =>
            s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.MINIO_BUCKET_NAME,
                Key: objectKey,
              }),
            ),
          ),
        );
        await MediaAsset.deleteOne({ $or: [{ key }, { originalKey: key }] });
        deleted.push(key);
      }

      if (deleted.length) {
        await writeAuditLog({
          req,
          action: 'media.bulk_deleted',
          actor: req.user,
          targetType: 'media',
          targetSnapshot: {
            name: `${deleted.length} media image${deleted.length === 1 ? '' : 's'}`,
            deletedKeys: deleted,
            skippedKeys: skipped.map((item) => item.key),
            missingKeys: missing,
          },
          metadata: {
            deletedCount: deleted.length,
            skippedCount: skipped.length,
            missingCount: missing.length,
            deletedKeys: deleted,
            skippedKeys: skipped.map((item) => item.key),
            missingKeys: missing,
          },
        });
      }

      res.json({
        message:
          deleted.length === 1
            ? '1 image deleted'
            : `${deleted.length} images deleted`,
        deleted,
        skipped,
        missing,
      });
    } catch (err) {
      console.error('Admin media bulk delete failed:', err);
      res.status(500).json({ error: 'Failed to delete selected images' });
    }
  },
);

// DELETE /api/admin/media/:key
// Delete one unattached object-storage image.
router.delete(
  '/media/:key',
  authMiddleware,
  requirePermission('canDeleteMedia'),
  async (req, res) => {
    try {
      const key = decodeURIComponent(String(req.params.key || '')).trim();

      if (!key) {
        return res.status(400).json({ error: 'Image key is required' });
      }

      const attachmentMap = await getMediaAttachments();
      const attachedPosts = attachmentMap.get(key) || [];

      if (attachedPosts.length) {
        return res.status(409).json({
          error: 'Image is still attached to content',
          attachedPosts,
        });
      }

      const mediaAsset = await MediaAsset.findOne({
        $or: [{ key }, { originalKey: key }],
      }).lean();
      const objectKeys = mediaAsset
        ? toAdminMediaAssetItem(mediaAsset, attachmentMap).objectKeys
        : [key];

      await Promise.all(
        objectKeys.map((objectKey) =>
          s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.MINIO_BUCKET_NAME,
              Key: objectKey,
            }),
          ),
        ),
      );
      await MediaAsset.deleteOne({ $or: [{ key }, { originalKey: key }] });

      await writeAuditLog({
        req,
        action: 'media.deleted',
        actor: req.user,
        targetType: 'media',
        targetSnapshot: {
          key,
          url: buildPublicMediaUrl(key),
        },
      });

      res.json({
        message: 'Image deleted',
        key,
      });
    } catch (err) {
      console.error('Admin media delete failed:', err);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  },
);

// POST /api/admin/users
// Provision an invited member account and email the activation link.
router.post(
  '/users',
  authMiddleware,
  requirePermission('canProvisionUsers'),
  async (req, res) => {
    try {
      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const role = String(req.body?.role || 'subscriber').trim();
      const invitationMessage = String(req.body?.message || '').trim();

      if (!firstName || !lastName || !email) {
        return res
          .status(400)
          .json({ error: 'First name, last name, and email are required' });
      }

      if (!/^\S+@\S+\.\S+$/u.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      if (invitationMessage.length > MAX_INVITATION_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: `Invitation message must be ${MAX_INVITATION_MESSAGE_LENGTH} characters or fewer`,
        });
      }

      if (!USER_ROLES.includes(role) || ['ghost', 'developer'].includes(role)) {
        return res.status(400).json({ error: 'Choose a valid initial role' });
      }

      if (role === 'internal_beta' && req.user?.role !== 'developer') {
        return res.status(403).json({
          error:
            'Developer access is required to assign the Internal Beta role',
        });
      }

      if (cleanRoleIds(req.body?.customRoleIds).length) {
        return res.status(400).json({
          error: 'Custom roles cannot be assigned when inviting a user',
        });
      }

      if (await User.exists({ email })) {
        return res
          .status(409)
          .json({ error: 'An account already exists for this email' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const user = new User({
        accountType: 'invited',
        username: email,
        email,
        accountName: `${firstName} ${lastName}`,
        firstName,
        lastName,
        password: crypto.randomBytes(32).toString('hex'),
        role,
        customRoles: [],
        contentAreas: [],
        emailVerification: { required: true, verified: false },
        invitation: {
          tokenHash: hashInvitationToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TOKEN_TTL_MS),
          message: invitationMessage,
          invitedBy: req.user._id,
          sentAt: null,
        },
      });

      await user.save();

      const deliveryResult = await deliverInvitation({
        req,
        user,
        token,
        actor: req.user,
        action: 'user.invited',
      });

      if (deliveryResult.error) {
        console.error(
          'User invitation email delivery failed:',
          deliveryResult.error,
        );
        return res.status(502).json({
          error:
            'Invitation was created, but the email could not be delivered. Fix the mail issue, then resend the invitation.',
          user: toAdminUser(user),
        });
      }

      res.status(201).json({
        message: 'Invitation sent',
        user: toAdminUser(user),
      });
    } catch (error) {
      console.error('User invitation failed:', error);
      res.status(500).json({ error: 'Could not send invitation' });
    }
  },
);

// POST /api/admin/users/:userId/invitation/resend
// Rotate an invited user's activation token and retry email delivery.
router.post(
  '/users/:userId/invitation/resend',
  authMiddleware,
  requirePermission('canProvisionUsers'),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select(
        'accountType username email accountName firstName lastName role invitation customRoles contentAreas emailVerification createdAt updatedAt',
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.accountType !== 'invited') {
        return res
          .status(400)
          .json({ error: 'User does not have an invitation' });
      }

      if (user.role === 'internal_beta' && req.user?.role !== 'developer') {
        return res.status(403).json({
          error:
            'Developer access is required to resend an Internal Beta invitation',
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      user.invitation.tokenHash = hashInvitationToken(token);
      user.invitation.expiresAt = new Date(
        now.getTime() + INVITATION_TOKEN_TTL_MS,
      );
      user.invitation.sentAt = null;
      user.invitation.delivery = {
        status: 'pending',
        attemptedAt: null,
        messageId: '',
        accepted: [],
        rejected: [],
        error: '',
      };
      await user.save();

      const deliveryResult = await deliverInvitation({
        req,
        user,
        token,
        actor: req.user,
        action: 'user.invitation_resent',
      });

      if (deliveryResult.error) {
        console.error(
          'Invitation resend email delivery failed:',
          deliveryResult.error,
        );
        return res.status(502).json({
          error:
            'The invitation was renewed, but the email could not be delivered. Fix the mail issue, then resend it again.',
          user: toAdminUser(user),
        });
      }

      res.json({
        message: 'Invitation resent',
        user: toAdminUser(user),
      });
    } catch (error) {
      console.error('Invitation resend failed:', error);
      res.status(500).json({ error: 'Could not resend invitation' });
    }
  },
);

// GET /api/admin/subscriptions
// List consented weekly/news subscribers and recent delivery records.
router.get(
  '/subscriptions',
  authMiddleware,
  requirePermission('canManageSubscriptions'),
  async (req, res) => {
    try {
      const [users, weeklyBriefs, newsBlasts] = await Promise.all([
        User.find({
          $or: [
            { 'emailSubscriptions.weeklyBrief.subscribed': true },
            { 'emailSubscriptions.newsAnnouncements.subscribed': true },
          ],
        })
          .select(
            'email accountName firstName lastName preferredLanguage emailSubscriptions createdAt',
          )
          .sort({ accountName: 1, email: 1 })
          .lean(),
        WeeklyBriefRun.find({ state: 'completed' })
          .select(
            'weekKey windowStart windowEnd recipientCount sentCount failedCount completedAt',
          )
          .sort({ completedAt: -1 })
          .limit(52)
          .lean(),
        NewsBlast.find({})
          .select(
            'subject recipientCount sentCount failedCount sentAt createdAt',
          )
          .sort({ createdAt: -1 })
          .limit(52)
          .lean(),
      ]);
      res.json({
        subscribers: users.map((user) => ({
          id: user._id,
          email: user.email,
          name:
            user.accountName ||
            [user.firstName, user.lastName].filter(Boolean).join(' '),
          preferredLanguage: user.preferredLanguage || 'en',
          weeklyBrief:
            user.emailSubscriptions?.weeklyBrief?.subscribed === true,
          newsAnnouncements:
            user.emailSubscriptions?.newsAnnouncements?.subscribed === true,
          weeklyBriefConsentedAt:
            user.emailSubscriptions?.weeklyBrief?.consentedAt || null,
          newsAnnouncementsConsentedAt:
            user.emailSubscriptions?.newsAnnouncements?.consentedAt || null,
        })),
        newsletters: [
          ...weeklyBriefs.map((item) => ({
            ...item,
            type: 'weeklyBrief',
            label: `Weekly brief — ${item.weekKey}`,
          })),
          ...newsBlasts.map((item) => ({
            ...item,
            type: 'newsBlast',
            label: `News blast — ${item.subject}`,
          })),
        ].sort(
          (first, second) =>
            new Date(second.completedAt || second.sentAt || second.createdAt) -
            new Date(first.completedAt || first.sentAt || first.createdAt),
        ),
      });
    } catch (error) {
      console.error('Subscription admin list failed:', error);
      res.status(500).json({ error: 'Could not load subscriptions' });
    }
  },
);

router.get(
  '/subscriptions/export.csv',
  authMiddleware,
  requirePermission('canManageSubscriptions'),
  async (req, res) => {
    try {
      const users = await User.find({
        $or: [
          { 'emailSubscriptions.weeklyBrief.subscribed': true },
          { 'emailSubscriptions.newsAnnouncements.subscribed': true },
        ],
      })
        .select(
          'email accountName firstName lastName preferredLanguage emailSubscriptions',
        )
        .sort({ accountName: 1, email: 1 })
        .lean();
      const header = [
        'Email',
        'Name',
        'Preferred language',
        'Weekly brief subscribed',
        'Weekly brief consented at',
        'News announcements subscribed',
        'News announcements consented at',
      ];
      const rows = users.map((user) => [
        user.email,
        user.accountName ||
          [user.firstName, user.lastName].filter(Boolean).join(' '),
        user.preferredLanguage || 'en',
        user.emailSubscriptions?.weeklyBrief?.subscribed === true
          ? 'Yes'
          : 'No',
        user.emailSubscriptions?.weeklyBrief?.consentedAt || '',
        user.emailSubscriptions?.newsAnnouncements?.subscribed === true
          ? 'Yes'
          : 'No',
        user.emailSubscriptions?.newsAnnouncements?.consentedAt || '',
      ]);
      await writeAuditLog({
        req,
        action: 'subscriptions.exported',
        actor: req.user,
        targetType: 'subscription',
        targetSnapshot: { name: 'Subscription export' },
        metadata: { subscriberCount: rows.length },
      });
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cmcen-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res
        .type('text/csv; charset=utf-8')
        .send(
          [header, ...rows]
            .map((row) => row.map(escapeCsvValue).join(','))
            .join('\n'),
        );
    } catch (error) {
      console.error('Subscription export failed:', error);
      res.status(500).json({ error: 'Could not export subscriptions' });
    }
  },
);

router.post(
  '/subscriptions/news-blasts',
  authMiddleware,
  requirePermission('canManageSubscriptions'),
  async (req, res) => {
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();
    if (isEmailSendingDisabled()) {
      return res.status(202).json({
        message:
          'News blast delivery skipped because email sending is disabled',
        skipped: true,
      });
    }
    const sender = getCaslSenderInfo();
    const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/+$/u, '');
    if (!subject || !body)
      return res
        .status(400)
        .json({ error: 'A subject and message are required' });
    if (!sender.ready || !baseUrl)
      return res.status(503).json({
        error:
          'CASL sender details and APP_BASE_URL must be configured before sending a news blast',
      });
    try {
      const recipients = await User.find({
        'emailSubscriptions.newsAnnouncements.subscribed': true,
        'emailSubscriptions.newsAnnouncements.consentedAt': { $ne: null },
        'emailSubscriptions.newsAnnouncements.unsubscribedAt': null,
      }).select('email accountName preferredLanguage');
      if (!recipients.length)
        return res.status(400).json({
          error: 'There are no members subscribed to news announcements',
        });
      const blast = await NewsBlast.create({
        subject,
        body,
        createdBy: req.user._id,
        recipientCount: recipients.length,
      });
      let sentCount = 0;
      let failedCount = 0;
      for (const recipient of recipients) {
        try {
          const token = await createUnsubscribeToken(
            recipient,
            'newsAnnouncements',
          );
          const unsubscribeUrl = `${baseUrl}/api/subscriptions/news-announcements/unsubscribe?token=${encodeURIComponent(token)}`;
          await sendMail({
            to: recipient.email,
            subject,
            text: `${body}\n\n${sender.name}\n${sender.mailingAddress}\n${sender.contact}\n\nUnsubscribe: ${unsubscribeUrl}`,
            html: `<p>${escapeHtml(body).replace(/\n/gu, '<br>')}</p><hr><p><strong>${escapeHtml(sender.name)}</strong><br>${escapeHtml(sender.mailingAddress)}<br><a href="${escapeHtml(sender.contact)}">${escapeHtml(sender.contact)}</a></p><p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from news announcements</a></p>`,
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
          sentCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error('News blast delivery failed:', error);
        }
      }
      blast.sentCount = sentCount;
      blast.failedCount = failedCount;
      blast.sentAt = new Date();
      await blast.save();
      await writeAuditLog({
        req,
        action: 'subscriptions.news_blast_sent',
        actor: req.user,
        targetType: 'newsBlast',
        target: blast._id,
        targetSnapshot: { subject },
        metadata: { recipientCount: recipients.length, sentCount, failedCount },
      });
      res.status(201).json({ message: 'News blast sent', blast });
    } catch (error) {
      console.error('News blast failed:', error);
      res.status(500).json({ error: 'Could not send news blast' });
    }
  },
);

// GET /api/admin/users?query=name&limit=50
// List users, optionally filtering by username or account name.
router.get(
  '/users',
  authMiddleware,
  requirePermission('canReadUsers'),
  async (req, res) => {
    try {
      const { query } = req.query;
      const limit = cleanUserPageSize(req.query.limit);

      const filter = query
        ? {
            email: { $not: LEGACY_GHOST_EMAIL_SUFFIX },
            $or: [
              { username: { $regex: query, $options: 'i' } },
              { accountName: { $regex: query, $options: 'i' } },
              { email: { $regex: query, $options: 'i' } },
              { firstName: { $regex: query, $options: 'i' } },
              { lastName: { $regex: query, $options: 'i' } },
            ],
          }
        : { email: { $not: LEGACY_GHOST_EMAIL_SUFFIX } };

      const users = await User.find(filter)
        .select(
          'accountType username email accountName firstName lastName role invitation.sentAt invitation.expiresAt invitation.delivery emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles createdAt updatedAt',
        )
        .sort({ accountName: 1, username: 1 })
        .limit(limit + 1)
        .populate('customRoles', 'name slug color permissions');
      const visibleUsers = users.slice(0, limit);

      res.json({
        roles: USER_ROLES,
        customRoles: await getAdminRoles(),
        permissionCatalog: PERMISSION_CATALOG,
        contentAreas: CONTENT_AREAS,
        users: visibleUsers.map((user) => toAdminUser(user)),
        limit,
        hasMore: users.length > limit,
      });
    } catch (err) {
      console.error('Admin user list failed:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },
);

// GET /api/admin/users/export?format=csv|pdf&includeRoles=subscriber,editor&includeAccountTypes=member
// Export sanitized user records for administrator review and reporting.
router.get(
  '/users/export',
  authMiddleware,
  requirePermission('canReadUsers'),
  async (req, res) => {
    try {
      const format = String(req.query.format || 'csv')
        .trim()
        .toLowerCase();

      if (!USER_EXPORT_FORMATS.includes(format)) {
        return res.status(400).json({ error: 'Invalid export format' });
      }

      const { filter, includedRoles, includedAccountTypes } =
        getUserExportCriteria(req.query);
      const users = await User.find(filter)
        .select(
          'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit preferredLanguage role customRoles contentAreas webauthn totp emailVerification.required emailVerification.verified emailVerification.verifiedAt createdAt updatedAt',
        )
        .sort({ accountName: 1, username: 1 })
        .populate('customRoles', 'name slug color permissions')
        .lean({ getters: true });
      const rows = users.map(toUserExportRow);
      const timestamp = new Date().toISOString().slice(0, 10);
      const extension = format === 'pdf' ? 'pdf' : 'csv';
      const filename = `cmcen-users-${timestamp}.${extension}`;

      await writeAuditLog({
        req,
        action: 'user.exported',
        actor: req.user,
        targetType: 'user',
        target: null,
        targetSnapshot: {
          username: 'User export',
          accountName: 'User export',
        },
        metadata: {
          format,
          userCount: rows.length,
          includedRoles,
          includedAccountTypes,
        },
      });

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );

      if (format === 'pdf') {
        res.type('application/pdf');
        return res.send(
          buildUsersPdf(rows, {
            includedRoles,
            includedAccountTypes,
          }),
        );
      }

      res.type('text/csv; charset=utf-8');
      return res.send(buildUsersCsv(rows));
    } catch (err) {
      console.error('Admin user export failed:', err);
      return res.status(500).json({ error: 'Failed to export users' });
    }
  },
);

// GET /api/admin/users/:userId
// Return one user's editable admin profile and submitted content.
router.get(
  '/users/:userId',
  authMiddleware,
  requirePermission('canReadUsers'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select(
          'accountType username email accountName firstName lastName role invitation.sentAt invitation.expiresAt invitation.delivery emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn totp customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const [events, retirementMessages, retirementComments, lastPosts] =
        await Promise.all([
          Event.find({
            $or: [{ createdBy: userId }, { publishedBy: userId }],
          })
            .select(
              'title status contentArea startDate createdBy publishedBy updatedAt createdAt',
            )
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean(),
          RetirementMessage.find({
            ...getRetirementMessageUserFilter(user),
          })
            .select(
              'retiree status createdBy publishedBy publishedAt updatedAt createdAt',
            )
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean(),
          RetirementComment.find({
            $or: [{ author: userId }, { publishedBy: userId }],
          })
            .select(
              'body status retirementMessage author publishedBy createdAt updatedAt publishedAt',
            )
            .populate('retirementMessage', 'retiree status')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean(),
          LastPostMessage.find({ createdBy: userId })
            .select('deceased status createdBy publishedAt updatedAt createdAt')
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean(),
        ]);

      const posts = [
        ...events.map((event) => ({
          _id: event._id,
          type: 'event',
          title: getEventTitle(event),
          status: event.status,
          action: getUserContentAction(event, userId),
          contentArea: event.contentArea || 'general',
          date: event.startDate,
          updatedAt: event.updatedAt,
          createdAt: event.createdAt,
          href: `/content-workspace?id=${encodeURIComponent(event._id)}`,
        })),
        ...retirementMessages.map((message) => ({
          _id: message._id,
          type: 'retirementMessage',
          title: getRetirementMessageTitle(message),
          status: message.status,
          action: getUserContentAction(message, userId),
          date: message.retiree?.retirementDate,
          updatedAt: message.updatedAt,
          createdAt: message.createdAt,
          href: `/retirement-message?id=${encodeURIComponent(message._id)}`,
        })),
        ...retirementComments.map((comment) => ({
          _id: comment._id,
          type: 'retirementComment',
          title: getRetirementCommentTitle(comment),
          status: comment.status,
          action: getUserContentAction(comment, userId, 'author'),
          excerpt: String(comment.body || '').slice(0, 180),
          updatedAt: comment.updatedAt,
          createdAt: comment.createdAt,
          href: comment.retirementMessage?._id
            ? `/retirement-message?id=${encodeURIComponent(comment.retirementMessage._id)}`
            : '',
        })),
        ...lastPosts.map((lastPost) => ({
          _id: lastPost._id,
          type: 'lastPost',
          title: getLastPostMessageTitle(lastPost),
          status: lastPost.status,
          action: 'submitted',
          updatedAt: lastPost.updatedAt,
          createdAt: lastPost.createdAt,
          href:
            lastPost.status === 'published'
              ? `/last-post-message?id=${encodeURIComponent(lastPost._id)}`
              : '',
        })),
      ].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0) -
          new Date(a.updatedAt || a.createdAt || 0),
      );

      res.json({
        roles: USER_ROLES,
        customRoles: await getAdminRoles(),
        permissionCatalog: PERMISSION_CATALOG,
        contentAreas: CONTENT_AREAS,
        user: toAdminUser(user, {
          events: events.length,
          retirementMessages: retirementMessages.length,
          retirementComments: retirementComments.length,
          lastPosts: lastPosts.length,
          total:
            events.length +
            retirementMessages.length +
            retirementComments.length +
            lastPosts.length,
        }),
        posts,
      });
    } catch (err) {
      console.error('Admin user detail failed:', err);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  },
);

// PATCH /api/admin/users/:userId
// Update a user's role and content-area assignments.
router.patch(
  '/users/:userId',
  authMiddleware,
  requirePermission('canManageUsers'),
  async (req, res) => {
    try {
      const { role, contentAreas, customRoleIds } = req.body || {};
      const { userId } = req.params;
      const updates = {};
      let roleValidation = null;
      let previousContentAreas = null;
      let previousCustomRoleIds = null;
      let customRoleChange = null;

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
        roleValidation = await validateStandardRoleChange(
          userId,
          req.user,
          role,
        );

        if (roleValidation.error) {
          return res
            .status(roleValidation.status)
            .json({ error: roleValidation.error });
        }

        updates.role = role;
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'contentAreas')
      ) {
        const cleanAreas = cleanContentAreas(contentAreas);

        if (!validateContentAreas(cleanAreas)) {
          return res
            .status(400)
            .json({ error: 'Invalid content area provided' });
        }

        const previousUser = await User.findById(userId).select('contentAreas');

        if (!previousUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        previousContentAreas = previousUser.contentAreas || [];
        updates.contentAreas = cleanAreas;
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'customRoleIds')
      ) {
        if (isSelf(userId, req.user)) {
          return res.status(403).json({
            error: 'You cannot change your own custom role assignments',
          });
        }

        const roleIdValidation = await validateCustomRoleIds(customRoleIds);

        if (roleIdValidation.error) {
          return res.status(400).json({ error: roleIdValidation.error });
        }

        const previousUser = await User.findById(userId).select('customRoles');

        if (!previousUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        previousCustomRoleIds = (previousUser.customRoles || []).map(String);
        updates.customRoles = roleIdValidation.roleIds;

        const allRoleIds = [
          ...new Set([...previousCustomRoleIds, ...roleIdValidation.roleIds]),
        ];
        const rolesForAudit = allRoleIds.length
          ? await Role.find({ _id: { $in: allRoleIds } }).select(
              'name slug description color permissions createdAt updatedAt',
            )
          : [];
        const roleDetailsById = getRoleDetailsById(rolesForAudit);
        const roleDiff = getStringArrayDiff(
          previousCustomRoleIds,
          roleIdValidation.roleIds,
        );

        customRoleChange = {
          previousCustomRoleIds,
          newCustomRoleIds: roleIdValidation.roleIds,
          addedRoleIds: roleDiff.added,
          removedRoleIds: roleDiff.removed,
          previousRoles: getRoleDetails(roleDetailsById, previousCustomRoleIds),
          newRoles: getRoleDetails(roleDetailsById, roleIdValidation.roleIds),
          addedRoles: getRoleDetails(roleDetailsById, roleDiff.added),
          removedRoles: getRoleDetails(roleDetailsById, roleDiff.removed),
        };
      }

      if (!Object.keys(updates).length) {
        return res
          .status(400)
          .json({ error: 'No admin user updates provided' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
        .select(
          'accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn totp customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'role') &&
        roleValidation?.targetUser?.role !== user.role
      ) {
        await writeAuditLog({
          req,
          action: 'user.role_changed',
          actor: req.user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: toAdminUser(user),
          metadata: {
            previousRole: roleValidation.targetUser.role,
            newRole: user.role,
          },
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'contentAreas') &&
        !areStringArraysEqual(
          previousContentAreas || [],
          user.contentAreas || [],
        )
      ) {
        await writeAuditLog({
          req,
          action: 'user.content_areas_changed',
          actor: req.user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: toAdminUser(user),
          metadata: {
            previousContentAreas: previousContentAreas || [],
            newContentAreas: user.contentAreas || [],
          },
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'customRoles') &&
        !areStringArraysEqual(
          previousCustomRoleIds || [],
          toAdminUser(user).customRoleIds || [],
        )
      ) {
        await writeAuditLog({
          req,
          action: 'user.custom_roles_changed',
          actor: req.user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: toAdminUser(user),
          metadata: {
            previousCustomRoleIds:
              customRoleChange?.previousCustomRoleIds || [],
            newCustomRoleIds: customRoleChange?.newCustomRoleIds || [],
            addedRoleIds: customRoleChange?.addedRoleIds || [],
            removedRoleIds: customRoleChange?.removedRoleIds || [],
            previousRoles: customRoleChange?.previousRoles || [],
            newRoles: customRoleChange?.newRoles || [],
            addedRoles: customRoleChange?.addedRoles || [],
            removedRoles: customRoleChange?.removedRoles || [],
          },
        });

        await Promise.all([
          ...(customRoleChange?.addedRoles || []).map((role) =>
            writeAuditLog({
              req,
              action: 'user.custom_role_added',
              actor: req.user,
              targetType: 'user',
              target: user._id,
              targetSnapshot: toAdminUser(user),
              metadata: {
                role,
              },
            }),
          ),
          ...(customRoleChange?.removedRoles || []).map((role) =>
            writeAuditLog({
              req,
              action: 'user.custom_role_removed',
              actor: req.user,
              targetType: 'user',
              target: user._id,
              targetSnapshot: toAdminUser(user),
              metadata: {
                role,
              },
            }),
          ),
        ]);
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User updated',
        user: toAdminUser(user, postSummary),
        customRoles: await getAdminRoles(),
      });
    } catch (err) {
      console.error('Admin user update failed:', err);
      res.status(500).json({ error: 'Failed to update user' });
    }
  },
);

// PATCH /api/admin/users/:userId/mfa-reset
// Clear a user's MFA methods so they can enroll again on their next sign-in.
router.patch(
  '/users/:userId/mfa-reset',
  authMiddleware,
  requirePermission('canResetUserMfa'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (isSelf(userId, req.user)) {
        return res
          .status(400)
          .json({ error: 'Administrators cannot reset their own MFA here' });
      }

      const previousUser = await User.findById(userId)
        .select(
          'accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn webauthnRegistrationChallenge webauthnAuthenticationChallenge totp twoFactor customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!previousUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const previousMfa = getMfaAuditSnapshot(previousUser);

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            webauthn: [],
            webauthnRegistrationChallenge: '',
            webauthnAuthenticationChallenge: '',
            totp: {
              secret: '',
              enabled: false,
              appName: '',
            },
            twoFactor: {
              tempToken: '',
              tempExpires: null,
            },
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
        .select(
          'accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn totp customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await writeAuditLog({
        req,
        action: 'user.mfa_reset',
        actor: req.user,
        targetType: 'user',
        target: user._id,
        targetSnapshot: toAdminUser(user),
        metadata: {
          previousMfa,
          previousMethods: previousMfa.methods,
          previousPasskeyCount: previousMfa.passkeyCount,
          previousTotpEnabled: previousMfa.hadTotp,
        },
      });

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User MFA reset',
        user: toAdminUser(user, postSummary),
      });
    } catch (err) {
      console.error('Admin MFA reset failed:', err);
      res.status(500).json({ error: 'Failed to reset user MFA' });
    }
  },
);

// PATCH /api/admin/users/:userId/role
// Change a user's role after validating it against the shared role config.
router.patch(
  '/users/:userId/role',
  authMiddleware,
  requirePermission('canManageUsers'),
  async (req, res) => {
    try {
      const { role } = req.body;
      const { userId } = req.params;

      const validation = await validateStandardRoleChange(
        userId,
        req.user,
        role,
      );

      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { role } },
        { returnDocument: 'after' },
      )
        .select(
          'accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn totp customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (validation.targetUser.role !== user.role) {
        await writeAuditLog({
          req,
          action: 'user.role_changed',
          actor: req.user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: toAdminUser(user),
          metadata: {
            previousRole: validation.targetUser.role,
            newRole: user.role,
          },
        });
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: `User promoted to ${role}`,
        user: toAdminUser(user, postSummary),
      });
    } catch (err) {
      console.error('Admin role update failed:', err);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  },
);

// PATCH /api/admin/users/:userId/developer
// Promote an administrator to the global developer role after an explicit confirmation.
router.patch(
  '/users/:userId/developer',
  authMiddleware,
  requirePermission('canManageUsers'),
  requireDeveloperRole,
  async (req, res) => {
    try {
      const { confirmation, confirmed } = req.body || {};
      const { userId } = req.params;

      if (confirmation !== DEVELOPER_CONFIRMATION || confirmed !== true) {
        return res.status(400).json({
          error: 'Developer promotion requires explicit confirmation',
        });
      }

      const previousUser = await User.findById(userId).select(
        'role accountType username email accountName firstName lastName customRoles contentAreas createdAt updatedAt',
      );

      if (!previousUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (previousUser.role !== 'administrator') {
        return res.status(400).json({
          error: 'Only administrator accounts can be promoted to developer',
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { role: 'developer' } },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
        .select(
          'accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt webauthn totp customRoles contentAreas createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (previousUser.role !== user.role) {
        await writeAuditLog({
          req,
          action: 'user.role_changed',
          actor: req.user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: toAdminUser(user),
          metadata: {
            previousRole: previousUser.role,
            newRole: user.role,
          },
        });
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User promoted to developer',
        user: toAdminUser(user, postSummary),
      });
    } catch (err) {
      console.error('Developer promotion failed:', err);
      res.status(500).json({ error: 'Failed to promote user to developer' });
    }
  },
);

// PATCH /api/admin/last-posts/:lastPostId
// Correct published or legacy Last Post metadata without resubmitting it.
router.patch(
  '/last-posts/:lastPostId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      return await saveAdminContentEdit({
        req,
        res,
        model: LastPostMessage,
        id: req.params.lastPostId,
        targetType: 'lastPost',
        notFoundMessage: 'Last Post notice not found',
        responseKey: 'lastPost',
        getSnapshot: getLastPostAdminSnapshot,
        applyUpdates(lastPost, body, changedFields) {
          if (!isPlainObject(body)) return 'Request body must be an object';
          if (Object.prototype.hasOwnProperty.call(body, 'deceased')) {
            if (!isPlainObject(body.deceased))
              return 'deceased must be an object';
            const error = applyAdminStringFields(
              lastPost.deceased,
              body.deceased,
              ['fullRank', 'firstName', 'surname', 'postNominal'],
              changedFields,
            );
            if (error) return error;
          }
          const localizedError = applyAdminLocalizedFields(
            lastPost,
            body,
            ['messages'],
            changedFields,
          );
          if (localizedError) return localizedError;
          return applyAdminStringFields(
            lastPost,
            body,
            ['title', 'slug', 'imageUrl', 'imageDisplayUrl', 'photoUrl'],
            changedFields,
          );
        },
      });
    } catch (error) {
      console.error('Admin Last Post update failed:', error);
      return res
        .status(500)
        .json({ error: 'Could not update Last Post notice' });
    }
  },
);

// PATCH /api/admin/retirement-comments/:commentId
// Correct a retirement comment from the staff content workspace.
router.patch(
  '/retirement-comments/:commentId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      return await saveAdminContentEdit({
        req,
        res,
        model: RetirementComment,
        id: req.params.commentId,
        targetType: 'retirementComment',
        notFoundMessage: 'Retirement comment not found',
        responseKey: 'comment',
        getSnapshot: (comment) =>
          getRetirementCommentSnapshot(comment, { includeBody: true }),
        applyUpdates(comment, body, changedFields) {
          if (!isPlainObject(body)) return 'Request body must be an object';
          if (!Object.prototype.hasOwnProperty.call(body, 'body')) {
            return 'Provide at least one editable field';
          }
          if (typeof body.body !== 'string') return 'body must be a string';

          const cleanBody = cleanString(body.body);
          if (cleanBody.length < 2 || cleanBody.length > 2000) {
            return 'Comment text must contain between 2 and 2000 characters';
          }

          comment.body = cleanBody;
          changedFields.push('body');
          return '';
        },
      });
    } catch (error) {
      console.error('Admin retirement comment update failed:', error);
      return res
        .status(500)
        .json({ error: 'Could not update retirement comment' });
    }
  },
);

// PATCH /api/admin/retirement-messages/:messageId
// Correct legacy retirement metadata while permitting intentionally blank values.
router.patch(
  '/retirement-messages/:messageId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      return await saveAdminContentEdit({
        req,
        res,
        model: RetirementMessage,
        id: req.params.messageId,
        targetType: 'retirementMessage',
        notFoundMessage: 'Retirement message not found',
        responseKey: 'retirementMessage',
        getSnapshot: getRetirementMessageSnapshot,
        applyUpdates(message, body, changedFields) {
          if (!isPlainObject(body)) return 'Request body must be an object';
          if (Object.prototype.hasOwnProperty.call(body, 'retiree')) {
            if (!isPlainObject(body.retiree))
              return 'retiree must be an object';
            const error = applyAdminStringFields(
              message.retiree,
              body.retiree,
              ['rank', 'firstName', 'lastName', 'postNominals', 'tradeRole'],
              changedFields,
            );
            if (error) return error;
            if (
              Object.prototype.hasOwnProperty.call(
                body.retiree,
                'retirementDate',
              )
            ) {
              const value = body.retiree.retirementDate;
              if (value !== null && typeof value !== 'string') {
                return 'retirementDate must be an ISO date string or null';
              }
              const date = value ? new Date(value) : null;
              if (date && Number.isNaN(date.getTime())) {
                return 'retirementDate must be a valid date';
              }
              message.retiree.retirementDate = date;
              changedFields.push('retirementDate');
            }
          }
          const localizedError = applyAdminLocalizedFields(
            message,
            body,
            ['messages'],
            changedFields,
          );
          if (localizedError) return localizedError;
          return applyAdminStringFields(
            message,
            body,
            ['photoUrl', 'photoDisplayUrl'],
            changedFields,
          );
        },
      });
    } catch (error) {
      console.error('Admin retirement message update failed:', error);
      return res
        .status(500)
        .json({ error: 'Could not update retirement message' });
    }
  },
);

// PATCH /api/admin/news/:articleId
router.patch(
  '/news/:articleId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      return await saveAdminContentEdit({
        req,
        res,
        model: NewsArticle,
        id: req.params.articleId,
        targetType: 'newsArticle',
        notFoundMessage: 'News story not found',
        responseKey: 'article',
        getSnapshot: getNewsAdminSnapshot,
        applyUpdates(article, body, changedFields) {
          if (!isPlainObject(body)) return 'Request body must be an object';
          const localizedError = applyAdminLocalizedFields(
            article,
            body,
            ['title', 'content'],
            changedFields,
          );
          if (localizedError) return localizedError;
          return applyAdminStringFields(
            article,
            body,
            ['imageUrl', 'imageDisplayUrl'],
            changedFields,
          );
        },
      });
    } catch (error) {
      console.error('Admin news update failed:', error);
      return res.status(500).json({ error: 'Could not update news story' });
    }
  },
);

// PATCH /api/admin/events/:eventId
router.patch(
  '/events/:eventId',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      return await saveAdminContentEdit({
        req,
        res,
        model: Event,
        id: req.params.eventId,
        targetType: 'event',
        notFoundMessage: 'Event not found',
        responseKey: 'event',
        getSnapshot: getEventSnapshot,
        applyUpdates(event, body, changedFields) {
          if (!isPlainObject(body)) return 'Request body must be an object';
          const localizedError = applyAdminLocalizedFields(
            event,
            body,
            ['title', 'description', 'location', 'registration'],
            changedFields,
          );
          if (localizedError) return localizedError;
          const stringError = applyAdminStringFields(
            event,
            body,
            [
              'city',
              'provinceRegion',
              'organizingEntity',
              'eventType',
              'timezone',
              'imagePath',
              'contentArea',
            ],
            changedFields,
          );
          if (stringError) return stringError;
          if (Object.prototype.hasOwnProperty.call(body, 'allDay')) {
            if (typeof body.allDay !== 'boolean')
              return 'allDay must be a boolean';
            event.allDay = body.allDay;
            changedFields.push('allDay');
          }
          for (const fieldName of ['startDate', 'endDate']) {
            if (!Object.prototype.hasOwnProperty.call(body, fieldName))
              continue;
            const value = body[fieldName];
            if (value !== null && typeof value !== 'string') {
              return `${fieldName} must be an ISO date string or null`;
            }
            const date = value ? new Date(value) : null;
            if (date && Number.isNaN(date.getTime())) {
              return `${fieldName} must be a valid date`;
            }
            event[fieldName] = date;
            changedFields.push(fieldName);
          }
          return '';
        },
      });
    } catch (error) {
      console.error('Admin event update failed:', error);
      return res.status(500).json({ error: 'Could not update event' });
    }
  },
);

router.delete('/events/:eventId', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner = String(event.createdBy || '') === String(req.user._id);
    if (
      !permissions.canDeleteContent &&
      !(permissions.canDeleteOwnContent && isOwner)
    ) {
      return res
        .status(403)
        .json({ error: 'You do not have permission to delete this event' });
    }

    const snapshot = getEventSnapshot(event);
    const mediaCleanup = permissions.canDeleteContent
      ? await deleteContentMediaAssets({
          mediaUrls: [event.imagePath],
          source: { type: 'event', id: event._id },
        })
      : [];

    await event.deleteOne();
    await writeAuditLog({
      req,
      action: 'content.deleted',
      actor: req.user,
      targetType: 'event',
      target: event._id,
      targetSnapshot: snapshot,
      metadata: {
        mediaCleanup: getContentMediaCleanupMetadata(mediaCleanup),
      },
    });

    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Admin event delete failed:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    res.status(500).json({ error: 'Failed to delete event' });
  }
});

router.delete(
  '/retirement-messages/:messageId',
  authMiddleware,
  async (req, res) => {
    try {
      const message = await RetirementMessage.findById(req.params.messageId);

      if (!message) {
        return res.status(404).json({ error: 'Retirement message not found' });
      }

      const permissions = getUserPermissions(req.user);
      const isOwner = String(message.createdBy || '') === String(req.user._id);
      if (
        !permissions.canDeleteContent &&
        !(permissions.canDeleteOwnContent && isOwner)
      ) {
        return res.status(403).json({
          error: 'You do not have permission to delete this retirement message',
        });
      }

      const snapshot = getRetirementMessageSnapshot(message);
      const deletedComments = await RetirementComment.countDocuments({
        retirementMessage: message._id,
      });
      const mediaCleanup = permissions.canDeleteContent
        ? await deleteContentMediaAssets({
            mediaUrls: [message.photoUrl],
            source: { type: 'retirementMessage', id: message._id },
          })
        : [];

      await RetirementComment.deleteMany({
        retirementMessage: message._id,
      });
      await message.deleteOne();
      await writeAuditLog({
        req,
        action: 'content.deleted',
        actor: req.user,
        targetType: 'retirementMessage',
        target: message._id,
        targetSnapshot: snapshot,
        metadata: {
          deletedComments,
          mediaCleanup: getContentMediaCleanupMetadata(mediaCleanup),
        },
      });

      res.json({ message: 'Retirement message deleted', deletedComments });
    } catch (err) {
      console.error('Admin retirement message delete failed:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid retirement message ID' });
      }

      res.status(500).json({ error: 'Failed to delete retirement message' });
    }
  },
);

router.delete(
  '/retirement-comments/:commentId',
  authMiddleware,
  async (req, res) => {
    try {
      const comment = await RetirementComment.findById(
        req.params.commentId,
      ).populate('retirementMessage', 'retiree status');

      if (!comment) {
        return res.status(404).json({ error: 'Retirement comment not found' });
      }

      const permissions = getUserPermissions(req.user);
      const isOwner = String(comment.author || '') === String(req.user._id);
      if (
        !permissions.canDeleteContent &&
        !(permissions.canDeleteOwnContent && isOwner)
      ) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to delete this comment' });
      }

      const snapshot = getRetirementCommentSnapshot(comment, {
        includeBody: true,
        includeRetirementMessageTitle: true,
      });
      const deletedBy = snapshotUser(req.user);

      await comment.deleteOne();
      await writeAuditLog({
        req,
        action: 'content.deleted',
        actor: req.user,
        targetType: 'retirementComment',
        target: comment._id,
        targetSnapshot: snapshot,
        metadata: {
          commentContent: snapshot.body,
          deletedBy:
            deletedBy.accountName ||
            deletedBy.username ||
            deletedBy.email ||
            'Unknown user',
        },
      });

      res.json({ message: 'Retirement comment deleted' });
    } catch (err) {
      console.error('Admin retirement comment delete failed:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid retirement comment ID' });
      }

      res.status(500).json({ error: 'Failed to delete retirement comment' });
    }
  },
);

router.delete('/last-posts/:lastPostId', authMiddleware, async (req, res) => {
  try {
    const lastPost = await LastPostMessage.findById(req.params.lastPostId);

    if (!lastPost) {
      return res.status(404).json({ error: 'Last Post notice not found' });
    }

    const permissions = getUserPermissions(req.user);
    const isOwner = String(lastPost.createdBy || '') === String(req.user._id);
    if (
      !permissions.canDeleteContent &&
      !(permissions.canDeleteOwnContent && isOwner)
    ) {
      return res.status(403).json({
        error: 'You do not have permission to delete this Last Post notice',
      });
    }

    const snapshot = {
      title: lastPost.title,
      status: lastPost.status,
      deceased: lastPost.deceased,
      submitter: lastPost.submitter,
    };
    const mediaCleanup = permissions.canDeleteContent
      ? await deleteContentMediaAssets({
          mediaUrls: [lastPost.imageUrl, lastPost.photoUrl],
          source: { type: 'lastPostMessage', id: lastPost._id },
        })
      : [];
    await lastPost.deleteOne();
    await writeAuditLog({
      req,
      action: 'content.deleted',
      actor: req.user,
      targetType: 'lastPost',
      target: lastPost._id,
      targetSnapshot: snapshot,
      metadata: {
        deletedByOwner: isOwner,
        mediaCleanup: getContentMediaCleanupMetadata(mediaCleanup),
      },
    });

    return res.json({ message: 'Last Post notice deleted' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid Last Post notice ID' });
    }

    console.error('Last Post deletion failed:', error);
    return res.status(500).json({ error: 'Could not delete Last Post notice' });
  }
});

function buildContentRemovalHandler({
  Model,
  idParam,
  targetType,
  displayName,
  getSnapshot,
  getOwner = (content) => content.createdBy,
  load = (id) => Model.findById(id),
}) {
  return async (req, res) => {
    try {
      const content = await load(req.params[idParam]);

      if (!content) {
        return res.status(404).json({ error: `${displayName} not found` });
      }

      const permissions = getUserPermissions(req.user);
      const isOwner = String(getOwner(content) || '') === String(req.user._id);
      if (
        !permissions.canHideContent &&
        !(permissions.canDeleteOwnContent && isOwner)
      ) {
        return res.status(403).json({
          error: `You do not have permission to remove this ${displayName.toLowerCase()}`,
        });
      }

      const snapshot = getSnapshot(content);
      if (content.status === 'pending') {
        return res.status(409).json({
          error: `Pending ${displayName.toLowerCase()} must be published, rejected, or deleted instead`,
        });
      }
      const removal = hideContent(content, {
        actor: req.user,
        reason: req.body?.reason,
      });

      if (!removal) {
        return res.status(409).json({
          error: `${displayName} is already removed or cannot be removed`,
        });
      }

      await content.save();
      await writeAuditLog({
        req,
        action: 'content.hidden',
        actor: req.user,
        targetType,
        target: content._id,
        targetSnapshot: snapshot,
        metadata: {
          previousStatus: removal.previousStatus,
          reason: removal.reason,
          removedByOwner: isOwner,
        },
      });

      return res.json({
        message: `${displayName} removed from public view`,
        content,
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: `Invalid ${displayName} ID` });
      }

      console.error(`Admin ${displayName} removal failed:`, error);
      return res.status(500).json({ error: `Failed to remove ${displayName}` });
    }
  };
}

function buildContentRestoreHandler({
  Model,
  idParam,
  targetType,
  displayName,
  getSnapshot,
  load = (id) => Model.findById(id),
}) {
  return async (req, res) => {
    try {
      const content = await load(req.params[idParam]);

      if (!content) {
        return res.status(404).json({ error: `${displayName} not found` });
      }

      const permissions = getUserPermissions(req.user);
      if (!permissions.canRestoreContent) {
        return res.status(403).json({
          error: `You do not have permission to restore this ${displayName.toLowerCase()}`,
        });
      }

      const snapshot = getSnapshot(content);
      const restoration = restoreContent(content);

      if (!restoration) {
        return res.status(409).json({
          error: `${displayName} is not available to restore`,
        });
      }

      await content.save();
      await writeAuditLog({
        req,
        action: 'content.restored',
        actor: req.user,
        targetType,
        target: content._id,
        targetSnapshot: snapshot,
        metadata: {
          restoredStatus: restoration.restoredStatus,
        },
      });

      return res.json({
        message: `${displayName} restored`,
        content,
      });
    } catch (error) {
      if (error.name === 'CastError') {
        return res.status(400).json({ error: `Invalid ${displayName} ID` });
      }

      console.error(`Admin ${displayName} restore failed:`, error);
      return res
        .status(500)
        .json({ error: `Failed to restore ${displayName}` });
    }
  };
}

const contentRemovalRoutes = [
  {
    path: '/events/:eventId',
    Model: Event,
    idParam: 'eventId',
    targetType: 'event',
    displayName: 'Event',
    getSnapshot: getEventSnapshot,
  },
  {
    path: '/retirement-messages/:messageId',
    Model: RetirementMessage,
    idParam: 'messageId',
    targetType: 'retirementMessage',
    displayName: 'Retirement message',
    getSnapshot: getRetirementMessageSnapshot,
  },
  {
    path: '/retirement-comments/:commentId',
    Model: RetirementComment,
    idParam: 'commentId',
    targetType: 'retirementComment',
    displayName: 'Retirement comment',
    getSnapshot: (comment) =>
      getRetirementCommentSnapshot(comment, {
        includeBody: true,
        includeRetirementMessageTitle: true,
      }),
    getOwner: (comment) => comment.author,
    load: (id) =>
      RetirementComment.findById(id).populate(
        'retirementMessage',
        'retiree status',
      ),
  },
  {
    path: '/last-posts/:lastPostId',
    Model: LastPostMessage,
    idParam: 'lastPostId',
    targetType: 'lastPost',
    displayName: 'Last Post notice',
    getSnapshot: getLastPostMessageSnapshot,
  },
];

contentRemovalRoutes.forEach((route) => {
  router.patch(
    `${route.path}/hide`,
    authMiddleware,
    buildContentRemovalHandler(route),
  );
  router.patch(
    `${route.path}/restore`,
    authMiddleware,
    buildContentRestoreHandler(route),
  );
});

module.exports = router;
