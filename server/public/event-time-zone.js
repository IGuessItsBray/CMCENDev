(function (root) {
  "use strict";
  function invalid(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
  function formatter(timeZone) {
    if (!timeZone)
      throw invalid("event_time_zone_required", "Select the event timezone.");
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    } catch {
      throw invalid(
        "event_time_zone_required",
        "Select a valid event timezone.",
      );
    }
  }
  function parts(date, timeZone) {
    return Object.fromEntries(
      formatter(timeZone)
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
  }
  function toInput(value, { timeZone, allDay = false } = {}) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw invalid("event_time_invalid", "Enter a valid event date and time.");
    if (allDay) return date.toISOString().slice(0, 10) + "T00:00";
    const p = parts(date, timeZone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function toInstant(value, { timeZone, allDay = false, originalValue } = {}) {
    const input = String(value || "").trim();
    if (!input) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(input);
    if (!match || (!allDay && !match[4]))
      throw invalid("event_time_invalid", "Enter a valid event date and time.");
    const [, y, m, d, hh = "00", mm = "00"] = match;
    const nominal = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      allDay ? 0 : Number(hh),
      allDay ? 0 : Number(mm),
    );
    const date = new Date(nominal);
    const wall = `${y}-${m}-${d}T${hh}:${mm}`;
    if (
      !Number.isFinite(nominal) ||
      date.toISOString().slice(0, 10) !== `${y}-${m}-${d}` ||
      Number(hh) > 23 ||
      Number(mm) > 59
    )
      throw invalid("event_time_invalid", "Enter a valid event date and time.");
    if (allDay) return date.toISOString();
    formatter(timeZone);
    // Preserve an existing instant, including seconds and either side of a DST
    // fold, when its displayed wall time has not changed.
    if (originalValue && toInput(originalValue, { timeZone }) === wall)
      return new Date(originalValue).toISOString();
    const offsets = new Set();
    for (let hour = -36; hour <= 36; hour += 6) {
      const probe = new Date(nominal + hour * 3600000),
        p = parts(probe, timeZone);
      offsets.add(
        Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
          probe.getTime(),
      );
    }
    const candidates = [...offsets]
      .map((offset) => new Date(nominal - offset))
      .filter((candidate) => toInput(candidate, { timeZone }) === wall);
    if (!candidates.length)
      throw invalid(
        "event_time_gap",
        "This local time does not exist because the clocks change. Choose another time.",
      );
    if (candidates.length > 1)
      throw invalid(
        "event_time_fold",
        "This local time occurs twice because the clocks change. Keep the original time or choose an unambiguous time.",
      );
    return candidates[0].toISOString();
  }
  const api = { toInput, toInstant };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CMCENEventTime = api;
})(typeof window === "undefined" ? globalThis : window);
