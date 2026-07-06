const express = require('express');
const User = require('../models/User');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const { USER_ROLES } = require('../config/roles');
const {
  authMiddleware,
  requirePermission
} = require('../middleware/auth');

const router = express.Router();

const CONTENT_AREAS = Object.freeze([
  'general',
  'branch',
  'association',
  'foundation',
  'museum'
]);

const DEVELOPER_CONFIRMATION = 'DEVELOPER';

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

function getEventTitle(event) {
  return (
    event.title?.en ||
    event.title?.fr ||
    'Untitled event'
  );
}

function getRetirementCommentTitle(comment) {
  const retiree = comment.retirementMessage?.retiree;
  const name = [
    retiree?.rank,
    retiree?.firstName,
    retiree?.lastName
  ].filter(Boolean).join(' ');

  return name
    ? `Retirement comment for ${name}`
    : 'Retirement comment';
}

function getRetirementMessageTitle(message) {
  const retiree = message.retiree;
  const name = [
    retiree?.rank,
    retiree?.firstName,
    retiree?.lastName
  ].filter(Boolean).join(' ');

  return name
    ? `Retirement message for ${name}`
    : 'Retirement message';
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

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
        const validation = await validateStandardRoleChange(userId, req.user, role);

        if (validation.error) {
          return res.status(validation.status).json({ error: validation.error });
        }

        updates.role = role;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'contentAreas')) {
        const cleanAreas = cleanContentAreas(contentAreas);

        if (!validateContentAreas(cleanAreas)) {
          return res.status(400).json({ error: 'Invalid content area provided' });
        }

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

module.exports = router;
