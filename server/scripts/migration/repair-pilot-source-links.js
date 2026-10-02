// Operator-only preparation/repair. No dotenv, storage, email or application boot.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { MongoClient, BSON } = require('mongoose').mongo;
const { parseArgs } = require('./lib/args');
const {
  pinned,
  planRepair,
  digest,
  runRepair,
  rollbackPlan,
} = require('./lib/pilot-source-link-repair');

async function main(argv) {
  const args = parseArgs(argv);
  const allowed = [
    '_',
    'snapshot',
    'output',
    'expected-origin',
    'expected-database',
    'apply',
    'authorization',
    'journal',
    'rollback-journal',
  ];
  assert(
    !args._.length && Object.keys(args).every((key) => allowed.includes(key)),
    'Unknown arguments',
  );
  assert(
    args.apply === undefined || args.apply === true,
    'Apply flag takes no value',
  );
  assert(!args.snapshot || !args.apply, 'Snapshots cannot be applied');
  assert(
    !args['rollback-journal'] || (!args.apply && !args.snapshot),
    'Rollback only generates local instructions',
  );
  let report;
  if (args['rollback-journal']) {
    const events = fs
      .readFileSync(args['rollback-journal'], 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => BSON.EJSON.deserialize(JSON.parse(line)));
    const prepared = events.filter((event) => event.event === 'prepared');
    assert(
      prepared.every((event) => event.targetOrigin === pinned.targetOrigin),
      'Rollback origin mismatch',
    );
    const databases = [
      ...new Set(prepared.map((event) => event.targetDatabase)),
    ];
    assert(
      databases.length === 1 &&
        typeof databases[0] === 'string' &&
        databases[0],
      'Rollback database evidence required',
    );
    report = {
      preparationOnly: true,
      targetOrigin: pinned.targetOrigin,
      targetDatabase: databases[0],
      rollback: rollbackPlan(events, BSON.ObjectId),
    };
  } else if (args.snapshot) {
    const documents = BSON.EJSON.deserialize(
      JSON.parse(fs.readFileSync(args.snapshot)),
    );
    const plan = planRepair(pinned, documents);
    report = {
      dryRun: true,
      snapshotOnly: true,
      scope: 20,
      plannedRecords: plan.operations.length,
      plannedUrls: plan.operations.reduce(
        (n, o) => n + Object.keys(o.set).length,
        0,
      ),
      planDigest: digest(plan),
      plan,
    };
  } else {
    assert(
      args['expected-origin'] === pinned.targetOrigin &&
        new URL(process.env.APP_BASE_URL || '').origin === pinned.targetOrigin,
      'Target origin mismatch',
    );
    assert(
      args['expected-database'] && process.env.MONGO_URI,
      'Explicit database required',
    );
    const authorization = args.authorization
      ? JSON.parse(fs.readFileSync(args.authorization))
      : null;
    if (args.apply)
      assert(
        authorization?.allowApply === true && args.journal,
        'Owner authorization and new journal required',
      );
    const client = new MongoClient(process.env.MONGO_URI);
    let fd;
    try {
      await client.connect();
      const db = client.db();
      assert.equal(db.databaseName, args['expected-database']);
      // Exclusive create prevents an unrelated run from appending to this journal.
      if (args.apply) fd = fs.openSync(args.journal, 'wx', 0o600);
      report = await runRepair({
        db,
        ObjectId: BSON.ObjectId,
        apply: args.apply === true,
        authorization,
        journal:
          fd === undefined
            ? undefined
            : async (event) => {
                fs.writeSync(
                  fd,
                  JSON.stringify(BSON.EJSON.serialize(event)) + '\n',
                );
                fs.fsyncSync(fd);
              },
      });
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      await client.close();
    }
  }
  if (args.output)
    fs.writeFileSync(
      args.output,
      JSON.stringify(BSON.EJSON.serialize(report), null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  console.log(
    JSON.stringify({
      dryRun: report.dryRun,
      snapshotOnly: report.snapshotOnly,
      scope: report.scope,
      plannedRecords: report.plannedRecords,
      plannedUrls: report.plannedUrls,
      updatedRecords: report.updatedRecords,
      planDigest: report.planDigest,
      rollbackOperations: report.rollback?.length,
    }),
  );
  return report;
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'Source-link repair stopped. Preserve the plan and journal; inspect locally for conflicts.',
    );
    process.exitCode = 1;
  });
module.exports = { main };
