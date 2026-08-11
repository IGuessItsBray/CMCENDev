const MAX_RATE_LIMIT_ENTRIES = 10000;

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function createRateLimit({ name, windowMs, max, keyGenerator = getClientIp }) {
  const entries = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || 'unknown');
    const entryKey = `${name}:${key}`;
    let entry = entries.get(entryKey);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(entryKey, entry);
    }

    entry.count += 1;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    );
    res.set({
      'RateLimit-Limit': String(max),
      'RateLimit-Remaining': String(Math.max(0, max - entry.count)),
      'RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    });

    if (entries.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [storedKey, storedEntry] of entries) {
        if (storedEntry.resetAt <= now) entries.delete(storedKey);
      }
    }

    if (entry.count > max) {
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
