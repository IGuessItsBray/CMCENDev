const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const registerScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'register.js'),
  'utf8',
);

function runRegisterPage({ token, apiJson }) {
  const redirects = [];
  const element = {
    addEventListener() {},
  };
  const context = {
    URLSearchParams,
    document: {
      getElementById() {
        return element;
      },
    },
    CMCENUtils: {
      apiJson,
      clearAuthToken() {},
      getCurrentLanguage() {
        return 'en';
      },
      getStoredAuthToken() {
        return token;
      },
    },
    window: {
      location: {
        replace(location) {
          redirects.push(location);
        },
      },
    },
  };

  context.window.CMCENUtils = context.CMCENUtils;
  vm.runInNewContext(registerScript, context);

  return { redirects };
}

test('redirects a signed-in visitor from registration to the dashboard', async () => {
  const page = runRegisterPage({
    token: 'valid-session-token',
    apiJson: async (path, options) => {
      assert.equal(path, '/api/me');
      assert.equal(options.token, 'valid-session-token');
      return { email: 'member@example.test' };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(page.redirects, ['/dashboard']);
});

test('does not redirect a visitor whose stored token is no longer valid', async () => {
  let cleared = false;
  const redirects = [];
  const element = { addEventListener() {} };
  const context = {
    URLSearchParams,
    document: { getElementById: () => element },
    CMCENUtils: {
      apiJson: async () => {
        const error = new Error('Invalid or expired token');
        error.status = 401;
        throw error;
      },
      clearAuthToken() {
        cleared = true;
      },
      getCurrentLanguage: () => 'en',
      getStoredAuthToken: () => 'expired-session-token',
    },
    window: { location: { replace: (location) => redirects.push(location) } },
  };
  context.window.CMCENUtils = context.CMCENUtils;
  vm.runInNewContext(registerScript, context);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(cleared, true);
  assert.deepEqual(redirects, []);
});
