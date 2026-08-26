const assert = require('node:assert/strict');
const test = require('node:test');
const routes = require('../routes/professional-awards');
const { LEGACY_AWARDS } = require('../services/professional-awards');

test('seeds every legacy professional award with its nomination or instruction links', () => {
  assert.deepEqual(
    LEGACY_AWARDS.map((award) => award.slug),
    [
      'colonel-in-chief-commendation',
      'branch-commendation',
      'subaltern-of-the-year',
      'member-of-the-year',
      'heritage-awards',
    ],
  );
  LEGACY_AWARDS.forEach((award) => {
    assert.ok(award.links.length >= 2);
    award.links.forEach((link) => assert.match(link.url, /^https:\/\//u));
  });
});

test('provides public and content-management award routes', () => {
  const paths = routes.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);
  assert.ok(paths.includes('/professional-awards'));
  assert.ok(paths.includes('/admin/professional-awards'));
  assert.ok(paths.includes('/admin/professional-awards/:awardId'));
  assert.ok(paths.includes('/admin/professional-awards/:awardId/recipients'));
  assert.ok(
    paths.includes(
      '/admin/professional-awards/:awardId/recipients/:recipientId',
    ),
  );
});
