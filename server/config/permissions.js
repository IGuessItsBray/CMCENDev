const { ROLE_LEVELS } = require('./roles');

const PERMISSION_CATALOG = Object.freeze([
  {
    key: 'connections.read',
    label: 'Read connections',
    group: 'Connections',
    action: 'read',
    description: 'View member-only connection areas.',
  },
  {
    key: 'content.create',
    label: 'Create content',
    group: 'Content',
    action: 'write',
    description: 'Create draft events and other site content.',
  },
  {
    key: 'retirements.submit',
    label: 'Submit retirement messages',
    group: 'Retirements',
    action: 'write',
    description: 'Submit retirement messages for review.',
  },
  {
    key: 'certificates.manage',
    label: 'Manage certificate requests',
    group: 'Certificates',
    action: 'edit',
    description:
      'View certificate requests with delivery details and confirm completed certificates were printed.',
  },
  {
    key: 'content.publish_own',
    label: 'Publish own content',
    group: 'Content',
    action: 'write',
    description: 'Publish content owned by the member.',
  },
  {
    key: 'content.review',
    label: 'Review and publish content',
    group: 'Content',
    action: 'edit',
    description: 'Review, edit, approve, and publish content.',
  },
  {
    key: 'content.delete',
    label: 'Delete content',
    group: 'Content',
    action: 'delete',
    description: 'Delete events, retirement messages, and comments.',
  },
  {
    key: 'content.delete_own',
    label: 'Delete own content',
    group: 'Content',
    action: 'delete',
    description: 'Delete content and comments submitted by the current member.',
  },
  {
    key: 'content_areas.manage',
    label: 'Manage content areas',
    group: 'Content',
    action: 'admin',
    description: 'Assign or change content-area access for members.',
  },
  {
    key: 'translations.manage',
    label: 'Manage translations',
    group: 'Translations',
    action: 'edit',
    description: 'Edit site translation strings.',
  },
  {
    key: 'pages.manage',
    label: 'Manage pages',
    group: 'Pages',
    action: 'edit',
    description: 'Create, edit, publish, archive, and delete custom pages.',
  },
  {
    key: 'navigation.manage',
    label: 'Manage navigation',
    group: 'Pages',
    action: 'edit',
    description:
      'Add custom pages to the main navigation and reorder custom links.',
  },
  {
    key: 'users.read',
    label: 'View users',
    group: 'Users',
    action: 'read',
    description:
      'View the member list and member details in the admin work zone.',
  },
  {
    key: 'users.manage',
    label: 'Manage users',
    group: 'Users',
    action: 'edit',
    description: 'Edit member roles, content areas, and role assignments.',
  },
  {
    key: 'users.delete_self',
    label: 'Delete own account',
    group: 'Users',
    action: 'delete',
    description: 'Delete the current account after MFA confirmation.',
  },
  {
    key: 'users.delete_any',
    label: 'Delete user accounts',
    group: 'Users',
    action: 'delete',
    description: 'Delete other accounts after MFA confirmation.',
  },
  {
    key: 'users.provision',
    label: 'Provision user accounts',
    group: 'Users',
    action: 'create',
    description: 'Create invited accounts and send activation links.',
  },
  {
    key: 'users.mfa_reset',
    label: 'Reset user MFA',
    group: 'Users',
    action: 'admin',
    description:
      "Reset another user's authenticator app and passkeys from the admin work zone.",
  },
  {
    key: 'roles.manage',
    label: 'Manage roles',
    group: 'Roles',
    action: 'edit',
    description: 'Create, edit, and delete custom roles.',
  },
  {
    key: 'audit.view',
    label: 'View audit log',
    group: 'Audit log',
    action: 'read',
    description:
      'Review security, login, publishing, deletion, and role-change logs.',
  },
  {
    key: 'analytics.view',
    label: 'View analytics',
    group: 'Analytics',
    action: 'read',
    description:
      'Review page visits, traffic sources, device types, operating systems, and guest/member usage.',
  },
  {
    key: 'timers.manage',
    label: 'Manage banners',
    group: 'Banners',
    action: 'edit',
    description: 'Create, update, schedule, and delete public site banners.',
  },
  {
    key: 'site_config.access',
    label: 'Access site config',
    group: 'Site config',
    action: 'read',
    description:
      'Open the site configuration work zone after token verification.',
  },
  {
    key: 'site_config.manage',
    label: 'Manage site config',
    group: 'Site config',
    action: 'admin',
    description:
      'Edit environment-backed site configuration values after token verification.',
  },
  {
    key: 'media.read',
    label: 'View media library',
    group: 'Media',
    action: 'read',
    description: 'View uploaded media and attachment usage.',
  },
  {
    key: 'media.upload',
    label: 'Upload media',
    group: 'Media',
    action: 'write',
    description: 'Upload authenticated image assets for content.',
  },
  {
    key: 'media.delete',
    label: 'Delete media',
    group: 'Media',
    action: 'delete',
    description: 'Delete unattached media from storage.',
  },
  {
    key: 'review.bypass',
    label: 'Bypass review stages',
    group: 'Moderation',
    action: 'admin',
    description: 'Skip review-only workflow gates.',
  },
]);

const LEGACY_PERMISSION_KEYS = Object.freeze({
  canAccessConnections: 'connections.read',
  canCreateDrafts: 'content.create',
  canSubmitRetirementMessages: 'retirements.submit',
  canManageCertificateRequests: 'certificates.manage',
  canPublishOwnContent: 'content.publish_own',
  canReviewAndPublish: 'content.review',
  canDeleteContent: 'content.delete',
  canDeleteOwnContent: 'content.delete_own',
  canManageContentAreas: 'content_areas.manage',
  canManageTranslations: 'translations.manage',
  canManagePages: 'pages.manage',
  canManageNavigation: 'navigation.manage',
  canReadUsers: 'users.read',
  canManageUsers: 'users.manage',
  canDeleteOwnAccount: 'users.delete_self',
  canDeleteAnyUser: 'users.delete_any',
  canProvisionUsers: 'users.provision',
  canResetUserMfa: 'users.mfa_reset',
  canManageRoles: 'roles.manage',
  canViewAuditLog: 'audit.view',
  canViewAnalytics: 'analytics.view',
  canManageTimers: 'timers.manage',
  canAccessSiteConfig: 'site_config.access',
  canManageSiteConfig: 'site_config.manage',
  canViewMediaLibrary: 'media.read',
  canUploadMedia: 'media.upload',
  canDeleteMedia: 'media.delete',
  canBypassReviewStages: 'review.bypass',
});

const CUSTOM_ROLE_DENYLIST = Object.freeze([
  'review.bypass',
  'site_config.access',
  'site_config.manage',
]);

function getAllPermissionKeys() {
  return PERMISSION_CATALOG.map((permission) => permission.key);
}

function hasMinimumRole(userRole, minimumRole) {
  const userLevel = ROLE_LEVELS[userRole];
  const requiredLevel = ROLE_LEVELS[minimumRole];

  return (
    userLevel !== undefined &&
    requiredLevel !== undefined &&
    userLevel >= requiredLevel
  );
}

function getBuiltInPermissionFlags(user) {
  const role = user?.role;
  const isGhost = role === 'ghost';

  return {
    canAccessConnections: hasMinimumRole(role, 'subscriber'),

    canCreateDrafts: isGhost || hasMinimumRole(role, 'contributor'),

    canSubmitRetirementMessages: isGhost || hasMinimumRole(role, 'contributor'),

    canManageCertificateRequests: hasMinimumRole(role, 'editor'),

    canPublishOwnContent: hasMinimumRole(role, 'author'),

    canReviewAndPublish: hasMinimumRole(role, 'editor'),

    canDeleteContent: hasMinimumRole(role, 'administrator'),

    canDeleteOwnContent: hasMinimumRole(role, 'subscriber'),

    canManageContentAreas: hasMinimumRole(role, 'administrator'),

    canManageTranslations: hasMinimumRole(role, 'editor'),

    canManagePages: hasMinimumRole(role, 'editor'),

    canManageNavigation: hasMinimumRole(role, 'administrator'),

    canReadUsers: hasMinimumRole(role, 'administrator'),

    canManageUsers: hasMinimumRole(role, 'administrator'),

    canDeleteOwnAccount: hasMinimumRole(role, 'subscriber'),

    canProvisionUsers: hasMinimumRole(role, 'administrator'),

    canDeleteAnyUser: hasMinimumRole(role, 'administrator'),

    canResetUserMfa: hasMinimumRole(role, 'administrator'),

    canManageRoles: hasMinimumRole(role, 'administrator'),

    canViewAuditLog: hasMinimumRole(role, 'administrator'),

    canViewAnalytics: hasMinimumRole(role, 'administrator'),

    canManageTimers: hasMinimumRole(role, 'editor'),

    canAccessSiteConfig: role === 'developer',

    canManageSiteConfig: role === 'developer',

    canViewMediaLibrary: hasMinimumRole(role, 'administrator'),

    canUploadMedia: hasMinimumRole(role, 'contributor'),

    canDeleteMedia: hasMinimumRole(role, 'administrator'),

    canBypassReviewStages: role === 'developer',
  };
}

function normalizePermissionKeys(value) {
  const catalogKeys = new Set(
    PERMISSION_CATALOG.map((permission) => permission.key),
  );

  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((permission) => String(permission || '').trim())
        .filter((permission) => catalogKeys.has(permission)),
    ),
  ];
}

function getCustomPermissionSet(user) {
  const assignedRoles = Array.isArray(user?.customRoles)
    ? user.customRoles
    : [];
  const permissions = new Set();

  assignedRoles.forEach((role) => {
    normalizePermissionKeys(role?.permissions).forEach((permission) => {
      permissions.add(permission);
    });
  });

  return permissions;
}

function getUserPermissions(user) {
  const flags = getBuiltInPermissionFlags(user);
  const explicitPermissions = new Set();
  const isDeveloper = user?.role === 'developer';

  if (isDeveloper) {
    Object.keys(flags).forEach((permissionName) => {
      flags[permissionName] = true;
    });

    getAllPermissionKeys().forEach((permission) => {
      explicitPermissions.add(permission);
    });
  }

  Object.entries(flags).forEach(([legacyName, isAllowed]) => {
    if (isAllowed) {
      explicitPermissions.add(LEGACY_PERMISSION_KEYS[legacyName]);
    }
  });

  getCustomPermissionSet(user).forEach((permission) => {
    if (!CUSTOM_ROLE_DENYLIST.includes(permission)) {
      explicitPermissions.add(permission);
    }
  });

  if (explicitPermissions.has('content.review')) {
    explicitPermissions.add('certificates.manage');
  }

  Object.entries(LEGACY_PERMISSION_KEYS).forEach(([legacyName, permission]) => {
    flags[legacyName] =
      flags[legacyName] || explicitPermissions.has(permission);
  });

  return {
    ...flags,
    keys: [...explicitPermissions].sort(),
  };
}

module.exports = {
  LEGACY_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  getAllPermissionKeys,
  hasMinimumRole,
  getUserPermissions,
  normalizePermissionKeys,
  CUSTOM_ROLE_DENYLIST,
};
