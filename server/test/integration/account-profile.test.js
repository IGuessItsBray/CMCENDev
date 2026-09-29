const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const execFile = require('node:util').promisify(
  require('node:child_process').execFile,
);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../models/User');
const {
  SOURCE,
  mapKey,
  buildAccount,
} = require('../../scripts/migration/lib/account-import');
const {
  profileFilter,
} = require('../../scripts/migration/lib/account-profile');

test('profile backfill preserves credentials and edits, is repeatable, and guards concurrent edits', async () => {
  const mongo = await MongoMemoryServer.create();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cmcen-profile-test-'));
  try {
    await mongoose.connect(mongo.getUri());
    await User.init();
    const user = await User.create(
      buildAccount(
        { email: 'profile@example.org', accountName: 'Profile User' },
        new mongoose.Types.ObjectId(),
      ),
    );
    const before = await User.collection.findOne({ _id: user._id });
    const row = {
      sourceUserId: 42,
      meta: {
        first_name: ['Alice'],
        last_name: ['Example'],
        'mepr-address-one': ['12 Example Street'],
        mepr_status: ['retired'],
        locale: ['fr_CA'],
      },
    };
    await mongoose.connection.db.collection('legacyaccountmaps').insertOne({
      _id: mapKey(row),
      source: SOURCE,
      sourceUserId: 42,
      userId: user._id,
      state: 'complete',
      completedAt: new Date(),
    });
    row.meta.description = ['Legacy biography'];
    row.meta.user_url = ['https://example.org'];
    row.meta.facebook = ['https://www.facebook.com/example'];
    row.legacyData = {
      account: { ID: '42', user_registered: '2001-01-01 12:00:00' },
      metadata: {
        billing_phone: ['555-0101'],
        wp_capabilities: ['historical role evidence'],
      },
    };
    const input = path.join(temp, 'profiles.json');
    await fs.writeFile(input, JSON.stringify({ source: SOURCE, users: [row] }));
    async function run(dir, apply) {
      await fs.mkdir(dir, { recursive: true });
      return execFile(
        process.execPath,
        [
          'scripts/migration/backfill-account-profiles.js',
          '--input',
          input,
          '--output',
          dir,
          ...(apply
            ? ['--apply']
            : ['--backup', path.join(dir, 'profiles-backup.ejson')]),
        ],
        {
          cwd: path.join(__dirname, '../..'),
          env: {
            ...process.env,
            MONGO_URI: mongo.getUri(),
            APP_BASE_URL: 'https://staging.cefamily.ca',
          },
        },
      );
    }
    const first = path.join(temp, 'first');
    await run(first, false);
    await run(first, true);
    const after = await User.collection.findOne({ _id: user._id });
    assert.equal(after.firstName, 'Alice');
    assert.equal(after.biography, 'Legacy biography');
    assert.equal(
      after.socialLinks.facebook,
      'https://www.facebook.com/example',
    );
    assert.equal(
      await mongoose.connection.db
        .collection('legacyaccountprofiles')
        .countDocuments(),
      1,
    );
    assert.equal(after.preferredLanguage, 'fr');
    assert.equal(after.address.line1, '12 Example Street');
    for (const key of [
      'password',
      'role',
      'email',
      'username',
      'profileComplete',
      'emailVerification',
      'emailSubscriptions',
      'passwordReset',
      'invitation',
    ])
      assert.deepEqual(after[key], before[key]);
    const repeat = path.join(temp, 'repeat');
    await run(repeat, false);
    await run(repeat, true);
    assert.equal(
      await mongoose.connection.db
        .collection('legacyaccountprofiles')
        .countDocuments(),
      1,
    );
    assert.deepEqual(await User.collection.findOne({ _id: user._id }), after);
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { firstName: 'My Edit', updatedAt: new Date() } },
    );
    const raced = await User.collection.updateOne(
      profileFilter(after, ['firstName']),
      { $set: { firstName: 'Lost Edit' } },
    );
    assert.equal(raced.matchedCount, 0);
    const edited = path.join(temp, 'edited');
    await run(edited, false);
    await run(edited, true);
    assert.equal(
      (await User.collection.findOne({ _id: user._id })).firstName,
      'My Edit',
    );
    await require('../../services/legacy-account-data').removeLegacyAccountData(
      user._id,
    );
    assert.equal(
      await mongoose.connection.db
        .collection('legacyaccountprofiles')
        .countDocuments(),
      0,
    );
    const tombstone = await mongoose.connection.db
      .collection('legacyaccountmaps')
      .findOne({ _id: mapKey(row) });
    assert.equal(tombstone.state, 'deleted');
    assert.equal(tombstone.userId, undefined);
    assert.equal(tombstone.emailHash, undefined);
    const blocked = path.join(temp, 'deleted');
    await assert.rejects(run(blocked, false));
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
