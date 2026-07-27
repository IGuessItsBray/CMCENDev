const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { writeAuditLog } = require('../services/audit-log');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

function cleanString(value) {
  return String(value || '').trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateBoundary(value, { isEnd = false } = {}) {
  const text = cleanString(value);

  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    if (isEnd) {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    return date;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date;
}

function buildAuditLogFilter(query) {
  const action = cleanString(query.action);
  const targetType = cleanString(query.targetType);
  const user = cleanString(query.user).slice(0, 100);
  const startDate = parseDateBoundary(query.startDate);
  const endDate = parseDateBoundary(query.endDate, { isEnd: true });
  const filter = {};

  if (action) {
    filter.action = action;
  }

  if (targetType) {
    filter.targetType = targetType;
  }

  if (startDate || endDate) {
    filter.createdAt = {
      ...(startDate ? { $gte: startDate } : {}),
      ...(endDate ? { $lt: endDate } : {}),
    };
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
      { 'targetSnapshot.lastName': userRegex },
    ];

    if (mongoose.isValidObjectId(user)) {
      userFilters.push({ actor: user }, { target: user });
    }

    filter.$or = userFilters;
  }

  return filter;
}

function formatCsvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(formatCsvValue).filter(Boolean).join('; ');
  }

  if (typeof value === 'object') {
    const preferredValue =
      value.label ||
      value.title ||
      value.name ||
      value.slug ||
      value.key ||
      value.route ||
      value.username ||
      value.email;

    if (preferredValue) {
      return formatCsvValue(preferredValue);
    }

    return Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .filter(([key]) => !['id', '_id', '__v'].includes(key))
      .map(([key, item]) => `${key}: ${formatCsvValue(item)}`)
      .filter(Boolean)
      .join('; ');
  }

  return String(value);
}

function escapeCsv(value) {
  const text = formatCsvValue(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function getSnapshotLabel(snapshot = {}) {
  return (
    snapshot.title ||
    snapshot.key ||
    snapshot.name ||
    snapshot.slug ||
    snapshot.accountName ||
    snapshot.username ||
    snapshot.email ||
    ''
  );
}

function getActorLabel(log) {
  const actor = log.actorSnapshot || {};

  return actor.accountName || actor.username || actor.email || 'System';
}

function buildMetadataSummary(metadata = {}) {
  return Object.entries(metadata)
    .filter(
      ([key, value]) =>
        key !== 'ipAddresses' &&
        value !== undefined &&
        value !== null &&
        value !== '',
    )
    .map(([key, value]) => `${key}: ${formatCsvValue(value)}`)
    .join('; ');
}

function buildAuditLogCsv(logs) {
  const headers = [
    'Date',
    'Action',
    'Target Type',
    'Actor',
    'Target',
    'IP Address',
    'IP Addresses',
    'Details',
    'Target ID',
  ];

  const rows = logs.map((log) => {
    const metadata = log.metadata || {};

    return [
      log.createdAt,
      log.action,
      log.targetType,
      getActorLabel(log),
      getSnapshotLabel(log.targetSnapshot || {}),
      metadata.ipAddress,
      metadata.ipAddresses,
      buildMetadataSummary(metadata),
      log.target,
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
}

router.get(
  '/',
  authMiddleware,
  requirePermission('canViewAuditLog'),
  async (req, res) => {
    try {
      const filter = buildAuditLogFilter(req.query);

      const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).lean();

      res.json({ logs });
    } catch (error) {
      console.error('Audit log list failed:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  },
);

router.get(
  '/export.csv',
  authMiddleware,
  requirePermission('canViewAuditLog'),
  async (req, res) => {
    try {
      const filter = buildAuditLogFilter(req.query);
      const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();
      const timestamp = new Date().toISOString().slice(0, 10);

      await writeAuditLog({
        req,
        action: 'audit.exported',
        actor: req.user,
        targetType: 'audit',
        targetSnapshot: {
          name: 'Audit log export',
        },
        metadata: {
          format: 'csv',
          entryCount: logs.length,
          action: cleanString(req.query.action),
          targetType: cleanString(req.query.targetType),
          user: cleanString(req.query.user).slice(0, 100),
          startDate: cleanString(req.query.startDate),
          endDate: cleanString(req.query.endDate),
        },
      });

      res.type('text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cmcen-audit-log-${timestamp}.csv"`,
      );
      res.send(buildAuditLogCsv(logs));
    } catch (error) {
      console.error('Audit log export failed:', error);
      res.status(500).json({ error: 'Failed to export audit logs' });
    }
  },
);

module.exports = router;
