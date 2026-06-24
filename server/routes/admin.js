const express = require('express');
const User = require('../models/User');
const { USER_ROLES } = require('../config/roles');
const {
  authMiddleware,
  requireExactRole
} = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/users?query=name
// List users, optionally filtering by username or account name.
router.get(
  '/users',
  authMiddleware,
  requireExactRole('administrator'),
  async (req, res) => {
    try {
      const { query } = req.query;

      const filter = query
        ? {
          $or: [
            { username: { $regex: query, $options: 'i' } },
            { accountName: { $regex: query, $options: 'i' } }
          ]
        }
        : {};

      const users = await User.find(filter).select('-password');
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

// PATCH /api/admin/users/:userId/role
// Change a user's role after validating it against the shared role config.
router.patch(
  '/users/:userId/role',
  authMiddleware,
  requireExactRole('administrator'),
  async (req, res) => {
    try {
      const { role } = req.body;
      const { userId } = req.params;

      if (!USER_ROLES.includes(role)) {
        return res.status(400).json({ error: 'Invalid role provided' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { role },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ message: `User promoted to ${role}`, user });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

module.exports = router;
