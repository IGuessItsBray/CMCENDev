// Personal correction forms use the existing content validators and persistence,
// but cannot exercise a staff override or alter approved/scheduled content.
function getPersonalSubmissionError(body, record, userId) {
  if (body?.submitForReview === undefined) return null;
  if (typeof body.submitForReview !== 'boolean') {
    return { status: 400, error: 'submitForReview must be a boolean' };
  }
  if (!body.submitForReview) return null;
  if (!record.createdBy || String(record.createdBy) !== String(userId)) {
    return { status: 404, error: 'Submission not found' };
  }
  if (
    !['draft', 'pending', 'rejected'].includes(record.status) ||
    record.scheduledPublishAt
  ) {
    return {
      status: 409,
      error: 'This submission is no longer available for corrections',
    };
  }
  if (body.publishNow !== undefined && body.publishNow !== false) {
    return {
      status: 400,
      error: 'Personal corrections must be submitted for review',
    };
  }
  return null;
}

module.exports = { getPersonalSubmissionError };
