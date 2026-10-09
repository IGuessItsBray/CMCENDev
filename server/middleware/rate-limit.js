const { createHash } = require('node:crypto');
const MAX_RATE_LIMIT_ENTRIES = 10000;

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function createRateLimit({
  name,
  windowMs,
  max,
  keyGenerator = getClientIp,
  maxEntries = MAX_RATE_LIMIT_ENTRIES,
}) {
  if (
    ![windowMs, max, maxEntries].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  ) {
    throw new Error('Rate limit settings must be positive integers');
  }
  const entries = new Map();
  const cleanupInterval = Math.min(windowMs, 60000);
  const expireEntries = () => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  };
  // Idle limiters release expired identities too; the timer never keeps Node alive.
  setInterval(expireEntries, cleanupInterval).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || 'unknown');
    // Bound retained key size even for caller-supplied account identifiers.
    const entryKey = createHash('sha256')
      .update(`${name}:${key}`)
      .digest('hex');
    let entry = entries.get(entryKey);

    if (!entry && entries.size >= maxEntries) {
      // Fail closed rather than evicting active counters and allowing a bypass.
      const retryAfterSeconds = Math.max(1, Math.ceil(cleanupInterval / 1000));
      res.locals.diagnosticReason = 'rate_limit_capacity';
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfterSeconds,
      });
    }

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(entryKey, entry);
    }

    entry.count = Math.min(max + 1, entry.count + 1);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );
    res.set({
      'RateLimit-Limit': String(max),
      'RateLimit-Remaining': String(Math.max(0, max - entry.count)),
      'RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    });

    if (entry.count > max) {
      res.locals.diagnosticReason = 'rate_limited';
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfterSeconds,
      });
    }

    return next();
  };
}

function rateLimitByIp(name, windowEnv, maxEnv, defaults) {
  return createRateLimit({
    name,
    windowMs: readPositiveInteger(windowEnv, defaults.windowSeconds) * 1000,
    max: readPositiveInteger(maxEnv, defaults.max),
  });
}

module.exports = {
  createRateLimit,
  getClientIp,
  readPositiveInteger,
  rateLimitByIp,
};
