const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup(document) {
  let locale = 'en';
  const window = {
    CMCENUtils: { focusInvalidField: (control) => control.focus() },
    translate: (key, values) =>
      `${locale}:${key}${values ? JSON.stringify(values) : ''}`,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/shared-forms.js'), 'utf8'),
    { window, document },
  );
  return {
    forms: window.CMCENForms,
    language: (value) => {
      locale = value;
    },
  };
}

function control(name, validity = { valid: true }) {
  const error = { id: `${name}-error`, textContent: '' };
  const attributes = { 'aria-describedby': `${name}-help` };
  return {
    name,
    type: 'text',
    tagName: 'INPUT',
    value: 'keep this',
    validity,
    error,
    attributes,
    willValidate: true,
    focused: 0,
    closest: () => ({ querySelector: () => error }),
    getAttribute: (key) => attributes[key] || null,
    setAttribute: (key, value) => {
      attributes[key] = value;
    },
    removeAttribute: (key) => {
      delete attributes[key];
    },
    matches() {
      return this.disabled === true;
    },
    focus() {
      this.focused++;
    },
  };
}

function form(controls) {
  return {
    elements: controls,
    querySelectorAll: () =>
      controls.filter((item) => item.attributes['aria-invalid'] === 'true'),
    querySelector() {
      return this.querySelectorAll()[0];
    },
  };
}

test('shows all native errors, focuses the first, and retains help associations', () => {
  const { forms } = setup();
  const first = control('name', { valid: false, valueMissing: true });
  const second = control('email', { valid: false, typeMismatch: true });
  second.type = 'email';
  assert.equal(forms.validate(form([first, second])), false);
  assert.equal(first.error.textContent, 'en:validation_field_required');
  assert.equal(second.error.textContent, 'en:validation_email_invalid');
  assert.equal(first.attributes['aria-describedby'], 'name-help name-error');
  assert.equal(first.focused, 1);
  assert.equal(second.focused, 0);
  assert.equal(first.value, 'keep this');
});

test('dynamic fields keep labels separate from errors and apply native constraints and select values', () => {
  const document = {
    createElement: (tagName) => ({
      tagName,
      dataset: {},
      children: [],
      attributes: {},
      append(...children) {
        this.children.push(...children);
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
    }),
  };
  const { forms } = setup(document);
  const { field, control } = forms.createField({
    id: 'test-email',
    name: 'email',
    labelKey: 'email',
    type: 'email',
    required: true,
    maxLength: 254,
  });
  assert.equal(control.type, 'email');
  assert.equal(control.required, true);
  assert.equal(control.maxLength, 254);
  assert.equal(control.attributes['aria-labelledby'], field.children[0].id);
  assert.notEqual(field.children[2].id, field.children[0].id);
  const select = forms.createField({
    id: 'test-role',
    name: 'role',
    label: 'Role',
    options: [
      { value: 'one', label: 'One' },
      { value: 'two', labelKey: 'two' },
    ],
    value: 'two',
  }).control;
  assert.equal(select.tagName, 'select');
  assert.equal(select.value, 'two');
  assert.equal(select.children[1].dataset.i18n, 'two');
});

test('revalidation clears corrected errors without moving focus and translates remaining errors', () => {
  const page = setup();
  const first = control('name', { valid: false, valueMissing: true });
  const second = control('year', { valid: false, rangeUnderflow: true });
  second.min = '1900';
  const fields = form([first, second]);
  page.forms.validate(fields);
  first.validity = { valid: true };
  page.language('fr');
  assert.equal(page.forms.validate(fields, { focus: false }), false);
  assert.equal(first.error.textContent, '');
  assert.equal(first.attributes['aria-invalid'], undefined);
  assert.equal(first.attributes['aria-describedby'], 'name-help');
  assert.equal(first.focused, 1);
  assert.equal(second.focused, 0);
  assert.equal(
    second.error.textContent,
    'fr:validation_range_underflow{"min":"1900"}',
  );
  second.validity = { valid: true };
  assert.equal(page.forms.validate(fields), true);
});

test('keeps page-owned custom validity and validates visible picker targets in DOM order', () => {
  const { forms } = setup();
  const picker = control('start');
  picker.willValidate = false;
  const title = control('title', { valid: false, customError: true });
  title.validationMessage = 'A title is required';
  const fields = form([picker, title]);
  assert.equal(
    forms.validate(fields, {
      errors: [{ control: picker, message: 'Choose a future date' }],
    }),
    false,
  );
  assert.equal(picker.error.textContent, 'Choose a future date');
  assert.equal(picker.focused, 1);
  assert.equal(title.focused, 0);
  assert.equal(title.error.textContent, 'A title is required');
  forms.clearErrors(fields);
  assert.equal(title.validationMessage, 'A title is required');
  assert.equal(title.attributes['aria-invalid'], undefined);
});

test('ignores disabled fields and custom pickers, including previously displayed errors', () => {
  const { forms } = setup();
  const field = control('date', { valid: false, valueMissing: true });
  forms.setError(field, 'Choose a date');
  field.disabled = true;
  field.willValidate = false;
  assert.equal(
    forms.validate(form([field]), {
      errors: [{ control: field, message: 'Choose a date' }],
    }),
    true,
  );
  assert.equal(field.error.textContent, '');
  assert.equal(field.focused, 0);
});
