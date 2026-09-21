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

async function setup(override) {
  const root = new Element('div'),
    create = new Element('button');
  const document = new Element('document');
  document.append(root, create);
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) => (id === 'adminRolesBody' ? root : create);
  const calls = [],
    updates = [];
  let denied = false,
    confirmation = async () => true;
  const roles = ['one', 'two'].map((_id) => ({
    _id,
    name: _id,
    slug: _id,
    color: '#123456',
    description: '',
    permissions: ['users.read'],
  }));
  const catalog = ['users.read', 'users.manage', 'review.bypass'].map(
    (key) => ({ key, label: key, description: key, group: 'Users' }),
  );
  const window = {
    translate: (key) => key,
    CMCENModal: { confirm: (...args) => confirmation(...args) },
  };
  const context = {
    window,
    document,
    AbortController,
    CMCENUtils: { showToast() {} },
  };
  for (const file of ['shared-forms.js', 'dashboard-next-roles.js'])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'),
      context,
    );
  const mounted = window.DashboardNextRoles.mount({
    api: async (url, options = {}) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      if (!options.method) return { roles, permissionCatalog: catalog };
      if (options.method === 'DELETE') return { roles: [] };
      const role = { _id: 'one', ...options.body };
      return { role, roles: [role, roles[1]] };
    },
    onRolesChanged: (roles) => updates.push(roles),
    onDenied: () => {
      denied = true;
    },
  });
  await flush();
  return {
    root,
    create,
    document,
    calls,
    updates,
    mounted,
    denied: () => denied,
    rows: () => root.querySelectorAll('.admin-user-row'),
    form: () => root.querySelector('form'),
    input: (name) =>
      root.querySelectorAll('input').find((input) => input.name === name),
    checkbox: (key) =>
      root.querySelectorAll('input').find((input) => input.value === key),
    remove: () => root.querySelector('.admin-users-danger'),
    confirm: (fn) => {
      confirmation = fn;
    },
  };
}

test('new roles stay local until submit and send only editable fields', async () => {
  const page = await setup();
  await page.create.fire('click');
  assert.equal(page.calls.length, 1);
  assert.equal(page.checkbox('review.bypass').disabled, true);
  page.input('name').value = 'Editors';
  page.checkbox('users.read').checked = true;
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  await page.form().fire('submit');
  const request = page.calls.at(-1);
  assert.equal(request.method, 'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(request.body)), {
    name: 'Editors',
    slug: '',
    color: '#4f46e5',
    description: '',
    permissions: ['users.read'],
  });
  assert.equal(page.updates.length, 1);
  assert.equal(page.mounted.hasUnsavedChanges(), false);
});

test('failed saves and cancelled role selection preserve the same form and draft', async () => {
  const page = await setup((url, options) => {
    if (options.method === 'PATCH')
      throw Object.assign(new Error('Conflict'), { status: 409 });
  });
  await page.rows()[0].fire('click');
  const form = page.form();
  page.input('name').value = 'Draft';
  page.confirm(async () => false);
  await page.rows()[1].fire('click');
  await page.document.fire('languagechange');
  assert.equal(page.form(), form);
  assert.equal(page.input('name').value, 'Draft');
  await form.fire('submit');
  assert.equal(page.calls.at(-1).url, '/api/admin/roles/one');
  assert.equal(page.form(), form);
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  assert.equal(page.updates.length, 0);
});

test('pending save blocks duplicate mutations and late completion cannot update disposed area', async () => {
  const pending = deferred();
  const page = await setup((url, options) =>
    options.method === 'POST' ? pending.promise : undefined,
  );
  await page.create.fire('click');
  page.input('name').value = 'Draft';
  const submission = page.form().fire('submit');
  await page.form().fire('submit');
  assert.equal(page.mounted.canNavigate(), false);
  assert.equal(page.calls.filter((call) => call.method).length, 1);
  page.mounted.dispose();
  assert.equal(page.calls.at(-1).signal.aborted, true);
  pending.resolve({ role: { _id: 'new' }, roles: [] });
  await submission;
  assert.equal(page.updates.length, 0);
  assert.equal(page.root.children.length, 0);
});

test('delete requires confirmation and synchronizes only after success', async () => {
  const page = await setup();
  await page.rows()[0].fire('click');
  page.confirm(async () => false);
  await page.remove().fire('click');
  assert.equal(page.calls.length, 1);
  const pending = deferred();
  page.confirm(() => pending.promise);
  const deletion = page.remove().fire('click');
  assert.equal(page.mounted.canNavigate(), false);
  pending.resolve(true);
  await deletion;
  assert.equal(page.calls.at(-1).method, 'DELETE');
  assert.equal(page.calls.at(-1).url, '/api/admin/roles/one');
  assert.equal(page.updates.length, 1);
  assert.equal(page.form(), null);
});

test('forbidden load delegates access revocation and disposed confirmations cannot delete', async () => {
  const denied = await setup(() => {
    throw Object.assign(new Error('Denied'), { status: 403 });
  });
  assert.equal(denied.denied(), true);
  const page = await setup();
  await page.rows()[0].fire('click');
  const pending = deferred();
  page.confirm(() => pending.promise);
  const deletion = page.remove().fire('click');
  page.mounted.dispose();
  pending.resolve(true);
  await deletion;
  assert.equal(page.calls.length, 1);
});
