const express = require('express');
const {
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const User = require('../models/User');
const Role = require('../models/Role');
const MediaAsset = require('../models/MediaAsset');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const { USER_ROLES } = require('../config/roles');
const {
  PERMISSION_CATALOG,
  normalizePermissionKeys
} = require('../config/permissions');
const {
  authMiddleware,
  requirePermission
} = require('../middleware/auth');
const {
  writeAuditLog,
  snapshotUser
} = require('../services/audit-log');
const {
  buildPublicMediaUrl,
  getMediaKeyFromValue
} = require('../services/media-library');
const {
  getEventSnapshot,
  getEventTitle,
  getRetirementCommentSnapshot,
  getRetirementCommentTitle,
  getRetirementMessageSnapshot,
  getRetirementMessageTitle
} = require('../services/content-snapshots');
const s3Client = require('../storage');

const router = express.Router();

const CONTENT_AREAS = Object.freeze([
  'general',
  'branch',
  'association',
  'foundation',
  'museum'
]);

const DEVELOPER_CONFIRMATION = 'DEVELOPER';
const DEFAULT_MEDIA_PAGE_SIZE = 100;
const MAX_MEDIA_PAGE_SIZE = 500;
const MAX_MEDIA_LIST_OBJECTS = 5000;

// GET /api/admin/review-counts
// Return the current moderation workload without loading each submission.
router.get(
  '/review-counts',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const [events, retirementMessages, comments] = await Promise.all([
        Event.countDocuments({ status: 'pending' }),
        RetirementMessage.countDocuments({ status: 'pending' }),
        RetirementComment.countDocuments({ status: 'pending' })
      ]);

      res.json({
        events,
        retirementMessages,
        comments
      });
    } catch (error) {
      console.error('Could not load review submission counts:', error);
      res.status(500).json({
        error: 'Could not load review submission counts'
      });
    }
  }
);

function cleanContentAreas(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(area => String(area || '').trim())
        .filter(Boolean)
    )
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
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanRoleColor(value) {
  const cleanValue = String(value || '').trim();

  return /^#[0-9a-f]{6}$/iu.test(cleanValue)
    ? cleanValue.toUpperCase()
    : '';
}

function cleanRoleIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(roleId => String(roleId || '').trim())
        .filter(Boolean)
    )
  ];
}

async function validateCustomRoleIds(roleIds) {
  const cleanIds = cleanRoleIds(roleIds);

  if (!cleanIds.length) {
    return {
      roleIds: [],
      roles: []
    };
  }

  const roles = await Role.find({
    _id: { $in: cleanIds }
  }).select('_id name slug color permissions');

  if (roles.length !== cleanIds.length) {
    return {
      error: 'Invalid custom role provided'
    };
  }

  return {
    roleIds: cleanIds,
    roles
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
    updatedAt: plainRole.updatedAt
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

  if (
    requireName ||
    Object.prototype.hasOwnProperty.call(source, 'name')
  ) {
    const name = cleanRoleName(source.name);

    if (!name) {
      return { error: 'Role name is required' };
    }

    update.name = name;
    hasEditableUpdate = true;
  }

  if (
    requireName ||
    Object.prototype.hasOwnProperty.call(source, 'slug')
  ) {
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
    hasEditableUpdate
  };
}

function validateContentAreas(contentAreas) {
  return contentAreas.every(area => CONTENT_AREAS.includes(area));
}

function areStringArraysEqual(first = [], second = []) {
  const normalizedFirst = [...first].map(String).sort();
  const normalizedSecond = [...second].map(String).sort();

  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((value, index) => value === normalizedSecond[index]);
}

function getStringArrayDiff(previousValues = [], nextValues = []) {
  const previousSet = new Set((previousValues || []).map(String));
  const nextSet = new Set((nextValues || []).map(String));

  return {
    added: [...nextSet].filter(value => !previousSet.has(value)).sort(),
    removed: [...previousSet].filter(value => !nextSet.has(value)).sort()
  };
}

function getPermissionDetails(permissionKeys = []) {
  const permissionsByKey = new Map(
    PERMISSION_CATALOG.map(permission => [permission.key, permission])
  );

  return (permissionKeys || []).map(permissionKey => {
    const permission = permissionsByKey.get(permissionKey);

    return {
      key: permissionKey,
      label: permission?.label || permissionKey,
      group: permission?.group || '',
      action: permission?.action || ''
    };
  });
}

function getRoleDetailsById(roles = []) {
  const details = new Map();

  roles.forEach(role => {
    const adminRole = toAdminRole(role);
    details.set(String(adminRole._id), adminRole);
  });

  return details;
}

function getRoleDetails(roleMap, roleIds = []) {
  return (roleIds || [])
    .map(roleId => roleMap.get(String(roleId)))
    .filter(Boolean);
}

function cleanMediaPageSize(value) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_MEDIA_PAGE_SIZE;
  }

  return Math.min(Math.max(parsed, 1), MAX_MEDIA_PAGE_SIZE);
}

function getMediaAttachmentMap(events, retirementMessages) {
  const attachmentMap = new Map();

  function addAttachment(key, attachment) {
    if (!key) return;

    if (!attachmentMap.has(key)) {
      attachmentMap.set(key, []);
    }

    attachmentMap.get(key).push(attachment);
  }

  events.forEach(event => {
    addAttachment(getMediaKeyFromValue(event.imagePath), {
      _id: event._id,
      type: 'event',
      title: getEventTitle(event),
      status: event.status,
      field: 'imagePath',
      href: `/submit-event?id=${encodeURIComponent(event._id)}`
    });
  });

  retirementMessages.forEach(message => {
    addAttachment(getMediaKeyFromValue(message.photoUrl), {
      _id: message._id,
      type: 'retirementMessage',
      title: getRetirementMessageTitle(message),
      status: message.status,
      field: 'photoUrl',
      href: `/retirement-message?id=${encodeURIComponent(message._id)}`
    });
  });

  return attachmentMap;
}

async function getMediaAttachments() {
  const [events, retirementMessages] = await Promise.all([
    Event.find({
      imagePath: { $nin: [null, ''] }
    })
      .select('title status imagePath updatedAt createdAt')
      .lean(),
    RetirementMessage.find({
      photoUrl: { $nin: [null, ''] }
    })
      .select('retiree status photoUrl updatedAt createdAt')
      .lean()
  ]);

  return getMediaAttachmentMap(events, retirementMessages);
}

function toAdminMediaItem(object, attachmentMap) {
  const key = object.Key;
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  const variants = processedMatch
    ? {
      thumb: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`),
      medium: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`),
      large: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`),
      hero: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`)
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
    attachedPostCount: attachments.length
  };
}

function getMediaVariantKey(asset, name) {
  return asset?.variants?.[name]?.key || '';
}

function toAdminMediaAssetItem(asset, attachmentMap) {
  const key = asset.key || asset.originalKey;
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
    lastModified: asset.createdAt || asset.updatedAt || null,
    createdAt: asset.createdAt || null,
    updatedAt: asset.updatedAt || null,
    attachedPosts: attachments,
    attachedPostCount: attachments.length,
    objectKeys: [
      key,
      getMediaVariantKey(asset, 'thumb'),
      getMediaVariantKey(asset, 'medium'),
      getMediaVariantKey(asset, 'large'),
      getMediaVariantKey(asset, 'hero')
    ].filter(Boolean)
  };
}

function getMediaSort(value) {
  if (value === 'oldest') return { createdAt: 1, _id: 1 };
  if (value === 'name') return { displayName: 1, createdAt: -1 };
  if (value === 'size') return { size: -1, createdAt: -1 };
  return { createdAt: -1, _id: -1 };
}

function getMediaSortKey(value) {
  return ['newest', 'oldest', 'name', 'size'].includes(value) ? value : 'newest';
}

function sortStorageObjectsNewestFirst(objects = []) {
  return [...objects].sort((first, second) => {
    const firstTime = first.LastModified ? new Date(first.LastModified).getTime() : 0;
    const secondTime = second.LastModified ? new Date(second.LastModified).getTime() : 0;

    return secondTime - firstTime || String(second.Key || '').localeCompare(String(first.Key || ''));
  });
}

function isVisibleMediaObject(object) {
  const key = String(object?.Key || '');
  return key && (!key.startsWith('images/') || /\/original\.[a-z0-9]+$/iu.test(key));
}

function cleanMediaCursor(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function listVisibleMediaObjectsNewestFirst() {
  const objects = [];
  let continuationToken;

  do {
    const result = await s3Client.send(new ListObjectsV2Command({
      Bucket: process.env.MINIO_BUCKET_NAME,
      MaxKeys: 1000,
      ContinuationToken: continuationToken
    }));

    objects.push(...(result.Contents || []).filter(isVisibleMediaObject));
    continuationToken = result.NextContinuationToken;
  } while (continuationToken && objects.length < MAX_MEDIA_LIST_OBJECTS);

  return sortStorageObjectsNewestFirst(objects);
}

function inferVariantsFromStorageKey(key) {
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  return processedMatch
    ? {
      thumb: { key: `${processedMatch[1]}/thumb.webp`, url: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`), width: 400 },
      medium: { key: `${processedMatch[1]}/medium.webp`, url: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`), width: 900 },
      large: { key: `${processedMatch[1]}/large.webp`, url: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`), width: 1600 },
      hero: { key: `${processedMatch[1]}/hero.webp`, url: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`), width: 2200 }
    }
    : {};
}

async function seedMediaAssetsFromStorageIfEmpty() {
  const existingCount = await MediaAsset.estimatedDocumentCount();
  if (existingCount) return;

  const objects = await listVisibleMediaObjectsNewestFirst();
  if (!objects.length) return;

  await MediaAsset.insertMany(objects.map(object => {
    const key = object.Key;
    return {
      key,
      url: buildPublicMediaUrl(key),
      originalKey: key,
      originalUrl: buildPublicMediaUrl(key),
      originalName: key.split('/').pop() || key,
      displayName: key.split('/').pop() || key,
      size: object.Size || 0,
      variants: inferVariantsFromStorageKey(key),
      createdAt: object.LastModified || new Date(),
      updatedAt: object.LastModified || new Date()
    };
  }), { ordered: false }).catch(error => {
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
  const email = String(user.email || '').trim().toLowerCase();
  const conditions = [
    { createdBy: userId },
    { publishedBy: userId }
  ];

  if (email) {
    conditions.push({ 'submitter.email': email });
  }

  return { $or: conditions };
}

async function getUserPostSummary(user) {
  const userId = user._id || user;
  const [eventCount, retirementMessageCount, retirementCommentCount] = await Promise.all([
    Event.countDocuments({
      $or: [
        { createdBy: userId },
        { publishedBy: userId }
      ]
    }),
    RetirementMessage.countDocuments(getRetirementMessageUserFilter(user)),
    RetirementComment.countDocuments({
      $or: [
        { author: userId },
        { publishedBy: userId }
      ]
    })
  ]);

  return {
    events: eventCount,
    retirementMessages: retirementMessageCount,
    retirementComments: retirementCommentCount,
    total: eventCount + retirementMessageCount + retirementCommentCount
  };
}

function toAdminUser(user, postSummary = null) {
  const plainUser = user.toObject ? user.toObject() : user;
  const customRoles = Array.isArray(plainUser.customRoles)
    ? plainUser.customRoles.map(role => {
      if (role && typeof role === 'object' && role.name) {
        return toAdminRole(role);
      }

      return role;
    })
    : [];

  return {
    _id: plainUser._id,
    username: plainUser.username,
    email: plainUser.email,
    accountName: plainUser.accountName,
    firstName: plainUser.firstName,
    lastName: plainUser.lastName,
    role: plainUser.role,
    accountType: plainUser.accountType || 'member',
    emailVerification: {
      required: plainUser.emailVerification?.required === true,
      verified: plainUser.emailVerification?.verified === true,
      verifiedAt: plainUser.emailVerification?.verifiedAt || null
    },
    customRoles,
    customRoleIds: customRoles.map(role =>
      typeof role === 'object' ? String(role._id) : String(role)
    ),
    contentAreas: plainUser.contentAreas || [],
    createdAt: plainUser.createdAt,
    updatedAt: plainUser.updatedAt,
    postSummary
  };
}

function isSelf(userId, currentUser) {
  return String(userId) === String(currentUser?._id);
}

function requireDeveloperRole(req, res, next) {
  if (req.user?.role !== 'developer') {
    return res.status(403).json({
      error: 'Developer access required'
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
      error: 'Use the developer promotion flow to assign the developer role'
    };
  }

  const targetUser = await User.findById(userId).select('role');

  if (!targetUser) {
    return { status: 404, error: 'User not found' };
  }

  if (targetUser.role === 'developer') {
    return {
      status: 400,
      error: 'Developer accounts cannot be changed from the standard role control'
    };
  }

  if (
    isSelf(userId, currentUser) &&
    !['administrator', 'developer'].includes(role)
  ) {
    return {
      status: 400,
      error: 'You cannot remove your own administrator access'
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
        roles: await getAdminRoles()
      });
    } catch (err) {
      console.error('Admin role list failed:', err);
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  }
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
        requireName: true
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const role = await Role.create({
        ...result.update,
        createdBy: req.user?._id || null
      });

      await writeAuditLog({
        req,
        action: 'role.created',
        actor: req.user,
        targetType: 'role',
        target: role._id,
        targetSnapshot: toAdminRole(role),
        metadata: {
          permissions: getPermissionDetails(role.permissions || [])
        }
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
            removedPermissions: []
          }
        });
      }

      res.status(201).json({
        message: 'Role created',
        role: toAdminRole(role),
        roles: await getAdminRoles()
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'A role with that slug already exists' });
      }

      console.error('Admin role create failed:', err);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
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
          runValidators: true
        }
      );
      const previousAdminRole = toAdminRole(previousRole);
      const nextAdminRole = toAdminRole(role);
      const permissionDiff = getStringArrayDiff(
        previousAdminRole.permissions || [],
        nextAdminRole.permissions || []
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
          newRole: nextAdminRole
        }
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
            previousPermissions: getPermissionDetails(previousAdminRole.permissions || []),
            newPermissions: getPermissionDetails(nextAdminRole.permissions || []),
            addedPermissions: getPermissionDetails(permissionDiff.added),
            removedPermissions: getPermissionDetails(permissionDiff.removed)
          }
        });
      }

      res.json({
        message: 'Role updated',
        role: nextAdminRole,
        roles: await getAdminRoles()
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'A role with that slug already exists' });
      }

      console.error('Admin role update failed:', err);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

// DELETE /api/admin/roles/:roleId
// Delete a custom role and remove it from users.
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
        { $pull: { customRoles: role._id } }
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
          permissions: getPermissionDetails(role.permissions || [])
        }
      });

      res.json({
        message: 'Role deleted',
        roles: await getAdminRoles()
      });
    } catch (err) {
      console.error('Admin role delete failed:', err);
      res.status(500).json({ error: 'Failed to delete role' });
    }
  }
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

      await seedMediaAssetsFromStorageIfEmpty();

      const [mediaAssets, totalMedia, attachmentMap] = await Promise.all([
        MediaAsset.find({})
          .sort(sort)
          .skip(offset)
          .limit(maxKeys)
          .lean(),
        MediaAsset.countDocuments({}),
        getMediaAttachments()
      ]);
      const nextOffset = offset + mediaAssets.length;

      res.json({
        bucket: process.env.MINIO_BUCKET_NAME || '',
        sort: sortKey,
        media: mediaAssets.map(asset => toAdminMediaAssetItem(asset, attachmentMap)),
        nextCursor: nextOffset < totalMedia ? String(nextOffset) : '',
        isTruncated: nextOffset < totalMedia
      });
    } catch (err) {
      console.error('Admin media list failed:', err);
      res.status(500).json({ error: 'Failed to fetch media library' });
    }
  }
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
          attachedPosts
        });
      }

      const mediaAsset = await MediaAsset.findOne({
        $or: [{ key }, { originalKey: key }]
      }).lean();
      const objectKeys = mediaAsset
        ? toAdminMediaAssetItem(mediaAsset, attachmentMap).objectKeys
        : [key];

      await Promise.all(objectKeys.map(objectKey =>
        s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.MINIO_BUCKET_NAME,
          Key: objectKey
        }))
      ));
      await MediaAsset.deleteOne({ $or: [{ key }, { originalKey: key }] });

      await writeAuditLog({
        req,
        action: 'media.deleted',
        actor: req.user,
        targetType: 'media',
        targetSnapshot: {
          key,
          url: buildPublicMediaUrl(key)
        }
      });

      res.json({
        message: 'Image deleted',
        key
      });
    } catch (err) {
      console.error('Admin media delete failed:', err);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  }
);

// GET /api/admin/users?query=name
// List users, optionally filtering by username or account name.
router.get(
  '/users',
  authMiddleware,
  requirePermission('canReadUsers'),
  async (req, res) => {
    try {
      const { query } = req.query;

      const filter = query
        ? {
          $or: [
            { username: { $regex: query, $options: 'i' } },
            { accountName: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } }
          ]
        }
        : {};

      const users = await User.find(filter)
        .select('accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles contentAreas createdAt updatedAt')
        .sort({ accountName: 1, username: 1 })
        .populate('customRoles', 'name slug color permissions');
      const summaries = await Promise.all(
        users.map(user => getUserPostSummary(user))
      );

      res.json({
        roles: USER_ROLES,
        customRoles: await getAdminRoles(),
        permissionCatalog: PERMISSION_CATALOG,
        contentAreas: CONTENT_AREAS,
        users: users.map((user, index) =>
          toAdminUser(user, summaries[index])
        )
      });
    } catch (err) {
      console.error('Admin user list failed:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
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
        .select('accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles contentAreas createdAt updatedAt')
        .populate('customRoles', 'name slug color permissions');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const [events, retirementMessages, retirementComments] = await Promise.all([
        Event.find({
          $or: [
            { createdBy: userId },
            { publishedBy: userId }
          ]
        })
          .select('title status contentArea startDate createdBy publishedBy updatedAt createdAt')
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean(),
        RetirementMessage.find({
          ...getRetirementMessageUserFilter(user)
        })
          .select('retiree status createdBy publishedBy publishedAt updatedAt createdAt')
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean(),
        RetirementComment.find({
          $or: [
            { author: userId },
            { publishedBy: userId }
          ]
        })
          .select('body status retirementMessage author publishedBy createdAt updatedAt publishedAt')
          .populate('retirementMessage', 'retiree status')
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean()
      ]);

      const posts = [
        ...events.map(event => ({
          _id: event._id,
          type: 'event',
          title: getEventTitle(event),
          status: event.status,
          action: getUserContentAction(event, userId),
          contentArea: event.contentArea || 'general',
          date: event.startDate,
          updatedAt: event.updatedAt,
          createdAt: event.createdAt,
          href: `/submit-event?id=${encodeURIComponent(event._id)}`
        })),
        ...retirementMessages.map(message => ({
          _id: message._id,
          type: 'retirementMessage',
          title: getRetirementMessageTitle(message),
          status: message.status,
          action: getUserContentAction(message, userId),
          date: message.retiree?.retirementDate,
          updatedAt: message.updatedAt,
          createdAt: message.createdAt,
          href: `/retirement-message?id=${encodeURIComponent(message._id)}`
        })),
        ...retirementComments.map(comment => ({
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
            : ''
        }))
      ].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
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
          total: events.length + retirementMessages.length + retirementComments.length
        }),
        posts
      });
    } catch (err) {
      console.error('Admin user detail failed:', err);
      res.status(500).json({ error: 'Failed to fetch user details' });
    }
  }
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
        roleValidation = await validateStandardRoleChange(userId, req.user, role);

        if (roleValidation.error) {
          return res.status(roleValidation.status).json({ error: roleValidation.error });
        }

        updates.role = role;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'contentAreas')) {
        const cleanAreas = cleanContentAreas(contentAreas);

        if (!validateContentAreas(cleanAreas)) {
          return res.status(400).json({ error: 'Invalid content area provided' });
        }

        const previousUser = await User.findById(userId).select('contentAreas');

        if (!previousUser) {
          return res.status(404).json({ error: 'User not found' });
        }

        previousContentAreas = previousUser.contentAreas || [];
        updates.contentAreas = cleanAreas;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'customRoleIds')) {
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
          ...new Set([
            ...previousCustomRoleIds,
            ...roleIdValidation.roleIds
          ])
        ];
        const rolesForAudit = allRoleIds.length
          ? await Role.find({ _id: { $in: allRoleIds } })
            .select('name slug description color permissions createdAt updatedAt')
          : [];
        const roleDetailsById = getRoleDetailsById(rolesForAudit);
        const roleDiff = getStringArrayDiff(
          previousCustomRoleIds,
          roleIdValidation.roleIds
        );

        customRoleChange = {
          previousCustomRoleIds,
          newCustomRoleIds: roleIdValidation.roleIds,
          addedRoleIds: roleDiff.added,
          removedRoleIds: roleDiff.removed,
          previousRoles: getRoleDetails(roleDetailsById, previousCustomRoleIds),
          newRoles: getRoleDetails(roleDetailsById, roleIdValidation.roleIds),
          addedRoles: getRoleDetails(roleDetailsById, roleDiff.added),
          removedRoles: getRoleDetails(roleDetailsById, roleDiff.removed)
        };
      }

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No admin user updates provided' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        {
          returnDocument: 'after',
          runValidators: true
        }
      )
        .select('accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles contentAreas createdAt updatedAt')
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
            newRole: user.role
          }
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'contentAreas') &&
        !areStringArraysEqual(previousContentAreas || [], user.contentAreas || [])
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
            newContentAreas: user.contentAreas || []
          }
        });
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, 'customRoles') &&
        !areStringArraysEqual(
          previousCustomRoleIds || [],
          toAdminUser(user).customRoleIds || []
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
            previousCustomRoleIds: customRoleChange?.previousCustomRoleIds || [],
            newCustomRoleIds: customRoleChange?.newCustomRoleIds || [],
            addedRoleIds: customRoleChange?.addedRoleIds || [],
            removedRoleIds: customRoleChange?.removedRoleIds || [],
            previousRoles: customRoleChange?.previousRoles || [],
            newRoles: customRoleChange?.newRoles || [],
            addedRoles: customRoleChange?.addedRoles || [],
            removedRoles: customRoleChange?.removedRoles || []
          }
        });

        await Promise.all([
          ...(customRoleChange?.addedRoles || []).map(role =>
            writeAuditLog({
              req,
              action: 'user.custom_role_added',
              actor: req.user,
              targetType: 'user',
              target: user._id,
              targetSnapshot: toAdminUser(user),
              metadata: {
                role
              }
            })
          ),
          ...(customRoleChange?.removedRoles || []).map(role =>
            writeAuditLog({
              req,
              action: 'user.custom_role_removed',
              actor: req.user,
              targetType: 'user',
              target: user._id,
              targetSnapshot: toAdminUser(user),
              metadata: {
                role
              }
            })
          )
        ]);
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User updated',
        user: toAdminUser(user, postSummary),
        customRoles: await getAdminRoles()
      });
    } catch (err) {
      console.error('Admin user update failed:', err);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
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

      const validation = await validateStandardRoleChange(userId, req.user, role);

      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { role } },
        { returnDocument: 'after' }
      )
        .select('accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles contentAreas createdAt updatedAt')
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
            newRole: user.role
          }
        });
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: `User promoted to ${role}`,
        user: toAdminUser(user, postSummary)
      });
    } catch (err) {
      console.error('Admin role update failed:', err);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

// PATCH /api/admin/users/:userId/developer
// Promote a user to the global developer role after an explicit confirmation.
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
          error: 'Developer promotion requires explicit confirmation'
        });
      }

      const previousUser = await User.findById(userId)
        .select('role accountType username email accountName firstName lastName customRoles contentAreas createdAt updatedAt');

      if (!previousUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { role: 'developer' } },
        {
          returnDocument: 'after',
          runValidators: true
        }
      )
        .select('accountType username email accountName firstName lastName role emailVerification.required emailVerification.verified emailVerification.verifiedAt customRoles contentAreas createdAt updatedAt')
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
            newRole: user.role
          }
        });
      }

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User promoted to developer',
        user: toAdminUser(user, postSummary)
      });
    } catch (err) {
      console.error('Developer promotion failed:', err);
      res.status(500).json({ error: 'Failed to promote user to developer' });
    }
  }
);

router.delete(
  '/events/:eventId',
  authMiddleware,
  requirePermission('canDeleteContent'),
  async (req, res) => {
    try {
      const event = await Event.findById(req.params.eventId);

      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const snapshot = getEventSnapshot(event);

      await event.deleteOne();
      await writeAuditLog({
        req,
        action: 'content.deleted',
        actor: req.user,
        targetType: 'event',
        target: event._id,
        targetSnapshot: snapshot
      });

      res.json({ message: 'Event deleted' });
    } catch (err) {
      console.error('Admin event delete failed:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid event ID' });
      }

      res.status(500).json({ error: 'Failed to delete event' });
    }
  }
);

router.delete(
  '/retirement-messages/:messageId',
  authMiddleware,
  requirePermission('canDeleteContent'),
  async (req, res) => {
    try {
      const message = await RetirementMessage.findById(req.params.messageId);

      if (!message) {
        return res.status(404).json({ error: 'Retirement message not found' });
      }

      const snapshot = getRetirementMessageSnapshot(message);
      const deletedComments = await RetirementComment.countDocuments({
        retirementMessage: message._id
      });

      await RetirementComment.deleteMany({
        retirementMessage: message._id
      });
      await message.deleteOne();
      await writeAuditLog({
        req,
        action: 'content.deleted',
        actor: req.user,
        targetType: 'retirementMessage',
        target: message._id,
        targetSnapshot: snapshot,
        metadata: { deletedComments }
      });

      res.json({ message: 'Retirement message deleted', deletedComments });
    } catch (err) {
      console.error('Admin retirement message delete failed:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid retirement message ID' });
      }

      res.status(500).json({ error: 'Failed to delete retirement message' });
    }
  }
);

router.delete(
  '/retirement-comments/:commentId',
  authMiddleware,
  requirePermission('canDeleteContent'),
  async (req, res) => {
    try {
      const comment = await RetirementComment.findById(req.params.commentId)
        .populate('retirementMessage', 'retiree status');

      if (!comment) {
        return res.status(404).json({ error: 'Retirement comment not found' });
      }

      const snapshot = getRetirementCommentSnapshot(comment, {
        includeBody: true,
        includeRetirementMessageTitle: true
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
          deletedBy: deletedBy.accountName ||
            deletedBy.username ||
            deletedBy.email ||
            'Unknown user'
        }
      });

      res.json({ message: 'Retirement comment deleted' });
    } catch (err) {
      console.error('Admin retirement comment delete failed:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid retirement comment ID' });
      }

      res.status(500).json({ error: 'Failed to delete retirement comment' });
    }
  }
);

module.exports = router;
