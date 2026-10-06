const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Execute the archive editor's publication controls independently of its media
// picker and API initialization. Use one context to model repeated renders.
function editor() {
  const source = fs.readFileSync(
    path.join(__dirname, '../public/archive-staff-review.js'), 'utf8',
  );
  const controls = source.slice(
    source.indexOf('const dateChoice = document.createElement("select")'),
    source.indexOf('const publish = button(ui("Publish", "Publier")'),
  );
  assert.ok(controls.includes('actions.append(customDate)'));
  function node() {
    return {
      children: [],
      value: '',
      append(child) { this.children.push(child); },
      setAttribute() {},
      addEventListener(event, handler) { this[event] = handler; },
    };
  }
  const context = vm.createContext({
    document: { createElement: node },
    node,
    ui: (english) => english,
    dateText: (date) => date,
  });
  vm.runInContext('const publicationChoices = new Map()', context);
  return function render({
    id = 'first', type = 'page', original = '2010-02-03T10:00:00Z',
  } = {}) {
    context.record = { id, type, publicationDate: { originalPublishedAt: original } };
    context.actions = node();
    vm.runInContext(`{ ${controls} }`, context);
    const [dropdown, customDate] = context.actions.children;
    return { dropdown, customDate };
  };
}

test('archive editor defaults valid originals and keeps original/current/custom choices', () => {
  const { dropdown, customDate } = editor()();
  assert.equal(dropdown.value, 'original');
  assert.deepEqual(Array.from(dropdown.children, (option) => option.value), ['', 'original', 'now', 'custom']);
  assert.equal(customDate.hidden, true);
});

test('archive editor defaults missing, invalid, and future originals to now', () => {
  const render = editor();
  for (const original of [null, '', 'invalid', '2099-01-01T00:00:00Z', 123]) {
    const { dropdown } = render({ original });
    assert.equal(dropdown.value, 'now');
    assert.deepEqual(Array.from(dropdown.children, (option) => option.value), ['', 'now', 'custom']);
  }
});

test('archive editor remembers explicit current and custom choices per record', () => {
  const render = editor();
  const first = render();
  first.dropdown.value = 'now';
  first.dropdown.change();
  assert.equal(render().dropdown.value, 'now');
  const second = render({ id: 'second' });
  assert.equal(second.dropdown.value, 'original');
  second.dropdown.value = 'custom';
  second.dropdown.change();
  second.customDate.value = '2015-01-02T12:34';
  second.customDate.input();
  assert.equal(render().dropdown.value, 'now');
  const restored = render({ id: 'second' });
  assert.equal(restored.dropdown.value, 'custom');
  assert.equal(restored.customDate.value, '2015-01-02T12:34');
  assert.equal(restored.customDate.hidden, false);
  assert.equal(render({ id: 'second', type: 'archiveDocument' }).dropdown.value, 'original');
  assert.equal(render({ id: 'third', original: null }).dropdown.value, 'now');
});

test('archive editor falls back if an explicitly selected original disappears', () => {
  const render = editor();
  const first = render();
  first.dropdown.value = 'original';
  first.dropdown.change();
  assert.equal(render({ original: null }).dropdown.value, 'now');
});
