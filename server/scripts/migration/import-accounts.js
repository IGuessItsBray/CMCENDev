// Run inside the target application container. No dotenv fallback and no mail
// imports: the target's existing environment is the only connection source.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { parseArgs } = require('./lib/args');
const {
  SOURCE,
  hash,
  validateSource,
  mapKey,
  identityHash,
  planImport,
  buildAccount,
} = require('./lib/account-import');

async function main() {
  const args = parseArgs();
  const allowed = [
    '_',
    'input',
    'output',
    'expected-origin',
    'backup',
    'apply',
  ];
  if (
    Object.keys(args).some((key) => !allowed.includes(key)) ||
    !args.input ||
    !args.output ||
    !args['expected-origin'] ||
    (args.apply && args.backup)
  )
    throw new Error('Invalid importer arguments');
  const actualOrigin = new URL(process.env.APP_BASE_URL || '').origin;
  if (actualOrigin !== args['expected-origin'])
    throw new Error('Target origin mismatch');
  if (!process.env.MONGO_URI)
    throw new Error('Target database configuration missing');
  const rows = validateSource(JSON.parse(fs.readFileSync(args.input, 'utf8')));
  const User = require(path.join(process.cwd(), 'models/User'));
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const db = mongoose.connection.db;
  const maps = db.collection('legacyaccountmaps');
  const snapshot = async () => ({
    database: db.databaseName,
    origin: actualOrigin,
    users: await db.collection('users').find({}).sort({ _id: 1 }).toArray(),
    mappings: await maps.find({}).sort({ _id: 1 }).toArray(),
  });
  const EJSON = mongoose.mongo.BSON.EJSON;
  const before = await snapshot();
  const plan = planImport(rows, before.users, before.mappings);
  const report = {
    source: SOURCE,
    targetOrigin: actualOrigin,
    sourceAccounts: rows.length,
    create: plan.filter((p) => p.state === 'create').length,
    existing: plan.filter((p) => p.state === 'existing').length,
    recover: plan.filter((p) => p.state === 'recover').length,
    conflicts: plan
      .filter((p) => p.state === 'conflict')
      .map((p) => ({
        sourceUserId: p.row.sourceUserId,
        reason: p.reason,
      })),
  };
  const privateWrite = (name, data) =>
    fs.writeFileSync(name, data, { mode: 0o600, flag: 'wx' });
  if (args.backup) {
    privateWrite(args.backup, EJSON.stringify(before, { relaxed: false }));
  }
  if (args.apply) {
    // The runner copies this snapshot out of the container before applying.
    const saved = fs.readFileSync(
      `${args.output}/accounts-backup.ejson`,
      'utf8',
    );
    if (hash(saved) !== hash(EJSON.stringify(before, { relaxed: false })))
      throw new Error(
        'Accounts changed since backup; create a fresh backup and recheck',
      );
    if (report.conflicts.length)
      throw new Error(
        'Identity conflicts: inspect dry-run report; no accounts imported',
      );
    const indexes = await db.collection('users').indexes();
    for (const field of ['email', 'username']) {
      if (
        !indexes.some(
          (i) =>
            i.unique && Object.keys(i.key).length === 1 && i.key[field] === 1,
        )
      )
        throw new Error('Required unique user indexes are missing');
    }
    let count = 0;
    for (const item of plan) {
      if (item.state === 'existing') continue;
      let mapping = item.mapping;
      if (!mapping) {
        mapping = {
          _id: mapKey(item.row),
          source: SOURCE,
          sourceUserId: item.row.sourceUserId,
          emailHash: identityHash(item.row),
          userId: new mongoose.Types.ObjectId(),
          state: 'pending',
          createdAt: new Date(),
        };
        await maps.insertOne(mapping);
      }
      if (item.state === 'create') {
        const user = new User(buildAccount(item.row, mapping.userId));
        await user.save(); // existing model validates and bcrypt-hashes password
      }
      await maps.updateOne(
        { _id: mapping._id, userId: mapping.userId },
        { $set: { state: 'complete', completedAt: new Date() } },
      );
      count += 1;
      if (count % 100 === 0)
        console.log(`Imported/recovered ${count} accounts`);
    }
    const after = await snapshot();
    const verified = planImport(rows, after.users, after.mappings);
    if (verified.some((p) => p.state !== 'existing'))
      throw new Error('Post-import mapping verification failed');
    for (const user of before.users) {
      const current = after.users.find(
        (u) => String(u._id) === String(user._id),
      );
      if (EJSON.stringify(user) !== EJSON.stringify(current))
        throw new Error(
          'Existing account changed during import; inspect before proceeding',
        );
    }
    report.verifiedMappings = verified.length;
    report.createdOrRecovered = count;
  }
  privateWrite(
    `${args.output}/${args.apply ? 'applied' : 'dry-run'}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    // Database errors can contain email addresses/credentials. Keep console safe.
    console.error(
      `Account import stopped (${error.code || error.name || 'error'}). No email was sent. Preserve this run directory for recovery.`,
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
