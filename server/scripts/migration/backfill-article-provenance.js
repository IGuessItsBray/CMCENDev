const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { parseArgs } = require('./lib/args');
const { planArticleProvenance } = require('./lib/article-provenance');

async function main() {
  const args = parseArgs();
  if (
    !args.output ||
    args._.length ||
    Object.keys(args).some((key) => !['_', 'output', 'apply'].includes(key))
  )
    throw new Error('Invalid arguments');
  if (
    new URL(process.env.APP_BASE_URL || '').origin !==
    'https://staging.cefamily.ca'
  )
    throw new Error('Wrong target');
  const mappings = require('./ledger/confirmed-imports.json').articles;
  await mongoose.connect(process.env.MONGO_URI, {
    autoIndex: false,
    autoCreate: false,
  });
  const collection = mongoose.connection.db.collection('newsarticles');
  const articles = await collection
    .find({
      _id: {
        $in: mappings.map((m) => new mongoose.Types.ObjectId(m.destinationId)),
      },
    })
    .sort({ _id: 1 })
    .toArray();
  const plans = planArticleProvenance(articles, mappings);
  const snapshot = mongoose.mongo.BSON.EJSON.stringify(articles, {
    relaxed: false,
  });
  const backup = path.join(args.output, 'articles-backup.ejson');
  if (!args.apply)
    fs.writeFileSync(backup, snapshot, { flag: 'wx', mode: 0o600 });
  else if (fs.readFileSync(backup, 'utf8') !== snapshot)
    throw new Error('Articles changed since backup; use a fresh run');
  const report = {
    matched: plans.length,
    toUpdate: plans.filter((p) => p.change).length,
    alreadyPresent: plans.filter((p) => !p.change).length,
    updated: 0,
  };
  if (args.apply) {
    for (const plan of plans.filter((p) => p.change)) {
      const result = await collection.updateOne(
        {
          _id: plan.article._id,
          migrationSource: plan.mapping.sourceUrl,
          legacy: null,
        },
        { $set: { legacy: plan.legacy } },
      );
      if (result.modifiedCount !== 1)
        throw new Error('Concurrent provenance change; stop and review');
      const after = await collection.findOne({ _id: plan.article._id });
      if (JSON.stringify(after.legacy) !== JSON.stringify(plan.legacy))
        throw new Error('Verification failed');
      report.updated += 1;
    }
  }
  fs.writeFileSync(
    path.join(args.output, args.apply ? 'applied.json' : 'dry-run.json'),
    JSON.stringify(report, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
