const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateSchedule,
  nextCalendarRun,
} = require('../services/backup-schedule');
const daily = {
  enabled: true,
  mode: 'daily',
  time: '02:00',
  timeZone: 'America/Toronto',
  days: [],
};
const next = (input, after) =>
  nextCalendarRun(validateSchedule(input), Date.parse(after));

test('daily schedules use the chosen local time independently of server time zone', () => {
  assert.equal(next(daily, '2026-10-09T00:00:00Z'), '2026-10-09T06:00:00.000Z');
  assert.equal(next(daily, '2026-10-09T06:00:00Z'), '2026-10-10T06:00:00.000Z');
  assert.equal(
    next(
      { ...daily, timeZone: 'Pacific/Kiritimati', time: '00:00' },
      '2026-10-09T09:59:00Z',
    ),
    '2026-10-09T10:00:00.000Z',
  );
});

test('weekly and custom schedules select the correct weekdays and cross week boundaries', () => {
  assert.equal(
    next(
      { ...daily, mode: 'weekly', days: [1], time: '09:15' },
      '2026-10-09T16:00:00Z',
    ),
    '2026-10-12T13:15:00.000Z',
  );
  assert.equal(
    next(
      { ...daily, mode: 'custom', days: [1, 3, 5], time: '13:00' },
      '2026-10-09T16:00:00Z',
    ),
    '2026-10-09T17:00:00.000Z',
  );
  assert.equal(
    next(
      { ...daily, mode: 'custom', days: [1, 3, 5], time: '13:00' },
      '2026-10-09T17:00:00Z',
    ),
    '2026-10-12T17:00:00.000Z',
  );
});

test('spring-forward nonexistent times skip the day and fall-back repeated times run once', () => {
  const schedule = { ...daily, time: '02:30' };
  assert.equal(
    next(schedule, '2026-03-08T05:00:00Z'),
    '2026-03-09T06:30:00.000Z',
  );
  assert.equal(
    next({ ...schedule, mode: 'weekly', days: [0] }, '2026-03-08T05:00:00Z'),
    '2026-03-15T06:30:00.000Z',
  );
  assert.equal(
    next({ ...daily, time: '01:30' }, '2026-11-01T04:00:00Z'),
    '2026-11-01T05:30:00.000Z',
  );
  assert.equal(
    next({ ...daily, time: '01:30' }, '2026-11-01T05:30:00Z'),
    '2026-11-02T06:30:00.000Z',
  );
});

test('calendar schedules reject malformed times, zones, days, modes, and extra fields', () => {
  for (const overrides of [
    { mode: 'cron' },
    { time: '24:00' },
    { time: '2:00' },
    { timeZone: 'Invalid/Zone' },
    { days: [7] },
    { days: [1, 1] },
    { mode: 'weekly', days: [] },
    { mode: 'weekly', days: [1, 2] },
    { mode: 'custom', days: [] },
    { password: 'unexpected' },
    { enabled: 'true' },
  ]) {
    assert.throws(() => validateSchedule({ ...daily, ...overrides }), {
      status: 400,
    });
  }
  assert.equal(
    validateSchedule({ enabled: true, intervalMinutes: 120 }).mode,
    'interval',
  );
});
