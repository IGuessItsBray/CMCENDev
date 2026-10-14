const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const policy = require('../services/password-policy');
const translations = require('../data/translations.json');
const source = (file) =>
  fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');

function browser(locale = 'en') {
  const window = { translate: (key) => translations[locale][key] || key };
  const context = { window, TextEncoder };
  vm.runInNewContext(source('password-policy.js'), context);
  const utils = source('app-utils.js');
  const start = utils.indexOf('  function getNewPasswordError(');
  const getNewPasswordError = vm.runInNewContext(
    `${utils.slice(start, utils.indexOf('  function escapeRegExp(', start))}; getNewPasswordError`,
    { ...context, translateText: (key) => window.translate(key) },
  );
  return { window, getNewPasswordError };
}

test('browser and server share Unicode/byte boundaries and policy-invalid passwords stay weak', () => {
  const { window } = browser();
  for (const password of [
    'Aa1!aaaaaa',
    '😀'.repeat(11),
    '😀'.repeat(18),
    '😀'.repeat(19),
    'a'.repeat(72),
    'a'.repeat(73),
  ]) {
    assert.equal(
      window.CMCENPasswordPolicy.getPasswordValidationError(password),
      policy.getPasswordValidationError(password),
    );
  }
  assert.equal(window.CMCENPasswordPolicy.getPasswordStrength('Aa1!aaaaaa'), 1);
  assert.equal(
    window.CMCENPasswordPolicy.getPasswordStrength('😀'.repeat(19)),
    1,
  );
  assert.equal(
    window.CMCENPasswordPolicy.getPasswordStrength('Aa1!aaaaaaaa'),
    5,
  );
  assert.ok(browser('fr').getNewPasswordError('short').includes('12'));
  assert.ok(browser('fr').getNewPasswordError('short').includes('72'));
  assert.notEqual(
    browser('fr').getNewPasswordError('short'),
    browser('en').getNewPasswordError('short'),
  );
});

for (const kind of ['register', 'reset', 'upgrade']) {
  test(`${kind} form blocks invalid enrollment passwords before API and accepts exact UTF-8 limit`, async () => {
    for (const password of [
      'Aa1!aaaaaa',
      '😀'.repeat(11),
      '😀'.repeat(19),
      '😀'.repeat(18),
    ]) {
      const { window, getNewPasswordError } = browser('fr');
      const calls = [];
      const messages = [];
      const fields = { password, passwordConfirmation: password };
      const input = { value: password, focus() {} };
      const button = { setAttribute() {}, removeAttribute() {} };
      let submit;
      const form = {
        reportValidity: () => true,
        reset() {},
        addEventListener: (_event, fn) => {
          submit = fn;
        },
        querySelectorAll: () =>
          Object.entries(fields).map(([name, value]) => ({
            dataset: { profileField: name },
            value,
          })),
        querySelector: () => input,
      };
      window.location = { reload() {} };
      window.history = { replaceState() {} };
      const context = {
        window,
        document: { getElementById: () => input, title: '' },
        CMCENUtils: {
          getNewPasswordError,
          apiJson: async (...args) => {
            calls.push(args);
            return { token: 'test' };
          },
          storeAuthToken() {},
          showToast: (message) => messages.push(message),
        },
        translate: (key) => translations.fr[key] || key,
        FormData: class {
          get(key) {
            return fields[key] || '';
          }
        },
        registerForm: form,
        registerButton: button,
        passwordInput: input,
        registerError: { focus() {} },
        invitationToken: null,
        setRegisterError: (message) => messages.push(message),
        setStoredToken() {},
        showMfaSetup() {},
        resetPasswordForm: form,
        resetPasswordButton: button,
        resetToken: 'test',
        setResetPasswordMessage: (message) => messages.push(message),
        showLoginForm() {},
        form,
        submit: button,
        token: 'test',
      };
      if (kind === 'register') {
        const script = source('register.js');
        const start = script.indexOf('async function submitRegistration(');
        const fn = vm.runInNewContext(
          `${script.slice(start, script.indexOf('registerForm.addEventListener("submit"', start))}; submitRegistration`,
          context,
        );
        await fn({ preventDefault() {} });
      } else {
        const script = source(kind === 'reset' ? 'login.js' : 'dashboard.js');
        const start =
          kind === 'reset'
            ? script.indexOf('resetPasswordForm.addEventListener("submit"')
            : script.indexOf(
                '  form.addEventListener("submit"',
                script.indexOf('function createGhostUpgradeForm('),
              );
        const end =
          kind === 'reset'
            ? script.indexOf('emailVerificationForm.addEventListener', start)
            : script.indexOf('  return form;', start);
        vm.runInNewContext(script.slice(start, end), context);
        await submit({ preventDefault() {} });
      }
      const valid = !policy.getPasswordValidationError(password);
      assert.equal(calls.length, valid ? 1 : 0, `${kind}: ${password}`);
      if (!valid)
        assert.ok(
          messages.some(
            (message) => message === translations.fr.password_policy_guidance,
          ),
        );
      if (valid) assert.equal(calls[0][1].body.password, password);
    }
  });
}

test('MFA reset UI cannot grant access to protected targets through permissions alone', () => {
  const window = {};
  vm.runInNewContext(source('dashboard-next-user-actions.js'), { window });
  const capability = window.DashboardNextUserActions.capabilities;
  for (const role of ['subscriber', 'administrator', 'developer']) {
    const actor = {
      _id: 'actor',
      role,
      permissions: { canResetUserMfa: true },
    };
    for (const targetRole of ['editor', 'administrator', 'developer']) {
      const target = {
        _id: 'target',
        role: targetRole,
        mfa: { enabled: true },
      };
      assert.equal(
        capability(actor, target).resetMfa,
        role === 'developer' || targetRole === 'editor',
      );
    }
    assert.equal(
      capability(actor, { ...actor, mfa: { enabled: true } }).resetMfa,
      false,
    );
  }
});
