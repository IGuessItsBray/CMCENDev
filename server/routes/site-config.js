const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { timingSafeEqual } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const ENV_FILE_PATH = path.join(__dirname, '..', '.env');
const CONFIG_TOKEN_KEY = 'config_token';
const CONFIG_TOKEN_ALIASES = Object.freeze([
  CONFIG_TOKEN_KEY,
  'CONFIG_TOKEN'
]);

function getExpectedConfigToken() {
  return CONFIG_TOKEN_ALIASES
    .map(key => process.env[key])
    .find(value => String(value || '').length > 0) || '';
}

function getSubmittedConfigToken(req) {
  return String(
    req.headers['x-config-token'] ||
    req.body?.configToken ||
    ''
  );
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
        area: 'site-config'
      },
      metadata
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
      hasSubmittedToken: Boolean(submittedToken)
    };
  }

  if (!tokensMatch(submittedToken, expectedToken)) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid site configuration token',
      reason: 'invalid_token',
      hasSubmittedToken: Boolean(submittedToken)
    };
  }

  return {
    ok: true,
    hasSubmittedToken: true
  };
}

async function requireConfigToken(req, res, next) {
  const tokenResult = await validateConfigToken(req);

  if (!tokenResult.ok) {
    await writeConfigAuditLog(req, 'config.token_rejected', {
      reason: tokenResult.reason,
      hasSubmittedToken: tokenResult.hasSubmittedToken,
      route: req.originalUrl
    });

    return res.status(tokenResult.status).json({
      error: tokenResult.error
    });
  }

  next();
}

async function readEnvFile() {
  try {
    return await fs.readFile(ENV_FILE_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function parseEnvEntries(contents) {
  return String(contents || '')
    .split(/\r?\n/u)
    .map((line, index) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u);

      if (!match) {
        return {
          type: line.trim().startsWith('#') ? 'comment' : 'other',
          line,
          index
        };
      }

      return {
        type: 'entry',
        key: match[1],
        rawValue: match[2],
        value: parseEnvValue(match[2]),
        index
      };
    });
}

function parseEnvValue(rawValue) {
  const value = String(rawValue || '').trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
      .replace(/\\n/gu, '\n')
      .replace(/\\"/gu, '"')
      .replace(/\\'/gu, "'");
  }

  const commentIndex = value.search(/\s#/u);

  return commentIndex >= 0
    ? value.slice(0, commentIndex).trim()
    : value;
}

function isSecretKey(key) {
  return /(?:SECRET|TOKEN|PASSWORD|KEY|URI)/iu.test(key);
}

function isConfigTokenKey(key) {
  return CONFIG_TOKEN_ALIASES.includes(key);
}

function toConfigVariable(entry) {
  const isConfigToken = isConfigTokenKey(entry.key);

  return {
    key: entry.key,
    value: isConfigToken ? '' : entry.value,
    isSecret: isSecretKey(entry.key),
    isConfigToken,
    masked: isConfigToken,
    source: 'env-file'
  };
}

function listConfigVariables(contents) {
  return parseEnvEntries(contents)
    .filter(entry => entry.type === 'entry')
    .map(toConfigVariable);
}

function validateConfigKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(String(key || ''));
}

function quoteEnvValue(value) {
  const cleanValue = String(value ?? '');

  if (/[\r\n]/u.test(cleanValue)) {
    throw new Error('Configuration values cannot contain line breaks');
  }

  if (!cleanValue) {
    return '';
  }

  if (/^[^\s#"'\\]+$/u.test(cleanValue)) {
    return cleanValue;
  }

  return JSON.stringify(cleanValue);
}

function applyEnvUpdates(contents, updates) {
  const lines = String(contents || '').split(/\r?\n/u);
  const seenKeys = new Set();
  const normalizedUpdates = Object.entries(updates || {})
    .map(([key, value]) => [String(key || '').trim(), String(value ?? '')])
    .filter(([key]) => key);

  normalizedUpdates.forEach(([key]) => {
    if (!validateConfigKey(key)) {
      throw new Error(`Invalid configuration key: ${key}`);
    }
  });

  const nextLines = lines.map(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/u);

    if (!match) {
      return line;
    }

    const key = match[1];
    const update = normalizedUpdates.find(([updateKey]) => updateKey === key);

    if (!update) {
      return line;
    }

    seenKeys.add(key);
    return `${key}=${quoteEnvValue(update[1])}`;
  });

  normalizedUpdates.forEach(([key, value]) => {
    if (!seenKeys.has(key)) {
      nextLines.push(`${key}=${quoteEnvValue(value)}`);
    }
  });

  return nextLines.join('\n').replace(/\n*$/u, '\n');
}

function applyProcessUpdates(updates) {
  Object.entries(updates || {}).forEach(([key, value]) => {
    process.env[key] = String(value ?? '');
  });
}

router.use(authMiddleware);

router.post('/access', requirePermission('canAccessSiteConfig'), async (req, res) => {
  await writeConfigAuditLog(req, 'config.access_requested', {
    route: req.originalUrl
  });

  res.json({ ok: true });
});

router.post('/verify', requirePermission('canAccessSiteConfig'), async (req, res) => {
  const tokenResult = await validateConfigToken(req);

  if (!tokenResult.ok) {
    await writeConfigAuditLog(req, 'config.token_rejected', {
      reason: tokenResult.reason,
      hasSubmittedToken: tokenResult.hasSubmittedToken,
      route: req.originalUrl
    });

    return res.status(tokenResult.status).json({
      error: tokenResult.error
    });
  }

  await writeConfigAuditLog(req, 'config.token_accepted', {
    route: req.originalUrl
  });

  res.json({ ok: true });
});

router.get(
  '/',
  requirePermission('canAccessSiteConfig'),
  requireConfigToken,
  async (req, res) => {
  try {
    const contents = await readEnvFile();

    res.json({
      envFilePresent: Boolean(contents),
      variables: listConfigVariables(contents)
    });
  } catch (error) {
    console.error('Site config read failed:', error);
    res.status(500).json({ error: 'Could not read site configuration' });
  }
  }
);

router.patch(
  '/',
  requirePermission('canManageSiteConfig'),
  requireConfigToken,
  async (req, res) => {
  try {
    const updates = req.body?.updates || {};
    const updateKeys = Object.keys(updates);

    if (!updateKeys.length) {
      return res.status(400).json({
        error: 'No configuration updates provided'
      });
    }

    const contents = await readEnvFile();
    const nextContents = applyEnvUpdates(contents, updates);

    await fs.writeFile(ENV_FILE_PATH, nextContents, 'utf8');
    applyProcessUpdates(updates);

    await writeAuditLog({
      req,
      action: 'config.updated',
      actor: req.user,
      targetType: 'config',
      targetSnapshot: {
        keys: updateKeys
      },
      metadata: {
        keys: updateKeys
      }
    });

    res.json({
      message: 'Site configuration updated',
      variables: listConfigVariables(nextContents)
    });
  } catch (error) {
    console.error('Site config update failed:', error);
    res.status(400).json({
      error: error.message || 'Could not update site configuration'
    });
  }
  }
);

module.exports = router;
