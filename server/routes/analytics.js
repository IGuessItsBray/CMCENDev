const express = require('express');
const AnalyticsVisit = require('../models/AnalyticsVisit');
const {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission,
} = require('../middleware/auth');
const {
  getBrowser,
  getClientIp,
  getCountry,
  getDeviceType,
  getOsType,
  getReferrerHost,
  normalizeStoredCountry,
  getSource,
} = require('../services/analytics');

const router = express.Router();

const RANGE_DAYS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 0,
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

function getBreakdownPipeline(field, limit) {
  return [
    {
      $group: {
        _id: `$${field}`,
        visits: { $sum: 1 },
      },
    },
    { $sort: { visits: -1, _id: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        label: { $ifNull: ['$_id', 'Unknown'] },
        visits: 1,
      },
    },
  ];
}

function normalizeCountryCounts(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const label = normalizeStoredCountry(row.label);
    counts.set(label, (counts.get(label) || 0) + row.visits);
  });

  return Array.from(counts, ([label, visits]) => ({ label, visits }))
    .sort(
      (first, second) =>
        second.visits - first.visits || first.label.localeCompare(second.label),
    )
    .slice(0, 10);
}

async function getTrafficSummary(match) {
  const [summary] = await AnalyticsVisit.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              visits: { $sum: 1 },
              registered: {
                $sum: { $cond: ['$isRegistered', 1, 0] },
              },
            },
          },
          {
            $project: {
              _id: 0,
              visits: 1,
              registered: 1,
            },
          },
        ],
        pages: getBreakdownPipeline('path', 12),
        sources: getBreakdownPipeline('source', 10),
        devices: getBreakdownPipeline('deviceType', 8),
        operatingSystems: getBreakdownPipeline('osType', 8),
        browsers: getBreakdownPipeline('browser', 8),
        countries: getBreakdownPipeline('country', 10),
        recentVisits: [
          { $sort: { createdAt: -1 } },
          { $limit: 25 },
          {
            $project: {
              _id: 0,
              path: 1,
              source: 1,
              deviceType: 1,
              osType: 1,
              browser: 1,
              isRegistered: 1,
              userRole: 1,
              country: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]);

  return summary || {};
}

async function getUniqueVisitorSummary(match) {
  const uniqueVisitors = await AnalyticsVisit.aggregate([
    { $match: match },
    {
      $project: {
        isRegistered: 1,
        userRole: 1,
        visitorKey: {
          $cond: [
            { $and: ['$isRegistered', '$user'] },
            { $concat: ['user:', { $toString: '$user' }] },
            {
              $concat: [
                'guest:',
                { $ifNull: ['$ipAddress', ''] },
                ':',
                { $ifNull: ['$userAgent', ''] },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$visitorKey',
        isRegistered: { $max: '$isRegistered' },
        userRole: { $first: '$userRole' },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              visitors: { $sum: 1 },
              registered: {
                $sum: { $cond: ['$isRegistered', 1, 0] },
              },
              guests: {
                $sum: { $cond: ['$isRegistered', 0, 1] },
              },
            },
          },
        ],
        roles: [
          {
            $group: {
              _id: '$userRole',
              visitors: { $sum: 1 },
            },
          },
          { $sort: { visitors: -1, _id: 1 } },
          { $limit: 8 },
          {
            $project: {
              _id: 0,
              label: { $ifNull: ['$_id', 'guest'] },
              visitors: 1,
            },
          },
        ],
      },
    },
  ]);
  const summary = uniqueVisitors[0] || {};
  const totals = summary.totals?.[0] || {
    visitors: 0,
    registered: 0,
    guests: 0,
  };

  return {
    totals,
    roles: summary.roles || [],
  };
}

router.get(
  ['/', ''],
  authMiddleware,
  requirePermission('canViewAnalytics'),
  async (req, res) => {
    try {
      const range =
        RANGE_DAYS[req.query.range] !== undefined ? req.query.range : '30d';
      const match = buildMatch(range);
      const [trafficSummary, uniqueSummary] = await Promise.all([
        getTrafficSummary(match),
        getUniqueVisitorSummary(match),
      ]);
      const totals = trafficSummary.totals?.[0] || {
        visits: 0,
        registered: 0,
      };
      const totalVisits = totals.visits;
      const registeredVisits = totals.registered;
      const guestVisits = Math.max(totalVisits - registeredVisits, 0);
      const pages = trafficSummary.pages || [];
      const sources = trafficSummary.sources || [];
      const devices = trafficSummary.devices || [];
      const operatingSystems = trafficSummary.operatingSystems || [];
      const browsers = trafficSummary.browsers || [];
      const countries = normalizeCountryCounts(trafficSummary.countries || []);
      const recentVisits = trafficSummary.recentVisits || [];

      res.json({
        range,
        totals: {
          visits: totalVisits,
          registered: registeredVisits,
          guests: guestVisits,
          uniqueVisitors: uniqueSummary.totals.visitors,
          uniqueRegistered: uniqueSummary.totals.registered,
          uniqueGuests: uniqueSummary.totals.guests,
        },
        pages: pages.map((item) => ({
          ...item,
          label: cleanId(item.label, '/'),
        })),
        sources: sources.map((item) => ({
          ...item,
          label: cleanId(item.label, 'direct'),
        })),
        devices,
        operatingSystems,
        browsers,
        countries,
        roles: uniqueSummary.roles,
        recentVisits,
      });
    } catch (error) {
      console.error('Analytics summary failed:', error);
      res.status(500).json({ error: 'Failed to load analytics' });
    }
  },
);

router.post('/visit', optionalAuthMiddleware, async (req, res) => {
  try {
    const userAgent = cleanString(req.headers['user-agent']).slice(0, 520);
    const referrer = cleanString(
      req.body?.referrer || req.headers.referer,
    ).slice(0, 520);
    const referrerHost = getReferrerHost(referrer);
    const locale = cleanString(req.body?.locale).slice(0, 80);
    const timeZone = cleanString(req.body?.timeZone).slice(0, 120);
    const user = req.user || null;

    await AnalyticsVisit.create({
      path: cleanPath(req.body?.path),
      fullPath: cleanString(req.body?.fullPath || req.body?.path || '/').slice(
        0,
        520,
      ),
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
      ipAddress: getClientIp(req),
      country: getCountry(req, locale, timeZone),
      userAgent,
    });
  } catch (error) {
    console.error('Analytics visit failed:', error);
  }

  res.status(204).end();
});

module.exports = router;
