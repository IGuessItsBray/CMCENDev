const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const script = fs.readFileSync(
  path.join(__dirname, '../public/dashboard-next-theme.js'),
  'utf8',
);

function setup({ saved = null, dark = false, blocked = false } = {}) {
  const documentEvents = {};
  const windowEvents = {};
  const attributes = {};
  const changes = [];
  const root = { dataset: {} };
  let click;
  let systemChange;
  let ready = false;
  const button = {
    setAttribute: (key, value) => {
      attributes[key] = value;
    },
    addEventListener: (key, handler) => {
      click = handler;
    },
  };
  const system = {
    matches: dark,
    addEventListener: (key, handler) => {
      systemChange = handler;
    },
  };
  const window = {
    matchMedia: () => system,
    addEventListener: (key, handler) => {
      windowEvents[key] = handler;
    },
  };
  vm.runInNewContext(script, {
    window,
    document: {
      documentElement: root,
      getElementById: () => (ready ? button : null),
      addEventListener: (key, handler) => {
        documentEvents[key] = handler;
      },
      dispatchEvent: (event) => changes.push(event.detail.theme),
    },
    localStorage: {
      getItem(key) {
        assert.equal(key, 'theme');
        if (blocked) throw Error('Unavailable');
        return saved;
      },
      setItem(key, value) {
        assert.equal(key, 'theme');
        if (blocked) throw Error('Unavailable');
        saved = value;
      },
    },
    CustomEvent: class {
      constructor(type, options) {
        Object.assign(this, options);
      }
    },
  });
  return {
    attributes,
    changes,
    root,
    window,
    ready() {
      ready = true;
      documentEvents.DOMContentLoaded();
    },
    toggle: () => click(),
    saved: () => saved,
    system(value) {
      system.matches = value;
      systemChange();
    },
    storage(value, key = 'theme') {
      saved = value;
      windowEvents.storage({ key });
    },
    language: () => documentEvents.languagechange(),
  };
}

test('applies the public theme preference before the DOM is ready', () => {
  const page = setup({ saved: 'dark', dark: false });
  assert.equal(page.root.dataset.theme, 'dark');
  page.ready();
  assert.equal(page.attributes['aria-pressed'], 'true');
  page.toggle();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.saved(), 'light');
  assert.equal(page.changes.at(-1), 'light');
  page.system(true);
  assert.equal(page.root.dataset.theme, 'light');
});

test('follows system changes until an explicit preference is chosen', () => {
  const page = setup({ saved: 'invalid' });
  page.ready();
  page.system(true);
  assert.equal(page.root.dataset.theme, 'dark');
  page.toggle();
  page.system(true);
  assert.equal(page.root.dataset.theme, 'light');
});

test('synchronizes external preferences and resumes system mode when cleared', () => {
  const page = setup({ saved: 'light', dark: true });
  page.ready();
  page.storage('dark');
  assert.equal(page.root.dataset.theme, 'dark');
  page.storage('light');
  assert.equal(page.root.dataset.theme, 'light');
  page.storage(null, null);
  assert.equal(page.root.dataset.theme, 'dark');
});

test('blocked storage still permits a session choice and localized toggle labels', () => {
  const page = setup({ dark: true, blocked: true });
  page.ready();
  page.toggle();
  assert.equal(page.root.dataset.theme, 'light');
  page.system(true);
  assert.equal(page.root.dataset.theme, 'light');
  page.window.translate = () => 'Passer au mode sombre';
  page.language();
  assert.equal(page.attributes['aria-label'], 'Passer au mode sombre');
});
