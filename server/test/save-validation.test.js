const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { requiresTextForSave } = require('../services/save-validation');

const source = fs.readFileSync(
  path.join(__dirname, '../public/app-utils.js'),
  'utf8',
);
const browserRule = vm.runInNewContext(
  source.slice(
    source.indexOf('  function requiresTextForSave('),
    source.indexOf('  function createLoadingSpinner('),
  ) + '\nrequiresTextForSave',
);

test('browser and server save rules use actor role and preserve previously blank text', () => {
  for (const rule of [requiresTextForSave, browserRule]) {
    for (const role of ['subscriber', 'administrator', 'editor', 'developer']) {
      const actor = { role, permissions: { canManageUsers: true } };
      assert.equal(rule(actor), role !== 'developer');
      assert.equal(rule(actor, 'Existing'), role !== 'developer');
      assert.equal(
        rule(actor, { en: 'Existing', fr: '' }),
        role !== 'developer',
      );
      assert.equal(rule(actor, ''), false);
      assert.equal(rule(actor, { en: '', fr: '' }), false);
    }
    assert.equal(rule(null), true);
  }
});
