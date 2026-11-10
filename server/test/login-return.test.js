const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');

function setup(search, token = 'synthetic-session') {
  const document = new Element('document');
  document.getElementById = () => new Element('div');
  const calls = [];
  const window = {
    location: { search, href: '/login' },
    refreshAuthUI: () => calls.push('refresh'),
  };
  const context = {
    window,
    document,
    URLSearchParams,
    CMCENUtils: {
      storeAuthToken: () => token,
      clearMfaSession: () => calls.push('clearMfa'),
      apiJson: async () => ({ preferredLanguage: 'en' }),
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../public/login.js'), 'utf8'),
    context,
  );
  return { window, calls, login: () => context.completeLogin('token') };
}

test('successful login returns to either authorized certificate entry path', async () => {
  for (const destination of ['/certificates', '/certificate-requests']) {
    const page = setup(`?returnTo=${encodeURIComponent(destination)}`);
    await page.login();
    assert.equal(page.window.location.href, destination);
    assert.deepEqual(page.calls, ['clearMfa', 'refresh']);
  }
});

test('missing, external, protocol-relative and unexpected login returns keep dashboard default', async () => {
  for (const destination of [
    '',
    'https://evil.example/certificates',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/api/me',
    '/certificates?url=evil',
    '/certificates#evil',
  ]) {
    const page = setup(`?returnTo=${encodeURIComponent(destination)}`);
    await page.login();
    assert.equal(page.window.location.href, '/dashboard');
  }
});

test('login with no valid session does not navigate to the request form', async () => {
  const page = setup('?returnTo=%2Fcertificates', '');
  await assert.rejects(page.login(), /no session token/);
  assert.equal(page.window.location.href, '/login');
});
