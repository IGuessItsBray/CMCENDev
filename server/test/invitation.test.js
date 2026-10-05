const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../models/User');

test('allows an invited account before the member profile is complete', async () => {
  const user = new User({
    accountType: 'invited',
    username: 'invitee@example.test',
    email: 'invitee@example.test',
    password: 'temporary-password',
    firstName: 'Invitee',
    lastName: 'Example',
  });

  await assert.doesNotReject(user.validate());
});

test('stores incomplete descriptive profiles while retaining credential invariants', async () => {
  const user = new User({
    accountType: 'member',
    username: 'member@example.test',
    email: 'member@example.test',
    password: 'member-password',
  });

  await assert.doesNotReject(user.validate());
  user.username = '';
  user.email = '';
  await assert.rejects(user.validate(), (error) => {
    assert.ok(error?.errors.username);
    assert.ok(error?.errors.email);
    return true;
  });
});

test('allows an activated invite to complete its profile later', async () => {
  const user = new User({
    accountType: 'member',
    profileComplete: false,
    username: 'activated@example.test',
    email: 'activated@example.test',
    password: 'member-password',
    firstName: 'Activated',
    lastName: 'Invitee',
  });

  await assert.doesNotReject(user.validate());
});
