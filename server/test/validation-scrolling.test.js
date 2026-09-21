const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup({ headerHeight = 0, panel = false, viewport } = {}) {
  const frames = [];
  const listeners = {};
  const pageScrolls = [];
  const panelScrolls = [];
  const root = { scrollTop: 1800 };
  const body = { parentElement: root };
  const container = {
    parentElement: body,
    scrollTop: 800,
    scrollHeight: 2400,
    clientHeight: 400,
    clientTop: 0,
    style: { overflowY: 'auto' },
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo(options) {
      panelScrolls.push(options.top);
      this.scrollTop = options.top;
    },
  };
  const headers = headerHeight
    ? [
        {
          style: { position: 'sticky', top: '0px' },
          contains: () => false,
          getBoundingClientRect: () => ({
            height: headerHeight,
            left: 0,
            right: 1200,
          }),
        },
      ]
    : [];
  const document = {
    scrollingElement: root,
    documentElement: root,
    body,
    activeElement: body,
    getElementById: () => null,
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    querySelectorAll: (selector) =>
      selector.includes('.site-header') ? headers : [],
  };
  const window = {
    innerHeight: 800,
    visualViewport: viewport,
    addEventListener() {},
    getComputedStyle: (element) => element.style || {},
    requestAnimationFrame: (callback) => frames.push(callback),
    scrollTo(options) {
      pageScrolls.push(options.top);
      root.scrollTop = options.top;
      assert.equal(options.behavior, 'instant');
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/app-utils.js'), 'utf8'),
    {
      window,
      document,
      fetch: async () => ({ ok: false }),
      HTMLImageElement: class {},
      MutationObserver: class {
        observe() {}
      },
    },
  );
  const scroller = panel ? container : root;
  function control(start) {
    const rect = () => ({
      top: (panel ? 100 : 0) + start - scroller.scrollTop,
      bottom: (panel ? 100 : 0) + start - scroller.scrollTop + 42,
      left: 300,
      right: 600,
      height: 42,
    });
    const label = {
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ top: rect().top - 30 }),
    };
    return {
      parentElement: panel ? container : body,
      isConnected: true,
      validity: { valid: false },
      labels: [label],
      getAttribute: () => null,
      getClientRects: () => [rect()],
      getBoundingClientRect: rect,
      closest: () => null,
      focus(options) {
        assert.equal(options.preventScroll, true);
        document.activeElement = this;
      },
    };
  }
  return {
    focus: window.CMCENUtils.focusInvalidField,
    control,
    document,
    pageScrolls,
    panelScrolls,
    invalid: (target) => listeners.invalid({ target }),
    flush: () => {
      while (frames.length) frames.shift()();
    },
  };
}

test('returns to the page top when the invalid field and label fit there', () => {
  const page = setup({ headerHeight: 120 });
  const field = page.control(300);
  page.focus(field);
  assert.equal(page.document.activeElement, field);
  assert.deepEqual(page.pageScrolls, [0]);
});

test('deep fields retain generous label headroom below the sticky header', () => {
  const page = setup({ headerHeight: 180 });
  const field = page.control(1600);
  page.focus(field);
  const labelTop = field.labels[0].getBoundingClientRect().top;
  assert.ok(labelTop - 180 >= 180);
  assert.ok(field.getBoundingClientRect().bottom < 800);
  assert.equal(page.pageScrolls.length, 1);
});

test('scrolls a nested panel without moving the page behind it', () => {
  const page = setup({ panel: true, headerHeight: 180 });
  const field = page.control(1200);
  page.focus(field);
  assert.deepEqual(page.pageScrolls, []);
  assert.equal(page.panelScrolls.length, 1);
  assert.ok(field.labels[0].getBoundingClientRect().top >= 200);
  page.focus(page.control(100));
  assert.equal(page.panelScrolls.at(-1), 0);
});

test('respects the smaller visible viewport when a keyboard is open', () => {
  const page = setup({
    headerHeight: 120,
    viewport: { offsetTop: 50, height: 320 },
  });
  const field = page.control(1600);
  page.focus(field);
  assert.ok(field.labels[0].getBoundingClientRect().top > 120);
  assert.ok(field.getBoundingClientRect().bottom < 370);
});

test('native validation repositions only its focused field once per validation batch', () => {
  const page = setup();
  const first = page.control(1500);
  const second = page.control(1900);
  page.invalid(first);
  page.invalid(second);
  page.document.activeElement = first;
  page.flush();
  assert.equal(page.pageScrolls.length, 1);
  assert.equal(page.document.activeElement, first);
});

test('passive validity checks and detached controls do not move the page', () => {
  const page = setup();
  const field = page.control(1500);
  page.invalid(field);
  page.flush();
  assert.deepEqual(page.pageScrolls, []);
  field.isConnected = false;
  page.document.activeElement = field;
  page.invalid(field);
  page.flush();
  assert.deepEqual(page.pageScrolls, []);
});
