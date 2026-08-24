const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const navigationSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'index.js'),
  'utf8',
);

test('shows the protected Contact quick link only to signed-in members', () => {
  assert.match(
    navigationSource,
    /<li data-auth-required hidden>\s*<a href="\/contact\.html" data-i18n="menu_contact">/u,
  );
});
