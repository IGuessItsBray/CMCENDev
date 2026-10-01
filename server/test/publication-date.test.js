const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getPublicationDateInfo,
  selectPublicationDate,
} = require('../services/publication-date');
const {
  applyEditorialReviewTransition,
} = require('../services/editorial-review');
const now = new Date('2026-09-29T12:00:00Z');
const original = new Date('2010-02-03T10:00:00Z');
const archive = () => ({
  legacy: {
    source: 'https://cmcen-rcmce.ca',
    originalStatus: 'publish',
    sourceRecords: [
      {
        language: 'fr',
        sourceStatus: 'publish',
        createdGmt: '2010-02-04 10:00:00',
      },
      {
        language: 'en',
        sourceStatus: 'publish',
        createdGmt: '2010-02-03 10:00:00',
      },
    ],
  },
  messageLanguage: 'en',
  status: 'draft',
});

test('pilot originals come from the primary source, not the import timestamp', () => {
  assert.deepEqual(
    getPublicationDateInfo(archive(), now).originalPublishedAt,
    original,
  );
  assert.equal(
    getPublicationDateInfo(
      { legacy: { source: 'wp' }, createdAt: original },
      now,
    ).originalPublishedAt,
    null,
  );
  assert.equal(
    getPublicationDateInfo({ originalPublishedAt: 'invalid' }, now)
      .originalPublishedAt,
    null,
  );
  assert.equal(
    getPublicationDateInfo({ originalPublishedAt: '2099-01-01' }, now)
      .originalPublishedAt,
    null,
  );
});
test('comment creation time is not treated as source publication provenance', () => {
  for (const approval of ['0', '1']) {
    const info = getPublicationDateInfo(
      {
        createdAt: original,
        legacy: {
          source: 'wp',
          wordpressCommentId: 1,
          originalApproval: approval,
        },
      },
      now,
    );
    assert.equal(info.originalPublishedAt, null);
  }
});
test('archive choices are explicit, validated, and preserve the original even when choosing now', () => {
  assert.throws(() => selectPublicationDate(archive(), undefined, now), {
    status: 400,
  });
  assert.throws(() => selectPublicationDate(archive(), 'yesterday', now), {
    status: 400,
  });
  assert.throws(() => selectPublicationDate({}, 'original', now), {
    status: 400,
  });
  assert.equal(selectPublicationDate({}, undefined, now), now);
  const record = archive();
  assert.equal(selectPublicationDate(record, 'now', now), now);
  assert.deepEqual(record.originalPublishedAt, original);
  assert.deepEqual(selectPublicationDate(record, 'original', now), original);
  const custom = '2008-04-05T09:30:00.000Z';
  assert.deepEqual(selectPublicationDate(record, 'custom', now, custom), new Date(custom));
  assert.equal(record.publicationDateChoice, 'custom');
  assert.throws(() => selectPublicationDate(record, 'custom', now, '2099-01-01'), { status: 400 });
  assert.throws(() => selectPublicationDate(record, 'now', now, custom), { status: 400 });
});
test('publication date choice leaves staff approval time current and survives scheduling', () => {
  for (const scheduledPublishAt of [null, new Date('2026-10-01T12:00:00Z')]) {
    const content = archive();
    const result = applyEditorialReviewTransition({
      content,
      action: 'publish',
      reviewerId: 'staff',
      publicationDateChoice: 'original',
      scheduledPublishAt,
      now,
    });
    assert.deepEqual(content.publishedAt, scheduledPublishAt ? null : original);
    assert.equal(content.reviewedAt, now);
    assert.deepEqual(content.originalPublishedAt, original);
    assert.equal(content.publicationDateChoice, 'original');
    assert.equal(result.auditMetadata.publicationDateChoice, 'original');
  }
});
