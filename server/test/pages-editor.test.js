const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element: BaseElement } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

class Element extends BaseElement {
  constructor(tag) {
    super(tag);
    this.style = {
      setProperty() {},
      removeProperty() {},
      getPropertyValue() {
        return '';
      },
    };
    const toggle = (value, force) => {
      const classes = new Set(
        (this.className || '').split(' ').filter(Boolean),
      );
      if (force ?? !classes.has(value)) classes.add(value);
      else classes.delete(value);
      this.className = [...classes].join(' ');
    };
    this.classList = {
      toggle,
      add: (v) => toggle(v, true),
      remove: (v) => toggle(v, false),
    };
  }
}

async function setup({
  api: override,
  permissions = { canManagePages: true },
} = {}) {
  const root = new Element('section'),
    status = new Element('div'),
    page = new Element('div'),
    content = new Element('div');
  content.className = 'pages-admin-shell';
  root.append(status, page);
  page.append(content);
  root.querySelector = (selector) =>
    selector === '[data-pages-status]'
      ? status
      : selector === '[data-pages-page]'
        ? page
        : content;
  const document = new Element('document');
  document.body = new Element('body');
  document.createElement = (tag) => new Element(tag);
  document.createElementNS = (namespace, tag) => new Element(tag);
  const timers = new Map();
  let nextTimer = 0;
  const window = {
    setTimeout: (fn) => {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  window.parent = window.top = window;
  const toasts = [],
    calls = [];
  let denied = false;
  const stored = {
    _id: 'one',
    title: { en: 'Test page', fr: '' },
    summary: { en: '', fr: '' },
    slug: 'test-page',
    route: '/pages/test-page',
    status: 'draft',
    blocks: [],
    access: { audience: 'public', roles: [], customRoles: [], permissions: [] },
  };
  const defaultApi = async (url, options) => {
    if (url === '/api/admin/pages')
      return {
        pages: [structuredClone(stored)],
        navigationItems: [],
        roles: [],
        customRoles: [],
        permissionCatalog: [],
      };
    if (options.method === 'PATCH')
      Object.assign(stored, structuredClone(options.body));
    return { page: structuredClone(stored) };
  };
  const api = async (url, options = {}) => {
    calls.push({ url, options });
    return override
      ? override(url, options, defaultApi)
      : defaultApi(url, options);
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/pages-editor.js'), 'utf8'),
    {
      window,
      document,
      Element,
      AbortController,
      DOMException,
      structuredClone,
      URLSearchParams,
      FormData,
      queueMicrotask,
      CMCENModal: { confirm: async () => true },
      CMCENUtils: {
        getLocalizedText: (value) => value?.en || '',
        formatTitleCaseValue: (value) => value || '',
        setStatusMessage: (node, text) => {
          node.textContent = text;
          node.hidden = false;
        },
        setStatusLoading: (node) => {
          node.hidden = false;
        },
        showToast: (message) => toasts.push(message),
        createLoadingSpinner: () => new Element('span'),
      },
    },
  );
  const editor = window.PagesEditor.mount({
    api,
    permissions,
    root,
    onDenied: () => {
      denied = true;
    },
  });
  await editor.ready;
  const button = (label) =>
    content
      .querySelectorAll('button')
      .find((item) => item.textContent === label);
  const open = () =>
    content.querySelector('.pages-admin-page-row').fire('click');
  const editTitle = async (value) => {
    await content.querySelector('.pages-page-details-heading').fire('click');
    const input = content
      .querySelectorAll('input')
      .find((item) => item.value === stored.title.en);
    assert.ok(input, 'title input available');
    input.value = value;
    await input.fire('input', { target: input });
  };
  const autosave = async () => {
    const entries = [...timers];
    timers.clear();
    for (const [, fn] of entries) fn();
    await flush();
  };
  return {
    editor,
    content,
    status,
    calls,
    stored,
    toasts,
    button,
    open,
    editTitle,
    autosave,
    timers,
    denied: () => denied,
  };
}

test('Pages does not fetch data without its permission', async () => {
  const page = await setup({ permissions: {} });
  assert.equal(page.calls.length, 0);
  page.editor.dispose();
});

test('returning to the library flushes pending edits instead of dropping them', async () => {
  const page = await setup();
  await page.open();
  await page.editTitle('Updated title');
  assert.equal(page.editor.hasUnsavedChanges(), true);
  await page.button('All custom pages').fire('click');
  assert.equal(page.stored.title.en, 'Updated title');
  assert.equal(page.editor.hasUnsavedChanges(), false);
  assert.ok(page.content.querySelector('.pages-admin-page-row'));
  page.editor.dispose();
});

test('a failed save retains the draft and prevents returning to the library', async () => {
  const page = await setup({
    api: (url, options, next) => {
      if (options.method === 'PATCH') throw new Error('Save failed');
      return next(url, options);
    },
  });
  await page.open();
  await page.editTitle('Keep this edit');
  await page.button('All custom pages').fire('click');
  assert.equal(page.editor.hasUnsavedChanges(), true);
  assert.ok(page.button('All custom pages'));
  assert.equal(page.stored.title.en, 'Test page');
  page.editor.dispose();
});

test('autosave serializes newer edits and never replaces newer input with an older response', async () => {
  const pending = deferred();
  let patches = 0;
  const page = await setup({
    api: async (url, options, next) => {
      if (options.method === 'PATCH' && ++patches === 1) await pending.promise;
      return next(url, options);
    },
  });
  await page.open();
  await page.editTitle('First');
  await page.autosave();
  const input = page.content
    .querySelectorAll('input')
    .find((item) => item.value === 'First');
  input.value = 'Second';
  await input.fire('input', { target: input });
  await page.autosave();
  assert.equal(patches, 1);
  pending.resolve();
  await flush();
  await flush();
  assert.equal(patches, 2);
  assert.equal(page.stored.title.en, 'Second');
  assert.equal(input.value, 'Second');
  assert.equal(page.editor.hasUnsavedChanges(), false);
  page.editor.dispose();
});

test('page managers can publish without navigation or homepage-feature permissions', async () => {
  const page = await setup();
  assert.equal(page.button('Manage navigation'), undefined);
  await page.open();
  await page.button('Save and continue').fire('click');
  assert.ok(page.button('Publish now'));
  await page.button('Publish now').fire('click');
  const writes = page.calls.filter((call) => call.options.method === 'PATCH');
  assert.equal(writes.at(-2).url, '/api/admin/pages/one');
  assert.equal(writes.at(-1).url, '/api/admin/pages/one/status');
  assert.equal(writes.at(-1).options.body.status, 'published');
  assert.equal(
    Object.hasOwn(writes.at(-1).options.body, 'featureOnHome'),
    false,
  );
  assert.equal(
    page.calls.some((call) => call.url.includes('navigation-items')),
    false,
  );
  page.editor.dispose();
});

test('disposal cancels pending work and late responses cannot restore the editor', async () => {
  const pending = deferred();
  const page = await setup({
    api: async (url, options, next) => {
      if (options.method === 'PATCH') await pending.promise;
      return next(url, options);
    },
  });
  await page.open();
  await page.editTitle('Pending');
  await page.autosave();
  const request = page.calls.at(-1);
  page.editor.dispose();
  assert.equal(request.options.signal.aborted, true);
  assert.equal(page.timers.size, 0);
  pending.resolve();
  await flush();
  assert.equal(page.content.children.length, 0);
  assert.equal(page.toasts.length, 0);
});

test('block layout and bilingual content remain intact in save payloads', async () => {
  const page = await setup();
  page.stored.blocks = [
    {
      type: 'heading',
      text: { en: 'Heading', fr: 'Titre' },
      layout: { column: 2, row: 3, span: 6, rowSpan: 2 },
    },
  ];
  await page.open();
  const handle = page.content.querySelector('.pages-block-resize-handle');
  await handle.fire('keydown', { key: 'ArrowRight' });
  await page.autosave();
  assert.deepEqual(page.stored.blocks[0], {
    type: 'heading',
    text: { en: 'Heading', fr: 'Titre' },
    layout: { column: 2, row: 3, span: 7, rowSpan: 2 },
  });
  page.editor.dispose();
});

test('failed content save prevents publishing', async () => {
  let fail = false;
  const page = await setup({
    api: (url, options, next) => {
      if (fail && options.method === 'PATCH') throw new Error('Save failed');
      return next(url, options);
    },
  });
  await page.open();
  await page.button('Save and continue').fire('click');
  fail = true;
  await page.button('Publish now').fire('click');
  assert.equal(
    page.calls.some((call) => call.url.endsWith('/status')),
    false,
  );
  assert.equal(page.stored.status, 'draft');
  assert.ok(page.button('Publish now'));
  page.editor.dispose();
});

test('revoked page access notifies the host', async () => {
  const page = await setup({
    api: () => {
      throw Object.assign(new Error('Access denied'), { status: 403 });
    },
  });
  assert.equal(page.denied(), true);
  assert.equal(page.content.children.length, 0);
  page.editor.dispose();
});

test('image uploads use the cancellable API and preserve source metadata and crop', async () => {
  const pending = deferred();
  const page = await setup({
    api: async (url, options, next) => {
      if (url === '/api/upload') {
        await pending.promise;
        return { key: 'image-key', url: '/fixture.png', variants: {} };
      }
      return next(url, options);
    },
  });
  const crop = { x: 45, y: 55, zoom: 1.2, rotate: 90 };
  page.stored.blocks = [
    { type: 'image', crop, layout: { column: 1, row: 1, span: 4, rowSpan: 3 } },
  ];
  await page.open();
  const tile = page.content.querySelector('.pages-block-editor');
  await tile.fire('click', { target: tile });
  const input = page.content
    .querySelectorAll('input')
    .find((item) => item.type === 'file');
  input.files = [new File(['fixture'], 'test.png', { type: 'image/png' })];
  await input.fire('change');
  const request = page.calls.at(-1);
  assert.equal(request.url, '/api/upload');
  assert.equal(request.options.body.get('sourceId'), 'one');
  assert.equal(request.options.body.get('sourceField'), 'block:0');
  assert.equal(request.options.body.get('uploadSource'), 'pageBuilder');
  assert.equal(request.options.timeoutMs, null);
  assert.equal(page.editor.canNavigate(), false);
  pending.resolve();
  await flush();
  await page.autosave();
  assert.equal(page.stored.blocks[0].mediaUrl, '/fixture.png');
  assert.deepEqual(page.stored.blocks[0].crop, crop);
  assert.equal(page.editor.canNavigate(), true);
  page.editor.dispose();
  assert.equal(request.options.signal.aborted, true);
});
