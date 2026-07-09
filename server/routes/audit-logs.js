const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const {
  authMiddleware,
  requirePermission
} = require('../middleware/auth');

const router = express.Router();

function cleanString(value) {
  return String(value || '').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get(
  '/',
  authMiddleware,
  requirePermission('canViewAuditLog'),
  async (req, res) => {
    try {
      const action = cleanString(req.query.action);
      const targetType = cleanString(req.query.targetType);
      const user = cleanString(req.query.user).slice(0, 100);
      const filter = {};

      if (action) {
        filter.action = action;
      }

      if (targetType) {
        filter.targetType = targetType;
      }

      if (user) {
        const userRegex = new RegExp(escapeRegex(user), 'i');
        const userFilters = [
          { 'actorSnapshot.username': userRegex },
          { 'actorSnapshot.email': userRegex },
          { 'actorSnapshot.accountName': userRegex },
          { 'targetSnapshot.username': userRegex },
          { 'targetSnapshot.email': userRegex },
          { 'targetSnapshot.accountName': userRegex },
          { 'targetSnapshot.firstName': userRegex },
          { 'targetSnapshot.lastName': userRegex }
        ];

        if (mongoose.isValidObjectId(user)) {
          userFilters.push(
            { actor: user },
            { target: user }
          );
        }

        filter.$or = userFilters;
      }

      const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      res.json({ logs });
    } catch (error) {
      console.error('Audit log list failed:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
