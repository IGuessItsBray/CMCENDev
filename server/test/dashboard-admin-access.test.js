const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { getUserPermissions } = require('../config/permissions');

const source = fs.readFileSync(
  path.join(__dirname, '../public/dashboard.js'),
  'utf8',
);
const gate = source.slice(
  source.indexOf('function canAccessAdministration('),
  source.indexOf('function renderDashboard('),
);
const canAccess = vm.runInNewContext(`${gate}\ncanAccessAdministration`);
const account = (role, customRoles = []) => ({
  role,
  permissions: getUserPermissions({ role, customRoles }),
});

test('personal-only accounts do not receive the Administration entry point', () => {
  for (const role of ['ghost', 'subscriber', 'contributor', 'author'])
    assert.equal(canAccess(account(role)), false, role);
  assert.equal(canAccess(null), false);
  assert.equal(canAccess({ role: 'administrator' }), false);
  assert.equal(canAccess({ permissions: { canManageRoles: 'true' } }), false);
});

test('staff and custom administrative permissions receive the Administration entry point', () => {
  for (const role of ['editor', 'administrator', 'developer'])
    assert.equal(canAccess(account(role)), true, role);
  for (const permission of [
    'roles.manage',
    'users.read',
    'timers.manage',
    'content.review',
    'subscriptions.manage',
    'audit.view',
  ])
    assert.equal(
      canAccess(account('subscriber', [{ permissions: [permission] }])),
      true,
      permission,
    );
  assert.equal(
    canAccess(
      account('subscriber', [
        { permissions: ['content.create', 'media.upload'] },
      ]),
    ),
    false,
  );
});
