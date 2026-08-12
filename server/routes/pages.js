const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const Page = require('../models/Page');
const NavigationItem = require('../models/NavigationItem');
const Role = require('../models/Role');
const MediaAsset = require('../models/MediaAsset');
const { USER_ROLES } = require('../config/roles');
const {
  PERMISSION_CATALOG,
  getUserPermissions,
  normalizePermissionKeys,
} = require('../config/permissions');
const {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission,
} = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');
const { buildPublicMediaUrl } = require('../services/media-library');
const s3Client = require('../storage');

const router = express.Router();
const PAGE_SHELL_PATH = path.join(__dirname, '..', 'public', 'page.html');
const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');
const NAV_GROUPS = Object.freeze(['about', 'doctrine', 'news', 'benefits']);
const NAV_GROUP_LABELS = Object.freeze({
  about: { en: 'About', fr: 'À propos' },
  doctrine: { en: 'Doctrine', fr: 'Doctrine' },
  news: { en: 'News', fr: 'Nouvelles' },
  benefits: { en: 'Benefits', fr: 'Avantages' },
});
const BLOCK_TYPES = new Set([
  'heading',
  'text',
  'image',
  'callout',
  'button',
  'divider',
  'columns',
  'carousel',
]);
const DEFAULT_MEDIA_PAGE_SIZE = 60;
const MAX_MEDIA_PAGE_SIZE = 120;
const MAX_MEDIA_LIST_OBJECTS = 5000;
const SITEMAP_EXCLUDED_HTML = new Set([
  '400.html',
  '401.html',
  '403.html',
  '404.html',
  '500.html',
  'admin-users.html',
  'analytics.html',
  'audit-log.html',
  'event.html',
  'last-post-message.html',
  'page.html',
  'pages-admin.html',
  'retirement-message.html',
  'site-config.html',
  'timers-admin.html',
  'translations-admin.html',
]);
const SITEMAP_ACCOUNT_HTML = new Set([
  'dashboard.html',
  'login.html',
  'notifications.html',
  'register.html',
]);
const SITEMAP_STATIC_LABELS = Object.freeze({
  'awards.html': { en: 'Awards', fr: 'Prix' },
  'about-family.html': { en: 'About the C&E Family', fr: 'Famille des C et E' },
  'about_association.html': {
    en: 'About the C&E Association',
    fr: 'À propos de l’Association des C et E',
  },
  'about_branch.html': { en: 'About the C&E Branch', fr: 'À propos de la Branche des C et E' },
  'about_museum_foundation.html': {
    en: 'About the C&E Museum & Foundation',
    fr: 'À propos du Musée et de la Fondation des C et E',
  },
  'association_directors.html': { en: 'Association Directors and Advisors', fr: 'Directeurs et conseillers de l’Association' },
  'affiliate_offers.html': { en: 'Affiliates', fr: 'Affiliés' },
  'bursaries.html': { en: 'Bursaries and Education', fr: 'Bourses et éducation' },
  'branch_advisory_council.html': { en: 'Branch Advisory Council', fr: 'Conseil consultatif de la Branche' },
  'calendar.html': { en: 'Events Calendar', fr: 'Calendrier des événements' },
  'certificates.html': { en: 'Certificates', fr: 'Certificats' },
  'ce_professions.html': { en: 'Communications & Electronics Professions', fr: 'Professions des communications et de l’électronique' },
  'doctrine_hub.html': { en: 'Doctrine Hub', fr: 'Centre de doctrine' },
  'cfmws.html': { en: 'Canadian Forces Morale and Welfare Services', fr: 'Services de bien-être et moral des Forces canadiennes' },
  'dashboard.html': {
    en: 'Account dashboard',
    fr: 'Tableau de bord du compte',
  },
  'event.html': { en: 'Event details', fr: 'Détails de l’événement' },
  'index.html': { en: 'Home', fr: 'Accueil' },
  'history.html': { en: 'History', fr: 'Histoire' },
  'honours_awards.html': { en: 'Honours and Awards', fr: 'Distinctions et prix' },
  'leadership.html': { en: 'Leadership', fr: 'Leadership' },
  'gallery.html': { en: 'Gallery', fr: 'Galerie' },
  'governance.html': { en: 'Governance', fr: 'Gouvernance' },
  'news_stories.html': { en: 'News Stories', fr: 'Nouvelles' },
  'promotions.html': { en: 'Promotions', fr: 'Promotions' },
  'last-post.html': { en: 'Last Post', fr: 'Dernière sonnerie' },
  'last-post-message.html': {
    en: 'Last Post message',
    fr: 'Message de dernière sonnerie',
  },
  'login.html': { en: 'Sign in', fr: 'Connexion' },
  'notifications.html': { en: 'Notifications', fr: 'Notifications' },
  'register.html': { en: 'Create account', fr: 'Créer un compte' },
  'retirement-message.html': {
    en: 'Retirement message',
    fr: 'Message de retraite',
  },
  'retirements.html': { en: 'Retirements', fr: 'Retraites' },
  'review-submissions.html': {
    en: 'Review submissions',
    fr: 'Réviser les soumissions',
  },
  'search.html': { en: 'Search', fr: 'Recherche' },
  'sitemap.html': { en: 'Site map', fr: 'Plan du site' },
  'submit-event.html': { en: 'Submit an event', fr: 'Soumettre un événement' },
  'submit-retirement.html': {
    en: 'Submit a retirement message',
    fr: 'Soumettre un message de retraite',
  },
  'support_troops.html': { en: 'Support Our Troops', fr: 'Appuyons nos troupes' },
  'standing_orders.html': { en: 'Standing Orders', fr: 'Ordres permanents' },
  'veteran_services.html': { en: 'Veteran Services', fr: 'Services aux vétérans' },
});

function cleanText(value, maxLength = 10000) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function cleanLocalizedText(value, maxLength = 10000) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    en: cleanText(source.en, maxLength),
    fr: cleanText(source.fr, maxLength),
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

function cleanCrop(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cleanNumber = (numberValue, fallback, min, max) => {
    const parsedValue = Number(numberValue);

    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    return Math.min(Math.max(parsedValue, min), max);
  };
  const rotate = [0, 90, 180, 270].includes(Number(source.rotate))
    ? Number(source.rotate)
    : 0;

  return {
    x: cleanNumber(source.x, 50, 0, 100),
    y: cleanNumber(source.y, 50, 0, 100),
    zoom: cleanNumber(source.zoom, 1, 1, 3),
    rotate,
  };
}

function cleanImageVariant(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cleanPositiveNumber = (numberValue) => {
    const parsedValue = Number(numberValue);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  };

  return {
    key: cleanText(source.key, 500),
    url: cleanUrl(source.url),
    width: cleanPositiveNumber(source.width),
    height: cleanPositiveNumber(source.height),
    size: cleanPositiveNumber(source.size),
    mimeType: cleanText(source.mimeType || 'image/webp', 100),
  };
}

function cleanImageVariants(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    thumb: cleanImageVariant(source.thumb),
    medium: cleanImageVariant(source.medium),
    large: cleanImageVariant(source.large),
    hero: cleanImageVariant(source.hero),
  };
}

function cleanBlock(block) {
  const source =
    block && typeof block === 'object' && !Array.isArray(block) ? block : {};
  const type = BLOCK_TYPES.has(source.type) ? source.type : 'text';

  const cleanMediaItem = (item) => {
    const itemSource =
      item && typeof item === 'object' && !Array.isArray(item) ? item : {};

    return {
      mediaKey: cleanText(itemSource.mediaKey, 500),
      mediaUrl: cleanUrl(itemSource.mediaUrl),
      mediaVariants: cleanImageVariants(itemSource.mediaVariants),
      alt: cleanLocalizedText(itemSource.alt, 500),
      caption: cleanLocalizedText(itemSource.caption, 500),
      crop: cleanCrop(itemSource.crop),
    };
  };
  const cleanColumn = (column) => {
    const columnSource =
      column && typeof column === 'object' && !Array.isArray(column)
        ? column
        : {};

    return {
      title: cleanLocalizedText(columnSource.title, 500),
      body: cleanLocalizedText(columnSource.body, 10000),
      mediaKey: cleanText(columnSource.mediaKey, 500),
      mediaUrl: cleanUrl(columnSource.mediaUrl),
      mediaVariants: cleanImageVariants(columnSource.mediaVariants),
      alt: cleanLocalizedText(columnSource.alt, 500),
      crop: cleanCrop(columnSource.crop),
    };
  };

  return {
    type,
    level: Number(source.level) === 3 ? 3 : 2,
    text: cleanLocalizedText(source.text, 500),
    body: cleanLocalizedText(source.body, 10000),
    url: cleanUrl(source.url),
    mediaKey: cleanText(source.mediaKey, 500),
    mediaUrl: cleanUrl(source.mediaUrl),
    mediaVariants: cleanImageVariants(source.mediaVariants),
    alt: cleanLocalizedText(source.alt, 500),
    caption: cleanLocalizedText(source.caption, 500),
    crop: cleanCrop(source.crop),
    variant: source.variant === 'important' ? 'important' : 'standard',
    columns: (Array.isArray(source.columns) ? source.columns : [])
      .slice(0, 3)
      .map(cleanColumn),
    items: (Array.isArray(source.items) ? source.items : [])
      .slice(0, 12)
      .map(cleanMediaItem),
  };
}

function cleanBlocks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 80).map(cleanBlock);
}

function cleanMediaPageSize(value) {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_MEDIA_PAGE_SIZE;
  }

  return Math.min(Math.max(parsedValue, 1), MAX_MEDIA_PAGE_SIZE);
}

function toPageBuilderMediaItem(object) {
  const key = object.Key || '';
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  const variants = processedMatch
    ? {
        thumb: {
          key: `${processedMatch[1]}/thumb.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`),
          width: 400,
        },
        medium: {
          key: `${processedMatch[1]}/medium.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`),
          width: 900,
        },
        large: {
          key: `${processedMatch[1]}/large.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`),
          width: 1600,
        },
        hero: {
          key: `${processedMatch[1]}/hero.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`),
          width: 2200,
        },
      }
    : {};

  return {
    key,
    url: buildPublicMediaUrl(key),
    variants,
    size: object.Size || 0,
    lastModified: object.LastModified || null,
  };
}

function toPageBuilderMediaAssetItem(asset) {
  const key = asset.key || asset.originalKey || '';

  return {
    key,
    url: asset.url || buildPublicMediaUrl(key),
    variants: asset.variants || {},
    size: asset.size || 0,
    width: asset.width || 0,
    height: asset.height || 0,
    name: asset.displayName || asset.originalName || key,
    uuid: asset.uuid || '',
    uploadContext: asset.uploadContext || {},
    inferredName: asset.inferredName || '',
    lastModified: asset.createdAt || asset.updatedAt || null,
  };
}

function getMediaSort(value) {
  if (value === 'oldest') return { createdAt: 1, _id: 1 };
  if (value === 'name') return { displayName: 1, createdAt: -1 };
  if (value === 'size') return { size: -1, createdAt: -1 };
  return { createdAt: -1, _id: -1 };
}

function getMediaSortKey(value) {
  return ['newest', 'oldest', 'name', 'size'].includes(value)
    ? value
    : 'newest';
}

function sortStorageObjectsNewestFirst(objects = []) {
  return [...objects].sort((first, second) => {
    const firstTime = first.LastModified
      ? new Date(first.LastModified).getTime()
      : 0;
    const secondTime = second.LastModified
      ? new Date(second.LastModified).getTime()
      : 0;

    return (
      secondTime - firstTime ||
      String(second.Key || '').localeCompare(String(first.Key || ''))
    );
  });
}

function isVisibleMediaObject(object) {
  const key = String(object?.Key || '');
  return (
    key && (!key.startsWith('images/') || /\/original\.[a-z0-9]+$/iu.test(key))
  );
}

function cleanMediaCursor(value) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

async function listVisibleMediaObjectsNewestFirst() {
  const objects = [];
  let continuationToken;

  do {
    const result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.MINIO_BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    objects.push(...(result.Contents || []).filter(isVisibleMediaObject));
    continuationToken = result.NextContinuationToken;
  } while (continuationToken && objects.length < MAX_MEDIA_LIST_OBJECTS);

  return sortStorageObjectsNewestFirst(objects);
}

function inferVariantsFromStorageKey(key) {
  const processedMatch = key.match(/^(images\/[^/]+)\/original\.[a-z0-9]+$/iu);
  return processedMatch
    ? {
        thumb: {
          key: `${processedMatch[1]}/thumb.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/thumb.webp`),
          width: 400,
        },
        medium: {
          key: `${processedMatch[1]}/medium.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/medium.webp`),
          width: 900,
        },
        large: {
          key: `${processedMatch[1]}/large.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/large.webp`),
          width: 1600,
        },
        hero: {
          key: `${processedMatch[1]}/hero.webp`,
          url: buildPublicMediaUrl(`${processedMatch[1]}/hero.webp`),
          width: 2200,
        },
      }
    : {};
}

async function seedMediaAssetsFromStorageIfEmpty() {
  const existingCount = await MediaAsset.estimatedDocumentCount();
  if (existingCount) return;

  const objects = await listVisibleMediaObjectsNewestFirst();
  if (!objects.length) return;

  await MediaAsset.insertMany(
    objects.map((object) => {
      const key = object.Key;
      return {
        key,
        url: buildPublicMediaUrl(key),
        originalKey: key,
        originalUrl: buildPublicMediaUrl(key),
        originalName: key.split('/').pop() || key,
        displayName: key.split('/').pop() || key,
        size: object.Size || 0,
        uploadContext: {
          type: 'legacyStorage',
          context: 'storage-seed',
          label: key.split('/').pop() || key,
        },
        inferredName: key.split('/').pop() || key,
        fileMetadata: {
          originalName: key.split('/').pop() || key,
          size: object.Size || 0,
          storageKey: key,
          lastModified: object.LastModified || null,
        },
        variants: inferVariantsFromStorageKey(key),
        createdAt: object.LastModified || new Date(),
        updatedAt: object.LastModified || new Date(),
      };
    }),
    { ordered: false },
  ).catch((error) => {
    if (error.code !== 11000) throw error;
  });
}

function cleanObjectIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => String(item || '').trim())
        .filter((item) => /^[0-9a-f]{24}$/iu.test(item)),
    ),
  ];
}

function cleanPageAccess(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const audience = ['public', 'authenticated', 'restricted'].includes(
    source.audience,
  )
    ? source.audience
    : 'public';

  return {
    audience,
    roles: [
      ...new Set(
        (Array.isArray(source.roles) ? source.roles : [])
          .map((role) => String(role || '').trim())
          .filter((role) => USER_ROLES.includes(role)),
      ),
    ],
    customRoles: cleanObjectIdList(source.customRoles),
    permissions: normalizePermissionKeys(source.permissions),
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
    publishedAt: page.publishedAt,
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
    publishedAt: plainPage.publishedAt,
  };
}

function titleCaseRouteSegment(value) {
  return String(value || '')
    .replace(/\.html$/iu, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function routeFromHtmlFile(fileName) {
  if (fileName === 'index.html') {
    return '/';
  }

  return `/${fileName.replace(/\.html$/iu, '')}`;
}

function getSitemapStaticLabel(fileName) {
  return (
    SITEMAP_STATIC_LABELS[fileName] || {
      en: titleCaseRouteSegment(fileName),
      fr: titleCaseRouteSegment(fileName),
    }
  );
}

function getSitemapSection(fileName) {
  if (fileName === 'index.html') {
    return 'main';
  }

  if (SITEMAP_ACCOUNT_HTML.has(fileName)) {
    return 'account';
  }

  return 'site';
}

function toSitemapItem({ title, route, summary, updatedAt, section, type }) {
  return {
    title: title || {},
    route,
    summary: summary || {},
    updatedAt: updatedAt || null,
    section,
    type,
  };
}

async function getStaticSitemapItems() {
  const files = await fs.readdir(PUBLIC_DIRECTORY);

  return files
    .filter(
      (fileName) =>
        fileName.endsWith('.html') && !SITEMAP_EXCLUDED_HTML.has(fileName),
    )
    .map((fileName) =>
      toSitemapItem({
        title: getSitemapStaticLabel(fileName),
        route: routeFromHtmlFile(fileName),
        updatedAt: null,
        section: getSitemapSection(fileName),
        type: 'static',
      }),
    )
    .sort((first, second) => {
      if (first.route === '/') return -1;
      if (second.route === '/') return 1;
      return first.title.en.localeCompare(second.title.en);
    });
}

function toSitemapPageItem(page) {
  return toSitemapItem({
    title: page.title,
    route: `/pages/${page.slug}`,
    summary: page.summary,
    updatedAt: page.updatedAt,
    section: 'pages',
    type: 'page',
  });
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
    const slug = normalizeSlug(
      source.slug || source.title?.en || source.title?.fr,
    );

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
      .map((role) => role?._id || role)
      .filter(Boolean)
      .map((roleId) => String(roleId)),
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
    (access.customRoles || []).map((roleId) => String(roleId)),
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
    permissions: role.permissions || [],
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
    updatedAt: plainItem.updatedAt,
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
  const groups = NAV_GROUPS.map((group) => ({
    key: group,
    label: NAV_GROUP_LABELS[group],
    builtIn: true,
    order: NAV_GROUPS.indexOf(group),
  }));
  const existing = new Set(groups.map((group) => group.key));

  items
    .filter((item) => item.type === 'group')
    .forEach((item) => {
      if (existing.has(item.group)) return;

      existing.add(item.group);
      groups.push({
        key: item.group,
        label: item.label || {},
        builtIn: false,
        order: item.order || 0,
        _id: item._id,
      });
    });

  return groups.sort(
    (first, second) => Number(first.order || 0) - Number(second.order || 0),
  );
}

router.get('/api/navigation', optionalAuthMiddleware, async (req, res) => {
  try {
    const items = await NavigationItem.find({ visible: true })
      .sort({ group: 1, order: 1, createdAt: 1 })
      .populate('page', 'status access')
      .lean();

    res.json({
      groups: getNavigationGroups(items),
      items: items
        .filter(
          (item) =>
            item.type === 'group' ||
            ((!item.page || item.page.status === 'published') &&
              canViewNavigationItem(item, req.user)),
        )
        .map(toNavigationItem),
    });
  } catch (error) {
    console.error('Navigation list failed:', error);
    res.status(500).json({ error: 'Could not load navigation' });
  }
});

router.get('/api/sitemap', optionalAuthMiddleware, async (req, res) => {
  try {
    const [staticItems, pages] = await Promise.all([
      getStaticSitemapItems(),
      Page.find({ status: 'published' })
        .select('title slug summary access updatedAt publishedAt')
        .sort({ 'title.en': 1, slug: 1 })
        .lean(),
    ]);
    const pageItems = pages
      .filter((page) => canViewPage(page, req.user))
      .map(toSitemapPageItem);

    res.json({
      generatedAt: new Date().toISOString(),
      sections: [
        { key: 'main', title: { en: 'Main', fr: 'Principal' } },
        { key: 'site', title: { en: 'Site pages', fr: 'Pages du site' } },
        {
          key: 'pages',
          title: { en: 'Published pages', fr: 'Pages publiées' },
        },
        { key: 'account', title: { en: 'Account', fr: 'Compte' } },
      ],
      items: [...staticItems, ...pageItems],
    });
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    res.status(500).json({ error: 'Could not generate sitemap' });
  }
});

router.get('/pages/:slug', (req, res) => {
  res.sendFile(PAGE_SHELL_PATH);
});

router.get('/api/pages/:slug', optionalAuthMiddleware, async (req, res) => {
  try {
    const slug = normalizeSlug(req.params.slug);
    const page = await Page.findOne({
      slug,
      status: 'published',
    }).lean();

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (!canViewPage(page, req.user)) {
      return res.status(req.user ? 403 : 401).json({
        error: req.user ? 'Page access denied' : 'Authentication required',
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
  },
);

router.get(
  '/api/admin/pages',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const [pages, navItems, customRoles] = await Promise.all([
        Page.find({}).sort({ updatedAt: -1, createdAt: -1 }).lean(),
        NavigationItem.find({})
          .sort({ group: 1, order: 1, createdAt: 1 })
          .lean(),
        Role.find({}).sort({ name: 1, createdAt: 1 }).lean(),
      ]);

      res.json({
        pages: pages.map((page) =>
          toPageResponse(page, { includeBlocks: false }),
        ),
        navigationItems: navItems.map(toNavigationItem),
        navigationGroups: getNavigationGroups(navItems),
        roles: USER_ROLES,
        customRoles: customRoles.map(toAdminRole),
        permissionCatalog: PERMISSION_CATALOG,
      });
    } catch (error) {
      console.error('Admin page list failed:', error);
      res.status(500).json({ error: 'Could not load pages' });
    }
  },
);

router.get(
  '/api/admin/pages/media',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const maxKeys = cleanMediaPageSize(req.query.limit);
      const offset = cleanMediaCursor(req.query.cursor);
      const sortKey = getMediaSortKey(req.query.sort);
      const sort = getMediaSort(sortKey);

      await seedMediaAssetsFromStorageIfEmpty();

      const [mediaAssets, totalMedia] = await Promise.all([
        MediaAsset.find({}).sort(sort).skip(offset).limit(maxKeys).lean(),
        MediaAsset.countDocuments({}),
      ]);
      const nextOffset = offset + mediaAssets.length;

      res.json({
        sort: sortKey,
        media: mediaAssets.map(toPageBuilderMediaAssetItem),
        nextCursor: nextOffset < totalMedia ? String(nextOffset) : '',
        isTruncated: nextOffset < totalMedia,
      });
    } catch (error) {
      console.error('Page builder media list failed:', error);
      res.status(500).json({ error: 'Could not load media library' });
    }
  },
);

router.post(
  '/api/admin/pages',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const result = cleanPageUpdate(req.body, req.user, {
        requireTitle: true,
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const page = await Page.create({
        ...result.update,
        createdBy: req.user?._id || null,
      });

      await writeAuditLog({
        req,
        action: 'page.created',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page),
      });

      res.status(201).json({
        message: 'Page created',
        page: toPageResponse(page),
      });
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ error: 'A page with that slug already exists' });
      }

      console.error('Admin page create failed:', error);
      res.status(500).json({ error: 'Could not create page' });
    }
  },
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
  },
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
        { returnDocument: 'after', runValidators: true },
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
          newPage: getPageSnapshot(page),
        },
      });

      res.json({
        message: 'Page saved',
        page: toPageResponse(page),
      });
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(409)
          .json({ error: 'A page with that slug already exists' });
      }

      console.error('Admin page update failed:', error);
      res.status(500).json({ error: 'Could not save page' });
    }
  },
);

router.patch(
  '/api/admin/pages/:pageId/status',
  authMiddleware,
  requirePermission('canManagePages'),
  async (req, res) => {
    try {
      const status = ['draft', 'published', 'archived'].includes(
        req.body?.status,
      )
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
              publishedAt: new Date(),
            }
          : {}),
      };
      const page = await Page.findByIdAndUpdate(
        req.params.pageId,
        { $set: updates },
        { returnDocument: 'after', runValidators: true },
      );

      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      await writeAuditLog({
        req,
        action:
          status === 'published' ? 'page.published' : 'page.status_changed',
        actor: req.user,
        targetType: 'page',
        target: page._id,
        targetSnapshot: getPageSnapshot(page),
        metadata: { status },
      });

      res.json({
        message: 'Page status updated',
        page: toPageResponse(page),
      });
    } catch (error) {
      console.error('Admin page status update failed:', error);
      res.status(500).json({ error: 'Could not update page status' });
    }
  },
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
        targetSnapshot: getPageSnapshot(page),
      });

      res.json({ message: 'Page deleted' });
    } catch (error) {
      console.error('Admin page delete failed:', error);
      res.status(500).json({ error: 'Could not delete page' });
    }
  },
);

router.post(
  '/api/admin/navigation-items',
  authMiddleware,
  requirePermission('canManageNavigation'),
  async (req, res) => {
    try {
      const result = cleanNavigationUpdate(req.body, req.user, {
        requireLabel: true,
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const item = await NavigationItem.create({
        ...result.update,
        createdBy: req.user?._id || null,
      });

      await writeAuditLog({
        req,
        action: 'navigation.created',
        actor: req.user,
        targetType: 'navigation',
        target: item._id,
        targetSnapshot: toNavigationItem(item),
      });

      res.status(201).json({
        message: 'Navigation item created',
        item: toNavigationItem(item),
      });
    } catch (error) {
      console.error('Navigation item create failed:', error);
      res.status(500).json({ error: 'Could not create navigation item' });
    }
  },
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
        { returnDocument: 'after', runValidators: true },
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
        targetSnapshot: toNavigationItem(item),
      });

      res.json({
        message: 'Navigation item updated',
        item: toNavigationItem(item),
      });
    } catch (error) {
      console.error('Navigation item update failed:', error);
      res.status(500).json({ error: 'Could not update navigation item' });
    }
  },
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
          group: item.group,
        });
      }

      await item.deleteOne();

      await writeAuditLog({
        req,
        action: 'navigation.deleted',
        actor: req.user,
        targetType: 'navigation',
        target: item._id,
        targetSnapshot: toNavigationItem(item),
      });

      res.json({ message: 'Navigation item deleted' });
    } catch (error) {
      console.error('Navigation item delete failed:', error);
      res.status(500).json({ error: 'Could not delete navigation item' });
    }
  },
);

module.exports = router;
