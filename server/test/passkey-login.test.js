const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadLogin({
  consent = true,
  cancelled = false,
  unavailable = false,
} = {}) {
  const elements = new Map();
  const calls = [];
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        disabled: false,
        hidden: false,
        value: '',
        textContent: '',
        classList: { toggle() {} },
        handlers: {},
        addEventListener(event, handler) {
          this.handlers[event] = handler;
        },
        setAttribute() {},
        removeAttribute() {},
      });
    return elements.get(id);
  };
  const window = { location: { search: '', href: '/login' } };
  const assertion = { id: 'selected-passkey' };
  const context = {
    URLSearchParams,
    window,
    document: { getElementById: element, addEventListener() {} },
    navigator: {
      credentials: {
        get: async (request) => {
          calls.push(['prompt', request]);
          if (cancelled)
            throw Object.assign(new Error('cancelled'), {
              name: 'NotAllowedError',
            });
          return assertion;
        },
      },
    },
    CMCENUtils: {
      ensureWebAuthnAvailable() {
        if (unavailable) throw new Error('Unavailable');
      },
      hasSessionCookieConsent: () => false,
      requestSessionCookieConsent: async () => consent,
      preparePublicKeyRequestOptions: (options) => options,
      serializeAssertionCredential: (credential) => credential,
      storeAuthToken: (token) => token,
      clearMfaSession() {},
      apiJson: async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith('/options'))
          return {
            options: { challenge: 'challenge' },
            loginToken: 'login-token',
          };
        if (url.endsWith('/verify')) return { token: 'session-token' };
        return {};
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/login.js'), 'utf8'),
    context,
  );
  return {
    elements,
    calls,
    window,
    click: element('passkeyLoginBtn').handlers.click,
  };
}

test('passkey button signs in without email, password or the MFA dialog', async () => {
  const login = loadLogin();
  await login.click();
  assert.deepEqual(
    login.calls.map(([url]) => url),
    [
      '/api/mfa/webauthn/login/options',
      'prompt',
      '/api/mfa/webauthn/login/verify',
      '/api/me',
    ],
  );
  const body = login.calls[2][1].body;
  assert.equal(body.loginToken, 'login-token');
  assert.equal(body.sessionCookieConsent, true);
  assert.equal(body.credential.id, 'selected-passkey');
  assert.equal(body.username, undefined);
  assert.equal(body.password, undefined);
  assert.equal(login.window.location.href, '/dashboard');
  assert.equal(login.elements.get('loginBtn').disabled, false);
  assert.equal(login.elements.get('passkeyLoginBtn').disabled, false);
});

test('declined consent and unavailable WebAuthn do not start sign-in', async () => {
  for (const options of [{ consent: false }, { unavailable: true }]) {
    const login = loadLogin(options);
    await login.click();
    assert.equal(login.calls.length, 0);
    assert.equal(login.window.location.href, '/login');
    assert.equal(login.elements.get('loginBtn').disabled, false);
  }
});

test('cancelled passkey prompts restore both sign-in choices', async () => {
  const login = loadLogin({ cancelled: true });
  await login.click();
  assert.equal(login.calls.length, 2);
  assert.equal(login.window.location.href, '/login');
  assert.equal(login.elements.get('loginError').hidden, false);
  assert.equal(login.elements.get('loginBtn').disabled, false);
  assert.equal(login.elements.get('passkeyLoginBtn').disabled, false);
});
