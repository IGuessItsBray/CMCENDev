const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const { timingSafeEqual } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const AnalyticsVisit = require('../models/AnalyticsVisit');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const MIGRATION_SCRIPT_PATH = path.join(
  __dirname,
  '..',
  'scripts',
  'migration',
  'scrape-current-retirements.js',
);
const LAST_POST_MIGRATION_SCRIPT_PATH = path.join(
  __dirname,
  '..',
  'scripts',
  'migration',
  'scrape-current-last-posts.js',
);
const CONFIG_TOKEN_KEY = 'config_token';
const CONFIG_TOKEN_ALIASES = Object.freeze([CONFIG_TOKEN_KEY, 'CONFIG_TOKEN']);
const MIGRATION_DEFINITIONS = Object.freeze({
  retirement: {
    label: 'Retirement migration',
    scriptPath: MIGRATION_SCRIPT_PATH,
    args: ['--content=retirements'],
    maxLimit: 1000,
  },
  comments: {
    label: 'Comment migration',
    scriptPath: MIGRATION_SCRIPT_PATH,
    args: ['--content=comments'],
    maxLimit: 1000,
  },
  lastPost: {
    label: 'Last Post migration',
    scriptPath: LAST_POST_MIGRATION_SCRIPT_PATH,
    args: [],
    maxLimit: 1000,
  },
});

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

function getMigrationDefinition(key) {
  return MIGRATION_DEFINITIONS[String(key || '')] || null;
}

function parseMigrationLimit(value, maxLimit) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    return null;
  }

  return limit;
}

function getMigrationSummary(stdout, stderr, mode) {
  const output = `${stdout || ''}\n${stderr || ''}`.trim();
  const retirementMatch = output.match(
    /\b(?:Imported|Would import)\s+(\d+)\s+retirement messages\./iu,
  );
  const commentMatch = output.match(
    /\b(?:Imported|Would import)\s+(\d+)\s+retirement comments\./iu,
  );
  const lastPostMatch = output.match(
    /\b(?:Imported|Would import)\s+(\d+)\s+Last Post messages\./u,
  );
  const manifestMatch = output.match(/Wrote manifest:\s*(.+)$/imu);

  return {
    mode,
    retirementMessages: retirementMatch ? Number(retirementMatch[1]) : null,
    comments: commentMatch ? Number(commentMatch[1]) : null,
    lastPostMessages: lastPostMatch ? Number(lastPostMatch[1]) : null,
    manifestPath: manifestMatch ? manifestMatch[1].trim() : '',
    output: output.split(/\r?\n/u).slice(-30),
  };
}

function writeMigrationEvent(res, event) {
  res.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    })}\n`,
  );
}

function splitMigrationOutputLines(chunk, carry = '') {
  const text = `${carry}${chunk.toString('utf8')}`;
  const lines = text.split(/\r?\n/u);

  return {
    lines: lines.slice(0, -1),
    carry: lines.at(-1) || '',
  };
}

function runMigrationStream({
  req,
  res,
  definition,
  migrationKey,
  mode,
  limit,
}) {
  const args = [definition.scriptPath, ...definition.args];

  if (mode === 'apply') {
    args.push('--apply');
  }

  if (limit) {
    args.push(`--limit=${limit}`);
  }

  const child = spawn(process.execPath, args, {
    cwd: path.join(__dirname, '..', '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  let stdoutCarry = '';
  let stderrCarry = '';
  let settled = false;
  const timeout = setTimeout(
    () => {
      child.kill('SIGTERM');
    },
    1000 * 60 * 30,
  );

  res.on('close', () => {
    if (!settled) {
      child.kill('SIGTERM');
    }
  });

  function handleLines(lines, stream) {
    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        output.push(line);
        writeMigrationEvent(res, {
          type: 'log',
          stream,
          message: line,
        });
      });
  }

  writeMigrationEvent(res, {
    type: 'start',
    migration: migrationKey,
    mode,
    limit,
    message: `${definition.label} ${mode === 'apply' ? 'started' : 'dry run started'}`,
  });

  child.stdout.on('data', (chunk) => {
    const result = splitMigrationOutputLines(chunk, stdoutCarry);
    stdoutCarry = result.carry;
    handleLines(result.lines, 'stdout');
  });

  child.stderr.on('data', (chunk) => {
    const result = splitMigrationOutputLines(chunk, stderrCarry);
    stderrCarry = result.carry;
    handleLines(result.lines, 'stderr');
  });

  child.on('error', (error) => {
    if (settled) return;

    settled = true;
    clearTimeout(timeout);
    writeMigrationEvent(res, {
      type: 'error',
      message: error.message || 'Migration failed to start',
    });
    res.end();
  });

  child.on('close', async (code) => {
    if (settled) return;

    settled = true;
    clearTimeout(timeout);
    handleLines(stdoutCarry ? [stdoutCarry] : [], 'stdout');
    handleLines(stderrCarry ? [stderrCarry] : [], 'stderr');

    const combinedOutput = output.join('\n');
    const summary = getMigrationSummary(combinedOutput, '', mode);
    summary.exitCode = code;

    try {
      await writeAuditLog({
        req,
        action: `migration.${migrationKey}.${mode}`,
        actor: req.user,
        targetType: 'migration',
        targetSnapshot: {
          migration: migrationKey,
          mode,
          label: definition.label,
          limit,
        },
        metadata: {
          ...summary,
          limit,
        },
      });
    } catch (error) {
      console.error('Migration audit log failed:', error);
    }

    if (code === 0) {
      writeMigrationEvent(res, {
        type: 'summary',
        message:
          mode === 'apply'
            ? `${definition.label} completed`
            : `${definition.label} dry run completed`,
        summary,
      });
      writeMigrationEvent(res, { type: 'done' });
    } else {
      writeMigrationEvent(res, {
        type: 'error',
        message: `${definition.label} failed with exit code ${code}`,
        summary,
      });
    }

    res.end();
  });
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
        migrations: Object.entries(MIGRATION_DEFINITIONS).map(
          ([key, definition]) => ({
            key,
            maxLimit: definition.maxLimit,
          }),
        ),
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

router.post(
  '/migrations/:migrationKey',
  requireDeveloperRole,
  requirePermission('canManageSiteConfig'),
  requireConfigToken,
  async (req, res) => {
    try {
      const definition = getMigrationDefinition(req.params.migrationKey);
      const mode = req.body?.mode === 'apply' ? 'apply' : 'dry-run';

      if (!definition) {
        return res.status(404).json({ error: 'Migration not found' });
      }

      const limit = parseMigrationLimit(req.body?.limit, definition.maxLimit);

      if ((req.body?.limit ?? '') !== '' && !limit) {
        return res.status(400).json({
          error: `Migration limit must be a whole number from 1 to ${definition.maxLimit}`,
        });
      }

      res.set({
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      runMigrationStream({
        req,
        res,
        definition,
        migrationKey: req.params.migrationKey,
        mode,
        limit,
      });
    } catch (error) {
      console.error('Site config migration failed:', error);
      res.status(500).json({
        error: error.message || 'Migration failed',
      });
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
