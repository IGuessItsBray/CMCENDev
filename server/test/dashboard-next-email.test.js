const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');

const flush = () => new Promise(setImmediate);

function setup(overrides = {}) {
  const root = new Element('div');
  const document = {
    getElementById: () => root,
    createElement(tag) {
      const element = new Element(tag);
      if (tag === 'form') element.reportValidity = () => true;
      return element;
    },
  };
  const window = { translate: (key) => key };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-email.js'),
      'utf8',
    ),
    { window, document },
  );
  const state = {
    controls: { account: false, operational: false, weekly: false, news: false },
    effective: { account: false, operational: false, weekly: false, news: false },
    globalDisabled: true,
    readiness: { transport: true, subscriptions: true },
    attempts: [],
    ...overrides,
  };
  const calls = [];
  let denied = false;
  const api = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/admin/email/controls') {
      state.controls[options.body.category] = options.body.enabled;
      state.effective[options.body.category] =
        options.body.enabled && !state.globalDisabled;
      return state;
    }
    if (url === '/api/admin/email/test') {
      if (options.body.recipient !== 'dot@ecgw.dev') throw new Error('rejected');
      return { status: 'accepted' };
    }
    return state;
  };
  const mounted = window.DashboardNextEmail.mount({
    api,
    onDenied: () => { denied = true; },
  });
  return { root, state, calls, mounted, denied: () => denied };
}

test('email panel shows four default-off controls and emergency stop', async () => {
  const view = setup();
  await flush();
  const switches = view.root.querySelectorAll('input').filter((input) => input.type === 'checkbox');
  assert.equal(switches.length, 4);
  assert.ok(switches.every((input) => input.checked === false));
  assert.equal(view.root.querySelector('button').disabled, true);
  assert.match(view.root.children[0].textContent, /global_off/u);
  switches[0].checked = true;
  await switches[0].fire('change');
  assert.equal(view.state.controls.account, true);
  assert.equal(view.state.controls.weekly, false);
  assert.equal(view.root.querySelectorAll('input').filter((input) => input.type === 'checkbox')[0].checked, true);
  view.mounted.dispose();
  assert.equal(view.state.controls.account, true);
});

test('email panel handles test-send acceptance and rejection without exposing secrets', async () => {
  const view = setup({
    globalDisabled: false,
    attempts: [
      { workflow: 'email_verification', status: 'skipped', reason: 'category_disabled', recipientMasked: 'p***@example.test', correlationId: 'one', createdAt: '2026-10-01T00:00:00Z' },
      { workflow: 'admin_test', status: 'accepted', reason: '', recipientMasked: 'd***@ecgw.dev', correlationId: 'two', createdAt: '2026-10-01T00:00:00Z' },
      { workflow: 'password_reset', status: 'failed', reason: 'EAUTH', recipientMasked: 'p***@example.test', correlationId: 'three', createdAt: '2026-10-01T00:00:00Z' },
    ],
  });
  await flush();
  const history = view.root.querySelectorAll('li').map((item) => item.textContent).join(' ');
  assert.match(history, /skipped.*accepted.*failed/u);
  assert.doesNotMatch(history, /private code|person@example\.test/u);
  const form = view.root.querySelector('form');
  const recipient = form.querySelector('input');
  recipient.value = 'subscriber@example.test';
  await form.fire('submit');
  assert.equal(view.root.children.at(-1).textContent, 'admin_email_test_error');
  recipient.value = 'dot@ecgw.dev';
  await form.fire('submit');
  assert.equal(view.root.children.at(-1).textContent, 'admin_email_test_accepted');
  assert.equal(view.calls.filter((call) => call.url === '/api/admin/email/test').length, 2);
});

test('email panel calls permission-denied handler without rendering controls', async () => {
  const root = new Element('div');
  const document = { getElementById: () => root, createElement: (tag) => new Element(tag) };
  const window = { translate: (key) => key };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/dashboard-next-email.js'), 'utf8'), { window, document });
  let denied = false;
  window.DashboardNextEmail.mount({ api: async () => { throw { status: 403 }; }, onDenied: () => { denied = true; } });
  await flush();
  assert.equal(denied, true);
  assert.equal(root.querySelectorAll('input').length, 0);
});
