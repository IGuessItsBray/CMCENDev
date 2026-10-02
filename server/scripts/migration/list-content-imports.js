// Registry evidence only: no bodies, user profiles, credentials or writes.
const assert = require('node:assert/strict');
const { MongoClient } = require('mongoose').mongo;
const { parseArgs } = require('./lib/args');
const { readContentCompletionIndex } = require('./lib/content-import');

async function main() {
  const args = parseArgs();
  assert(
    !args._.length &&
      Object.keys(args).every((k) =>
        ['_', 'source-origin', 'expected-origin', 'expected-database'].includes(
          k,
        ),
      ),
  );
  assert(
    args['source-origin'] &&
      args['expected-origin'] &&
      args['expected-database'],
  );
  assert.equal(new URL(args['source-origin']).origin, args['source-origin']);
  assert.equal(
    new URL(process.env.APP_BASE_URL || '').origin,
    args['expected-origin'],
  );
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    assert.equal(client.db().databaseName, args['expected-database']);
    console.log(
      JSON.stringify(
        await readContentCompletionIndex(client.db(), args['source-origin']),
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(`Completion index stopped (${e.code || e.name || 'error'}).`);
    process.exitCode = 1;
  });
module.exports = { main };
