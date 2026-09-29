const test = require('node:test');
const assert = require('node:assert/strict');
const { planAccounts } = require('../scripts/migration/lib/account-plan');

const user = (id) => ({
  id,
  emailHash: String(id).repeat(64),
  loginHash: 'a'.repeat(64),
  emailPlausible: true,
  status: '0',
});
const audit = () => ({
  users: [user(1)],
  posts: [{ authorId: 1 }],
  comments: [
    { userId: 1 },
    { userId: 0, emailHash: '1'.repeat(64) },
    { userId: 99 },
  ],
});

test('planning requires a destination check and never claims guest ownership', () => {
  const result = planAccounts(audit());
  assert.equal(result.destinationChecked, false);
  assert.equal(result.activationReady, false);
  assert.equal(result.users[0].destinationUserId, null);
  assert.equal(result.users[0].registeredSourceComments, 1);
  assert.equal(result.users[0].status, 'awaiting-destination-check');
  assert.equal(result.summary.guestComments, 1);
  assert.deepEqual(result.summary.missingCommentUserIds, [99]);
  assert.equal(JSON.stringify(result).includes('emailHash'), false);
});

test('destination collisions require review rather than automatic linking', () => {
  const result = planAccounts(audit(), [
    {
      id: 'existing-admin',
      emailHash: '1'.repeat(64),
      loginHash: 'b'.repeat(64),
    },
  ]);
  assert.deepEqual(result.users[0].holds, ['destination-collision-review']);
  assert.equal(result.users[0].destinationUserId, null);
  assert.equal(
    planAccounts(audit(), []).users[0].status,
    'ready-for-import-preparation',
  );
});

test('malformed IDs fail closed; duplicate identities and unusual statuses are held', () => {
  const input = audit();
  input.users.push(user(1));
  assert.throws(() => planAccounts(input), /duplicate/);
  input.users[1] = { ...user(2), emailHash: '1'.repeat(64), status: '1' };
  const result = planAccounts(input);
  assert.ok(
    result.users.every((r) => r.holds.includes('duplicate-source-email')),
  );
  assert.ok(
    result.users.every((r) => r.holds.includes('duplicate-source-login')),
  );
  assert.ok(result.users[1].holds.includes('source-status-review'));
});
