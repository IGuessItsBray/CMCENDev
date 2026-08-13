const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AI_CRAWLERS,
  blockKnownAiCrawlers,
  buildRobotsTxt,
  escapeXml,
  getPublicBaseUrl,
  isKnownAiCrawler,
  isNoIndexPath,
  router,
  serializeSitemap,
  setStandardResponseHeaders,
} = require('../routes/seo');

test('uses APP_BASE_URL as the public origin for crawler assets', () => {
  const previousBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://cmcen.example.ca/some-path';

  try {
    assert.equal(
      getPublicBaseUrl({ protocol: 'http', get: () => 'localhost:3000' }),
      'https://cmcen.example.ca',
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previousBaseUrl;
    }
  }
});

test('marks account, admin, submission, and API paths as non-indexable', () => {
  for (const pathname of [
    '/api/me',
    '/dashboard',
    '/login',
    '/pages-admin',
    '/submit-event',
  ]) {
    assert.equal(isNoIndexPath(pathname), true, pathname);
  }

  assert.equal(isNoIndexPath('/about-family'), false);
});

test('serializes safe, valid XML sitemap entries', () => {
  const sitemap = serializeSitemap([
    {
      loc: 'https://cmcen.example.ca/pages/communications-and-electronics',
      lastmod: new Date('2026-08-13T12:00:00.000Z'),
    },
    { loc: 'https://cmcen.example.ca/about?topic=C&E' },
  ]);

  assert.match(sitemap, /<lastmod>2026-08-13T12:00:00\.000Z<\/lastmod>/u);
  assert.match(sitemap, /topic=C&amp;E/u);
  assert.equal(escapeXml('<CMCEN>'), '&lt;CMCEN&gt;');
});

test('defines crawler routes and applies baseline response headers', () => {
  const routePaths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  const headers = {};
  let nextCalled = false;

  setStandardResponseHeaders(
    { path: '/dashboard' },
    {
      set(nameOrHeaders, value) {
        if (typeof nameOrHeaders === 'string') {
          headers[nameOrHeaders] = value;
        } else {
          Object.assign(headers, nameOrHeaders);
        }
      },
    },
    () => {
      nextCalled = true;
    },
  );

  assert.deepEqual(routePaths, ['/robots.txt', '/sitemap.xml']);
  assert.equal(AI_CRAWLERS.includes('GPTBot'), true);
  assert.equal(AI_CRAWLERS.includes('Google-Extended'), true);
  assert.equal(AI_CRAWLERS.includes('ClaudeBot'), true);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
  assert.equal(nextCalled, true);
});

test('blocks declared AI crawlers without blocking public search pages', () => {
  const robots = buildRobotsTxt('https://cmcen.example.ca');

  assert.match(robots, /^User-agent: \*\nAllow: \/$/mu);
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//u);
  assert.match(robots, /User-agent: Google-Extended\nDisallow: \//u);
  assert.match(robots, /User-agent: ClaudeBot\nDisallow: \//u);
  assert.match(robots, /Sitemap: https:\/\/cmcen\.example\.ca\/sitemap\.xml/u);
});

test('recognizes known AI crawlers for server-side access denial', () => {
  assert.equal(isKnownAiCrawler('Mozilla/5.0 compatible; GPTBot/1.0'), true);
  assert.equal(isKnownAiCrawler('Mozilla/5.0 compatible; Googlebot/2.1'), false);

  const response = {
    statusCode: 0,
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    set() {
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  blockKnownAiCrawlers(
    { get: () => 'GPTBot/1.0' },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body, 'Automated AI crawler access is not permitted.');
  assert.equal(nextCalled, false);
});
