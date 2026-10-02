const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Element: BaseElement } = require('./helpers/dashboard-dom');

function setup() {
  class Element extends BaseElement {
    constructor(tag) {
      super(tag);
      this.style.setProperty = (key, value) => {
        this.style[key] = value;
      };
      this.classList = {
        contains: (name) => this.className.split(' ').includes(name),
        toggle: (name, enabled) => {
          const names = new Set(this.className.split(' '));
          if (enabled) names.add(name);
          else names.delete(name);
          this.className = [...names].join(' ');
        },
      };
    }
    getBoundingClientRect() {
      return { left: 10, bottom: 30 };
    }
    dispatchEvent(event) {
      void this.fire(event.type);
      return true;
    }
    remove() {
      this.isConnected = false;
    }
  }
  const document = new EventTarget();
  document.createElement = (tag) => new Element(tag);
  const window = new EventTarget();
  window.innerWidth = 1000;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/color-picker.js'), 'utf8'),
    { document, window, Event, CustomEvent, AbortController },
  );
  const counts = () => [
    getEventListeners(document, 'click').length,
    ...['resize', 'scroll', 'cmcen:picker-open'].map(
      (type) => getEventListeners(window, type).length,
    ),
  ];
  return { window, document, counts, create: window.CMCENColorPicker.create };
}

test('color picker destroy is idempotent and releases every global listener', () => {
  const { create, counts } = setup();
  assert.deepEqual(counts(), [0, 0, 0, 0]);
  for (let index = 0; index < 10; index++) {
    const picker = create();
    assert.deepEqual(counts(), [1, 1, 1, 1]);
    picker.destroy();
    picker.destroy();
    assert.equal(picker.isConnected, false);
    assert.deepEqual(counts(), [0, 0, 0, 0]);
  }
});

test('destroying one picker preserves another picker and its input behavior', async () => {
  const { create, counts, document } = setup();
  const old = create();
  const current = create({ value: '#abcdef' });
  old.destroy();
  assert.deepEqual(counts(), [1, 1, 1, 1]);
  const preview = current.querySelector('.cmcen-color-picker-preview');
  await preview.fire('click', { stopPropagation() {} });
  assert.equal(preview.getAttribute('aria-expanded'), 'true');
  document.dispatchEvent(new Event('click'));
  assert.equal(preview.getAttribute('aria-expanded'), 'false');
  const swatch = current.querySelector('.cmcen-color-picker-swatch');
  await swatch.fire('click');
  assert.equal(current.querySelector('input').value, '#171c32');
  current.destroy();
  assert.deepEqual(counts(), [0, 0, 0, 0]);
});
