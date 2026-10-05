const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const { requiresTextForSave } = require('../services/save-validation');

const source = fs.readFileSync(
  path.join(__dirname, '../public/dashboard.js'),
  'utf8',
);
function controls(user) {
  const create = ({ name, value, required }) => {
    const field = new Element('label');
    const input = new Element('input');
    Object.assign(input, { name, value, required });
    field.append(input);
    return field;
  };
  const build = vm.runInNewContext(
    source.slice(
      source.indexOf('function createProfileForm('),
      source.indexOf('function createDangerZone('),
    ) + '\ncreateProfileForm',
    {
      document: { createElement: (tag) => new Element(tag) },
      window: {},
      CMCENUtils: { requiresTextForSave },
      createProfileField: create,
      createProfileSelect: create,
      profileSelectOptions: {
        status: [],
        affiliationElement: [],
        preferredLanguage: [],
      },
      createDetailRow: () => new Element('div'),
      formatContentAreas: () => '',
      translate: (key) => key,
      setProfileFormMode() {},
      syncProfileTradeOtherVisibility() {},
    },
  );
  return Object.fromEntries(
    build(user)
      .querySelectorAll('input')
      .map((input) => [input.name, input]),
  );
}

test('account editor relaxes descriptive required controls only for developer saves or existing blanks', () => {
  const profile = {
    firstName: 'Dot',
    lastName: 'Assistant',
    status: 'regular',
    affiliationElement: 'army',
    address: {
      line1: 'Street',
      city: 'Ottawa',
      country: 'Canada',
      stateProvince: 'Ontario',
      postalCode: 'K1A 0A1',
    },
  };
  for (const role of ['developer', 'administrator', 'subscriber']) {
    const inputs = controls({ ...profile, role });
    for (const name of [
      'firstName',
      'lastName',
      'address.line1',
      'address.city',
      'status',
      'affiliationElement',
    ])
      assert.equal(inputs[name].required, role !== 'developer');
    assert.equal(inputs.preferredLanguage.required, true);
  }
  assert.equal(
    controls({ ...profile, role: 'subscriber', lastName: '' }).lastName
      .required,
    false,
  );
});
