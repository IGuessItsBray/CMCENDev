// Explicit operator command. No dotenv, storage uploads, publication workflow or automatic startup migration.
const fs = require('node:fs');
const mongoose = require('mongoose');
const { EJSON } = mongoose.mongo.BSON;
const {
  planMigration,
  applyMigration,
  listIndexes,
} = require('../../services/document-migration');
const { parseArgs } = require('./lib/args');

async function main(argv) {
  const args = parseArgs(argv);
  const allowed = [
    '_',
    'snapshot',
    'output',
    'database',
    'apply',
    'expected-plan',
    'backup',
  ];
  if (
    args._.length ||
    Object.keys(args).some((key) => !allowed.includes(key)) ||
    (args.apply !== undefined && args.apply !== true)
  )
    throw new Error('Invalid arguments');
  if (args.snapshot) {
    if (args.apply) throw new Error('Snapshots are preview-only');
    const snapshot = EJSON.parse(fs.readFileSync(args.snapshot, 'utf8'));
    const plan = planMigration(
      snapshot.documents || [],
      snapshot.indexes || [],
    );
    if (args.output)
      fs.writeFileSync(
        args.output,
        EJSON.stringify(
          { mode: 'snapshot-preview', liveDestinationChecked: false, ...plan },
          null,
          2,
        ),
        {
          flag: 'wx',
          mode: 0o600,
        },
      );
    return { mode: 'snapshot-preview', liveDestinationChecked: false, ...plan };
  }
  if (!process.env.MONGO_URI || !args.database)
    throw new Error('Explicit MONGO_URI and --database required');
  const client = new mongoose.mongo.MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    if (db.databaseName !== args.database) throw new Error('Database mismatch');
    const collection = db.collection('archivedocuments');
    const snapshot = {
      documents: await collection.find({}).toArray(),
      indexes: await listIndexes(collection),
    };
    const plan = planMigration(snapshot.documents, snapshot.indexes);
    if (!args.apply) {
      if (args.output)
        fs.writeFileSync(args.output, EJSON.stringify(plan, null, 2), {
          flag: 'wx',
          mode: 0o600,
        });
      return { mode: 'database-preview', ...plan };
    }
    if (
      !args.backup ||
      !args['expected-plan'] ||
      args['expected-plan'] !== plan.sha256 ||
      plan.conflicts.length
    )
      throw new Error('Exact reviewed plan and new backup path required');
    const fd = fs.openSync(args.backup, 'wx', 0o600);
    try {
      fs.writeSync(fd, EJSON.stringify(snapshot));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const result = await applyMigration(
      collection,
      plan,
      args['expected-plan'],
    );
    return {
      mode: 'applied',
      counts: result.counts,
      conflicts: result.conflicts,
      sha256: result.sha256,
    };
  } finally {
    await client.close();
  }
}
if (require.main === module)
  main(process.argv.slice(2))
    .then((result) => console.log(EJSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { main };
