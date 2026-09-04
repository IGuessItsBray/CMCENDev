const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyEditorialReviewTransition,
} = require('../services/editorial-review');

function createContent(overrides = {}) {
  return {
    status: 'pending',
    rejectionReason: '',
    publishedBy: null,
    publishedAt: null,
    scheduledPublishAt: null,
    scheduledBy: null,
    scheduledAt: null,
    reviewedBy: null,
    reviewedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

test('applies immediate publication metadata and its audit event', () => {
  const content = createContent({
    rejectionReason: 'Previously rejected',
    scheduledPublishAt: new Date('2026-09-02T12:00:00.000Z'),
  });
  const now = new Date('2026-09-01T12:00:00.000Z');
  const reviewerId = 'reviewer-id';

  const transition = applyEditorialReviewTransition({
    content,
    action: 'publish',
    reviewerId,
    publishedRejectionReason: null,
    now,
  });

  assert.equal(content.status, 'published');
  assert.equal(content.rejectionReason, null);
  assert.equal(content.publishedBy, reviewerId);
  assert.equal(content.publishedAt, now);
  assert.equal(content.scheduledPublishAt, null);
  assert.equal(content.reviewedBy, reviewerId);
  assert.equal(content.reviewedAt, now);
  assert.equal(content.updatedBy, reviewerId);
  assert.deepEqual(transition, {
    auditAction: 'content.published',
    auditMetadata: { source: 'review' },
    scheduledPublishAt: null,
  });
});

test('keeps scheduled publication pending with review metadata', () => {
  const content = createContent();
  const now = new Date('2026-09-01T12:00:00.000Z');
  const scheduledPublishAt = new Date('2026-09-02T12:00:00.000Z');

  const transition = applyEditorialReviewTransition({
    content,
    action: 'publish',
    reviewerId: 'reviewer-id',
    scheduledPublishAt,
    publishedRejectionReason: '',
    now,
  });

  assert.equal(content.status, 'pending');
  assert.equal(content.rejectionReason, '');
  assert.equal(content.publishedBy, null);
  assert.equal(content.publishedAt, null);
  assert.equal(content.scheduledPublishAt, scheduledPublishAt);
  assert.equal(content.scheduledBy, 'reviewer-id');
  assert.equal(content.scheduledAt, now);
  assert.equal(content.reviewedBy, 'reviewer-id');
  assert.equal(content.reviewedAt, now);
  assert.deepEqual(transition, {
    auditAction: 'content.publish_scheduled',
    auditMetadata: { source: 'review', scheduledPublishAt },
    scheduledPublishAt,
  });
});

test('rejects content and clears a pending schedule', () => {
  const content = createContent({
    scheduledPublishAt: new Date('2026-09-02T12:00:00.000Z'),
    scheduledBy: 'another-reviewer',
    scheduledAt: new Date('2026-09-01T10:00:00.000Z'),
  });
  const now = new Date('2026-09-01T12:00:00.000Z');

  const transition = applyEditorialReviewTransition({
    content,
    action: 'reject',
    reviewerId: 'reviewer-id',
    rejectionReason: 'Please correct the French translation.',
    now,
  });

  assert.equal(content.status, 'rejected');
  assert.equal(
    content.rejectionReason,
    'Please correct the French translation.',
  );
  assert.equal(content.publishedBy, null);
  assert.equal(content.publishedAt, null);
  assert.equal(content.scheduledPublishAt, null);
  assert.equal(content.scheduledBy, null);
  assert.equal(content.scheduledAt, null);
  assert.equal(content.reviewedBy, 'reviewer-id');
  assert.equal(content.reviewedAt, now);
  assert.deepEqual(transition, {
    auditAction: 'content.rejected',
    auditMetadata: {
      source: 'review',
      rejectionReason: 'Please correct the French translation.',
    },
    scheduledPublishAt: null,
  });
});

test('cancels a schedule without recording a completed review', () => {
  const scheduledPublishAt = new Date('2026-09-02T12:00:00.000Z');
  const content = createContent({
    scheduledPublishAt,
    scheduledBy: 'reviewer-id',
    scheduledAt: new Date('2026-09-01T10:00:00.000Z'),
    reviewedBy: 'reviewer-id',
    reviewedAt: new Date('2026-09-01T10:00:00.000Z'),
  });

  const transition = applyEditorialReviewTransition({
    content,
    action: 'cancel-schedule',
    reviewerId: 'reviewer-id',
  });

  assert.equal(content.status, 'pending');
  assert.equal(content.scheduledPublishAt, null);
  assert.equal(content.scheduledBy, null);
  assert.equal(content.scheduledAt, null);
  assert.equal(content.reviewedBy, null);
  assert.equal(content.reviewedAt, null);
  assert.equal(content.updatedBy, 'reviewer-id');
  assert.deepEqual(transition, {
    auditAction: 'content.publish_schedule_cancelled',
    auditMetadata: { source: 'review', scheduledPublishAt },
    scheduledPublishAt: null,
  });
});
