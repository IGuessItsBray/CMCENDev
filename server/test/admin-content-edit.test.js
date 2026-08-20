const assert = require('node:assert/strict');
const test = require('node:test');
const adminRoutes = require('../routes/admin');
const LastPostMessage = require('../models/LastPostMessage');
const RetirementMessage = require('../models/RetirementMessage');

test('provides audited admin edit routes for every content type', () => {
  const patchRoutes = adminRoutes.stack
    .filter((layer) => layer.route?.methods.patch)
    .map((layer) => layer.route.path);

  assert.deepEqual(
    [
      '/last-posts/:lastPostId',
      '/retirement-messages/:messageId',
      '/news/:articleId',
      '/events/:eventId',
    ].every((path) => patchRoutes.includes(path)),
    true,
  );
});

test('allows legacy identity fields to be intentionally blank', () => {
  assert.notEqual(LastPostMessage.schema.path('deceased.firstName').isRequired, true);
  assert.notEqual(LastPostMessage.schema.path('deceased.surname').isRequired, true);
  assert.notEqual(RetirementMessage.schema.path('retiree.rank').isRequired, true);
  assert.notEqual(
    RetirementMessage.schema.path('retiree.firstName').isRequired,
    true,
  );
  assert.notEqual(RetirementMessage.schema.path('retiree.lastName').isRequired, true);
});
