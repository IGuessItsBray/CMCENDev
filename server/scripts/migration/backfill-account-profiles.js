const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { parseArgs } = require('./lib/args');
const { SOURCE, hash, mapKey } = require('./lib/account-import');
const { historyHash } = require('./lib/account-history');
const {
  profileRows,
  planProfile,
  profileFilter,
  get,
} = require('./lib/account-profile');

async function main() {
  const args = parseArgs();
  if (
    Object.keys(args).some(
      (k) => !['_', 'input', 'output', 'backup', 'apply'].includes(k),
    ) ||
    !args.input ||
    !args.output ||
    (args.backup && args.apply)
  )
    throw new Error('Invalid arguments');
  if (
    new URL(process.env.APP_BASE_URL || '').origin !==
    'https://staging.cefamily.ca'
  )
    throw new Error('Wrong target');
  const rows = profileRows(JSON.parse(fs.readFileSync(args.input, 'utf8')));
  const User = require(path.join(process.cwd(), 'models/User'));
  if (
    ['biography', 'websiteUrl', 'socialLinks.facebook'].some(
      (key) => !User.schema.path(key),
    ) ||
    User.schema.path('currentUnit').options.maxlength < 183
  )
    throw new Error('Deploy expanded profile support before backfill');
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const db = mongoose.connection.db;
  const EJSON = mongoose.mongo.BSON.EJSON;
  const users = await db
    .collection('users')
    .find({})
    .sort({ _id: 1 })
    .toArray();
  const mappings = await db
    .collection('legacyaccountmaps')
    .find({ source: SOURCE })
    .sort({ _id: 1 })
    .toArray();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const histories = await db
    .collection('legacyaccountprofiles')
    .find({})
    .sort({ _id: 1 })
    .toArray();
  const historyById = new Map(histories.map((h) => [h._id, h]));
  const byKey = new Map(mappings.map((m) => [m._id, m]));
  // All mappings must be complete, not merely the subset imported so far.
  const plans = [];
  for (const row of rows) {
    const mapping = byKey.get(mapKey(row));
    const user = byId.get(String(mapping?.userId));
    const prior = historyById.get(mapKey(row));
    if (
      row.legacyData &&
      prior &&
      (prior.sourceHash !== historyHash(row.legacyData) ||
        String(prior.userId) !== String(user?._id))
    )
      throw new Error('Legacy history conflict');
    plans.push({ row, user, ...(await planProfile(row, user, mapping, User)) });
  }
  const snapshot = EJSON.stringify(
    { database: db.databaseName, users, mappings, histories },
    { relaxed: false },
  );
  const write = (file, data) =>
    fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
  if (args.backup) write(args.backup, snapshot);
  const report = {
    sourceAccounts: rows.length,
    accountsToUpdate: 0,
    fieldsToFill: {},
    review: [],
    updatedAccounts: 0,
    concurrentSkips: [],
    preservedHistories: 0,
  };
  for (const plan of plans) {
    if (Object.keys(plan.set).length) report.accountsToUpdate += 1;
    for (const key of Object.keys(plan.set))
      report.fieldsToFill[key] = (report.fieldsToFill[key] || 0) + 1;
    for (const issue of plan.issues)
      report.review.push({ sourceUserId: plan.row.sourceUserId, ...issue });
  }
  if (args.apply) {
    if (
      hash(fs.readFileSync(`${args.output}/profiles-backup.ejson`, 'utf8')) !==
      hash(snapshot)
    )
      throw new Error(
        'Accounts changed since backup; rerun in a new report directory',
      );
    for (const plan of plans) {
      if (plan.row.legacyData) {
        const result = await db.collection('legacyaccountprofiles').updateOne(
          {
            _id: mapKey(plan.row),
            sourceHash: historyHash(plan.row.legacyData),
            userId: plan.user._id,
          },
          {
            $setOnInsert: {
              source: SOURCE,
              sourceUserId: plan.row.sourceUserId,
              sourceData: plan.row.legacyData,
              preservedAt: new Date(),
            },
          },
          { upsert: true },
        );
        if (result.matchedCount || result.upsertedCount)
          report.preservedHistories += 1;
      }
      const keys = Object.keys(plan.set);
      if (!keys.length) continue;
      const result = await db
        .collection('users')
        .updateOne(profileFilter(plan.user, keys), {
          $set: { ...plan.set, updatedAt: new Date() },
        });
      if (!result.matchedCount) {
        report.concurrentSkips.push(plan.row.sourceUserId);
        continue;
      }
      const after = await db
        .collection('users')
        .findOne({ _id: plan.user._id });
      if (keys.some((k) => get(after, k) !== plan.set[k]))
        throw new Error('Profile verification failed');
      report.updatedAccounts += 1;
    }
  }
  write(
    `${args.output}/${args.apply ? 'applied' : 'dry-run'}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({ ...report, review: report.review.length }, null, 2),
  );
}

main()
  .catch(() => {
    console.error(
      'Profile backfill stopped. Ensure the account import finished and use a fresh run directory. No mail or password changes were requested.',
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
