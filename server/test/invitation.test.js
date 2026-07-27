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

test('continues to require a completed profile for member accounts', async () => {
  const user = new User({
    accountType: 'member',
    username: 'member@example.test',
    email: 'member@example.test',
    password: 'member-password',
  });

  await assert.rejects(user.validate(), (error) => {
    assert.ok(error?.errors.firstName);
    assert.ok(error?.errors['address.line1']);
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
