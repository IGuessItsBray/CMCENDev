const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLE_LEVELS } = require('../config/roles');
const { getUserPermissions } = require('../config/permissions');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  const token = authHeader.slice(7);

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired token',
    });
  }

  try {
    const user = await User.findById(decoded.userId)
      .select(
        'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit phone preferredLanguage role customRoles contentAreas emailSubscriptions notificationState totp webauthn twoFactor createdAt updatedAt sessionVersion',
      )
      .populate('customRoles', 'name slug color permissions');

    if (!user) {
      return res.status(401).json({
        error: 'User no longer exists',
      });
    }

    if (
      Number(decoded.sessionVersion || 0) !== Number(user.sessionVersion || 0)
    ) {
      return res.status(401).json({
        error: 'Session has been revoked',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication lookup failed:', error);

    return res.status(500).json({
      error: 'Could not authenticate user',
    });
  }
}

async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .select(
        'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit phone preferredLanguage role customRoles contentAreas emailSubscriptions notificationState createdAt updatedAt sessionVersion',
      )
      .populate('customRoles', 'name slug color permissions');

    if (
      user &&
      Number(decoded.sessionVersion || 0) === Number(user.sessionVersion || 0)
    ) {
      req.user = user;
    }
  } catch {
    req.user = null;
  }

  return next();
}

function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    const userLevel = ROLE_LEVELS[req.user?.role];
    const requiredLevel = ROLE_LEVELS[minimumRole];

    if (requiredLevel === undefined) {
      console.error(`Unknown required role: ${minimumRole}`);

      return res.status(500).json({
        error: 'Invalid server permission configuration',
      });
    }

    if (userLevel === undefined || userLevel < requiredLevel) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        requiredRole: minimumRole,
      });
    }

    next();
  };
}

function requireExactRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user?.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
      });
    }

    next();
  };
}

function requirePermission(permissionName) {
  return (req, res, next) => {
    const permissions = getUserPermissions(req.user);
    const permissionKeys = Array.isArray(permissions.keys)
      ? permissions.keys
      : [];

    if (
      permissions[permissionName] !== true &&
      !permissionKeys.includes(permissionName)
    ) {
      return res.status(403).json({
        error: 'Insufficient permissions',
      });
    }

    req.permissions = permissions;
    next();
  };
}

async function authOrTempMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const incomingTemp =
    req.headers['x-temp-token'] || req.body?.tempToken || req.query?.tempToken;
  console.log(
    'authOrTempMiddleware -> authHeader present:',
    !!authHeader,
    'tempToken present:',
    !!incomingTemp,
  );

  // Try regular JWT first
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select(
          'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit preferredLanguage role customRoles contentAreas notificationState createdAt updatedAt',
        )
        .populate('customRoles', 'name slug color permissions');

      if (!user)
        return res.status(401).json({ error: 'User no longer exists' });

      if (
        Number(decoded.sessionVersion || 0) !== Number(user.sessionVersion || 0)
      ) {
        return res.status(401).json({ error: 'Session has been revoked' });
      }

      req.user = user;
      return next();
    } catch (e) {
      console.log('authOrTempMiddleware -> JWT verify failed:', e && e.name);
      // fall through to temp-token check
    }
  }

  const tempToken = incomingTemp;
  if (!tempToken) {
    console.log('authOrTempMiddleware -> no temp token provided');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await User.findOne({
      'twoFactor.tempToken': tempToken,
      'twoFactor.tempExpires': { $gt: new Date() },
    })
      .select(
        'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit preferredLanguage role customRoles contentAreas emailSubscriptions createdAt updatedAt webauthn totp sessionVersion',
      )
      .populate('customRoles', 'name slug color permissions');

    if (!user)
      return res.status(401).json({ error: 'Invalid or expired temp token' });

    req.user = user;
    req.isTemp = true;
    return next();
  } catch (error) {
    console.error('Temp token lookup failed:', error);
    return res.status(500).json({ error: 'Could not authenticate' });
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  authOrTempMiddleware,
  requireMinimumRole,
  requireExactRole,
  requirePermission,
};
