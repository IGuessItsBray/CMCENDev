const express = require('express');
const { timingSafeEqual } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const AnalyticsVisit = require('../models/AnalyticsVisit');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const CONFIG_TOKEN_KEY = 'config_token';
const CONFIG_TOKEN_ALIASES = Object.freeze([CONFIG_TOKEN_KEY, 'CONFIG_TOKEN']);

function getExpectedConfigToken() {
  return (
    CONFIG_TOKEN_ALIASES.map((key) => process.env[key]).find(
      (value) => String(value || '').length > 0,
    ) || ''
  );
}

function getSubmittedConfigToken(req) {
  return String(req.headers['x-config-token'] || req.body?.configToken || '');
}

function tokensMatch(submittedToken, expectedToken) {
  if (!submittedToken || !expectedToken) {
    return false;
  }

  const submitted = Buffer.from(submittedToken);
  const expected = Buffer.from(expectedToken);

  if (submitted.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(submitted, expected);
}

async function writeConfigAuditLog(req, action, metadata = {}) {
  try {
    await writeAuditLog({
      req,
      action,
      actor: req.user,
      targetType: 'config',
      targetSnapshot: {
        area: 'site-config',
      },
      metadata,
    });
  } catch (error) {
    console.error('Site config audit log failed:', error);
  }
}

async function validateConfigToken(req) {
  const expectedToken = getExpectedConfigToken();
  const submittedToken = getSubmittedConfigToken(req);

  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      error: 'Site configuration access token is not configured',
      reason: 'token_not_configured',
      hasSubmittedToken: Boolean(submittedToken),
    };
  }

  if (!tokensMatch(submittedToken, expectedToken)) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid site configuration token',
      reason: 'invalid_token',
      hasSubmittedToken: Boolean(submittedToken),
    };
  }

  return {
    ok: true,
    hasSubmittedToken: true,
  };
}

async function requireConfigToken(req, res, next) {
  const tokenResult = await validateConfigToken(req);

  if (!tokenResult.ok) {
    await writeConfigAuditLog(req, 'config.token_rejected', {
      reason: tokenResult.reason,
      hasSubmittedToken: tokenResult.hasSubmittedToken,
      route: req.originalUrl,
    });

    return res.status(tokenResult.status).json({
      error: tokenResult.error,
    });
  }

  next();
}

function requireDeveloperRole(req, res, next) {
  if (req.user?.role !== 'developer') {
    return res.status(404).json({
      error: 'Endpoint not found',
    });
  }

  next();
}

router.use(authMiddleware);

router.post(
  '/access',
  requireDeveloperRole,
  requirePermission('canAccessSiteConfig'),
  async (req, res) => {
    await writeConfigAuditLog(req, 'config.access_requested', {
      route: req.originalUrl,
    });

    res.json({ ok: true });
  },
);

router.post(
  '/verify',
  requireDeveloperRole,
  requirePermission('canAccessSiteConfig'),
  async (req, res) => {
    const tokenResult = await validateConfigToken(req);

    if (!tokenResult.ok) {
      await writeConfigAuditLog(req, 'config.token_rejected', {
        reason: tokenResult.reason,
        hasSubmittedToken: tokenResult.hasSubmittedToken,
        route: req.originalUrl,
      });

      return res.status(tokenResult.status).json({
        error: tokenResult.error,
      });
    }

    await writeConfigAuditLog(req, 'config.token_accepted', {
      route: req.originalUrl,
    });

    res.json({ ok: true });
  },
);

router.get(
  '/',
  requireDeveloperRole,
  requirePermission('canAccessSiteConfig'),
  requireConfigToken,
  async (req, res) => {
    try {
      res.json({
        maintenance: {
          canPurgeAnalytics: req.user?.role === 'developer',
        },
      });
    } catch (error) {
      console.error('Site config operations read failed:', error);
      res.status(500).json({ error: 'Could not load site operations' });
    }
  },
);

router.delete(
  '/analytics',
  requireDeveloperRole,
  requirePermission('canManageSiteConfig'),
  requireConfigToken,
  async (req, res) => {
    try {
      const result = await AnalyticsVisit.deleteMany({});

      await writeAuditLog({
        req,
        action: 'analytics.purged',
        actor: req.user,
        targetType: 'analytics',
        targetSnapshot: {
          deletedCount: result.deletedCount || 0,
        },
        metadata: {
          deletedCount: result.deletedCount || 0,
          route: req.originalUrl,
        },
      });

      res.json({
        message: 'Analytics history purged',
        deletedCount: result.deletedCount || 0,
      });
    } catch (error) {
      console.error('Analytics purge failed:', error);
      res.status(500).json({ error: 'Failed to purge analytics' });
    }
  },
);

module.exports = router;
