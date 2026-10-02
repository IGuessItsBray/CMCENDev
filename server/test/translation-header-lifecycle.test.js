const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { createTranslationsRuntime } = require('../services/translation-store');

test('language switching uses the current header after repeated replacements', () => {
  class Element {
    closest(selector) {
      return selector === '#langToggle' ? this : null;
    }
  }
  let toggle = new Element();
  const oldToggle = toggle;
  const listeners = [];
  const languageChanges = [];
  const document = {
    getElementById: () => toggle,
    querySelectorAll: () => [],
    documentElement: { setAttribute() {} },
    addEventListener(type, callback) {
      if (type === 'click') listeners.push(callback);
    },
    dispatchEvent(event) {
      if (event.type === 'languagechange')
        languageChanges.push(event.detail.language);
    },
  };
  const window = {};
  vm.runInNewContext(
    createTranslationsRuntime({
      en: { title: 'Hello' },
      fr: { title: 'Bonjour' },
    }),
    {
      document,
      window,
      Element,
      CustomEvent,
      localStorage: { getItem: () => 'en', setItem() {} },
    },
  );
  assert.equal(listeners.length, 1);
  assert.equal(oldToggle.textContent, 'FR');
  for (let index = 0; index < 10; index++) {
    toggle = new Element();
    listeners[0]({ target: toggle });
    assert.equal(toggle.textContent, index % 2 === 0 ? 'EN' : 'FR');
  }
  assert.equal(oldToggle.textContent, 'FR');
  assert.equal(languageChanges.length, 11);
  assert.equal(window.translate('title'), 'Hello');
  assert.equal(listeners.length, 1);
});
