const assert = require('node:assert/strict');
const test = require('node:test');
const { toInput, toInstant } = require('../public/event-time-zone');

test('TGIT is displayed and saved in Toronto independently of the browser timezone', () => {
  const timeZone = 'America/Toronto';
  for (const [instant, wall] of [
    ['2025-10-23T20:00:00.000Z', '2025-10-23T16:00'],
    ['2025-10-23T23:00:00.000Z', '2025-10-23T19:00'],
  ]) {
    assert.equal(toInput(instant, { timeZone }), wall);
    assert.equal(toInstant(wall, { timeZone }), instant);
  }
});
test('Canadian offsets, fractional offsets, winter and summer round-trip', () => {
  for (const timeZone of [
    'America/St_Johns',
    'America/Halifax',
    'America/Toronto',
    'America/Winnipeg',
    'America/Edmonton',
    'America/Vancouver',
    'Asia/Kathmandu',
  ]) {
    for (const instant of [
      '2025-01-15T20:00:00.000Z',
      '2025-07-15T20:00:00.000Z',
    ]) {
      const wall = toInput(instant, { timeZone });
      assert.equal(toInstant(wall, { timeZone }), instant);
    }
  }
});
test('DST gaps are rejected rather than shifted', () => {
  assert.throws(
    () => toInstant('2025-03-09T02:30', { timeZone: 'America/Toronto' }),
    { code: 'event_time_gap' },
  );
  assert.throws(
    () => toInstant('2025-03-09T02:30', { timeZone: 'America/Vancouver' }),
    { code: 'event_time_gap' },
  );
});
test('DST repeated times preserve either original instant but new ambiguous entries are rejected', () => {
  const timeZone = 'America/Toronto',
    wall = '2025-11-02T01:30';
  for (const originalValue of [
    '2025-11-02T05:30:12.123Z',
    '2025-11-02T06:30:00.000Z',
  ]) {
    assert.equal(toInput(originalValue, { timeZone }), wall);
    assert.equal(toInstant(wall, { timeZone, originalValue }), originalValue);
  }
  assert.throws(() => toInstant(wall, { timeZone }), {
    code: 'event_time_fold',
  });
});
test('all-day dates remain UTC date containers across timezones', () => {
  for (const timeZone of [
    'America/Vancouver',
    'America/Toronto',
    'Pacific/Auckland',
  ]) {
    assert.equal(
      toInput('2025-10-21T00:00:00Z', { timeZone, allDay: true }),
      '2025-10-21T00:00',
    );
    assert.equal(
      toInstant('2025-10-21T00:00', { timeZone, allDay: true }),
      '2025-10-21T00:00:00.000Z',
    );
  }
});
test('invalid dates, missing zones and malformed local values fail safely', () => {
  for (const value of [
    '2025-02-30T12:00',
    '2025-10-23T25:00',
    'not a date',
    '2025-10-23T12:00Z',
  ])
    assert.throws(() => toInstant(value, { timeZone: 'America/Toronto' }));
  assert.throws(() => toInstant('2025-10-23T12:00', {}), {
    code: 'event_time_zone_required',
  });
  assert.throws(() => toInstant('2025-10-23T12:00', { timeZone: 'global' }), {
    code: 'event_time_zone_required',
  });
  assert.equal(toInstant('', { timeZone: 'America/Toronto' }), null);
});
