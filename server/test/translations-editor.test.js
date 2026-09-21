const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element: BaseElement } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
class Element extends BaseElement {
  constructor(tag) {
    super(tag);
    const toggle = (name, force) => {
      const classes = new Set(
        (this.className || '').split(' ').filter(Boolean),
      );
      if (force ?? !classes.has(name)) classes.add(name);
      else classes.delete(name);
      this.className = [...classes].join(' ');
    };
    this.classList = {
      toggle,
      add: (...names) => names.forEach((n) => toggle(n, true)),
      remove: (...names) => names.forEach((n) => toggle(n, false)),
    };
  }
  append(...nodes) {
    super.append(
      ...nodes.map((node) =>
        typeof node === 'string'
          ? Object.assign(new Element('text'), { textContent: node })
          : node,
      ),
    );
  }
  appendChild(node) {
    this.append(node);
    return node;
  }
}
function setup({
  api: override,
  permissions = { canManageTranslations: true },
} = {}) {
  const nodes = new Map();
  for (const name of [
    'Search',
    'StatusFilter',
    'ClearFilters',
    'Count',
    'Message',
    'List',
    'CategoryList',
    'Retry',
  ])
    nodes.set(`translations${name}`, new Element('div'));
  nodes.get('translationsStatusFilter').value = 'all';
  const document = new Element('document');
  document.getElementById = (id) => nodes.get(id);
  document.createElement = (tag) => new Element(tag);
  const records = [
    { key: 'home_title', values: { en: 'Welcome', fr: '' }, missing: ['fr'] },
    {
      key: 'home_intro',
      values: { en: 'Introduction', fr: 'Présentation' },
      missing: [],
    },
    {
      key: 'event_title',
      values: { en: '', fr: 'Événement' },
      missing: ['en'],
    },
  ];
  const calls = [],
    toasts = [];
  let denied = false;
  const window = {
    translate: (key, values) => `${key}${values ? JSON.stringify(values) : ''}`,
    translations: { en: {}, fr: {} },
  };
  const api = async (url, options = {}) => {
    calls.push({ url, options });
    const next = async () =>
      options.method === 'PATCH'
        ? {
            values: Object.fromEntries(
              Object.entries(options.body).map(([k, v]) => [k, v.trim()]),
            ),
          }
        : { rows: structuredClone(records) };
    return override ? override(url, options, next) : next();
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/translations-editor.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      DOMException,
      CMCENUtils: { showToast: (message) => toasts.push(message) },
    },
  );
  const editor = window.TranslationsEditor.mount({
    api,
    permissions,
    onDenied: () => {
      denied = true;
      editor.dispose();
    },
  });
  const list = nodes.get('translationsList');
  const row = (key) =>
    list
      .querySelectorAll('.translation-row')
      .find((r) => r.dataset.key === key);
  const input = (key, language) =>
    row(key)
      .querySelectorAll('textarea')
      .find((i) => i.dataset.language === language);
  const save = (key) => row(key).querySelector('button').fire('click');
  const edit = async (key, language, value) => {
    const field = input(key, language);
    field.value = value;
    await field.fire('input');
  };
  const search = async (value) => {
    const field = nodes.get('translationsSearch');
    field.value = value;
    await field.fire('input');
  };
  const filter = async (value) => {
    const field = nodes.get('translationsStatusFilter');
    field.value = value;
    await field.fire('change');
  };
  return {
    editor,
    nodes,
    document,
    window,
    calls,
    toasts,
    denied: () => denied,
    list,
    row,
    input,
    edit,
    save,
    search,
    filter,
  };
}

test('access is permission gated and loading failures can be retried', async () => {
  const denied = setup({ permissions: {} });
  await denied.editor.ready;
  assert.equal(denied.calls.length, 0);
  let failed = true;
  const page = setup({
    api: (url, options, next) => {
      if (failed) throw new Error('Offline');
      return next();
    },
  });
  await page.editor.ready;
  assert.equal(page.nodes.get('translationsRetry').hidden, false);
  assert.equal(page.nodes.get('translationsSearch').disabled, true);
  failed = false;
  await page.nodes.get('translationsRetry').fire('click');
  assert.equal(page.nodes.get('translationsRetry').hidden, true);
  assert.equal(page.nodes.get('translationsSearch').disabled, false);
});

test('search and missing-language filters drive rows and category counts', async () => {
  const page = setup();
  await page.editor.ready;
  assert.equal(page.list.hidden, true);
  assert.equal(page.nodes.get('translationsCategoryList').children.length, 9);
  await page.search('home-title');
  assert.equal(page.list.querySelectorAll('.translation-row').length, 1);
  assert.ok(page.row('home_title'));
  await page.filter('missing-en');
  assert.equal(page.list.hidden, true);
  await page.search('');
  assert.ok(page.row('event_title'));
  const cards = page.nodes.get('translationsCategoryList').children;
  const publicCard = cards.find((card) => card.dataset.category === 'public');
  const eventsCard = cards.find((card) => card.dataset.category === 'events');
  assert.equal(
    publicCard.querySelector('.translation-category-meta').textContent,
    'translations_category_count{"count":0}',
  );
  assert.equal(
    eventsCard.querySelector('.translation-category-meta').textContent,
    'translations_category_count{"count":1}',
  );
});

test('drafts and expanded groups survive filtering and language changes', async () => {
  const page = setup();
  await page.editor.ready;
  await page.search('home');
  await page.edit('home_title', 'fr', 'Bienvenue');
  page.list.querySelector('details').open = false;
  await page.search('event');
  assert.equal(page.editor.hasUnsavedChanges(), true);
  await page.search('home');
  assert.equal(page.input('home_title', 'fr').value, 'Bienvenue');
  assert.equal(page.list.querySelector('details').open, false);
  await page.document.fire('languagechange');
  assert.equal(page.input('home_title', 'fr').value, 'Bienvenue');
  assert.equal(page.editor.hasUnsavedChanges(), true);
});

test('a late save preserves newer typing across a filter rerender and applies only saved text to the dictionary', async () => {
  const pending = deferred();
  const page = setup({
    api: async (url, options, next) => {
      if (options.method === 'PATCH') await pending.promise;
      return next();
    },
  });
  await page.editor.ready;
  await page.search('home');
  await page.edit('home_title', 'fr', ' Première ');
  const saving = page.save('home_title');
  await flush();
  await page.edit('home_title', 'fr', 'Nouvelle version');
  await page.search('event');
  await page.search('home');
  assert.equal(page.row('home_title').querySelector('button').disabled, true);
  pending.resolve();
  await saving;
  assert.equal(page.input('home_title', 'fr').value, 'Nouvelle version');
  assert.equal(page.window.translations.fr.home_title, 'Première');
  assert.equal(page.editor.hasUnsavedChanges(), true);
  assert.equal(page.row('home_title').querySelector('button').disabled, false);
  await page.save('home_title');
  assert.equal(page.editor.hasUnsavedChanges(), false);
});

test('row saves are serialized and repeated clicks cannot submit the same row twice', async () => {
  const pending = deferred();
  let patches = 0;
  const page = setup({
    api: async (url, options, next) => {
      if (options.method === 'PATCH' && ++patches === 1) await pending.promise;
      return next();
    },
  });
  await page.editor.ready;
  await page.search('home');
  await page.edit('home_title', 'fr', 'Bienvenue');
  await page.edit('home_intro', 'en', 'Updated intro');
  const first = page.save('home_title');
  const second = page.save('home_intro');
  await page.save('home_title');
  await flush();
  assert.equal(patches, 1);
  assert.equal(page.editor.canNavigate(), false);
  pending.resolve();
  await Promise.all([first, second]);
  assert.equal(patches, 2);
  assert.equal(page.editor.hasUnsavedChanges(), false);
  assert.equal(page.editor.canNavigate(), true);
});

test('save errors preserve the editable draft for retry', async () => {
  let fail = true;
  const page = setup({
    api: (url, options, next) => {
      if (fail && options.method === 'PATCH') throw new Error('Save failed');
      return next();
    },
  });
  await page.editor.ready;
  await page.search('home_title');
  await page.edit('home_title', 'fr', 'Retry me');
  await page.save('home_title');
  assert.equal(page.editor.hasUnsavedChanges(), true);
  assert.equal(page.row('home_title').querySelector('button').disabled, false);
  assert.equal(page.input('home_title', 'fr').value, 'Retry me');
  fail = false;
  await page.save('home_title');
  assert.equal(page.editor.hasUnsavedChanges(), false);
});

test('disposal aborts active saves and skips queued saves and dictionary updates', async () => {
  const pending = deferred();
  const page = setup({
    api: async (url, options, next) => {
      if (options.method === 'PATCH') await pending.promise;
      return next();
    },
  });
  await page.editor.ready;
  await page.search('home');
  await page.edit('home_title', 'fr', 'Pending');
  await page.edit('home_intro', 'en', 'Queued');
  const first = page.save('home_title'),
    second = page.save('home_intro');
  await flush();
  const request = page.calls.at(-1);
  page.editor.dispose();
  assert.equal(request.options.signal.aborted, true);
  pending.resolve();
  await Promise.all([first, second]);
  assert.equal(
    page.calls.filter((call) => call.options.method === 'PATCH').length,
    1,
  );
  assert.deepEqual(page.window.translations.fr, {});
  assert.equal(page.list.children.length, 0);
  assert.equal(page.toasts.length, 0);
});

test('revoked access notifies the shell and removes loaded data', async () => {
  const page = setup({
    api: (url, options, next) => {
      if (options.method === 'PATCH')
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      return next();
    },
  });
  await page.editor.ready;
  await page.search('home');
  await page.edit('home_title', 'fr', 'Pending');
  await page.save('home_title');
  assert.equal(page.denied(), true);
  assert.equal(page.list.children.length, 0);
});

test('saving a missing translation refreshes filtered results and category totals', async () => {
  const page = setup();
  await page.editor.ready;
  await page.filter('missing-fr');
  await page.edit('home_title', 'fr', 'Bienvenue');
  await page.save('home_title');
  assert.equal(page.list.hidden, true);
  assert.equal(
    page.nodes.get('translationsCount').textContent,
    'translations_filtered_count{"visible":0,"total":3}',
  );
  const card = page.nodes
    .get('translationsCategoryList')
    .children.find((item) => item.dataset.category === 'public');
  assert.equal(
    card.querySelector('.translation-category-meta').textContent,
    'translations_category_count{"count":0}',
  );
});

test('a disposed editor ignores a late initial load', async () => {
  const pending = deferred();
  const page = setup({
    api: async (url, options, next) => {
      await pending.promise;
      return next();
    },
  });
  page.editor.dispose();
  pending.resolve();
  await page.editor.ready;
  assert.equal(page.calls[0].options.signal.aborted, true);
  assert.equal(page.nodes.get('translationsCategoryList').children.length, 0);
  assert.equal(page.list.children.length, 0);
});
