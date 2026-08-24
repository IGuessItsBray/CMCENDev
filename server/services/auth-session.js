const jwt = require('jsonwebtoken');

const REFRESH_COOKIE_NAME = 'cmcen_refresh';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TOKEN_TTL || '1h';

function getRefreshTokenTtlDays() {
  const configuredDays = Number(process.env.JWT_REFRESH_TOKEN_TTL_DAYS || 30);

  if (!Number.isFinite(configuredDays)) return 30;

  return Math.min(90, Math.max(1, Math.floor(configuredDays)));
}

function createSessionToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      sessionVersion: Number(user.sessionVersion || 0),
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function createRefreshToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      sessionVersion: Number(user.sessionVersion || 0),
      tokenType: 'refresh',
    },
    process.env.JWT_SECRET,
    { expiresIn: `${getRefreshTokenTtlDays()}d` },
  );
}

function getRefreshCookieOptions(req, options = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req.secure || process.env.NODE_ENV === 'production'),
    path: '/api',
    ...options,
  };
}

function setRefreshTokenCookie(req, res, user) {
  const refreshToken = createRefreshToken(user);

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    getRefreshCookieOptions(req, {
      maxAge: getRefreshTokenTtlDays() * 24 * 60 * 60 * 1000,
    }),
  );
}

function clearRefreshTokenCookie(req, res) {
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions(req));
}

function readCookie(req, name) {
  const cookieHeader = String(req.headers.cookie || '');

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex < 1) continue;

    const cookieName = cookie.slice(0, separatorIndex).trim();

    if (cookieName !== name) continue;

    try {
      return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
    } catch {
      return '';
    }
  }

  return '';
}

module.exports = {
  REFRESH_COOKIE_NAME,
  clearRefreshTokenCookie,
  createSessionToken,
  readCookie,
  setRefreshTokenCookie,
};
