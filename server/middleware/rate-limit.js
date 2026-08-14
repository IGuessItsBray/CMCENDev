const MAX_RATE_LIMIT_ENTRIES = 10000;

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

function pruneEntries(entries, now, maxEntries) {
  for (const [storedKey, storedEntry] of entries) {
    if (storedEntry.resetAt <= now) entries.delete(storedKey);
  }

  while (entries.size >= maxEntries) {
    let earliestKey = '';
    let earliestResetAt = Number.POSITIVE_INFINITY;

    for (const [storedKey, storedEntry] of entries) {
      if (storedEntry.resetAt < earliestResetAt) {
        earliestKey = storedKey;
        earliestResetAt = storedEntry.resetAt;
      }
    }

    if (!earliestKey) break;
    entries.delete(earliestKey);
  }
}

function createRateLimit({
  name,
  windowMs,
  max,
  keyGenerator = getClientIp,
  maxEntries = MAX_RATE_LIMIT_ENTRIES,
}) {
  const entries = new Map();
  const configuredEntryLimit = Number(maxEntries);
  const entryLimit =
    Number.isSafeInteger(configuredEntryLimit) && configuredEntryLimit > 0
      ? configuredEntryLimit
      : MAX_RATE_LIMIT_ENTRIES;

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || 'unknown');
    const entryKey = `${name}:${key}`;
    let entry = entries.get(entryKey);

    if (!entry || entry.resetAt <= now) {
      if (!entry) {
        pruneEntries(entries, now, entryLimit);
      }
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
  MAX_RATE_LIMIT_ENTRIES,
  createRateLimit,
  getClientIp,
  pruneEntries,
  readPositiveInteger,
  rateLimitByIp,
};
