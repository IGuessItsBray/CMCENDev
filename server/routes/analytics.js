const express = require('express');
const AnalyticsVisit = require('../models/AnalyticsVisit');
const {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission
} = require('../middleware/auth');
const {
  getBrowser,
  getCountry,
  getDeviceType,
  getOsType,
  getReferrerHost,
  getSource
} = require('../services/analytics');

const router = express.Router();

const RANGE_DAYS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 0
});

function getRangeStart(range) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d'];

  if (!days) return null;

  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

function buildMatch(range) {
  const start = getRangeStart(range);
  return start ? { createdAt: { $gte: start } } : {};
}

function cleanId(value, fallback = 'Unknown') {
  const cleanValue = String(value || '').trim();
  return cleanValue || fallback;
}

function cleanString(value) {
  return String(value || '').trim();
}

function cleanPath(value) {
  const cleanValue = cleanString(value).slice(0, 320);
  return cleanValue.startsWith('/') ? cleanValue : '/';
}

async function groupCounts(match, field, { limit = 10 } = {}) {
  return AnalyticsVisit.aggregate([
    { $match: match },
    {
      $group: {
        _id: `$${field}`,
        visits: { $sum: 1 }
      }
    },
    { $sort: { visits: -1, _id: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        label: { $ifNull: ['$_id', 'Unknown'] },
        visits: 1
      }
    }
  ]);
}

router.get(
  '/',
  authMiddleware,
  requirePermission('canViewAnalytics'),
  async (req, res) => {
    try {
      const range = RANGE_DAYS[req.query.range] !== undefined
        ? req.query.range
        : '30d';
      const match = buildMatch(range);
      const totalVisits = await AnalyticsVisit.countDocuments(match);
      const registeredVisits = await AnalyticsVisit.countDocuments({
        ...match,
        isRegistered: true
      });
      const guestVisits = Math.max(totalVisits - registeredVisits, 0);

      const [
        pages,
        sources,
        devices,
        operatingSystems,
        browsers,
        countries,
        roles,
        recentVisits
      ] = await Promise.all([
        groupCounts(match, 'path', { limit: 12 }),
        groupCounts(match, 'source', { limit: 10 }),
        groupCounts(match, 'deviceType', { limit: 8 }),
        groupCounts(match, 'osType', { limit: 8 }),
        groupCounts(match, 'browser', { limit: 8 }),
        groupCounts(match, 'country', { limit: 10 }),
        groupCounts(match, 'userRole', { limit: 8 }),
        AnalyticsVisit.find(match)
          .select('path source deviceType osType browser isRegistered userRole country createdAt')
          .sort({ createdAt: -1 })
          .limit(25)
          .lean()
      ]);

      res.json({
        range,
        totals: {
          visits: totalVisits,
          registered: registeredVisits,
          guests: guestVisits
        },
        pages: pages.map(item => ({
          ...item,
          label: cleanId(item.label, '/')
        })),
        sources: sources.map(item => ({
          ...item,
          label: cleanId(item.label, 'direct')
        })),
        devices,
        operatingSystems,
        browsers,
        countries,
        roles,
        recentVisits
      });
    } catch (error) {
      console.error('Analytics summary failed:', error);
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  }
);

router.post(
  '/visit',
  optionalAuthMiddleware,
  async (req, res) => {
    try {
      const userAgent = cleanString(req.headers['user-agent']).slice(0, 520);
      const referrer = cleanString(req.body?.referrer || req.headers.referer).slice(0, 520);
      const referrerHost = getReferrerHost(referrer);
      const user = req.user || null;

      await AnalyticsVisit.create({
        path: cleanPath(req.body?.path),
        fullPath: cleanString(req.body?.fullPath || req.body?.path || '/').slice(0, 520),
        title: cleanString(req.body?.title).slice(0, 160),
        referrer,
        referrerHost,
        source: getSource(req, referrerHost),
        deviceType: getDeviceType(userAgent),
        osType: getOsType(userAgent),
        browser: getBrowser(userAgent),
        isRegistered: Boolean(user),
        user: user?._id || null,
        userRole: user?.role || 'guest',
        ipAddress: req.ip || '',
        country: getCountry(req),
        userAgent
      });
    } catch (error) {
      console.error('Analytics visit failed:', error);
    }

    res.status(204).end();
  }
);

module.exports = router;
