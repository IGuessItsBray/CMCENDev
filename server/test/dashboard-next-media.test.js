const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const image = (key, used = false) => ({
  key,
  name: key,
  url: '/image.png',
  attachedPosts: used ? [{ title: 'Page', href: '/page', type: 'page' }] : [],
  attachedPostCount: used ? 1 : 0,
});
function setup({
  api: override,
  permissions = { canUploadMedia: true, canDeleteMedia: true },
  confirm = async () => true,
} = {}) {
  const root = new Element('div');
  const document = new Element('document');
  document.documentElement = { lang: 'en' };
  document.createElement = (tag) => new Element(tag);
  document.getElementById = () => root;
  const timers = new Map();
  let timer = 0,
    denied = 0;
  const calls = [];
  const window = {
    location: { origin: 'https://example.test' },
    translate: (key, values) => key + (values ? JSON.stringify(values) : ''),
    CMCENModal: { confirm },
    CMCENUtils: {
      createLoadingSpinner(label) {
        const spinner = new Element('div');
        spinner.className = 'loading-state';
        spinner.setAttribute('role', 'status');
        spinner.setAttribute('aria-label', label);
        return spinner;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-media.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      URL,
      URLSearchParams,
      FormData,
      setTimeout: (fn) => {
        timers.set(++timer, fn);
        return timer;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  const instance = window.DashboardNextMedia.mount({
    permissions,
    onDenied: () => {
      denied++;
      instance.dispose();
    },
    api: async (url, options = {}) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      return {
        media: [image('unused'), image('used', true)],
        nextCursor: '',
        isTruncated: false,
      };
    },
  });
  const find = (tag, predicate) => root.querySelectorAll(tag).find(predicate);
  const field = (name) =>
    find(
      name === 'sort' || name === 'type' ? 'select' : 'input',
      (el) => el.name === name,
    );
  const button = (key) => find('button', (el) => el.dataset.i18n === key);
  const status = () => root.querySelector('.admin-media-status').textContent;
  return {
    root,
    document,
    instance,
    calls,
    field,
    button,
    status,
    denied: () => denied,
    timers,
    permissions,
  };
}

test('view-only access exposes neither upload nor delete actions; attached images cannot be selected', async () => {
  const page = setup({ permissions: {} });
  await page.instance.ready;
  assert.equal(page.root.querySelector('.admin-media-upload').hidden, true);
  assert.equal(page.root.querySelector('.admin-media-selection').hidden, true);
  assert.equal(page.button('admin_delete'), undefined);
  page.field('files').files = [
    new File(['x'], 'photo.png', { type: 'image/png' }),
  ];
  await page.field('files').fire('change');
  await page.button('admin_next_media_delete_selected').fire('click');
  assert.equal(page.calls.length, 1);
  const admin = setup();
  await admin.instance.ready;
  assert.equal(
    admin.root.querySelector('.admin-media-grid').querySelectorAll('input')
      .length,
    1,
  );
});

test('new searches abort old requests and ignore their late responses', async () => {
  const pending = [];
  const page = setup({
    api: () => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
  });
  page.field('search').value = 'new';
  await page.field('search').fire('input');
  assert.equal(page.calls[0].signal.aborted, true);
  [...page.timers.values()].at(-1)();
  pending[1].resolve({ media: [image('new')], isTruncated: false });
  await flush();
  pending[0].resolve({ media: [image('old')], isTruncated: false });
  await page.instance.ready;
  assert.deepEqual(
    page.root
      .querySelectorAll('h2')
      .map((el) => el.textContent)
      .slice(1),
    ['new'],
  );
  assert.equal(
    new URL(page.calls[1].url, 'https://example.test').searchParams.get(
      'search',
    ),
    'new',
  );
});

test('pagination retries the failed cursor and deduplicates appended records', async () => {
  let appendCalls = 0;
  const page = setup({
    api: (url) => {
      if (!url.includes('cursor='))
        return { media: [image('one')], nextCursor: '100', isTruncated: true };
      if (++appendCalls === 1) return Promise.reject(new Error('offline'));
      return { media: [image('one'), image('two')], isTruncated: false };
    },
  });
  await page.instance.ready;
  await page.button('admin_media_load_more').fire('click');
  assert.equal(page.button('admin_next_retry').hidden, false);
  await page.button('admin_next_retry').fire('click');
  assert.equal(page.calls[1].url, page.calls[2].url);
  assert.equal(page.root.querySelectorAll('article').length, 2);
  assert.equal(page.button('admin_media_load_more').hidden, true);
  assert.equal(page.status(), '');
});

test('bulk deletion never silently truncates selections beyond the server limit', async () => {
  const page = setup({
    api: () => ({
      media: Array.from({ length: 201 }, (_, i) => image(String(i))),
      isTruncated: false,
    }),
  });
  await page.instance.ready;
  await page.button('admin_next_media_select_all').fire('click');
  await page.button('admin_next_media_delete_selected').fire('click');
  assert.equal(page.calls.length, 1);
  assert.match(page.status(), /selection_limit/);
});

test('bulk delete sends only unused selections and reports skipped and missing results', async () => {
  const page = setup({
    api: (url, options) =>
      options.method === 'POST'
        ? { deleted: [], skipped: [{ key: 'unused' }], missing: ['missing'] }
        : undefined,
  });
  await page.instance.ready;
  await page.button('admin_next_media_select_all').fire('click');
  await page.button('admin_next_media_delete_selected').fire('click');
  const mutation = page.calls.find((call) => call.method);
  assert.deepEqual(Array.from(mutation.body.keys), ['unused']);
  assert.equal(mutation.url, '/api/admin/media/bulk-delete');
  assert.match(page.status(), /bulk_delete_skipped/);
  assert.match(page.status(), /bulk_delete_missing/);
});

test('confirmation prevents duplicate deletes and disposal prevents the pending mutation', async () => {
  const confirmation = deferred();
  const page = setup({ confirm: () => confirmation.promise });
  await page.instance.ready;
  const first = page.button('admin_delete').fire('click');
  assert.equal(page.instance.canNavigate(), false);
  await page.button('admin_delete').fire('click');
  page.instance.dispose();
  confirmation.resolve(true);
  await first;
  assert.equal(page.calls.length, 1);
});

test('delete conflict refreshes attachment state and permission denial removes only delete controls', async () => {
  for (const status of [409, 403]) {
    let reads = 0;
    const page = setup({
      api: (url, options) => {
        if (options.method)
          return Promise.reject(Object.assign(new Error('denied'), { status }));
        return { media: [image('unused', ++reads > 1)], isTruncated: false };
      },
    });
    await page.instance.ready;
    await page.button('admin_delete').fire('click');
    assert.equal(page.button('admin_delete'), undefined);
    assert.equal(page.denied(), 0);
    assert.equal(page.root.querySelector('.admin-media-upload').hidden, false);
    assert.match(
      page.status(),
      status === 409 ? /delete_attached_error/ : /delete_error/,
    );
  }
});

test('upload validates custom slugs, maps metadata, and preserves failed slug drafts', async () => {
  let fail = true;
  const page = setup({
    api: (url) =>
      url === '/api/upload'
        ? fail
          ? Promise.reject(new Error('failed'))
          : {}
        : undefined,
  });
  await page.instance.ready;
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  page.field('slug').value = 'Invalid slug';
  page.field('files').files = [file];
  await page.field('files').fire('change');
  assert.equal(page.calls.length, 1);
  page.field('slug').value = 'custom-name';
  await page.field('files').fire('change');
  const call = page.calls.find((call) => call.url === '/api/upload');
  assert.equal(call.body.get('image').name, 'photo.png');
  assert.equal(call.body.get('cdnSlug'), 'custom-name');
  assert.equal(call.body.get('uploadSource'), 'mediaManager');
  assert.equal(call.body.get('uploadContext'), 'media-manager');
  assert.equal(call.body.get('sourceField'), 'mediaLibrary');
  assert.equal(call.body.get('sourceName'), 'photo.png');
  assert.equal(page.instance.hasUnsavedChanges(), true);
  fail = false;
  await page.field('files').fire('change');
  assert.equal(page.field('slug').value, '');
  assert.equal(page.instance.hasUnsavedChanges(), false);
});

test('upload uses four workers, retains partial outcomes, and aborts on disposal', async () => {
  const pending = [];
  const page = setup({
    api: (url) => {
      if (url === '/api/upload') {
        const d = deferred();
        pending.push(d);
        return d.promise;
      }
    },
  });
  await page.instance.ready;
  page.field('files').files = Array.from(
    { length: 6 },
    (_, i) => new File(['x'], `${i}.png`, { type: 'image/png' }),
  );
  const upload = page.field('files').fire('change');
  assert.equal(pending.length, 4);
  assert.equal(page.instance.canNavigate(), false);
  pending[0].reject(new Error('failed'));
  await flush();
  assert.equal(pending.length, 5);
  page.instance.dispose();
  assert.ok(
    page.calls
      .filter((call) => call.url === '/api/upload')
      .every((call) => call.signal.aborted),
  );
  pending.slice(1).forEach((d) => d.resolve({}));
  await upload;
  assert.equal(pending.length, 5);
  assert.equal(page.root.children.length, 0);
});

test('library permission denial disposes the area', async () => {
  const page = setup({
    api: () =>
      Promise.reject(Object.assign(new Error('denied'), { status: 403 })),
  });
  await page.instance.ready;
  assert.equal(page.denied(), 1);
});

test('loading indicator clears after success or failure and errors remain visible', async () => {
  for (const fails of [false, true]) {
    const pending = deferred();
    const page = setup({ api: () => pending.promise });
    const grid = page.root.querySelector('.admin-media-grid');
    assert.ok(grid.querySelector('.loading-state'));
    assert.equal(page.status(), '');
    if (fails) pending.reject(new Error('offline'));
    else pending.resolve({ media: [image('loaded')], isTruncated: false });
    await page.instance.ready;
    assert.equal(grid.querySelector('.loading-state'), null);
    if (fails) assert.match(page.status(), /load_error/);
    else assert.equal(grid.querySelectorAll('article').length, 1);
  }
});

test('dropping files uses the same upload metadata and permission checks as file selection', async () => {
  for (const allowed of [true, false]) {
    const page = setup({ permissions: { canUploadMedia: allowed } });
    await page.instance.ready;
    page.field('slug').value = 'dropped-image';
    await page.root.querySelector('.admin-media-upload').fire('drop', {
      preventDefault() {},
      dataTransfer: {
        files: [new File(['x'], 'photo.png', { type: 'image/png' })],
      },
    });
    const uploads = page.calls.filter((call) => call.url === '/api/upload');
    assert.equal(uploads.length, allowed ? 1 : 0);
    if (allowed) {
      assert.equal(uploads[0].body.get('cdnSlug'), 'dropped-image');
      assert.equal(uploads[0].body.get('image').name, 'photo.png');
    }
  }
});
