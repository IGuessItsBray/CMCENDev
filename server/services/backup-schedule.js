const DEFAULT_SCHEDULE = Object.freeze({
  mode: 'daily',
  time: '02:00',
  timeZone: 'America/Toronto',
  days: [0, 1, 2, 3, 4, 5, 6],
});

function validateSchedule(input) {
  const invalid = () => {
    throw Object.assign(
      new Error(
        'Choose daily, weekly, or custom; a valid time and time zone; and the required weekdays',
      ),
      { status: 400 },
    );
  };
  if (!input || typeof input.enabled !== 'boolean') invalid();
  // Existing callers and stored interval schedules remain supported until resaved.
  if (Object.hasOwn(input, 'intervalMinutes')) {
    if (
      Object.keys(input).some(
        (key) => !['enabled', 'intervalMinutes'].includes(key),
      ) ||
      !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 60 ||
      input.intervalMinutes > 525600
    )
      invalid();
    return { ...input, mode: 'interval' };
  }
  if (
    Object.keys(input).some(
      (key) => !['enabled', 'mode', 'time', 'timeZone', 'days'].includes(key),
    ) ||
    !['daily', 'weekly', 'custom'].includes(input.mode) ||
    typeof input.time !== 'string' ||
    !/^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(input.time) ||
    typeof input.timeZone !== 'string' ||
    !input.timeZone ||
    input.timeZone.length > 100 ||
    !Array.isArray(input.days) ||
    input.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    invalid();
  try {
    new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format();
  } catch {
    invalid();
  }
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  if (
    days.length !== input.days.length ||
    (input.mode === 'weekly' && days.length !== 1) ||
    (input.mode === 'custom' && !days.length)
  )
    invalid();
  return {
    enabled: input.enabled,
    mode: input.mode,
    time: input.time,
    timeZone: input.timeZone,
    days: input.mode === 'daily' ? [...DEFAULT_SCHEDULE.days] : days,
  };
}

function nextCalendarRun(schedule, after) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (instant) =>
    Object.fromEntries(
      formatter
        .formatToParts(instant)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
  const local = parts(after);
  const [hour, minute] = schedule.time.split(':').map(Number);
  for (let offset = 0; offset < 15; offset += 1) {
    const date = new Date(
      Date.UTC(local.year, local.month - 1, local.day + offset),
    );
    if (!schedule.days.includes(date.getUTCDay())) continue;
    const wall = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      minute,
    );
    const offsets = new Set(
      [-36, 0, 36].map((hours) => {
        const sample = wall + hours * 3600000;
        const p = parts(sample);
        return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - sample;
      }),
    );
    const candidates = [...offsets]
      .map((zoneOffset) => wall - zoneOffset)
      .filter((instant) => {
        const p = parts(instant);
        return (
          p.year === date.getUTCFullYear() &&
          p.month === date.getUTCMonth() + 1 &&
          p.day === date.getUTCDate() &&
          p.hour === hour &&
          p.minute === minute
        );
      })
      .sort((a, b) => a - b);
    // Nonexistent spring-forward times are skipped. Repeated fall-back times
    // run only at their first occurrence, never twice on the same local date.
    if (candidates.length && candidates[0] > after)
      return new Date(candidates[0]).toISOString();
  }
  throw new Error('Could not calculate the next backup time');
}

function nextRunAt(state, now) {
  if (!state.enabled) return null;
  if (state.mode === 'interval')
    return new Date(
      (state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : now) +
        state.intervalMinutes * 60000,
    ).toISOString();
  return state.nextRunAt || nextCalendarRun(state, now);
}

module.exports = {
  DEFAULT_SCHEDULE,
  validateSchedule,
  nextCalendarRun,
  nextRunAt,
};
