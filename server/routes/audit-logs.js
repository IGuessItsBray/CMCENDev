const express = require('express');
const AuditLog = require('../models/AuditLog');
const {
  authMiddleware,
  requirePermission
} = require('../middleware/auth');

const router = express.Router();

function cleanString(value) {
  return String(value || '').trim();
}

router.get(
  '/',
  authMiddleware,
  requirePermission('canManageUsers'),
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(Number(req.query.limit) || 100, 1),
        250
      );
      const action = cleanString(req.query.action);
      const targetType = cleanString(req.query.targetType);
      const filter = {};

      if (action) {
        filter.action = action;
      }

      if (targetType) {
        filter.targetType = targetType;
      }

      const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({ logs });
    } catch (error) {
      console.error('Audit log list failed:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
