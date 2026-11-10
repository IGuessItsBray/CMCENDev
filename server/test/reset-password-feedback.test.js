const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const translations = require('../data/translations.json');
const policy = require('../services/password-policy');
const source = (name) =>
  fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');

function target() {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    value: '',
    type: 'password',
    textContent: '',
    hidden: true,
    disabled: false,
    dataset: {},
    selectionStart: 0,
    selectionEnd: 0,
    selectionDirection: 'none',
    classList: {
      toggle(name, enabled) {
        enabled ? classes.add(name) : classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    fire(name) {
      return Promise.all(
        (listeners.get(name) || []).map((fn) => fn({ preventDefault() {} })),
      );
    },
    focus() {},
    setSelectionRange(start, end, direction) {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    },
  };
}

function harness() {
  const elements = Object.fromEntries(
    [...source('login.html').matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [
      id,
      target(),
    ]),
  );
  const document = {
    ...target(),
    title: 'Test',
    getElementById: (id) => elements[id],
  };
  document.hidden = false;
  let language = 'en';
  const navigation = [];
  const calls = [];
  let respond = async () => ({ message: 'Reset complete' });
  const window = {
    ...target(),
    translate: (key) => translations[language][key] || key,
    location: { search: '?resetToken=synthetic-test-token' },
    history: { replaceState: (...args) => navigation.push(args) },
  };
  const form = elements.resetPasswordForm;
  form.reset = () => {
    form.fire('reset');
    elements.newPassword.value = '';
    elements.newPasswordConfirmation.value = '';
  };
  const context = vm.createContext({
    document,
    window,
    TextEncoder,
    URLSearchParams,
    queueMicrotask,
    CMCENUtils: {
      getNewPasswordError: (value) =>
        policy.getPasswordValidationError(value)
          ? translations[language].password_policy_guidance
          : '',
      translateText: (key) => translations[language][key],
      apiJson: async (...args) => {
        calls.push(args);
        return respond(...args);
      },
    },
  });
  for (const file of [
    'password-policy.js',
    'reset-password-feedback.js',
    'login.js',
  ])
    vm.runInContext(source(file), context);
  return {
    elements,
    document,
    window,
    form,
    navigation,
    calls,
    setLanguage: async (value) => {
      language = value;
      await document.fire('languagechange');
    },
    setResponse: (callback) => {
      respond = callback;
    },
    enter: async (value, confirmation = '') => {
      elements.newPassword.value = value;
      elements.newPasswordConfirmation.value = confirmation;
      await elements.newPassword.fire('input');
    },
  };
}

test('live requirements exactly match server Unicode and bcrypt byte limits', async () => {
  const page = harness();
  const { elements } = page;
  assert.equal(elements.resetPasswordFeedback.hidden, false);
  assert.equal(elements.resetPasswordLength.dataset.state, 'pending');
  for (const value of [
    '',
    'a'.repeat(11),
    'é'.repeat(12),
    '😀'.repeat(18),
    '😀'.repeat(19),
    'a'.repeat(72),
    'a'.repeat(73),
  ]) {
    await page.enter(value);
    const result = policy.getPasswordRequirements(value);
    assert.equal(
      elements.resetPasswordLength.dataset.state,
      !value ? 'pending' : result.minimumLength ? 'met' : 'unmet',
    );
    assert.equal(
      elements.resetPasswordBytes.dataset.state,
      !value ? 'pending' : result.maximumBytes ? 'met' : 'unmet',
    );
    assert.equal(
      elements.newPassword.getAttribute('aria-invalid'),
      String(!!value && !!policy.getPasswordValidationError(value)),
    );
    if (policy.getPasswordValidationError(value) && value)
      assert.match(elements.resetPasswordStrength.className, /is-weak/);
  }
  await page.enter('lantern meadow orbit velvet');
  assert.match(elements.resetPasswordStrength.className, /is-strong/);
  await page.enter('Aa1!aaaaaaaa');
  assert.match(elements.resetPasswordStrength.className, /is-weak/);
});

test('confirmation reacts to edits of either field and language changes keep values and visibility', async () => {
  const page = harness();
  const { elements } = page;
  await page.enter('lantern meadow orbit velvet', 'wrong');
  assert.equal(elements.resetPasswordMatch.dataset.state, 'unmet');
  elements.newPasswordConfirmation.value = elements.newPassword.value;
  await elements.newPasswordConfirmation.fire('input');
  assert.equal(elements.resetPasswordMatch.dataset.state, 'met');
  await elements.newPasswordToggle.fire('click');
  await page.setLanguage('fr');
  assert.match(
    elements.resetPasswordStrengthText.textContent,
    /Robustesse estimée/,
  );
  assert.equal(
    elements.newPasswordToggle.getAttribute('aria-label'),
    translations.fr.hide_password,
  );
  assert.equal(
    elements.resetPasswordMatch.textContent,
    translations.fr.passwords_match,
  );
  assert.equal(elements.newPassword.type, 'text');
  assert.equal(elements.newPassword.value, 'lantern meadow orbit velvet');
  elements.newPassword.value += '!';
  await elements.newPassword.fire('change');
  assert.equal(elements.resetPasswordMatch.dataset.state, 'unmet');
});

test('optional uppercase, number and special-character indicators update live without changing acceptance', async () => {
  const page = harness();
  const { elements } = page;
  const indicators = [
    elements.resetPasswordUppercase,
    elements.resetPasswordNumber,
    elements.resetPasswordSpecial,
  ];
  for (const [value, expected] of [
    ['', [false, false, false]],
    ['lantern meadow orbit velvet', [false, false, false]],
    ['Élantern meadow', [true, false, false]],
    ['lantern meadow 7', [false, true, false]],
    ['lantern meadow!', [false, false, true]],
    ['lantern meadow 😀', [false, false, true]],
    ['Élantern meadow 7!', [true, true, true]],
    ['lantern meadow ', [false, false, false]],
  ]) {
    await page.enter(value);
    indicators.forEach((indicator, index) =>
      assert.equal(
        indicator.dataset.state,
        expected[index] ? 'met' : 'pending',
      ),
    );
  }
  await page.enter('Élantern meadow 7!');
  await page.setLanguage('fr');
  assert.equal(
    elements.resetPasswordUppercase.textContent,
    'Présent: Lettre majuscule',
  );
  assert.equal(elements.resetPasswordNumber.textContent, 'Présent: Chiffre');
  assert.ok(
    elements.resetPasswordSpecial.textContent.startsWith(
      'Présent: Caractère spécial',
    ),
  );
  await page.enter(
    'lantern meadow orbit velvet',
    'lantern meadow orbit velvet',
  );
  assert.equal(elements.newPassword.getAttribute('aria-invalid'), 'false');
  await page.form.fire('submit');
  assert.equal(
    page.calls.length,
    1,
    'Optional suggestions must not gate reset submission',
  );
  indicators.forEach((indicator) =>
    assert.equal(indicator.dataset.state, 'pending'),
  );
});

test('toggles preserve selection and value, act independently, and remask on background/reset/navigation', async () => {
  const page = harness();
  const { elements } = page;
  await page.enter('lantern meadow orbit velvet');
  elements.newPassword.setSelectionRange(3, 8, 'forward');
  await elements.newPasswordToggle.fire('click');
  assert.equal(elements.newPassword.type, 'text');
  assert.equal(elements.newPasswordConfirmation.type, 'password');
  assert.equal(elements.newPassword.selectionStart, 3);
  assert.equal(elements.newPassword.selectionEnd, 8);
  assert.equal(elements.newPasswordToggle.getAttribute('aria-pressed'), 'true');
  await elements.newPasswordToggle.fire('click');
  assert.equal(elements.newPassword.type, 'password');
  await elements.newPasswordConfirmationToggle.fire('click');
  page.document.hidden = true;
  await page.document.fire('visibilitychange');
  assert.equal(elements.newPasswordConfirmation.type, 'password');
  assert.equal(elements.newPassword.value, 'lantern meadow orbit velvet');
  await elements.newPasswordToggle.fire('click');
  await elements.resetPasswordBack.fire('click');
  assert.equal(elements.newPassword.type, 'password');
  assert.equal(elements.newPassword.value, '');
  assert.equal(elements.resetPasswordForm.hidden, true);
  assert.match(elements.resetPasswordStrength.className, /is-empty/);
  assert.equal(page.navigation.at(-1)[2], '/login');
  await page.enter('another synthetic password');
  await page.window.fire('pagehide');
  assert.equal(elements.newPassword.value, '');
});

test('reset rejects mismatch and invalid policy, prevents repeat submits, clears on success and preserves retry on failure', async () => {
  const page = harness();
  const { elements } = page;
  await page.enter('short', 'short');
  await page.form.fire('submit');
  await page.enter('lantern meadow orbit velvet', 'mismatch');
  await page.form.fire('submit');
  assert.equal(page.calls.length, 0);
  await page.enter(
    'lantern meadow orbit velvet',
    'lantern meadow orbit velvet',
  );
  page.setResponse(async () => {
    throw new Error('Invalid or expired link');
  });
  await page.form.fire('submit');
  assert.equal(
    elements.resetPasswordMessage.textContent,
    'Invalid or expired link',
  );
  assert.equal(elements.resetPasswordBtn.disabled, false);
  assert.equal(elements.newPassword.value, 'lantern meadow orbit velvet');
  let finish;
  page.setResponse(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = page.form.fire('submit');
  await page.form.fire('submit');
  assert.equal(page.calls.length, 2);
  assert.equal(page.calls[1][0], '/api/password-reset/confirm');
  assert.equal(page.calls[1][1].body.password, 'lantern meadow orbit velvet');
  assert.equal(elements.resetPasswordBtn.disabled, true);
  finish({ message: 'Reset complete' });
  await first;
  assert.equal(elements.newPassword.value, '');
  assert.equal(elements.newPasswordConfirmation.value, '');
  assert.equal(elements.newPassword.type, 'password');
  assert.equal(elements.loginForm.hidden, false);
  assert.equal(elements.resetPasswordBtn.disabled, false);
});

test('visibility controls are non-submitting, labelled, and preserve password-manager semantics', () => {
  const html = source('login.html');
  for (const id of ['newPassword', 'newPasswordConfirmation']) {
    const button = html.match(
      new RegExp(`<button\\b[^>]*id="${id}Toggle"[^>]*>`),
    )[0];
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="[^"]+"/);
    assert.ok(button.includes(`aria-controls="${id}"`));
    const input = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))[0];
    assert.match(input, /type="password"/);
    assert.match(input, /autocomplete="new-password"/);
  }
});
