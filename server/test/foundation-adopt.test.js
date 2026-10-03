const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = fs.readFileSync(
  path.join(__dirname, '../public/foundation-adopt.js'),
  'utf8',
);
const pageContent = require('../public/page-content/foundation-adopt.json');
function element() {
  return {
    children: [],
    handlers: {},
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(event, handler) {
      this.handlers[event] = handler;
    },
  };
}

test('adoption checkout follows repeated language changes with one listener', () => {
  const link = {};
  const listeners = [];
  const document = {
    documentElement: { lang: 'en' },
    getElementById: (id) => (id === 'adoptCampaignLink' ? link : null),
    addEventListener: (event, handler) => listeners.push({ event, handler }),
  };
  vm.runInNewContext(runtime, { document });
  assert.equal(
    link.href,
    'https://www.zeffy.com/en-CA/donation-form/adopt-an-exhibit',
  );
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].event, 'languagechange');
  for (let i = 0; i < 20; i += 1) {
    document.documentElement.lang = i % 2 ? 'en' : 'fr';
    listeners[0].handler();
    const locale = i % 2 ? 'en-CA' : 'fr-CA';
    assert.equal(
      link.href,
      `https://www.zeffy.com/${locale}/donation-form/adopt-an-exhibit`,
    );
  }
  assert.equal(listeners.length, 1);
});

test('adoption script does not register a listener without its campaign link', () => {
  vm.runInNewContext(runtime, {
    document: {
      getElementById: () => null,
      addEventListener: () => assert.fail('Unexpected listener'),
    },
  });
});

test('public catalogue fetches published API records and supports search, batches and language changes', async () => {
  const ids = Object.fromEntries(
    [
      'adoptCampaignLink',
      'adoptCatalogueSearch',
      'adoptCatalogue',
      'adoptCatalogueCount',
      'adoptCatalogueMore',
      'adoptCatalogueError',
      'adoptCatalogueRetry',
    ].map((id) => [id, element()]),
  );
  ids.adoptCatalogueSearch.value = '';
  const listeners = {},
    fetches = [];
  const document = {
    documentElement: { lang: 'en' },
    getElementById: (id) => ids[id],
    createElement: () => element(),
    addEventListener: (event, handler) => {
      listeners[event] = handler;
    },
  };
  const displays = Array.from({ length: 30 }, (_, i) => ({
    _id: String(i),
    displayNumber: String(i),
    title: { en: `Display ${i}`, fr: `Exposition ${i}` },
    description: { en: 'Radio', fr: 'Radio' },
  }));
  vm.runInNewContext(runtime, {
    document,
    fetch: async (url) => {
      fetches.push(url);
      return {
        ok: true,
        json: async () =>
          url.includes('page-content') ? pageContent : { displays },
      };
    },
  });
  await new Promise(setImmediate);
  assert.deepEqual(fetches, [
    '/page-content/foundation-adopt.json',
    '/api/adopt-displays',
  ]);
  assert.equal(ids.adoptCatalogue.children.length, 24);
  ids.adoptCatalogueMore.handlers.click();
  assert.equal(ids.adoptCatalogue.children.length, 30);
  ids.adoptCatalogueSearch.value = 'Display 29';
  ids.adoptCatalogueSearch.handlers.input();
  assert.equal(ids.adoptCatalogue.children.length, 1);
  document.documentElement.lang = 'fr';
  ids.adoptCatalogueSearch.value = 'Exposition 29';
  listeners.languagechange();
  assert.equal(ids.adoptCatalogue.children.length, 1);
  assert.equal(
    ids.adoptCatalogue.children[0].children[0].textContent,
    'Exposition 29',
  );
  assert.match(ids.adoptCampaignLink.href, /fr-CA/);
});
test('public catalogue distinguishes an API failure from an empty published catalogue and retries', async () => {
  const ids = Object.fromEntries(
    [
      'adoptCampaignLink',
      'adoptCatalogueSearch',
      'adoptCatalogue',
      'adoptCatalogueCount',
      'adoptCatalogueMore',
      'adoptCatalogueError',
      'adoptCatalogueRetry',
    ].map((id) => [id, element()]),
  );
  ids.adoptCatalogueSearch.value = '';
  let fail = true;
  vm.runInNewContext(runtime, {
    document: {
      documentElement: { lang: 'en' },
      getElementById: (id) => ids[id],
      createElement: () => element(),
      addEventListener() {},
    },
    fetch: async (url) => ({
      ok: url.includes('page-content') || !fail,
      json: async () =>
        url.includes('page-content') ? pageContent : { displays: [] },
    }),
  });
  await new Promise(setImmediate);
  assert.equal(ids.adoptCatalogueRetry.hidden, false);
  assert.equal(ids.adoptCatalogue.children.length, 0);
  fail = false;
  await ids.adoptCatalogueRetry.handlers.click();
  assert.equal(ids.adoptCatalogueRetry.hidden, true);
  assert.equal(
    ids.adoptCatalogue.children[0].textContent,
    pageContent.en.catalogueEmpty,
  );
});

test('translation request failure offers retry and recovers', async () => {
  const ids = Object.fromEntries(
    [
      'adoptCampaignLink',
      'adoptCatalogueSearch',
      'adoptCatalogue',
      'adoptCatalogueCount',
      'adoptCatalogueMore',
      'adoptCatalogueError',
      'adoptCatalogueRetry',
    ].map((id) => [id, element()]),
  );
  ids.adoptCatalogueSearch.value = '';
  ids.adoptCatalogueRetry.hidden = true;
  let fail = true;
  vm.runInNewContext(runtime, {
    document: {
      documentElement: { lang: 'fr' },
      getElementById: (id) => ids[id],
      createElement: () => element(),
      addEventListener() {},
    },
    fetch: async (url) => ({
      ok: !fail,
      json: async () =>
        url.includes('page-content') ? pageContent : { displays: [] },
    }),
  });
  await new Promise(setImmediate);
  assert.equal(ids.adoptCatalogueRetry.hidden, false);
  assert.match(ids.adoptCatalogueError.textContent, /Impossible/);
  fail = false;
  await ids.adoptCatalogueRetry.handlers.click();
  assert.equal(ids.adoptCatalogueRetry.hidden, true);
  assert.equal(
    ids.adoptCatalogue.children[0].textContent,
    pageContent.fr.catalogueEmpty,
  );
});
