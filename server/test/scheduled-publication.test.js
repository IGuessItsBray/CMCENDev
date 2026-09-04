const assert = require('node:assert/strict');
const test = require('node:test');

const { getScheduledPublicationDate } = require('../services/editorial-review');

test('accepts only future ISO publication times', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  assert.equal(getScheduledPublicationDate(undefined, now), null);
  assert.equal(getScheduledPublicationDate('', now), null);
  assert.equal(
    getScheduledPublicationDate('2026-09-01T11:59:59.999Z', now),
    undefined,
  );
  assert.equal(getScheduledPublicationDate('not-a-date', now), undefined);
  assert.equal(
    getScheduledPublicationDate('2026-09-01T12:15:00.000Z', now)?.toISOString(),
    '2026-09-01T12:15:00.000Z',
  );
});
