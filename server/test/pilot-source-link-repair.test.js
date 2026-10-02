const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongoose').mongo.BSON;
const {
  pinned,
  digest,
  planRepair,
  runRepair,
  rollbackPlan,
} = require('../scripts/migration/lib/pilot-source-link-repair');
const {
  retainWordPressSourceLinks,
} = require('../scripts/migration/lib/wordpress-source-links');

function fixture() {
  const documents = pinned.groups.map((g) => ({
    collection:
      g.kind === 'retirement' ? 'retirementmessages' : 'lastpostmessages',
    document: {
      _id: g.destinationId,
      status: 'draft',
      publishedAt: null,
      messages: {
        en: 'Owner English correction',
        fr: 'Correction du propriétaire',
      },
      photoUrl: 'owner-photo',
      photoDisplayUrl: 'owner-crop',
      createdBy: 'owner',
      legacy: {
        source: pinned.sourceOrigin,
        importBatch: pinned.batchId,
        sourcePostIds: [...g.sourceIds],
        sourceRecords: g.sources.map((s) => ({
          sourceId: s.sourceId,
          language: s.language,
          slug: s.slug,
          createdGmt: '2026-09-01 12:00:00',
        })),
      },
    },
  }));
  for (const [id, date] of [
    ['b5327e1bad13362898e17e2b', '2026-09-14T19:39:49Z'],
    ['d460b7277355c3eb8991a20a', '2026-09-04T12:00:00Z'],
  ]) {
    const doc = documents.find((d) => d.document._id === id).document;
    Object.assign(doc, {
      status: 'published',
      publishedAt: date,
      publicationDateChoice: 'original',
      originalPublishedAt: date,
    });
    if (id.startsWith('d460'))
      Object.assign(doc, { photoUrl: '', photoDisplayUrl: '' });
  }
  for (const sourceId of [358026, 357954]) {
    const doc = documents.find((d) =>
      d.document.legacy.sourcePostIds.includes(sourceId),
    ).document;
    Object.assign(doc, {
      status: 'draft',
      publishedAt: null,
      photoUrl: '',
      photoDisplayUrl: '',
    });
  }
  return documents;
}
function fakeDb(documents, beforeWrite) {
  const writes = [];
  return {
    databaseName: 'local_test',
    writes,
    collection(name) {
      return {
        async findOne(filter) {
          const doc = documents.find(
            (d) =>
              d.collection === name && d.document._id === String(filter._id),
          )?.document;
          if (
            filter['legacy.sourceRecords'] &&
            JSON.stringify(doc?.legacy.sourceRecords) !==
              JSON.stringify(filter['legacy.sourceRecords'])
          )
            return null;
          return doc ? structuredClone(doc) : null;
        },
        async updateOne(filter, update) {
          beforeWrite?.();
          const doc = documents.find(
            (d) =>
              d.collection === name && d.document._id === String(filter._id),
          ).document;
          if (
            JSON.stringify(doc.legacy.sourceRecords) !==
            JSON.stringify(filter['legacy.sourceRecords'])
          )
            return { matchedCount: 0 };
          writes.push(structuredClone(update));
          for (const [key, value] of Object.entries(update.$set))
            doc.legacy.sourceRecords[Number(key.split('.')[2])].url = value;
          return { matchedCount: 1 };
        },
      };
    },
  };
}
function authorization(plan) {
  return {
    allowApply: true,
    approvedBy: 'Synthetic local test owner',
    backupReference: 'synthetic-backup',
    targetOrigin: pinned.targetOrigin,
    targetDatabase: 'local_test',
    planDigest: digest(plan),
    destinationVerifiedAt: new Date().toISOString(),
  };
}

test('exact 20 pilot scope produces 40 URL fields using original ID/language, including FR-first source ordering', () => {
  const documents = fixture();
  documents[0].document.legacy.sourceRecords.reverse();
  const plan = planRepair(pinned, documents);
  assert.equal(plan.operations.length, 20);
  assert.equal(
    plan.operations.reduce((n, o) => n + Object.keys(o.set).length, 0),
    40,
  );
  for (const operation of plan.operations) {
    const group = pinned.groups.find(
      (g) => g.destinationId === operation.destinationId,
    );
    for (const [index, record] of operation.beforeRecords.entries())
      assert.equal(
        operation.set[`legacy.sourceRecords.${index}.url`],
        group.sources.find(
          (s) =>
            s.sourceId === record.sourceId && s.language === record.language,
        ).url,
      );
  }
});
test('dry run does not write; authorized apply only changes source URLs and is idempotent', async () => {
  const documents = fixture(),
    before = structuredClone(documents),
    db = fakeDb(documents),
    events = [];
  const preview = await runRepair({ db, ObjectId });
  assert.equal(db.writes.length, 0);
  await assert.rejects(
    runRepair({ db, ObjectId, apply: true, journal: async () => {} }),
    /authorization/,
  );
  await runRepair({
    db,
    ObjectId,
    apply: true,
    authorization: authorization(preview.plan),
    journal: async (event) => events.push(event),
  });
  assert.equal(db.writes.length, 20);
  assert.equal(events.length, 40);
  for (const entry of documents)
    for (const record of entry.document.legacy.sourceRecords) delete record.url;
  assert.deepEqual(
    documents,
    before,
    'Published dates, status, Dianne empty photos and owner changes preserved',
  );
  // Reapply the captured dotted updates to verify the second run skips all records.
  documents.forEach((entry, index) => {
    for (const [field, value] of Object.entries(db.writes[index].$set))
      entry.document.legacy.sourceRecords[Number(field.split('.')[2])].url =
        value;
  });
  const repeat = await runRepair({ db, ObjectId });
  assert.equal(repeat.plannedRecords, 0);
  assert.equal(rollbackPlan(events, ObjectId).length, 20);
});
test('existing valid URLs and aliases are preserved; conflicts, missing records, identities and languages fail closed', () => {
  const docs = fixture(),
    sources = pinned.groups[0].sources;
  docs[0].document.legacy.sourceRecords[0].url = sources[0].url;
  docs[0].document.legacy.sourceRecords[1].sourceUrl = sources[1].url;
  assert.equal(planRepair(pinned, docs).operations.length, 19);
  for (const alter of [
    (d) => {
      d[0].document.legacy.sourceRecords[0].url =
        'https://cmcen-rcmce.ca/owner-other/';
    },
    (d) => {
      d[0].document.legacy.sourceRecords[0].language = 'fr';
    },
    (d) => {
      d[0].document.legacy.sourceRecords = [];
    },
    (d) => {
      d[0].document.legacy.sourcePostIds = [999, 998];
    },
    (d) => {
      d[0].document.legacy.sourceUrl = 'https://cmcen-rcmce.ca/other/';
    },
    (d) => {
      d[0].document.legacy.importBatch = 'foreign';
    },
  ]) {
    const changed = fixture();
    alter(changed);
    assert.throws(() => planRepair(pinned, changed));
  }
  const changedManifest = structuredClone(pinned);
  changedManifest.groups.pop();
  assert.throws(() => planRepair(changedManifest, docs));
});
test('concurrent provenance changes block conditional write after journaling intent', async () => {
  const docs = fixture(),
    events = [],
    db = fakeDb(docs, () => {
      docs[0].document.legacy.sourceRecords[0].url =
        'https://cmcen-rcmce.ca/concurrent-owner/';
    });
  const plan = planRepair(pinned, docs);
  await assert.rejects(
    runRepair({
      db,
      ObjectId,
      apply: true,
      authorization: authorization(plan),
      journal: async (e) => events.push(e),
    }),
    /Concurrent/,
  );
  assert.equal(db.writes.length, 0);
  assert.equal(events[0].event, 'prepared');
  assert.equal(
    rollbackPlan(events, ObjectId).length,
    0,
    'An unconfirmed intent is not automatically rolled back',
  );
});
test('late conflict and stale/wrong owner approvals produce zero writes', async () => {
  const docs = fixture(),
    db = fakeDb(docs),
    plan = planRepair(pinned, docs);
  for (const changes of [
    { allowApply: false },
    { targetDatabase: 'wrong_db' },
    { targetOrigin: 'https://other.example.org' },
    { planDigest: 'changed' },
    { destinationVerifiedAt: '2000-01-01T00:00:00Z' },
    { destinationVerifiedAt: '9999-01-01T00:00:00Z' },
    { backupReference: '' },
  ])
    await assert.rejects(
      runRepair({
        db,
        ObjectId,
        apply: true,
        authorization: { ...authorization(plan), ...changes },
        journal: async () => {
          throw new Error('Should not journal');
        },
      }),
    );
  docs.at(-1).document.legacy.sourceRecords[0].url =
    'https://cmcen-rcmce.ca/conflict/';
  await assert.rejects(
    runRepair({
      db,
      ObjectId,
      apply: true,
      authorization: authorization(plan),
      journal: async () => {
        throw new Error('Should not journal');
      },
    }),
  );
  assert.equal(db.writes.length, 0);
});
test('rollback restores absent, null and blank URL fields without touching other fields', () => {
  const docs = fixture();
  docs[0].document.legacy.sourceRecords[0].url = null;
  docs[0].document.legacy.sourceRecords[1].url = '';
  const plan = planRepair(pinned, docs);
  const events = plan.operations.flatMap((operation) => [
    { event: 'prepared', planDigest: digest(plan), operation },
    {
      event: 'applied',
      planDigest: digest(plan),
      destinationId: operation.destinationId,
    },
  ]);
  const rollback = rollbackPlan(events, ObjectId);
  const first = rollback.find(
    (r) => String(r.filter._id) === docs[0].document._id,
  );
  assert.deepEqual(first.update.$set, {
    'legacy.sourceRecords.0.url': null,
    'legacy.sourceRecords.1.url': '',
  });
  assert.equal(Object.keys(rollback[0].update.$unset).length, 2);
  assert.deepEqual(
    first.filter['legacy.sourceRecords'],
    plan.operations[0].afterRecords,
  );
});
test('future source-link preparation requires exact metadata identities and preserves canonical EN/FR URLs', () => {
  const group = pinned.groups[0];
  const batch = {
    items: [
      {
        sources: group.sources.map((s) => ({
          id: s.sourceId,
          language: s.language,
        })),
        document: {
          legacy: {
            sourceRecords: group.sources.map((s) => ({
              sourceId: s.sourceId,
              language: s.language,
              slug: s.slug,
            })),
          },
        },
      },
    ],
  };
  const metadata = group.sources.map((s) => ({
    id: s.sourceId,
    status: 'publish',
    slug: s.slug,
    link: s.url,
  }));
  const result = retainWordPressSourceLinks(batch, metadata);
  assert.deepEqual(
    result.items[0].document.legacy.sourceRecords.map((r) => r.url),
    group.sources.map((s) => s.url),
  );
  assert.deepEqual(retainWordPressSourceLinks(result, metadata), result);
  assert.equal(batch.items[0].document.legacy.sourceRecords[0].url, undefined);
  assert.throws(() => retainWordPressSourceLinks(batch, metadata.slice(1)));
  const wrong = structuredClone(metadata);
  wrong[0].slug = 'wrong-subject';
  assert.throws(() => retainWordPressSourceLinks(batch, wrong));
  const conflict = structuredClone(result);
  conflict.items[0].document.legacy.sourceRecords[0].url = group.sources[1].url;
  assert.throws(() => retainWordPressSourceLinks(conflict, metadata));
});
