const assert = require('node:assert/strict');
const test = require('node:test');

const { USER_ROLES, ROLE_LEVELS } = require('../config/roles');
const { getUserPermissions } = require('../config/permissions');

test('Internal Beta is a built-in role with subscriber permissions', () => {
  const betaPermissions = getUserPermissions({ role: 'internal_beta' });
  const subscriberPermissions = getUserPermissions({ role: 'subscriber' });

  assert.equal(USER_ROLES.includes('internal_beta'), true);
  assert.equal(ROLE_LEVELS.internal_beta, ROLE_LEVELS.subscriber);
  assert.deepEqual(betaPermissions, subscriberPermissions);
});
