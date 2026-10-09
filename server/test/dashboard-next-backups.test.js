const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);

test('backup schedule submits typed values, manual run uses extended timeout, and disposal cancels polling', async () => {
  const root = new Element('div');
  const document = {
    getElementById: () => root,
    createElement: (tag) => new Element(tag),
  };
  const window = {};
  const calls = [];
  let cleared = false;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/dashboard-next-backups.js'),
      'utf8',
    ),
    {
      document,
      window,
      setInterval: () => 42,
      clearInterval: (id) => {
        cleared = id === 42;
      },
    },
  );
  const mounted = window.DashboardNextBackups.mount({
    api: async (url, options = {}) => {
      calls.push({ url, ...options });
      return {
        enabled: false,
        mode: 'daily',
        time: '02:00',
        timeZone: 'America/Toronto',
        days: [0, 1, 2, 3, 4, 5, 6],
        nextRunAt: null,
        lastResult: null,
        running: false,
        readiness: { encryptionConfigured: true, mongoConfigured: true },
        backups: [],
      };
    },
    onDenied: () => assert.fail('unexpected access denial'),
  });
  await flush();
  const form = root.querySelector('form');
  form.reportValidity = () => true;
  const inputs = form.querySelectorAll('input');
  inputs.find((input) => input.name === 'enabled').checked = true;
  const mode = form
    .querySelectorAll('select')
    .find((input) => input.name === 'mode');
  mode.value = 'custom';
  await mode.fire('change');
  inputs.find((input) => input.name === 'time').value = '03:30';
  inputs.find((input) => input.name === 'timeZone').value = 'UTC';
  const days = inputs.filter((input) => input.name === 'days');
  days.forEach((input) => {
    input.checked = false;
  });
  await form.fire('submit');
  await flush();
  assert.equal(
    calls.some((call) => call.method === 'PATCH'),
    false,
  );
  days.forEach((input) => {
    input.checked = [1, 3, 5].includes(Number(input.value));
  });
  await form.fire('submit');
  await flush();
  const submitted = calls.find((call) => call.method === 'PATCH');
  assert.equal(submitted.body.enabled, true);
  assert.equal(submitted.body.mode, 'custom');
  assert.equal(submitted.body.time, '03:30');
  assert.equal(submitted.body.timeZone, 'UTC');
  assert.deepEqual(Array.from(submitted.body.days), [1, 3, 5]);
  const run = root
    .querySelectorAll('button')
    .find((button) => button.type === 'button');
  await run.fire('click');
  await flush();
  assert.equal(calls.find((call) => call.method === 'POST').timeoutMs, null);
  mounted.dispose();
  assert.equal(cleared, true);
  assert.equal(root.children.length, 0);
});
