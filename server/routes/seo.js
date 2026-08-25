const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const Page = require('../models/Page');

const router = express.Router();
const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');
const NON_INDEXABLE_PATHS = [
  /^\/api(?:\/|$)/u,
  /^\/admin-users(?:\/|$)/u,
  /^\/analytics(?:\/|$)/u,
  /^\/audit-log(?:\/|$)/u,
  /^\/content-workspace(?:\/|$)/u,
  /^\/dashboard(?:\/|$)/u,
  /^\/login(?:\/|$)/u,
  /^\/pages-admin(?:\/|$)/u,
  /^\/register(?:\/|$)/u,
  /^\/review-submissions(?:\/|$)/u,
  /^\/timers-admin(?:\/|$)/u,
  /^\/translations-admin(?:\/|$)/u,
  /^\/submit-(?:event|last-post|retirement)(?:\/|$)/u,
  /^\/(?:400|401|403|404|500)(?:\.html)?$/u,
];
const SITEMAP_EXCLUDED_FILES = new Set([
  '400.html',
  '401.html',
  '403.html',
  '404.html',
  '500.html',
  'admin-users.html',
  'analytics.html',
  'audit-log.html',
  'content-workspace.html',
  'contact.html',
  'dashboard.html',
  'event.html',
  'last-post-message.html',
  'login.html',
  'page.html',
  'pages-admin.html',
  'register.html',
  'retirement-message.html',
  'review-submissions.html',
  'search.html',
  'sitemap.html',
  'submit-event.html',
  'submit-last-post.html',
  'submit-retirement.html',
  'timers-admin.html',
  'translations-admin.html',
]);
const AI_CRAWLERS = [
  'AI2Bot',
  'Amazonbot',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Cohere-ai',
  'Diffbot',
  'DuckAssistBot',
  'FacebookBot',
  'Google-Extended',
  'GoogleOther',
  'GPTBot',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'OAI-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'PhindBot',
  'Timpibot',
  'YouBot',
];

function getPublicBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  if (configuredBaseUrl) {
    try {
      const url = new URL(configuredBaseUrl);
      return url.origin;
    } catch {
      // Fall back to the request host when an environment value is malformed.
    }
  }

  const protocol = req.protocol || 'https';
  return `${protocol}://${req.get('host')}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function isNoIndexPath(pathname) {
  return NON_INDEXABLE_PATHS.some((pattern) => pattern.test(pathname));
}

function isPublicSitemapFile(fileName) {
  return fileName.endsWith('.html') && !SITEMAP_EXCLUDED_FILES.has(fileName);
}

function getCspOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

function buildContentSecurityPolicy(environment = process.env, nonce) {
  const plausibleApiOrigin = getCspOrigin(environment.PLAUSIBLE_API_URL);
  const plausibleShareOrigin = getCspOrigin(environment.PLAUSIBLE_SHARE_URL);
  const apiDocsEnabled = environment.ENABLE_API_DOCS === 'true';
  const scriptSources = ["'self'", `'nonce-${nonce}'`];
  const styleSources = ["'self'", `'nonce-${nonce}'`];

  if (plausibleShareOrigin) {
    scriptSources.push(plausibleShareOrigin);
  }

  if (apiDocsEnabled) {
    scriptSources.push('https://unpkg.com');
    styleSources.push('https://unpkg.com');
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
    "img-src 'self' data: blob: https:",
    `connect-src 'self'${plausibleApiOrigin ? ` ${plausibleApiOrigin}` : ''}`,
    `frame-src 'self'${plausibleShareOrigin ? ` ${plausibleShareOrigin}` : ''}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function isKnownAiCrawler(userAgent) {
  const normalizedUserAgent = String(userAgent || '').toLowerCase();
  return AI_CRAWLERS.some((crawler) =>
    normalizedUserAgent.includes(crawler.toLowerCase()),
  );
}

function routeFromFileName(fileName) {
  return fileName === 'index.html'
    ? '/'
    : `/${fileName.replace(/\.html$/u, '')}`;
}

async function getSitemapUrls(baseUrl) {
  const files = await fs.readdir(PUBLIC_DIRECTORY);
  const staticUrls = files
    .filter(
      isPublicSitemapFile,
    )
    .map((fileName) => ({ loc: `${baseUrl}${routeFromFileName(fileName)}` }));
  const pages = await Page.find({
    status: 'published',
    'access.audience': 'public',
  })
    .select('slug updatedAt publishedAt')
    .sort({ slug: 1 })
    .lean();
  const pageUrls = pages.map((page) => ({
    loc: `${baseUrl}/pages/${encodeURIComponent(page.slug)}`,
    lastmod: page.updatedAt || page.publishedAt || null,
  }));

  return [...staticUrls, ...pageUrls];
}

function serializeSitemap(urls) {
  const entries = urls
    .map(
      ({ loc, lastmod }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>${
          lastmod
            ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>`
            : ''
        }\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function setStandardResponseHeaders(req, res, next) {
  const cspNonce = crypto.randomBytes(16).toString('base64');
  res.locals = res.locals || {};
  res.locals.cspNonce = cspNonce;

  res.set({
    'Content-Security-Policy': buildContentSecurityPolicy(
      process.env,
      cspNonce,
    ),
    'Permissions-Policy':
      'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });

  if (isNoIndexPath(req.path)) {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  next();
}

function blockKnownAiCrawlers(req, res, next) {
  if (!isKnownAiCrawler(req.get('user-agent'))) {
    return next();
  }

  return res
    .status(403)
    .set('Cache-Control', 'no-store')
    .type('text/plain')
    .send('Automated AI crawler access is not permitted.');
}

function buildRobotsTxt(baseUrl) {
  const blockedAiCrawlerRules = AI_CRAWLERS.map(
    (crawler) => `User-agent: ${crawler}\nDisallow: /`,
  ).join('\n\n');

  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin-users\nDisallow: /analytics\nDisallow: /audit-log\nDisallow: /content-workspace\nDisallow: /dashboard\nDisallow: /login\nDisallow: /pages-admin\nDisallow: /register\nDisallow: /review-submissions\nDisallow: /timers-admin\nDisallow: /translations-admin\nDisallow: /submit-event\nDisallow: /submit-last-post\nDisallow: /submit-retirement\n\n# AI crawlers are not permitted to crawl or use CMCEN content.\n${blockedAiCrawlerRules}\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(buildRobotsTxt(getPublicBaseUrl(req)));
});

router.get('/sitemap.xml', async (req, res) => {
  try {
    const urls = await getSitemapUrls(getPublicBaseUrl(req));
    res.type('application/xml').send(serializeSitemap(urls));
  } catch (error) {
    console.error('XML sitemap generation failed:', error);
    res
      .status(500)
      .type('application/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><error>Could not generate sitemap</error>',
      );
  }
});

module.exports = {
  router,
  AI_CRAWLERS,
  buildRobotsTxt,
  escapeXml,
  getPublicBaseUrl,
  getSitemapUrls,
  buildContentSecurityPolicy,
  getCspOrigin,
  isKnownAiCrawler,
  isNoIndexPath,
  isPublicSitemapFile,
  serializeSitemap,
  blockKnownAiCrawlers,
  setStandardResponseHeaders,
};
