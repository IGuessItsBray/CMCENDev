const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../../models/User');
const { SOURCE } = require('../../scripts/migration/lib/account-import');

test('account import backs up, preserves existing users, hashes passwords and resumes safely', async () => {
  const mongo = await MongoMemoryServer.create();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cmcen-account-test-'));
  try {
    await mongoose.connect(mongo.getUri());
    await User.init();
    const admin = await User.create({
      username: 'admin@example.org',
      email: 'admin@example.org',
      role: 'developer',
      profileComplete: false,
      password: 'existing-test-password',
    });
    const before = await User.collection.findOne({ _id: admin._id });
    const input = path.join(temp, 'accounts.json');
    await fs.writeFile(
      input,
      JSON.stringify({
        source: SOURCE,
        users: [
          {
            id: 42,
            email: 'legacy@example.org',
            displayName: 'Legacy Member',
            status: '0',
          },
        ],
      }),
    );
    async function run(directory, mode) {
      await fs.mkdir(directory, { recursive: true });
      return execFile(
        process.execPath,
        [
          'scripts/migration/import-accounts.js',
          '--input',
          input,
          '--output',
          directory,
          '--expected-origin',
          'https://staging.example.org',
          ...(mode === 'apply'
            ? ['--apply']
            : ['--backup', path.join(directory, 'accounts-backup.ejson')]),
        ],
        {
          cwd: path.join(__dirname, '../..'),
          env: {
            ...process.env,
            MONGO_URI: mongo.getUri(),
            APP_BASE_URL: 'https://staging.example.org',
          },
        },
      );
    }
    const first = path.join(temp, 'first');
    await run(first, 'backup');
    assert.equal(await User.countDocuments(), 1);
    await run(first, 'apply');
    const imported = await User.collection.findOne({
      email: 'legacy@example.org',
    });
    assert.match(imported.password, /^\$2[aby]\$/);
    assert.equal(imported.role, 'subscriber');
    assert.equal(imported.profileComplete, false);
    assert.equal(imported.passwordReset.tokenHash, '');
    assert.equal(imported.invitation.tokenHash, '');
    assert.deepEqual(await User.collection.findOne({ _id: admin._id }), before);
    const maps = mongoose.connection.db.collection('legacyaccountmaps');
    assert.equal((await maps.findOne({ sourceUserId: 42 })).state, 'complete');
    // Simulate a crash after account creation but before mapping completion.
    await maps.updateOne({ sourceUserId: 42 }, { $set: { state: 'pending' } });
    const retry = path.join(temp, 'retry');
    await run(retry, 'backup');
    await run(retry, 'apply');
    assert.equal(await User.countDocuments(), 2);
    assert.deepEqual(
      await User.collection.findOne({ _id: imported._id }),
      imported,
    );
    const repeat = path.join(temp, 'repeat');
    await run(repeat, 'backup');
    await run(repeat, 'apply');
    assert.deepEqual(
      await User.collection.findOne({ _id: imported._id }),
      imported,
    );
    // A source trying to claim an existing admin is rejected before writing.
    await fs.writeFile(
      input,
      JSON.stringify({
        source: SOURCE,
        users: [
          {
            id: 99,
            email: 'admin@example.org',
            displayName: 'Collision',
            status: '0',
          },
        ],
      }),
    );
    const collision = path.join(temp, 'collision');
    await run(collision, 'backup');
    await assert.rejects(run(collision, 'apply'));
    assert.equal(await User.countDocuments(), 2);
    assert.equal(await maps.countDocuments(), 1);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
