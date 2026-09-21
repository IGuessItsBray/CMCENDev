const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const summary = (visits = 42) => ({
  totals: { visits, uniqueVisitors: 20, uniqueRegistered: 5, uniqueGuests: 15 },
  pages: [{ label: '/sample', visits: 42 }],
  roles: [{ label: 'editor', visitors: 5 }],
  recentVisits: [],
});
function setup({ api: override, config = { enabled: false } } = {}) {
  class Node extends Element {
    constructor(tag) {
      super(tag);
      this.style.setProperty = (key, value) => {
        this.style[key] = value;
      };
    }
    matches(selector) {
      if (selector === 'script[data-plausible-embed]')
        return this.tagName === 'SCRIPT' && this.dataset.plausibleEmbed;
      return super.matches(selector);
    }
  }
  const document = new Node('document'),
    root = new Node('div');
  document.documentElement = { lang: 'en', dataset: { theme: 'light' } };
  document.body = new Node('body');
  document.append(document.body);
  document.body.append(root);
  document.createElement = (tag) => new Node(tag);
  document.getElementById = () => root;
  const calls = [];
  let denied = 0;
  const window = {
    translate: (key) => `${document.documentElement.lang}:${key}`,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/analytics-controller.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      AbortSignal,
      URL,
      URLSearchParams,
      Intl,
    },
  );
  const controller = window.AnalyticsController.mount({
    api: async (url, options) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      return url === '/api/analytics/embed' ? config : summary();
    },
    onDenied: () => {
      denied++;
      controller.dispose();
    },
  });
  return {
    controller,
    root,
    document,
    calls,
    denied: () => denied,
    range: () => root.querySelector('select'),
    refresh: () => root.querySelector('button'),
    cards: () =>
      root
        .querySelectorAll('.analytics-stat-card')
        .map((el) => el.querySelector('strong').textContent),
  };
}

test('built-in reports retain the range control and localize without refetching', async () => {
  const page = setup();
  await page.controller.ready;
  assert.deepEqual(page.cards(), ['42', '20', '5', '15']);
  const select = page.range();
  select.value = '7d';
  await select.fire('change');
  assert.equal(page.calls.at(-1).url, '/api/analytics?range=7d');
  assert.equal(page.range(), select);
  page.document.documentElement.lang = 'fr';
  await page.document.fire('languagechange');
  assert.equal(page.range().value, '7d');
  assert.equal(page.calls.length, 3);
  assert.match(
    page.root.querySelectorAll('h2')[0].querySelector('span').textContent,
    /^fr:/,
  );
});

test('a late range response cannot replace newer analytics', async () => {
  const pending = [];
  const page = setup({
    api: (url) => {
      if (url.includes('?')) {
        const d = deferred();
        pending.push(d);
        return d.promise;
      }
    },
  });
  await flush();
  page.range().value = '90d';
  const newer = page.range().fire('change');
  assert.equal(page.calls[1].signal.aborted, true);
  pending[1].resolve(summary(90));
  await newer;
  pending[0].resolve(summary(30));
  await page.controller.ready;
  assert.equal(page.cards()[0], '90');
});

test('configuration and report failures can be retried without displaying stale metrics', async () => {
  for (const configFailure of [true, false]) {
    let fail = true;
    const page = setup({
      api: (url) => {
        if (fail && (configFailure || url.includes('?')))
          return Promise.reject(new Error('offline'));
      },
    });
    await page.controller.ready;
    assert.equal(page.cards().length, 0);
    assert.match(page.refresh().textContent, /retry/);
    fail = false;
    await page.refresh().fire('click');
    assert.equal(page.cards()[0], '42');
  }
});

test('Plausible mode skips legacy reports and preserves share parameters through theme changes', async () => {
  const page = setup({
    config: {
      enabled: true,
      embedUrl: 'https://example.test/share/site?auth=fixture&embed=true',
      scriptUrl: 'https://example.test/js/embed.host.js',
    },
  });
  await page.controller.ready;
  assert.equal(page.calls.length, 1);
  const frame = page.root.querySelector('iframe');
  assert.ok(frame);
  assert.equal(page.range().parent.hidden, true);
  page.document.documentElement.dataset.theme = 'dark';
  await page.document.fire('themechange');
  const url = new URL(frame.src);
  assert.equal(url.searchParams.get('auth'), 'fixture');
  assert.equal(url.searchParams.get('embed'), 'true');
  assert.equal(url.searchParams.get('theme'), 'dark');
  await page.document.fire('languagechange');
  assert.equal(page.root.querySelector('iframe'), frame);
  await page.refresh().fire('click');
  assert.equal(page.document.body.querySelectorAll('script').length, 1);
  page.controller.dispose();
  await page.document.fire('themechange');
  assert.equal(page.root.children.length, 0);
});

test('permission denial clears analytics and disposal ignores pending responses', async () => {
  const denied = setup({
    api: () =>
      Promise.reject(Object.assign(new Error('denied'), { status: 403 })),
  });
  await denied.controller.ready;
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
  const pending = deferred();
  const page = setup({ api: () => pending.promise });
  page.controller.dispose();
  assert.equal(page.calls[0].signal.aborted, true);
  pending.resolve({ enabled: false });
  await page.controller.ready;
  assert.equal(page.calls.length, 1);
  assert.equal(page.root.children.length, 0);
});

test('analytics views do not count their own visits, while public pages still do', () => {
  const utils = fs.readFileSync(
    path.join(__dirname, '../public/app-utils.js'),
    'utf8',
  );
  const source = utils.slice(
    utils.indexOf('  function trackPageVisit()'),
    utils.indexOf('  function initializePlausibleAnalytics()'),
  );
  for (const [pathname, search, expected] of [
    ['/analytics', '', 0],
    ['/dashboard-next', '?area=analytics', 0],
    ['/news', '', 1],
  ]) {
    const calls = [];
    vm.runInNewContext(source + '\ntrackPageVisit();', {
      window: { location: { pathname, search } },
      document: { title: 'Sample' },
      navigator: { language: 'en' },
      URLSearchParams,
      Intl,
      getStoredAuthToken: () => null,
      fetch: (...args) => {
        calls.push(args);
        return Promise.resolve();
      },
    });
    assert.equal(calls.length, expected);
  }
});
