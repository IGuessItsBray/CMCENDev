const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLE_LEVELS } = require('../config/roles');
const { getUserPermissions } = require('../config/permissions');

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    const token = authHeader.slice(7);

    let decoded;

    try {
        decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );
    } catch {
        return res.status(401).json({
            error: 'Invalid or expired token'
        });
    }

    try {
        const user = await User.findById(decoded.userId)
            .select(
                'username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit role contentAreas createdAt updatedAt'
            );

        if (!user) {
            return res.status(401).json({
                error: 'User no longer exists'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication lookup failed:', error);

        return res.status(500).json({
            error: 'Could not authenticate user'
        });
    }
}

function requireMinimumRole(minimumRole) {
    return (req, res, next) => {
        const userLevel = ROLE_LEVELS[req.user?.role];
        const requiredLevel = ROLE_LEVELS[minimumRole];

        if (requiredLevel === undefined) {
            console.error(`Unknown required role: ${minimumRole}`);

            return res.status(500).json({
                error: 'Invalid server permission configuration'
            });
        }

        if (
            userLevel === undefined ||
            userLevel < requiredLevel
        ) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                requiredRole: minimumRole
            });
        }

        next();
    };
}

function requireExactRole(...allowedRoles) {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user?.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions'
            });
        }

        next();
    };
}

function requirePermission(permissionName) {
    return (req, res, next) => {
        const permissions = getUserPermissions(req.user);

        if (permissions[permissionName] !== true) {
            return res.status(403).json({
                error: 'Insufficient permissions'
            });
        }

        req.permissions = permissions;
        next();
    };
}

module.exports = {
    authMiddleware,
    requireMinimumRole,
    requireExactRole,
    requirePermission
};
