const { ROLE_LEVELS } = require('./roles');

function hasMinimumRole(userRole, minimumRole) {
  const userLevel = ROLE_LEVELS[userRole];
  const requiredLevel = ROLE_LEVELS[minimumRole];

  return (
    userLevel !== undefined &&
    requiredLevel !== undefined &&
    userLevel >= requiredLevel
  );
}

function getUserPermissions(user) {
  return {
    canAccessConnections:
      hasMinimumRole(user.role, 'subscriber'),

    canCreateDrafts:
      hasMinimumRole(user.role, 'contributor'),

    canSubmitRetirementMessages:
      hasMinimumRole(user.role, 'contributor'),

    canPublishOwnContent:
      hasMinimumRole(user.role, 'author'),

    canReviewAndPublish:
      hasMinimumRole(user.role, 'editor'),

    canManageUsers:
      user.role === 'administrator'
  };
}

module.exports = {
  hasMinimumRole,
  getUserPermissions
};
