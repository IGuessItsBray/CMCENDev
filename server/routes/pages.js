const express = require('express');
const path = require('path');
const Page = require('../models/Page');
const NavigationItem = require('../models/NavigationItem');
const Role = require('../models/Role');
const { USER_ROLES } = require('../config/roles');
const {
  PERMISSION_CATALOG,
  getUserPermissions,
  normalizePermissionKeys
} = require('../config/permissions');
const {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission
} = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const PAGE_SHELL_PATH = path.join(__dirname, '..', 'public', 'page.html');
const NAV_GROUPS = Object.freeze(['about', 'doctrine', 'news', 'benefits']);
const NAV_GROUP_LABELS = Object.freeze({
  about: { en: 'About', fr: 'À propos' },
  doctrine: { en: 'Doctrine', fr: 'Doctrine' },
  news: { en: 'News', fr: 'Nouvelles' },
  benefits: { en: 'Benefits', fr: 'Avantages' }
});
const BLOCK_TYPES = new Set(['heading', 'text', 'image', 'callout', 'button', 'divider']);

function cleanText(value, maxLength = 10000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanLocalizedText(value, maxLength = 10000) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    en: cleanText(source.en, maxLength),
    fr: cleanText(source.fr, maxLength)
  };
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeNavigationGroup(value) {
  return normalizeSlug(value);
}

function cleanUrl(value) {
  const url = cleanText(value, 1000);

  if (!url) return '';

  if (
    url.startsWith('/') ||
    /^https?:\/\//iu.test(url) ||
    /^mailto:/iu.test(url)
  ) {
    return url;
  }

  return '';
}

function cleanBlock(block) {
  const source = block && typeof block === 'object' && !Array.isArray(block)
    ? block
    : {};
  const type = BLOCK_TYPES.has(source.type) ? source.type : 'text';

  return {
    type,
    level: Number(source.level) === 3 ? 3 : 2,
    text: cleanLocalizedText(source.text, 500),
    body: cleanLocalizedText(source.body, 10000),
    url: cleanUrl(source.url),
    mediaKey: cleanText(source.mediaKey, 500),
    mediaUrl: cleanUrl(source.mediaUrl),
    alt: cleanLocalizedText(source.alt, 500),
    caption: cleanLocalizedText(source.caption, 500),
    variant: source.variant === 'important' ? 'important' : 'standard'
  };
}

function cleanBlocks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 80).map(cleanBlock);
}

function cleanObjectIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(item => String(item || '').trim())
        .filter(item => /^[0-9a-f]{24}$/iu.test(item))
    )
  ];
}

function cleanPageAccess(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const audience = ['public', 'authenticated', 'restricted'].includes(source.audience)
    ? source.audience
    : 'public';

  return {
    audience,
    roles: [
      ...new Set(
        (Array.isArray(source.roles) ? source.roles : [])
          .map(role => String(role || '').trim())
          .filter(role => USER_ROLES.includes(role))
      )
    ],
    customRoles: cleanObjectIdList(source.customRoles),
    permissions: normalizePermissionKeys(source.permissions)
  };
}

function getPageAccess(page = {}) {
  return cleanPageAccess(page.access || {});
}

function getPageSnapshot(page) {
  return {
    _id: page._id,
    title: page.title || {},
    slug: page.slug,
    status: page.status,
    access: getPageAccess(page),
    updatedAt: page.updatedAt,
    publishedAt: page.publishedAt
  };
}

function toPageResponse(page, { includeBlocks = true } = {}) {
  const plainPage = page.toObject ? page.toObject() : page;

  return {
    _id: plainPage._id,
    title: plainPage.title || {},
    slug: plainPage.slug,
    route: `/pages/${plainPage.slug}`,
    summary: plainPage.summary || {},
    status: plainPage.status,
    access: getPageAccess(plainPage),
    blocks: includeBlocks ? plainPage.blocks || [] : undefined,
    createdAt: plainPage.createdAt,
    updatedAt: plainPage.updatedAt,
    publishedAt: plainPage.publishedAt
  };
}

function cleanPageUpdate(body, actor, { requireTitle = false } = {}) {
  const source = body || {};
  const update = {};

  if (requireTitle || Object.prototype.hasOwnProperty.call(source, 'title')) {
    const title = cleanLocalizedText(source.title, 180);

    if (!title.en && !title.fr) {
      return { error: 'Page title is required' };
    }

    update.title = title;
  }

  if (requireTitle || Object.prototype.hasOwnProperty.call(source, 'slug')) {
    const slug = normalizeSlug(source.slug || source.title?.en || source.title?.fr);

    if (!slug) {
      return { error: 'Page slug is required' };
    }

    update.slug = slug;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'summary')) {
    update.summary = cleanLocalizedText(source.summary, 500);
  }

  if (Object.prototype.hasOwnProperty.call(source, 'blocks')) {
    update.blocks = cleanBlocks(source.blocks);
  }

  if (Object.prototype.hasOwnProperty.call(source, 'access')) {
    update.access = cleanPageAccess(source.access);
  }

  update.updatedBy = actor?._id || null;

  return { update };
}

function getCustomRoleIds(user) {
  return new Set(
    (Array.isArray(user?.customRoles) ? user.customRoles : [])
      .map(role => role?._id || role)
      .filter(Boolean)
      .map(roleId => String(roleId))
  );
}

function canViewPage(page, user) {
  const access = getPageAccess(page);

  if (access.audience === 'public') {
    return true;
  }

  if (!user) {
    return false;
  }

  if (user.role === 'developer') {
    return true;
  }

  if (access.audience === 'authenticated') {
    return true;
  }

  const allowedRoles = new Set(access.roles || []);
  const allowedCustomRoles = new Set(
    (access.customRoles || []).map(roleId => String(roleId))
  );
  const requiredPermissions = new Set(access.permissions || []);
  const userCustomRoleIds = getCustomRoleIds(user);
  const userPermissionKeys = new Set(getUserPermissions(user).keys || []);

  if (allowedRoles.has(user.role)) {
    return true;
  }

  for (const roleId of userCustomRoleIds) {
    if (allowedCustomRoles.has(roleId)) {
      return true;
    }
  }

  for (const permission of requiredPermissions) {
    if (userPermissionKeys.has(permission)) {
      return true;
    }
  }

  return false;
}

function canViewNavigationItem(item, user) {
  if (item.type === 'group') {
    return true;
  }

  if (item.permission) {
    const permissionKeys = new Set(getUserPermissions(user).keys || []);

    if (!permissionKeys.has(item.permission)) {
      return false;
    }
  }

  return !item.page || canViewPage(item.page, user);
}

function toAdminRole(role) {
  return {
    _id: role._id,
    name: role.name,
    slug: role.slug,
    color: role.color,
    permissions: role.permissions || []
  };
}

function toNavigationItem(item) {
  const plainItem = item.toObject ? item.toObject() : item;

  return {
    _id: plainItem._id,
    type: plainItem.type || 'link',
    group: plainItem.group,
    label: plainItem.label || {},
    page: plainItem.page?._id || plainItem.page || null,
    route: plainItem.route,
    permission: plainItem.permission || '',
    visible: plainItem.visible !== false,
    order: plainItem.order || 0,
    createdAt: plainItem.createdAt,
    updatedAt: plainItem.updatedAt
  };
}

function cleanNavigationUpdate(body, actor, { requireLabel = false } = {}) {
  const source = body || {};
  const update = {};

  if (Object.prototype.hasOwnProperty.call(source, 'type')) {
    update.type = source.type === 'group' ? 'group' : 'link';
  }

  if (requireLabel || Object.prototype.hasOwnProperty.call(source, 'group')) {
    const group = normalizeNavigationGroup(source.group);

    if (!group) {
      return { error: 'Invalid navigation group' };
    }

    update.group = group;
  }

  if (requireLabel || Object.prototype.hasOwnProperty.call(source, 'label')) {
    const label = cleanLocalizedText(source.label, 120);

    if (!label.en && !label.fr) {
      return { error: 'Navigation label is required' };
    }

    update.label = label;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'route')) {
    const route = cleanUrl(source.route);

    if (route && !route.startsWith('/')) {
      return { error: 'Navigation route must be a local site path' };
    }

    update.route = route;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'page')) {
    update.page = source.page || null;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'permission')) {
    update.permission = cleanText(source.permission, 120);
  }

  if (Object.prototype.hasOwnProperty.call(source, 'visible')) {
    update.visible = source.visible !== false;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'order')) {
    update.order = Number.parseInt(source.order, 10) || 0;
  }

  update.updatedBy = actor?._id || null;

  return { update };
}

function getNavigationGroups(items = []) {
  const groups = NAV_GROUPS.map(group => ({
    key: group,
    label: NAV_GROUP_LABELS[group],
    builtIn: true,
    order: NAV_GROUPS.indexOf(group)
  }));
  const existing = new Set(groups.map(group => group.key));

  items
    .filter(item => item.type === 'group')
    .forEach(item => {
      if (existing.has(item.group)) return;

      existing.add(item.group);
      groups.push({
        key: item.group,
        label: item.label || {},
        builtIn: false,
        order: item.order || 0,
        _id: item._id
      });
    });

  return groups.sort((first, second) =>
    Number(first.order || 0) - Number(second.order || 0)
  );
}

router.get('/pages/:slug', (req, res) => {
  res.sendFile(PAGE_SHELL_PATH);
});

router.get('/api/navigation', optionalAuthMiddleware, async (req, res) => {
  try {
    const items = await NavigationItem.find({ visible: true })
      .sort({ group: 1, order: 1, createdAt: 1 })
      .populate('page', 'status access')
      .lean();

    res.json({
      groups: getNavigationGroups(items),
      items: items
        .filter(item =>
          item.type === 'group' ||
          ((!item.page || item.page.status === 'published') && canViewNavigationItem(item, req.user))
        )
        .map(toNavigationItem)
    });
  } catch (error) {
    console.error('Navigation list failed:', error);
    res.status(500).json({ error: 'Could not load navigation' });
  }
});

router.get('/api/pages/:slug', optionalAuthMiddleware, async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const page = await Page.findOne({
      slug,
      status: 'published'
    }).lean();

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (!canViewPage(page, req.user)) {
      return res.status(req.user ? 403 : 401).json({
        error: req.user ? 'Page access denied' : 'Authentication required'
      });
    }

    res.json({ page: toPageResponse(page) });
  } catch (error) {
    console.error('Public page lookup failed:', error);
    res.status(500).json({ error: 'Could not load page' });
  }
});

router.get(
  '/api/admin/pages/:pageId/preview',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const page = await Page.findById(req.params.pageId).lean();

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ page: toPageResponse(page) });
    } catch (error) {
      console.error('Admin page preview failed:', error);
      res.status(500).json({ error: 'Could not load page preview' });
    }
  }
);

router.get(
  '/api/admin/pages',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const [pages, navItems, customRoles] = await Promise.all([
        Page.find({})
          .sort({ updatedAt: -1, createdAt: -1 })
          .lean(),
        NavigationItem.find({})
          .sort({ group: 1, order: 1, createdAt: 1 })
          .lean(),
        Role.find({})
          .sort({ name: 1, createdAt: 1 })
          .lean()
      ]);

      res.json({
        pages: pages.map(page => toPageResponse(page, { includeBlocks: false })),
        navigationItems: navItems.map(toNavigationItem),
        navigationGroups: getNavigationGroups(navItems),
        roles: USER_ROLES,
        customRoles: customRoles.map(toAdminRole),
        permissionCatalog: PERMISSION_CATALOG
      });
    } catch (error) {
      console.error('Admin page list failed:', error);
      res.status(500).json({ error: 'Could not load pages' });
    }
  }
);

router.post(
  '/api/admin/pages',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const result = cleanPageUpdate(req.body, req.user, {
        requireTitle: true
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const page = await Page.create({
        ...result.update,
        createdBy: req.user?._id || null
      });

      await writeAuditLog({
        req,
        action: 'page.created',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page)
      });

      res.status(201).json({
        message: 'Page created',
        page: toPageResponse(page)
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'A page with that slug already exists' });
      }

      console.error('Admin page create failed:', error);
      res.status(500).json({ error: 'Could not create page' });
    }
  }
);

router.get(
  '/api/admin/pages/:pageId',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const page = await Page.findById(req.params.pageId);

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      res.json({ page: toPageResponse(page) });
    } catch (error) {
      console.error('Admin page detail failed:', error);
      res.status(500).json({ error: 'Could not load page' });
    }
  }
);

router.patch(
  '/api/admin/pages/:pageId',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const result = cleanPageUpdate(req.body, req.user);

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const previousPage = await Page.findById(req.params.pageId);

      if (!previousPage) {
        return res.status(404).json({ error: 'Page not found' });
      }

      const page = await Page.findByIdAndUpdate(
        req.params.pageId,
        { $set: result.update },
        { returnDocument: 'after', runValidators: true }
      );

      await writeAuditLog({
        req,
        action: 'page.updated',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page),
        metadata: {
          previousPage: getPageSnapshot(previousPage),
          newPage: getPageSnapshot(page)
        }
      });

      res.json({
        message: 'Page saved',
        page: toPageResponse(page)
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: 'A page with that slug already exists' });
      }

      console.error('Admin page update failed:', error);
      res.status(500).json({ error: 'Could not save page' });
    }
  }
);

router.patch(
  '/api/admin/pages/:pageId/status',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const status = ['draft', 'published', 'archived'].includes(req.body?.status)
        ? req.body.status
        : '';

      if (!status) {
        return res.status(400).json({ error: 'Invalid page status' });
      }

      const updates = {
        status,
        updatedBy: req.user?._id || null,
        ...(status === 'published'
          ? {
            publishedBy: req.user?._id || null,
            publishedAt: new Date()
          }
          : {})
      };
      const page = await Page.findByIdAndUpdate(
        req.params.pageId,
        { $set: updates },
        { returnDocument: 'after', runValidators: true }
      );

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      await writeAuditLog({
        req,
        action: status === 'published' ? 'page.published' : 'page.status_changed',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page),
        metadata: { status }
      });

      res.json({
        message: 'Page status updated',
        page: toPageResponse(page)
      });
    } catch (error) {
      console.error('Admin page status update failed:', error);
      res.status(500).json({ error: 'Could not update page status' });
    }
  }
);

router.delete(
  '/api/admin/pages/:pageId',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const page = await Page.findById(req.params.pageId);

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      await NavigationItem.deleteMany({ page: page._id });
      await page.deleteOne();

      await writeAuditLog({
        req,
        action: 'page.deleted',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page)
      });

      res.json({ message: 'Page deleted' });
    } catch (error) {
      console.error('Admin page delete failed:', error);
      res.status(500).json({ error: 'Could not delete page' });
    }
  }
);

router.post(
  '/api/admin/navigation-items',
  authMiddleware,
  requirePermission('canManageNavigation'),
  async (req, res) => {
    try {
      const result = cleanNavigationUpdate(req.body, req.user, {
        requireLabel: true
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const item = await NavigationItem.create({
        ...result.update,
        createdBy: req.user?._id || null
      });

      await writeAuditLog({
        req,
        action: 'navigation.created',
        actor: req.user,
        targetType: 'navigation',
        target: item._id,
        targetSnapshot: toNavigationItem(item)
      });

      res.status(201).json({
        message: 'Navigation item created',
        item: toNavigationItem(item)
      });
    } catch (error) {
      console.error('Navigation item create failed:', error);
      res.status(500).json({ error: 'Could not create navigation item' });
    }
  }
);

router.patch(
  '/api/admin/navigation-items/:itemId',
  authMiddleware,
  requirePermission('canManageNavigation'),
  async (req, res) => {
    try {
      const result = cleanNavigationUpdate(req.body, req.user);

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const item = await NavigationItem.findByIdAndUpdate(
        req.params.itemId,
        { $set: result.update },
        { returnDocument: 'after', runValidators: true }
      );

      if (!item) {
        return res.status(404).json({ error: 'Navigation item not found' });
      }

      await writeAuditLog({
        req,
        action: 'navigation.updated',
        actor: req.user,
        targetType: 'navigation',
        target: item._id,
        targetSnapshot: toNavigationItem(item)
      });

      res.json({
        message: 'Navigation item updated',
        item: toNavigationItem(item)
      });
    } catch (error) {
      console.error('Navigation item update failed:', error);
      res.status(500).json({ error: 'Could not update navigation item' });
    }
  }
);

router.delete(
  '/api/admin/navigation-items/:itemId',
  authMiddleware,
  requirePermission('canManageNavigation'),
  async (req, res) => {
    try {
      const item = await NavigationItem.findById(req.params.itemId);

      if (!item) {
        return res.status(404).json({ error: 'Navigation item not found' });
      }

      if (item.type === 'group') {
        await NavigationItem.deleteMany({
          type: 'link',
          group: item.group
        });
      }

      await item.deleteOne();

      await writeAuditLog({
        req,
        action: 'navigation.deleted',
        actor: req.user,
        targetType: 'navigation',
        target: item._id,
        targetSnapshot: toNavigationItem(item)
      });

      res.json({ message: 'Navigation item deleted' });
    } catch (error) {
      console.error('Navigation item delete failed:', error);
      res.status(500).json({ error: 'Could not delete navigation item' });
    }
  }
);

module.exports = router;
