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
const record = (metadata = { status: 'pending' }, seconds = 0) => ({
  _id: String(seconds),
  action: 'content.created',
  targetType: 'event',
  actor: 'one',
  target: 'two',
  actorSnapshot: { username: 'Example' },
  targetSnapshot: { title: { en: 'Sample', fr: 'Exemple' } },
  createdAt: new Date(
    Date.parse('2026-09-21T12:00:00Z') - seconds * 1000,
  ).toISOString(),
  metadata,
});
function setup({ api: override, logs = [record()] } = {}) {
  const root = new Element('div'),
    document = new Element('document');
  document.documentElement = { lang: 'en' };
  document.body = new Element('body');
  document.append(document.body);
  document.body.append(root);
  const downloads = [],
    revoked = [],
    timers = [],
    calls = [];
  let denied = 0;
  document.createElement = (tag) => {
    const el = new Element(tag);
    if (tag === 'a') {
      el.click = () => downloads.push({ href: el.href, filename: el.download });
      el.remove = () => {};
    }
    return el;
  };
  document.createTextNode = (value) => {
    const el = new Element('span');
    el.textContent = value;
    return el;
  };
  document.getElementById = () => root;
  const window = {
    translate: (key, values) => key + (values ? JSON.stringify(values) : ''),
    CMCENUtils: { formatDate: (value) => value },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/audit-log-controller.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      AbortSignal,
      URLSearchParams,
      URL: {
        createObjectURL: () => 'blob:sample',
        revokeObjectURL: (url) => revoked.push(url),
      },
      setTimeout: (fn) => timers.push(fn),
    },
  );
  const controller = window.AuditLogController.mount({
    api: async (url, options) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      return url.includes('export.csv')
        ? {
            blob: async () => new Blob(['csv']),
            headers: { get: () => 'attachment; filename="audit-sample.csv"' },
          }
        : { logs };
    },
    onDenied: () => {
      denied++;
      controller.dispose();
    },
  });
  const field = (name) =>
    [
      ...root.querySelectorAll('input'),
      ...root.querySelectorAll('select'),
    ].find((el) => el.name === name);
  const button = (key) =>
    root.querySelectorAll('button').find((el) => el.dataset.i18n === key);
  const set = async (name, value) => {
    const el = field(name);
    el.value = value;
    await el.fire(el.tagName === 'SELECT' ? 'change' : 'input');
  };
  return {
    root,
    document,
    controller,
    calls,
    downloads,
    revoked,
    timers,
    field,
    button,
    set,
    denied: () => denied,
    submit: () => root.querySelector('form').fire('submit'),
  };
}

test('all filters survive refresh and the CSV request uses the same selected values', async () => {
  const page = setup();
  await page.controller.ready;
  const user = page.field('user');
  for (const [name, value] of Object.entries({
    user: ' Example ',
    action: 'user.login',
    targetType: 'user',
    startDate: '2026-09-01',
    endDate: '2026-09-21',
  }))
    await page.set(name, value);
  await page.submit();
  assert.equal(page.field('user'), user);
  const listQuery = page.calls.at(-1).url.split('?')[1];
  const params = new URLSearchParams(listQuery);
  assert.equal(params.get('user'), 'Example');
  assert.equal(params.get('action'), 'user.login');
  assert.equal(params.get('targetType'), 'user');
  assert.equal(params.get('startDate'), '2026-09-01');
  assert.equal(params.get('endDate'), '2026-09-21');
  await page.button('audit_export_csv').fire('click');
  assert.equal(page.calls.at(-1).url.split('?')[1], listQuery);
  assert.equal(page.calls.at(-1).parseJson, false);
  assert.equal(page.downloads[0].filename, 'audit-sample.csv');
  page.timers.forEach((fn) => fn());
  assert.deepEqual(page.revoked, ['blob:sample']);
  await page.document.fire('languagechange');
  assert.equal(page.field('user'), user);
  assert.equal(user.value, ' Example ');
  await page.button('admin_next_audit_clear').fire('click');
  assert.equal(page.calls.at(-1).url, '/api/audit-logs');
});

test('invalid date ranges neither fetch nor export', async () => {
  const page = setup();
  await page.controller.ready;
  await page.set('startDate', '2026-09-21');
  await page.set('endDate', '2026-09-01');
  await page.submit();
  await page.button('audit_export_csv').fire('click');
  assert.equal(page.calls.length, 1);
  assert.equal(page.downloads.length, 0);
});

test('late filter responses cannot replace current results', async () => {
  const pending = [];
  const page = setup({
    api: () => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
  });
  await page.set('action', 'user.login');
  const next = page.submit();
  assert.equal(page.calls[0].signal.aborted, true);
  pending[1].resolve({ logs: [{ ...record(), action: 'user.login' }] });
  await next;
  pending[0].resolve({ logs: [record()] });
  await page.controller.ready;
  assert.equal(
    page.root.querySelector('.admin-post-header').querySelector('strong')
      .textContent,
    'audit_action_user_login',
  );
});

test('duplicate grouping preserves differing metadata and historical action labels', async () => {
  const page = setup({
    logs: [
      record({ status: 'pending' }, 0),
      record({ status: 'pending' }, 10),
      record({ status: 'published' }, 20),
      { ...record({}, 30), action: 'config.token_accepted' },
      { ...record({}, 40), action: 'migration.comments.apply' },
    ],
  });
  await page.controller.ready;
  assert.equal(page.root.querySelectorAll('article').length, 4);
  assert.equal(
    page.root.querySelector('.audit-log-duplicate-count').textContent,
    '×2',
  );
  const titles = page.root
    .querySelectorAll('.admin-post-header')
    .map((el) => el.querySelector('strong').textContent);
  assert.ok(titles.includes('audit_action_config_token_accepted'));
  assert.ok(titles.includes('audit_action_migration_comments_apply'));
});

test('failed reads are retryable and denial clears private logs', async () => {
  let fail = true;
  const page = setup({
    api: () => (fail ? Promise.reject(new Error('offline')) : undefined),
  });
  await page.controller.ready;
  assert.equal(page.root.querySelectorAll('article').length, 0);
  fail = false;
  await page.button('admin_refresh').fire('click');
  assert.equal(page.root.querySelectorAll('article').length, 1);
  const denied = setup({
    api: () =>
      Promise.reject(Object.assign(new Error('denied'), { status: 403 })),
  });
  await denied.controller.ready;
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
});

test('export guards duplicates and disposal cancels a pending blob without downloading', async () => {
  const pending = deferred();
  const page = setup({
    api: (url) =>
      url.includes('export.csv')
        ? { headers: { get: () => '' }, blob: () => pending.promise }
        : undefined,
  });
  await page.controller.ready;
  const exporting = page.button('audit_export_csv').fire('click');
  await flush();
  await page.button('audit_export_csv').fire('click');
  assert.equal(page.calls.length, 2);
  assert.equal(page.controller.canNavigate(), false);
  assert.equal(page.controller.hasUnsavedChanges(), true);
  page.controller.dispose();
  assert.equal(page.calls.at(-1).signal.aborted, true);
  pending.resolve(new Blob(['csv']));
  await exporting;
  assert.equal(page.downloads.length, 0);
});

test('export failures restore controls and forbidden exports revoke the area', async () => {
  for (const status of [500, 403]) {
    const page = setup({
      api: (url) =>
        url.includes('export.csv')
          ? Promise.reject(Object.assign(new Error('failed'), { status }))
          : undefined,
    });
    await page.controller.ready;
    await page.button('audit_export_csv').fire('click');
    assert.equal(page.downloads.length, 0);
    if (status === 403) assert.equal(page.denied(), 1);
    else assert.equal(page.controller.canNavigate(), true);
  }
});
