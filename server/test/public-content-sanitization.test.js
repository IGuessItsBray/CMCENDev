const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RETIREMENT_NOTICE_IDS_TO_HIDE,
  hidePublicTestRetirementNotices,
} = require('../services/public-content-sanitization');

test('hides the identified public test retirement notice', async () => {
  let filter;
  let update;
  const hiddenAtBefore = new Date();

  const modifiedCount = await hidePublicTestRetirementNotices({
    RetirementMessageModel: {
      async updateMany(receivedFilter, receivedUpdate) {
        filter = receivedFilter;
        update = receivedUpdate;
        return { modifiedCount: 1 };
      },
    },
  });

  assert.equal(modifiedCount, 1);
  assert.deepEqual(filter, {
    _id: { $in: RETIREMENT_NOTICE_IDS_TO_HIDE },
    status: 'published',
  });
  assert.equal(update.$set.status, 'hidden');
  assert.equal(update.$set.hiddenFromStatus, 'published');
  assert.equal(update.$set.hiddenBy, null);
  assert.ok(update.$set.hiddenAt >= hiddenAtBefore);
});
