const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const Comment = require('../../models/Comment');

const sources = [
  {
    collection: 'retirementcomments',
    field: 'retirementMessage',
    type: 'retirement',
    oldType: 'retirementComment',
  },
  {
    collection: 'lastpostcomments',
    field: 'lastPostMessage',
    type: 'lastPost',
    oldType: 'lastPostComment',
  },
];

function convertComment(record, source) {
  if (!record[source.field])
    throw new Error(`Missing parent on comment ${record._id}`);
  const converted = {
    ...record,
    parentType: source.type,
    parentId: record[source.field],
  };
  delete converted[source.field];
  return converted;
}

async function consolidateComments(db, { apply = false } = {}) {
  const destination = db.collection('comments');
  const plan = [];
  const ids = new Set();
  for (const source of sources) {
    for await (const original of db.collection(source.collection).find({})) {
      const id = String(original._id);
      if (ids.has(id)) throw new Error(`Duplicate source comment ID ${id}`);
      ids.add(id);
      const record = convertComment(original, source);
      await new Comment(record).validate();
      const existing = await destination.findOne({ _id: record._id });
      if (existing && !isDeepStrictEqual(existing, record)) {
        throw new Error(
          `Destination comment ${id} differs; refusing to overwrite it`,
        );
      }
      plan.push({ original, record, source, existing: Boolean(existing) });
    }
  }
  const report = {
    sourceComments: plan.length,
    create: plan.filter((item) => !item.existing).length,
    existing: plan.filter((item) => item.existing).length,
    applied: false,
  };
  if (!apply) return report;

  // Run with app writes stopped. Keep source collections as the original backup.
  for (const { original, record, source, existing } of plan) {
    const current = await db
      .collection(source.collection)
      .findOne({ _id: original._id });
    if (!isDeepStrictEqual(current, original))
      throw new Error(
        `Source comment ${record._id} changed; stop app writes before applying`,
      );
    if (!existing) await destination.insertOne(record);
    const copied = await destination.findOne({ _id: record._id });
    if (!isDeepStrictEqual(copied, record))
      throw new Error(`Verification failed for ${record._id}`);
    await db
      .collection('contentrevisions')
      .updateMany(
        { contentType: source.oldType, contentId: record._id },
        { $set: { contentType: 'comment' } },
      );
    await db
      .collection('auditlogs')
      .updateMany(
        { targetType: source.oldType, target: record._id },
        { $set: { targetType: 'comment' } },
      );
  }
  return { ...report, applied: true };
}

if (require.main === module) {
  (async () => {
    require('dotenv').config({ quiet: true });
    if (process.argv.slice(2).some((value) => value !== '--apply'))
      throw new Error(
        'Usage: node scripts/migration/consolidate-comments.js [--apply]',
      );
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    try {
      console.log(
        JSON.stringify(
          await consolidateComments(mongoose.connection.db, {
            apply: process.argv.includes('--apply'),
          }),
          null,
          2,
        ),
      );
    } finally {
      await mongoose.disconnect();
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { convertComment, consolidateComments, sources };
