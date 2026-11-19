const assert = require('node:assert/strict');
const test = require('node:test');
const organizer = require('../public/event-organizer');

class Control extends EventTarget {
  value = '';
  setCustomValidity(message) {
    this.validationMessage = message;
  }
}

test('Other reopens saved names and never sends hidden names with preset selections', () => {
  const select = new Control();
  const input = new Control();
  const container = {};
  const control = organizer.bind(select, input, container, (key) => key);
  control.set('CAFCYBERCOM');
  assert.equal(select.value, organizer.other);
  assert.equal(container.hidden, false);
  assert.equal(input.required, true);
  assert.equal(input.maxLength, 100);
  assert.equal(control.value(), 'CAFCYBERCOM');

  input.value = '  ';
  input.dispatchEvent(new Event('input'));
  assert.equal(input.validationMessage, 'event_organizing_entity_invalid');
  assert.throws(control.value, /event_organizing_entity_invalid/);
  input.value = 'CAFCYBERCOM';
  select.value = 'foundation';
  select.dispatchEvent(new Event('change'));
  assert.equal(container.hidden, true);
  assert.equal(input.disabled, true);
  assert.equal(input.required, false);
  assert.equal(control.value(), 'foundation');

  control.set('');
  assert.equal(input.value, '');
  assert.equal(control.value(), '');
});

test('public labels translate only the four presets and preserve custom names literally', () => {
  assert.deepEqual(organizer.presets, ['branch', 'association', 'foundation', 'museum']);
  assert.equal(organizer.label('museum', (key) => `localized ${key}`), 'localized entity_museum');
  assert.equal(organizer.label('CAFCYBERCOM', () => { throw new Error('custom names are not translation keys'); }), 'CAFCYBERCOM');
});
