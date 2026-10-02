const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, BSON } = require('mongoose').mongo;
const {
  pinned,
  digest,
  runRepair,
  rollbackPlan,
} = require('../../scripts/migration/lib/pilot-source-link-repair');

test('standalone local Mongo: dotted URL repair preserves editorial state, repeats safely and supports conditional rollback', async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  try {
    await client.connect();
    const db = client.db('source_link_repair_local_test');
    const original = [];
    for (const group of pinned.groups) {
      const collection =
        group.kind === 'retirement' ? 'retirementmessages' : 'lastpostmessages';
      const isPublished = [
        'b5327e1bad13362898e17e2b',
        'd460b7277355c3eb8991a20a',
      ].includes(group.destinationId);
      const date = new Date(
        group.destinationId.startsWith('b532')
          ? '2026-09-14T19:39:49Z'
          : '2026-09-04T12:00:00Z',
      );
      const document = {
        _id: new BSON.ObjectId(group.destinationId),
        status: isPublished ? 'published' : 'draft',
        publishedAt: isPublished ? date : null,
        originalPublishedAt: date,
        publicationDateChoice: 'original',
        photoUrl: group.destinationId.startsWith('d460')
          ? ''
          : 'owner-original',
        photoDisplayUrl: '',
        messages: { en: 'Owner correction', fr: 'Correction française' },
        updatedAt: new Date('2026-10-02T01:00:00Z'),
        createdBy: new BSON.ObjectId(),
        legacy: {
          source: pinned.sourceOrigin,
          importBatch: pinned.batchId,
          sourcePostIds: group.sourceIds,
          sourceRecords: group.sources.toReversed().map((s) => ({
            sourceId: s.sourceId,
            language: s.language,
            slug: s.slug,
            retainedDate: date,
          })),
        },
      };
      await db.collection(collection).insertOne(document);
      original.push({ collection, document });
    }
    const preview = await runRepair({ db, ObjectId: BSON.ObjectId });
    assert.equal(preview.plannedUrls, 40);
    const events = [];
    const authorization = {
      allowApply: true,
      approvedBy: 'Synthetic test owner',
      backupReference: 'Synthetic fixture backup',
      targetOrigin: pinned.targetOrigin,
      targetDatabase: db.databaseName,
      planDigest: preview.planDigest,
      destinationVerifiedAt: new Date().toISOString(),
    };
    await runRepair({
      db,
      ObjectId: BSON.ObjectId,
      apply: true,
      authorization,
      journal: async (event) =>
        events.push(BSON.EJSON.deserialize(BSON.EJSON.serialize(event))),
    });
    for (const entry of original) {
      const actual = await db
        .collection(entry.collection)
        .findOne({ _id: entry.document._id });
      for (const source of actual.legacy.sourceRecords) delete source.url;
      assert.deepEqual(actual, entry.document);
    }
    assert.equal(
      (await runRepair({ db, ObjectId: BSON.ObjectId })).plannedRecords,
      0,
    );
    const rollback = rollbackPlan(events, BSON.ObjectId);
    // Simulate a later owner edit: rollback must not clobber it.
    const held = rollback[0];
    await db.collection(held.collection).updateOne(
      { _id: held.filter._id },
      {
        $set: {
          'legacy.sourceRecords.0.url':
            'https://cmcen-rcmce.ca/owner-later-edit/',
        },
      },
    );
    assert.equal(
      (await db.collection(held.collection).updateOne(held.filter, held.update))
        .matchedCount,
      0,
    );
    for (const operation of rollback.slice(1))
      assert.equal(
        (
          await db
            .collection(operation.collection)
            .updateOne(operation.filter, operation.update)
        ).matchedCount,
        1,
      );
    for (const entry of original.filter(
      (e) => !e.document._id.equals(held.filter._id),
    ))
      assert.deepEqual(
        await db
          .collection(entry.collection)
          .findOne({ _id: entry.document._id }),
        entry.document,
      );
    assert.equal(digest(preview.plan), preview.planDigest);
  } finally {
    await client.close();
    await mongo.stop();
  }
});
