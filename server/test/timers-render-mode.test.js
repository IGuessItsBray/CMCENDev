const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const script = fs.readFileSync(
  path.join(__dirname, '../public/timers.js'),
  'utf8',
);

function setup(renderOnly) {
  const calls = { storage: 0, requests: [], listeners: [] };
  const window = {
    location: { pathname: '/' },
    addEventListener: (name) => calls.listeners.push(name),
  };
  vm.runInNewContext(script, {
    window,
    document: {
      currentScript: {
        hasAttribute: (name) => renderOnly && name === 'data-render-only',
      },
      addEventListener: (name) => calls.listeners.push(name),
    },
    sessionStorage: {
      getItem() {
        calls.storage++;
        return null;
      },
      setItem() {
        calls.storage++;
      },
    },
    CMCENUtils: {
      apiJson: async (url) => {
        calls.requests.push(url);
        return { timers: [] };
      },
    },
  });
  return { calls, window };
}

test('preview mode exposes the renderer without requests, storage, or public page listeners', () => {
  const { calls, window } = setup(true);
  assert.equal(typeof window.CMCENBannerView.create, 'function');
  assert.equal(typeof window.CMCENBannerView.updateCountdowns, 'function');
  assert.equal(window.CMCENTimers, undefined);
  assert.equal(calls.storage, 0);
  assert.deepEqual(calls.requests, []);
  assert.deepEqual(calls.listeners, []);
});

test('public mode still fetches active banners and observes page changes', async () => {
  const { calls, window } = setup(false);
  await new Promise(setImmediate);
  assert.equal(typeof window.CMCENTimers.reload, 'function');
  assert.deepEqual(calls.requests, ['/api/timers/active?scope=home']);
  assert.ok(calls.storage > 0);
  assert.deepEqual(calls.listeners, [
    'languagechange',
    'cmcenheaderready',
    'resize',
  ]);
});
