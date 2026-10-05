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
  user,
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
      requiresTextForSave: require('../services/save-validation')
        .requiresTextForSave,
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
    user,
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
    admin.root
      .querySelector('.admin-media-grid')
      .querySelectorAll('input')
      .filter((input) => input.type === 'checkbox').length,
    1,
  );
});

test('opens the stored original while retaining a small preview and stable media identity', async () => {
  const page = setup({
    api: () => ({
      media: [
        {
          ...image('thumb.webp'),
          url: '/thumb.webp',
          originalUrl: '/full.jpg',
        },
      ],
    }),
  });
  await page.instance.ready;
  const preview = page.root.querySelector('.admin-media-preview');
  assert.equal(preview.href, 'https://example.test/full.jpg');
  assert.equal(
    preview.querySelector('img').src,
    'https://example.test/thumb.webp',
  );
  assert.equal(
    page.root.querySelector('.admin-media-key').textContent,
    'thumb.webp',
  );
});

test('older media responses and unsafe original URLs fall back to the existing preview link', async () => {
  for (const originalUrl of [undefined, 'javascript:alert(1)']) {
    const page = setup({
      api: () => ({ media: [{ ...image('legacy'), originalUrl }] }),
    });
    await page.instance.ready;
    assert.equal(
      page.root.querySelector('.admin-media-preview').href,
      'https://example.test/image.png',
    );
  }
});

test('renames attached media without changing its key and hides editing from viewers', async () => {
  const page = setup({
    api: (url, options) =>
      options.method === 'PATCH'
        ? {
            name: 'Shared transparent crest',
            displayName: 'Shared transparent crest',
          }
        : undefined,
  });
  await page.instance.ready;
  const forms = page.root.querySelectorAll('form');
  const form = forms.at(-1);
  assert.equal(form.hidden, true);
  await page.root
    .querySelectorAll('button')
    .filter(
      (button) =>
        button.dataset.i18nAriaLabel === 'admin_media_library_name_rename',
    )
    .at(-1)
    .fire('click');
  form.querySelector('input').value = ' Shared transparent crest ';
  await form.fire('submit');
  const patch = page.calls.find((call) => call.method === 'PATCH');
  assert.equal(patch.url, '/api/admin/media/used');
  assert.deepEqual(JSON.parse(JSON.stringify(patch.body)), {
    displayName: 'Shared transparent crest',
  });
  assert(
    page.root
      .querySelectorAll('h2')
      .some((heading) => heading.textContent === 'Shared transparent crest'),
  );
  assert.equal(form.hidden, true);
  const viewer = setup({ permissions: {} });
  await viewer.instance.ready;
  assert.equal(viewer.root.querySelectorAll('form').length, 0);
});

test('developer blank media name remains blank when reopening with a readable fallback', async () => {
  const page = setup({
    user: { role: 'developer' },
    api: (url, options) =>
      options.method === 'PATCH'
        ? { key: 'unused', displayName: '', name: 'original.png' }
        : undefined,
  });
  await page.instance.ready;
  const form = page.root.querySelectorAll('form')[0];
  const rename = page.root
    .querySelectorAll('button')
    .find(
      (button) =>
        button.dataset.i18nAriaLabel === 'admin_media_library_name_rename',
    );
  await rename.fire('click');
  const input = form.querySelector('input');
  assert.equal(input.required, false);
  input.value = ' ';
  await form.fire('submit');
  assert.equal(
    page.calls.find((call) => call.method === 'PATCH').body.displayName,
    '',
  );
  assert.equal(form.hidden, true);
  await rename.fire('click');
  assert.equal(input.value, '');
  assert(
    page.root
      .querySelectorAll('h2')
      .some((heading) => heading.textContent === 'original.png'),
  );
});

test('invalid names never issue a write and failed saves retain the old name', async () => {
  const page = setup({
    api: (url, options) => {
      if (options.method === 'PATCH') throw new Error('unavailable');
    },
  });
  await page.instance.ready;
  const form = page.root.querySelectorAll('form')[0];
  await page.root
    .querySelectorAll('button')
    .find(
      (button) =>
        button.dataset.i18nAriaLabel === 'admin_media_library_name_rename',
    )
    .fire('click');
  for (const value of [' ', 'x'.repeat(121), 'line\nbreak']) {
    form.querySelector('input').value = value;
    await form.fire('submit');
  }
  assert.equal(page.calls.length, 1);
  form.querySelector('input').value = 'New label';
  await form.fire('submit');
  assert(
    page.root
      .querySelectorAll('h2')
      .some((heading) => heading.textContent === 'unused'),
  );
  assert.match(page.status(), /admin_media_library_name_error/);
  assert.equal(form.hidden, false);
  assert.equal(form.querySelector('input').value, 'New label');
});

test('pencil editing supports repeated open, Cancel, Escape and focus restoration', async () => {
  const page = setup();
  await page.instance.ready;
  const form = page.root.querySelectorAll('form')[0];
  const input = form.querySelector('input');
  const rename = page.root
    .querySelectorAll('button')
    .find(
      (button) =>
        button.dataset.i18nAriaLabel === 'admin_media_library_name_rename',
    );
  let focused;
  input.focus = () => {
    focused = input;
  };
  rename.focus = () => {
    focused = rename;
  };
  assert.equal(form.hidden, true);
  for (const method of ['cancel', 'escape']) {
    await rename.fire('click');
    assert.equal(focused, input);
    assert.equal(rename.getAttribute('aria-expanded'), 'true');
    input.value = 'Unsaved name';
    if (method === 'cancel')
      await page.button('admin_media_library_name_cancel').fire('click');
    else await form.fire('keydown', { key: 'Escape' });
    assert.equal(focused, rename);
    assert.equal(form.hidden, true);
    assert.equal(input.value, 'unused');
    assert.equal(rename.getAttribute('aria-expanded'), 'false');
  }
  assert.equal(page.calls.length, 1);
});

test('pending Save blocks duplicate saves and Cancel, then collapses with the new name', async () => {
  const pending = deferred();
  const page = setup({
    api: (url, options) =>
      options.method === 'PATCH' ? pending.promise : undefined,
  });
  await page.instance.ready;
  const form = page.root.querySelectorAll('form')[0];
  const rename = page.root
    .querySelectorAll('button')
    .find(
      (button) =>
        button.dataset.i18nAriaLabel === 'admin_media_library_name_rename',
    );
  await rename.fire('click');
  form.querySelector('input').value = 'New name';
  const saving = form.fire('submit');
  await form.fire('submit');
  await page.button('admin_media_library_name_cancel').fire('click');
  assert.equal(form.hidden, false);
  assert.equal(page.button('admin_media_library_name_save').disabled, true);
  assert.equal(page.calls.filter((call) => call.method === 'PATCH').length, 1);
  pending.resolve({ name: 'New name', displayName: 'New name' });
  await saving;
  assert.equal(form.hidden, true);
  await rename.fire('click');
  assert.equal(form.querySelector('input').value, 'New name');
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
