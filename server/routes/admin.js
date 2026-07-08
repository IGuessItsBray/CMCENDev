const express = require('express');
const {
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const User = require('../models/User');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const { USER_ROLES } = require('../config/roles');
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
      href: `/submit-event.html?id=${encodeURIComponent(event._id)}`
    });
  });

  retirementMessages.forEach(message => {
    addAttachment(getMediaKeyFromValue(message.photoUrl), {
      _id: message._id,
      type: 'retirementMessage',
      title: getRetirementMessageTitle(message),
      status: message.status,
      field: 'photoUrl',
      href: `/retirement-message.html?id=${encodeURIComponent(message._id)}`
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
  const attachments = attachmentMap.get(key) || [];

  return {
    key,
    url: buildPublicMediaUrl(key),
    size: object.Size || 0,
    lastModified: object.LastModified || null,
    eTag: object.ETag ? String(object.ETag).replace(/^"|"$/gu, '') : '',
    attachedPosts: attachments,
    attachedPostCount: attachments.length
  };
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

  return {
    _id: plainUser._id,
    username: plainUser.username,
    email: plainUser.email,
    accountName: plainUser.accountName,
    firstName: plainUser.firstName,
    lastName: plainUser.lastName,
    role: plainUser.role,
    contentAreas: plainUser.contentAreas || [],
    createdAt: plainUser.createdAt,
    updatedAt: plainUser.updatedAt,
    postSummary
  };
}

function isSelf(userId, currentUser) {
  return String(userId) === String(currentUser?._id);
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

// GET /api/admin/media
// List images currently present in object storage with linked post usage.
router.get(
  '/media',
  authMiddleware,
  requirePermission('canManageUsers'),
  async (req, res) => {
    try {
      const maxKeys = cleanMediaPageSize(req.query.limit);
      const continuationToken = String(req.query.cursor || '').trim() || undefined;

      const [bucketObjects, attachmentMap] = await Promise.all([
        s3Client.send(new ListObjectsV2Command({
          Bucket: process.env.MINIO_BUCKET_NAME,
          MaxKeys: maxKeys,
          ContinuationToken: continuationToken
        })),
        getMediaAttachments()
      ]);

      res.json({
        bucket: process.env.MINIO_BUCKET_NAME || '',
        media: (bucketObjects.Contents || [])
          .filter(object => object.Key)
          .map(object => toAdminMediaItem(object, attachmentMap)),
        nextCursor: bucketObjects.NextContinuationToken || '',
        isTruncated: Boolean(bucketObjects.IsTruncated)
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
  requirePermission('canManageUsers'),
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

      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: key
      }));

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
  requirePermission('canManageUsers'),
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
        .select('username email accountName firstName lastName role contentAreas createdAt updatedAt')
        .sort({ accountName: 1, username: 1 });
      const summaries = await Promise.all(
        users.map(user => getUserPostSummary(user))
      );

      res.json({
        roles: USER_ROLES,
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
  requirePermission('canManageUsers'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select('username email accountName firstName lastName role contentAreas createdAt updatedAt');

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
          href: `/submit-event.html?id=${encodeURIComponent(event._id)}`
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
          href: `/retirement-message.html?id=${encodeURIComponent(message._id)}`
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
            ? `/retirement-message.html?id=${encodeURIComponent(comment.retirementMessage._id)}`
            : ''
        }))
      ].sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
      );

      res.json({
        roles: USER_ROLES,
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
      const { role, contentAreas } = req.body || {};
      const { userId } = req.params;
      const updates = {};
      let roleValidation = null;
      let previousContentAreas = null;

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

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No admin user updates provided' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        {
          new: true,
          runValidators: true
        }
      ).select('username email accountName firstName lastName role contentAreas createdAt updatedAt');

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

      const postSummary = await getUserPostSummary(user);

      res.json({
        message: 'User updated',
        user: toAdminUser(user, postSummary)
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
        { new: true }
      ).select('username email accountName firstName lastName role contentAreas createdAt updatedAt');

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
        .select('role username email accountName firstName lastName contentAreas createdAt updatedAt');

      if (!previousUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { role: 'developer' } },
        {
          new: true,
          runValidators: true
        }
      ).select('username email accountName firstName lastName role contentAreas createdAt updatedAt');

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
  requirePermission('canManageUsers'),
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
  requirePermission('canManageUsers'),
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
  requirePermission('canManageUsers'),
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
