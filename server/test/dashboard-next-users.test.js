const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const { Element } = require('./helpers/dashboard-dom');

async function controller(apiOverride, permissions = manager.permissions) {
  const roots = {
    adminUsersBody: new Element('div'),
    adminUsersInvite: new Element('button'),
  };
  const document = new Element('document');
  document.append(...Object.values(roots));
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) =>
    roots[id] ||
    document.querySelectorAll('input').find((item) => item.id === id);
  const users = ['one', 'two'].map((_id) => ({
    _id,
    accountName: _id,
    role: 'subscriber',
    accountType: 'member',
    contentAreas: [],
    customRoleIds: [],
  }));
  const catalog = {
    users,
    roles: ['subscriber', 'editor'],
    customRoles: [],
    contentAreas: ['general'],
    nextCursor: '',
  };
  const timers = new Map();
  let timerId = 0;
  const utils = {
    getUserDisplayName: (user) => user.accountName,
    formatTitleCaseValue: (value) => value,
    showToast() {},
  };
  const window = {
    translate: (key) => key,
    CMCENUtils: utils,
    CMCENModal: { confirm: async () => true },
    matchMedia: () => ({ matches: false }),
  };
  const context = {
    document,
    window,
    CMCENUtils: utils,
    AbortController,
    URLSearchParams,
    setTimeout: (fn) => {
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  for (const file of [
    'shared-forms.js',
    'dashboard-next-user-actions.js',
    'dashboard-next-users.js',
  ])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'),
      context,
    );
  const api = async (url, options = {}) => {
    const value = apiOverride?.(url, options);
    if (value !== undefined) return value;
    if (url.startsWith('/api/admin/users?')) return catalog;
    return { user: users.find((user) => url.includes(`/${user._id}?`)) };
  };
  const mounted = window.DashboardNextUsers.mount({
    api,
    permissions,
    user: { ...manager, permissions },
    navigate() {},
    onDenied() {},
  });
  await flush();
  const detail = () =>
    roots.adminUsersBody.querySelector('.admin-users-detail');
  return {
    roots,
    document,
    users,
    mounted,
    detail,
    rows: () => roots.adminUsersBody.querySelectorAll('.admin-user-row'),
    search: () =>
      roots.adminUsersBody
        .querySelectorAll('input')
        .find((item) => item.id === 'users-search'),
    runTimers: async () => {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((fn) => fn());
      await flush();
    },
  };
}

function setup(modal = {}) {
  const window = { translate: (key) => key, CMCENModal: modal };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-user-actions.js'),
      'utf8',
    ),
    {
      window,
      CMCENUtils: { getUserDisplayName: (user) => user.accountName },
    },
  );
  return window.DashboardNextUserActions;
}
const manager = {
  _id: 'actor',
  role: 'administrator',
  permissions: {
    canManageUsers: true,
    canProvisionUsers: true,
    canResetUserMfa: true,
    canDeleteAnyUser: true,
  },
};

test('role changes preserve the user draft and remove deleted assignments from its baseline', async () => {
  const page = await controller();
  page.mounted.updateRoles([
    { _id: 'first', name: 'First' },
    { _id: 'second', name: 'Second' },
  ]);
  await page.rows()[0].fire('click');
  const form = page.detail().querySelector('form');
  const role = form.querySelector('select');
  role.value = 'editor';
  const first = form
    .querySelectorAll('input')
    .find((item) => item.value === 'first');
  first.checked = true;
  page.mounted.updateRoles([
    { _id: 'first', name: 'Renamed' },
    { _id: 'third', name: 'Third' },
  ]);
  assert.equal(page.detail().querySelector('form'), form);
  assert.equal(role.value, 'editor');
  assert.equal(
    form.querySelectorAll('input').find((item) => item.value === 'first')
      .checked,
    true,
  );
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  page.mounted.updateRoles([{ _id: 'third', name: 'Third' }]);
  assert.equal(
    form.querySelectorAll('input').some((item) => item.value === 'first'),
    false,
  );
  role.value = 'subscriber';
  assert.equal(page.mounted.hasUnsavedChanges(), false);
});

test('deleting an assigned role reconciles both saved and draft assignments', async () => {
  const page = await controller();
  page.users[0].customRoleIds = ['first'];
  page.mounted.updateRoles([{ _id: 'first', name: 'First' }]);
  await page.rows()[0].fire('click');
  const form = page.detail().querySelector('form');
  const assigned = form
    .querySelectorAll('input')
    .find((item) => item.value === 'first');
  assert.equal(assigned.checked, true);
  assigned.checked = false;
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  page.mounted.updateRoles([]);
  assert.equal(page.detail().querySelector('form'), form);
  assert.equal(page.mounted.hasUnsavedChanges(), false);
});

test('user actions honor separate permissions, self protection, and protected roles', () => {
  const { capabilities, assignableRoles } = setup();
  const target = {
    _id: 'other',
    role: 'subscriber',
    accountType: 'invited',
    mfa: { enabled: true },
  };
  const reader = capabilities(
    { _id: 'reader', permissions: { canReadUsers: true } },
    target,
  );
  assert.ok(Object.values(reader).every((allowed) => allowed === false));
  const self = capabilities(manager, { ...target, _id: 'actor' });
  for (const key of ['role', 'customRoles', 'resetMfa', 'remove'])
    assert.equal(self[key], false);
  assert.equal(self.edit, true); // Content-area assignments may still change.
  assert.equal(
    capabilities(manager, { ...target, role: 'internal_beta' }).role,
    false,
  );
  assert.equal(
    capabilities(manager, { ...target, role: 'internal_beta' }).resend,
    false,
  );
  assert.equal(
    capabilities(manager, { ...target, role: 'developer' }).role,
    false,
  );
  assert.equal(capabilities(manager, target).promote, false);
  assert.equal(
    capabilities(
      { ...manager, role: 'developer' },
      { ...target, role: 'administrator' },
    ).promote,
    true,
  );
  const roles = assignableRoles(
    ['subscriber', 'internal_beta', 'ghost', 'developer'],
    manager,
    null,
    true,
  );
  assert.deepEqual(Array.from(roles), ['subscriber']);
});

test('save payload contains only changed permitted assignments and ignores choice order', () => {
  const { changes } = setup();
  const original = {
    role: 'subscriber',
    customRoleIds: ['one', 'two'],
    contentAreas: ['general'],
  };
  const current = {
    role: 'editor',
    customRoleIds: ['two', 'one'],
    contentAreas: ['general', 'history'],
  };
  const payload = changes(original, current, {
    role: false,
    customRoles: true,
    edit: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    contentAreas: ['general', 'history'],
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(changes(original, current, {}))),
    {},
  );
  assert.deepEqual(original.customRoleIds, ['one', 'two']);
});

test('cancelled and disposed confirmations cannot mutate an account', async () => {
  let calls = 0;
  const target = { _id: 'other', accountType: 'invited' };
  const options = {
    api: async () => {
      calls++;
    },
    actor: manager,
    isCurrent: () => true,
  };
  await setup({ confirm: async () => false }).perform(
    'resend',
    target,
    options,
  );
  await setup({ confirm: async () => true }).perform('resend', target, {
    ...options,
    isCurrent: () => false,
  });
  await setup().perform('remove', target, {
    ...options,
    actor: { permissions: {} },
  });
  assert.equal(calls, 0);
});

test('deletion requires a chosen disposition and fresh MFA before sending DELETE', async () => {
  const calls = [];
  const { perform } = setup({
    choose: async () => 'keep_and_anonymize',
    prompt: async () => '123456',
  });
  await perform(
    'remove',
    { _id: 'other' },
    {
      actor: manager,
      isCurrent: () => true,
      api: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith('/status')) return { enabled: true };
        if (url.endsWith('/credentials')) return [];
        return { message: 'Deleted' };
      },
    },
  );
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body)), {
    contentDisposition: 'keep_and_anonymize',
    mfaMethod: 'totp',
    mfaCode: '123456',
  });
  await assert.rejects(
    perform(
      'remove',
      { _id: 'other' },
      {
        actor: manager,
        isCurrent: () => true,
        api: async (url) =>
          url.endsWith('/credentials') ? [] : { enabled: false },
      },
    ),
    /admin_next_users_mfa_required/,
  );
});

test('search and failed saves preserve the same editor and its draft', async () => {
  let patches = 0;
  const page = await controller((url, options) => {
    if (options.method === 'PATCH') {
      patches++;
      return Promise.reject(new Error('Save failed'));
    }
  });
  await page.rows()[0].fire('click');
  await flush();
  const form = page.detail().querySelector('form');
  const role = form.querySelector('select');
  role.value = 'editor';
  await role.fire('input');
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  page.search().value = 'new search';
  await page.search().fire('input');
  await page.runTimers();
  assert.equal(page.detail().querySelector('form'), form);
  assert.equal(role.value, 'editor');
  await form.fire('submit');
  assert.equal(patches, 1);
  assert.equal(page.detail().querySelector('form'), form);
  assert.equal(role.value, 'editor');
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  assert.equal(
    form.querySelector('.admin-users-feedback').textContent,
    'Save failed',
  );
  page.mounted.dispose();
});

test('late account detail cannot replace a newer selection or a disposed screen', async () => {
  const slow = deferred();
  const page = await controller((url) =>
    url.includes('/one?') ? slow.promise : undefined,
  );
  const firstSelection = page.rows()[0].fire('click');
  await flush();
  await page.rows()[1].fire('click');
  await flush();
  assert.equal(page.detail().querySelector('h2').textContent, 'two');
  slow.resolve({ user: page.users[0] });
  await firstSelection;
  assert.equal(page.detail().querySelector('h2').textContent, 'two');
  page.mounted.dispose();
  assert.equal(page.roots.adminUsersBody.children.length, 0);
  const pending = deferred();
  const disposed = await controller((url) =>
    url.includes('/one?') ? pending.promise : undefined,
  );
  const selection = disposed.rows()[0].fire('click');
  await flush();
  disposed.mounted.dispose();
  pending.resolve({ user: disposed.users[0] });
  await selection;
  assert.equal(disposed.roots.adminUsersBody.children.length, 0);
});

test('out-of-order searches cannot replace the current list', async () => {
  const slow = deferred();
  const page = await controller((url) =>
    url.includes('query=slow') ? slow.promise : undefined,
  );
  page.search().value = 'slow';
  await page.search().fire('input');
  await page.runTimers();
  page.search().value = 'new';
  await page.search().fire('input');
  await page.runTimers();
  slow.resolve({
    users: [{ _id: 'stale', accountName: 'stale' }],
    nextCursor: '',
  });
  await flush();
  assert.deepEqual(
    page.rows().map((row) => row.dataset.userId),
    ['one', 'two'],
  );
  page.mounted.dispose();
});

test('read-only staff cannot submit access changes', async () => {
  let patches = 0;
  const page = await controller(
    (url, options) => {
      if (options.method === 'PATCH') patches++;
    },
    { canReadUsers: true },
  );
  await page.rows()[0].fire('click');
  const form = page.detail().querySelector('form');
  assert.equal(form.querySelector('select').disabled, true);
  assert.equal(form.querySelector('button'), null);
  assert.equal(page.roots.adminUsersInvite.hidden, true);
  await form.fire('submit');
  assert.equal(patches, 0);
  page.mounted.dispose();
});
