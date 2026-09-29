const { test } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const { SOURCE, mapKey } = require('../scripts/migration/lib/account-import');
const {
  planProfile,
  profileRows,
  profileFilter,
} = require('../scripts/migration/lib/account-profile');

function example() {
  const row = {
    sourceUserId: 42,
    meta: {
      first_name: ['Alice'],
      last_name: ['Example'],
      mepr_affiliation_element: ['air-force'],
      locale: ['fr_CA'],
      Phone: ['555-0100'],
    },
  };
  const user = {
    _id: 'mapped',
    firstName: 'Edited',
    preferredLanguage: 'en',
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  };
  const mapping = {
    _id: mapKey(row),
    source: SOURCE,
    sourceUserId: 42,
    state: 'complete',
    userId: 'mapped',
    completedAt: new Date(1100),
  };
  return { row, user, mapping };
}

test('fills mapped fields and untouched default language while preserving existing profile values', async () => {
  const { row, user, mapping } = example();
  const plan = await planProfile(row, user, mapping, User);
  assert.deepEqual(plan.set, {
    lastName: 'Example',
    affiliationElement: 'air_force',
    phone: '555-0100',
    preferredLanguage: 'fr',
  });
  assert.ok(
    plan.issues.some(
      (i) => i.field === 'firstName' && i.reason === 'existing-value-preserved',
    ),
  );
  user.updatedAt = new Date(2000);
  assert.equal(
    (await planProfile(row, user, mapping, User)).set.preferredLanguage,
    undefined,
  );
});

test('rejects pending or wrong mappings and dangerous fields', async () => {
  const { row, user, mapping } = example();
  mapping.state = 'pending';
  const unsafe = {
    sourceUserId: 42,
    meta: {},
    legacyData: {
      account: { ID: '42', user_pass: 'old-password-hash' },
      metadata: {},
    },
  };
  assert.throws(() => profileRows({ source: SOURCE, users: [unsafe] }));
  await assert.rejects(() => planProfile(row, user, mapping, User));
  assert.throws(() =>
    profileRows({
      source: SOURCE,
      users: [{ sourceUserId: 42, meta: { role: ['developer'] } }],
    }),
  );
});

test('holds invalid or conflicting values instead of truncating or guessing', async () => {
  const { row, user, mapping } = example();
  row.meta.last_name = ['a'.repeat(81)];
  row.meta.Phone = ['one', 'two'];
  const plan = await planProfile(row, user, mapping, User);
  assert.equal(plan.set.lastName, undefined);
  assert.equal(plan.set.phone, undefined);
  assert.ok(plan.issues.some((i) => i.reason === 'invalid-source-value'));
  assert.ok(plan.issues.some((i) => i.reason === 'conflicting-source-values'));
  assert.deepEqual(profileFilter(user, ['lastName']).lastName, {
    $exists: false,
  });
});

test('preserves legacy unit text beyond the former 160-character limit', async () => {
  const { row, user, mapping } = example();
  row.meta.mepr_current_unit = ['U'.repeat(183)];
  const plan = await planProfile(row, user, mapping, User);
  assert.equal(plan.set.currentUnit, 'U'.repeat(183));
  row.meta.mepr_current_unit = ['U'.repeat(257)];
  assert.equal(
    (await planProfile(row, user, mapping, User)).set.currentUnit,
    undefined,
  );
});
