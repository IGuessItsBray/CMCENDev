const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup({
  permissions = {},
  publicPage = false,
  token = 'token',
  api,
} = {}) {
  const root = new Element('div'),
    document = new Element('document'),
    window = new Element('window');
  root.dataset.publicRequests = String(publicPage);
  document.getElementById = () => root;
  document.createElement = (tag) => new Element(tag);
  const mounts = [],
    calls = [];
  let reloads = 0;
  window.location = {
    reload() {
      reloads++;
    },
  };
  window.translate = (key) => key;
  for (const [name, type] of [
    ['RetirementCertificateRequest', 'retirement'],
    ['TrustedToServeRequest', 'trusted'],
    ['CertificateRequests', 'staff'],
  ]) {
    window[name] = {
      mount(options) {
        const controller = {
          dispose() {
            controller.disposed = true;
          },
          hasUnsavedChanges: () => true,
          setFamilyOptions(value) {
            controller.options = value;
          },
        };
        mounts.push({ type, ...options, controller });
        return controller;
      },
    };
  }
  const CMCENUtils = {
    getStoredAuthToken: () => token,
    clearAuthToken() {
      token = null;
    },
    apiJson: async (path, options) => {
      calls.push({ path, options });
      return api
        ? api(path, options)
        : path === '/api/me'
          ? { permissions }
          : { relationships: [], wordings: [] };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve('../public/certificate-requests.js'),
      'utf8',
    ),
    { document, window, CMCENUtils, AbortController },
  );
  return { root, window, mounts, calls, reloads: () => reloads };
}
test('public submitters mount both forms but never staff queue', async () => {
  const page = setup({
    publicPage: true,
    permissions: {
      canSubmitCertificateRequests: true,
      canManageCertificateRequests: true,
    },
  });
  await flush();
  assert.deepEqual(
    page.mounts.map((entry) => entry.type),
    ['retirement', 'trusted'],
  );
  assert.deepEqual(
    page.calls.map((call) => call.path),
    ['/api/me', '/api/certificate-requests/options'],
  );
  assert.equal(page.mounts[0].initiallyExpanded, false);
  let prevented = false;
  await page.window.fire('beforeunload', {
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  await page.window.fire('pagehide');
  assert.equal(
    page.mounts.every((entry) => entry.controller.disposed),
    true,
  );
});
test('management-only custom roles retain staff access without request forms', async () => {
  const page = setup({ permissions: { canManageCertificateRequests: true } });
  await flush();
  assert.deepEqual(
    page.mounts.map((entry) => entry.type),
    ['staff'],
  );
  assert.equal(page.mounts[0].showRequestForm, false);
  assert.equal(page.calls.length, 1);
});
test('history restoration reloads disposed forms and rechecks the session', async () => {
  const page = setup({
    publicPage: true,
    permissions: { canSubmitCertificateRequests: true },
  });
  await flush();
  await page.window.fire('pageshow', { persisted: false });
  assert.equal(page.reloads(), 0);
  await page.window.fire('pagehide');
  assert.equal(page.mounts.every((entry) => entry.controller.disposed), true);
  await page.window.fire('pageshow', { persisted: true });
  assert.equal(page.reloads(), 1);
});
test('signed-out and expired sessions show sign-in instead of repeated profile retries', async () => {
  const out = setup({ publicPage: true, token: null });
  await flush();
  assert.equal(out.calls.length, 0);
  assert.equal(
    out.root.querySelector('a').href,
    '/login?returnTo=%2Fcertificates',
  );
  const expired = setup({
    publicPage: true,
    api: () => {
      throw Object.assign(new Error('Expired'), { status: 401 });
    },
  });
  await flush();
  assert.equal(expired.calls.length, 1);
  assert.ok(expired.root.querySelector('a'));
});
test('profile recovery retries once explicitly and pagehide ignores late profile data', async () => {
  let attempts = 0;
  const page = setup({
    api: () => {
      if (++attempts === 1) throw new Error('Network');
      return { permissions: { canManageCertificateRequests: true } };
    },
  });
  await flush();
  assert.equal(page.mounts.length, 0);
  await page.root.querySelector('button').fire('click');
  assert.equal(page.mounts.length, 1);
  let resolve;
  const pending = setup({
    api: () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  });
  await pending.window.fire('pagehide');
  assert.equal(pending.calls[0].options.signal.aborted, true);
  resolve({ permissions: { canManageCertificateRequests: true } });
  await flush();
  assert.equal(pending.mounts.length, 0);
});
