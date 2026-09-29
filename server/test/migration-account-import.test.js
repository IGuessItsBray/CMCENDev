const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SOURCE,
  validateSource,
  planImport,
  buildAccount,
  mapKey,
  identityHash,
} = require('../scripts/migration/lib/account-import');
const User = require('../models/User');

function rows() {
  return validateSource({
    source: SOURCE,
    users: [
      {
        id: 42,
        email: 'Legacy@Example.org',
        displayName: 'Legacy Member',
        status: '0',
        password: 'must-not-copy',
        role: 'developer',
      },
    ],
  });
}

test('import allowlist creates resettable subscribers without copying credentials or privileges', async () => {
  const [row] = rows();
  const first = buildAccount(row, '507f1f77bcf86cd799439011');
  const second = buildAccount(row, '507f1f77bcf86cd799439012');
  assert.notEqual(first.password, second.password);
  assert.ok(first.password.length >= 64);
  assert.equal(first.username, 'legacy@example.org');
  assert.equal(first.role, 'subscriber');
  assert.equal(first.accountType, 'member');
  assert.equal(first.emailVerification.required, false);
  assert.equal(first.emailVerification.verified, false);
  const user = new User(first);
  await user.validate();
  assert.equal(user.emailSubscriptions.weeklyBrief.subscribed, false);
  assert.equal(user.emailSubscriptions.newsAnnouncements.subscribed, false);
  assert.equal(user.invitation.tokenHash, '');
  assert.equal(user.passwordReset.tokenHash, '');
});

test('existing email or username collisions are held without attaching source ownership', () => {
  for (const existing of [
    { email: 'LEGACY@example.org' },
    { username: 'legacy@example.org' },
  ]) {
    const plan = planImport(rows(), [{ _id: 'admin', ...existing }], []);
    assert.equal(plan[0].state, 'conflict');
  }
});

test('completed mappings preserve changed accounts; interrupted imports recover without replacing passwords', () => {
  const [row] = rows();
  const mapping = {
    _id: mapKey(row),
    source: SOURCE,
    sourceUserId: 42,
    emailHash: identityHash(row),
    userId: 'mapped',
    state: 'complete',
  };
  assert.equal(
    planImport(
      [row],
      [{ _id: 'mapped', email: 'new@example.org' }],
      [mapping],
    )[0].state,
    'existing',
  );
  assert.equal(planImport([row], [], [mapping])[0].state, 'conflict');
  mapping.state = 'pending';
  assert.equal(planImport([row], [], [mapping])[0].state, 'create');
  const user = { _id: 'mapped', ...buildAccount(row, 'mapped') };
  assert.equal(planImport([row], [user], [mapping])[0].state, 'recover');
  user.role = 'developer';
  assert.equal(planImport([row], [user], [mapping])[0].state, 'conflict');
});

test('invalid source identities fail before database work', () => {
  assert.throws(() => validateSource({ source: 'other', users: [] }));
  const input = {
    source: SOURCE,
    users: [{ id: 42, email: 'not-email', status: 0 }],
  };
  assert.throws(() => validateSource(input));
});
