const eventListElement = document.getElementById("eventList");
const calendarGridElement = document.getElementById("calendarGrid");
const calendarMessageElement = document.getElementById("calendarMessage");
const calendarMonthLabelElement = document.getElementById("calendarMonthLabel");
const calendarPreviousButton = document.getElementById(
  "calendarPreviousButton",
);
const calendarNextButton = document.getElementById("calendarNextButton");
const calendarTodayButton = document.getElementById("calendarTodayButton");
const calendarWeekdaysElement = document.getElementById("calendarWeekdays");
const calendarMonthViewButton = document.getElementById(
  "calendarMonthViewButton",
);
const calendarAgendaViewButton = document.getElementById(
  "calendarAgendaViewButton",
);
const calendarEventTypeFilter = document.getElementById(
  "calendarEventTypeFilter",
);
const calendarOrganizingEntityFilter = document.getElementById(
  "calendarOrganizingEntityFilter",
);
const calendarProvinceRegionFilter = document.getElementById(
  "calendarProvinceRegionFilter",
);
const calendarClearFiltersButton = document.getElementById(
  "calendarClearFiltersButton",
);
const calendarDownloadButton = document.getElementById(
  "calendarDownloadButton",
);

const calendarFilterElements = [
  calendarEventTypeFilter,
  calendarOrganizingEntityFilter,
  calendarProvinceRegionFilter,
];

const MAX_EVENTS_PER_DAY = 3;

let displayedMonth = getStartOfMonth(new Date());
let isLoadingEvents = false;
let publicEvents = [];
let requestSequence = 0;
let selectedView = getInitialCalendarView();

function getCurrentLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function getLocale(language) {
  return language === "fr" ? "fr-CA" : "en-CA";
}

function getLocalizedText(value, language) {
  return CMCENUtils.getLocalizedText(value, language);
}

function getCalendarTranslation(key, replacements = {}) {
  if (typeof translate === "function") {
    return translate(key, replacements);
  }

  return key;
}

function getCalendarFilters() {
  return {
    eventType: calendarEventTypeFilter.value,
    organizingEntity: calendarOrganizingEntityFilter.value,
    provinceRegion: calendarProvinceRegionFilter.value,
  };
}

function hasCalendarFilters() {
  return Object.values(getCalendarFilters()).some(Boolean);
}

function getInitialCalendarView() {
  return window.matchMedia?.("(max-width: 700px)").matches ? "agenda" : "month";
}

function getRegionLabel(value) {
  if (!value) return "";

  const key =
    value === "International"
      ? "region_international"
      : `region_${value.toLowerCase()}`;

  return getCalendarTranslation(key);
}

function getEntityLabel(value) {
  return value ? getCalendarTranslation(`entity_${value}`) : "";
}

function getEventTypeLabel(value) {
  return value
    ? getCalendarTranslation(`event_type_${value.replace(/-/gu, "_")}`)
    : "";
}

function getDateParts(event) {
  const date = new Date(event.startDate);

  if (event.allDay) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
    };
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  };
}

function getMonthKey(event) {
  const { year, month } = getDateParts(event);

  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDisplayedMonthKey() {
  return `${displayedMonth.getFullYear()}-${String(
    displayedMonth.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function getStartOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getDateKey(dateValue, allDay) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = allDay ? date.getUTCFullYear() : date.getFullYear();
  const month = allDay ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = allDay ? date.getUTCDate() : date.getDate();

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function getLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getCalendarGridRange(month) {
  const firstDay = getStartOfMonth(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const firstGridDay = new Date(firstDay);

  firstGridDay.setDate(firstGridDay.getDate() - firstGridDay.getDay());

  const dayCount = Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7;
  const lastGridDay = new Date(firstGridDay);

  lastGridDay.setDate(lastGridDay.getDate() + dayCount - 1);

  return {
    firstGridDay,
    lastGridDay,
    dayCount,
  };
}

function formatIcsDate(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function formatIcsDateTime(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${formatIcsDate(date)}T${String(date.getUTCHours()).padStart(
    2,
    "0",
  )}${String(date.getUTCMinutes()).padStart(2, "0")}${String(
    date.getUTCSeconds(),
  ).padStart(2, "0")}Z`;
}

function formatIcsExclusiveEndDate(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setUTCDate(date.getUTCDate() + 1);

  return formatIcsDate(date);
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const lines = [];
  let currentLine = "";
  let currentLineByteLength = 0;

  for (const character of line) {
    const characterByteLength = encoder.encode(character).length;

    if (currentLine && currentLineByteLength + characterByteLength > 75) {
      lines.push(currentLine);
      currentLine = " ";
      currentLineByteLength = 1;
    }

    currentLine += character;
    currentLineByteLength += characterByteLength;
  }

  lines.push(currentLine);

  return lines.join("\r\n");
}

function getIcsEventLocation(event, language) {
  return [
    getLocalizedText(event.location, language),
    [event.city, getRegionLabel(event.provinceRegion)]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

function getIcsEventDescription(event, language) {
  const description = getLocalizedText(event.description, language);
  const registration = getLocalizedText(event.registration, language);
  const details = [description];

  if (registration) {
    details.push(
      `${getCalendarTranslation("event_registration_label")}: ${registration}`,
    );
  }

  return details.filter(Boolean).join("\n\n");
}

function getIcsEventUrl(event) {
  const url = new URL("/event", window.location.origin);

  url.searchParams.set("id", event._id);

  return url.toString();
}

function getIcsEventLines(event, language, generatedAt) {
  const title =
    getLocalizedText(event.title, language) ||
    getCalendarTranslation("calendar_untitled_event");
  const startDate = event.allDay
    ? formatIcsDate(event.startDate)
    : formatIcsDateTime(event.startDate);
  const endDate = event.allDay
    ? formatIcsExclusiveEndDate(event.endDate || event.startDate)
    : formatIcsDateTime(event.endDate);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`${event._id}@${window.location.hostname}`)}`,
    `DTSTAMP:${generatedAt}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${startDate}`);

    if (endDate) {
      lines.push(`DTEND;VALUE=DATE:${endDate}`);
    }
  } else {
    lines.push(`DTSTART:${startDate}`);

    if (endDate) {
      lines.push(`DTEND:${endDate}`);
    }
  }

  lines.push(`SUMMARY:${escapeIcsText(title)}`);

  const description = getIcsEventDescription(event, language);

  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }

  const location = getIcsEventLocation(event, language);

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  if (event.eventType) {
    lines.push(
      `CATEGORIES:${escapeIcsText(getEventTypeLabel(event.eventType))}`,
    );
  }

  lines.push(`URL:${getIcsEventUrl(event)}`, "END:VEVENT");

  return lines;
}

function buildCalendarIcs(events, language) {
  const generatedAt = formatIcsDateTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CMCEN//Events Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) =>
      getIcsEventLines(event, language, generatedAt),
    ),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function downloadCalendarIcs() {
  if (!publicEvents.length) {
    return;
  }

  const { firstGridDay, lastGridDay } = getCalendarGridRange(displayedMonth);
  const fileName = [
    "cmcen-events",
    getLocalDateKey(firstGridDay),
    "to",
    getLocalDateKey(lastGridDay),
  ].join("-");
  const content = buildCalendarIcs(publicEvents, getCurrentLanguage());
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = `${fileName}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

  CMCENUtils.showToast(getCalendarTranslation("calendar_download_started"), {
    color: "success",
    position: "bottom-right",
    animation: "slide",
  });
}

function formatMonthHeading(event, locale) {
  return CMCENUtils.formatDate(event.startDate, {
    locale,
    month: "long",
    year: "numeric",
    ...(event.allDay ? { timeZone: "UTC" } : {}),
  });
}

function formatMonthAbbreviation(event, locale) {
  return CMCENUtils.formatDate(event.startDate, {
    locale,
    month: "short",
    ...(event.allDay ? { timeZone: "UTC" } : {}),
  });
}

function formatCalendarMonth(month, locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
}

function formatCalendarDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getDayNumber(dateValue, allDay) {
  const date = new Date(dateValue);

  return allDay ? date.getUTCDate() : date.getDate();
}

function getMonthNumber(dateValue, allDay) {
  const date = new Date(dateValue);

  return allDay ? date.getUTCMonth() : date.getMonth();
}

function getYearNumber(dateValue, allDay) {
  const date = new Date(dateValue);

  return allDay ? date.getUTCFullYear() : date.getFullYear();
}

function formatDayLabel(event) {
  const startDay = getDayNumber(event.startDate, event.allDay);

  if (!event.endDate) {
    return String(startDay);
  }

  const sameMonth =
    getMonthNumber(event.startDate, event.allDay) ===
    getMonthNumber(event.endDate, event.allDay);
  const sameYear =
    getYearNumber(event.startDate, event.allDay) ===
    getYearNumber(event.endDate, event.allDay);
  const endDay = getDayNumber(event.endDate, event.allDay);

  if (sameMonth && sameYear && endDay !== startDay) {
    return `${startDay}-${endDay}`;
  }

  return String(startDay);
}

function formatEventTime(event, locale) {
  if (event.allDay) {
    return getCalendarTranslation("all_day");
  }

  const startTime = CMCENUtils.formatDate(event.startDate, {
    locale,
    hour: "numeric",
    minute: "2-digit",
  });

  if (!event.endDate) {
    return startTime;
  }

  const endTime = CMCENUtils.formatDate(event.endDate, {
    locale,
    hour: "numeric",
    minute: "2-digit",
  });

  return `${startTime}-${endTime}`;
}

function formatEventDateRange(event, locale) {
  const formatDate = (value) =>
    CMCENUtils.formatDate(value, {
      locale,
      month: "short",
      day: "numeric",
      ...(event.allDay ? { timeZone: "UTC" } : {}),
    });

  const startLabel = formatDate(event.startDate);

  if (!event.endDate) {
    return startLabel;
  }

  const endLabel = formatDate(event.endDate);

  return endLabel === startLabel ? startLabel : `${startLabel}-${endLabel}`;
}

function createCalendarMeta(label, value) {
  if (!value) return null;

  const item = document.createElement("span");

  item.className = "calendar-event-meta-item";

  const labelElement = document.createElement("span");

  labelElement.className = "calendar-event-meta-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("span");

  valueElement.className = "calendar-event-meta-value";
  valueElement.textContent = value;

  item.append(labelElement, valueElement);

  return item;
}

function createAgendaEventCard(event, language, locale) {
  const article = document.createElement("a");

  article.className = "calendar-event";
  article.href = `/event?id=${encodeURIComponent(event._id)}`;

  const dayColumn = document.createElement("div");

  dayColumn.className = "calendar-event-day";

  const dayNumber = document.createElement("span");

  dayNumber.className = "calendar-event-day-number";
  dayNumber.textContent = formatDayLabel(event);

  const monthLabel = document.createElement("span");

  monthLabel.className = "calendar-event-month";
  monthLabel.textContent = formatMonthAbbreviation(event, locale);

  const eventTime = document.createElement("span");

  eventTime.className = "calendar-event-time";
  eventTime.textContent = formatEventTime(event, locale);

  dayColumn.append(monthLabel, dayNumber, eventTime);

  const content = document.createElement("div");

  content.className = "calendar-event-content";

  const body = document.createElement("div");

  body.className = "calendar-event-body";

  const dateLine = document.createElement("p");

  dateLine.className = "calendar-event-date-line";
  dateLine.textContent = formatEventDateRange(event, locale);

  const titleElement = document.createElement("h3");

  titleElement.className = "calendar-event-title";
  titleElement.textContent = getLocalizedText(event.title, language);
  article.setAttribute("aria-label", titleElement.textContent);

  body.append(dateLine, titleElement);

  const location = getLocalizedText(event.location, language);

  if (location) {
    const locationElement = document.createElement("p");

    locationElement.className = "calendar-event-location";
    locationElement.textContent = location;

    body.appendChild(locationElement);
  }

  const description = getLocalizedText(event.description, language);

  if (description) {
    const descriptionElement = document.createElement("p");

    descriptionElement.className = "calendar-event-description";
    descriptionElement.textContent = description;

    body.appendChild(descriptionElement);
  }

  const metaRail = document.createElement("div");

  metaRail.className = "calendar-event-meta";

  const cityRegion = [event.city, getRegionLabel(event.provinceRegion)]
    .filter(Boolean)
    .join(", ");

  [
    createCalendarMeta(
      getCalendarTranslation("calendar_meta_type"),
      getEventTypeLabel(event.eventType),
    ),
    createCalendarMeta(
      getCalendarTranslation("calendar_meta_area"),
      cityRegion,
    ),
    createCalendarMeta(
      getCalendarTranslation("calendar_meta_host"),
      getEntityLabel(event.organizingEntity),
    ),
  ].forEach((item) => {
    if (item) {
      metaRail.appendChild(item);
    }
  });

  content.appendChild(body);

  if (metaRail.childElementCount) {
    content.appendChild(metaRail);
  }

  article.append(dayColumn, content);

  return article;
}

function getEventsForDate(date) {
  const dateKey = getLocalDateKey(date);

  return publicEvents.filter((event) => {
    const startDateKey = getDateKey(event.startDate, event.allDay);
    const endDateKey = event.endDate
      ? getDateKey(event.endDate, event.allDay)
      : startDateKey;

    return (
      startDateKey &&
      endDateKey &&
      startDateKey <= dateKey &&
      endDateKey >= dateKey
    );
  });
}

function isMultiDayEvent(event) {
  if (!event.endDate) {
    return false;
  }

  const startDateKey = getDateKey(event.startDate, event.allDay);
  const endDateKey = getDateKey(event.endDate, event.allDay);

  return Boolean(startDateKey && endDateKey && startDateKey < endDateKey);
}

function getSingleDayEventsForDate(date) {
  return getEventsForDate(date).filter((event) => !isMultiDayEvent(event));
}

function getEventChipTime(event, date, locale) {
  if (event.allDay) {
    return getCalendarTranslation("all_day");
  }

  if (getDateKey(event.startDate, false) !== getLocalDateKey(date)) {
    return getCalendarTranslation("calendar_continues");
  }

  return CMCENUtils.formatDate(event.startDate, {
    locale,
    hour: "numeric",
    minute: "2-digit",
  });
}

function createCalendarEventChip(event, date, language, locale) {
  const link = document.createElement("a");
  const title = getLocalizedText(event.title, language);
  const time = getEventChipTime(event, date, locale);
  const eventType = getEventTypeLabel(event.eventType);

  link.className = "calendar-event-chip";
  link.href = `/event?id=${encodeURIComponent(event._id)}`;
  link.setAttribute(
    "aria-label",
    [title, time, eventType].filter(Boolean).join(", "),
  );

  if (event.eventType) {
    link.dataset.eventType = event.eventType;
  }

  const timeElement = document.createElement("span");

  timeElement.className = "calendar-event-chip-time";
  timeElement.textContent = time;

  const titleElement = document.createElement("span");

  titleElement.className = "calendar-event-chip-title";
  titleElement.textContent = title;

  link.append(timeElement, titleElement);

  return link;
}

function getMultiDayEventSegments(weekDates) {
  const weekDateKeys = weekDates.map(getLocalDateKey);
  const weekStartKey = weekDateKeys[0];
  const weekEndKey = weekDateKeys[weekDateKeys.length - 1];
  const segments = publicEvents
    .filter((event) => {
      if (!isMultiDayEvent(event)) {
        return false;
      }

      const startDateKey = getDateKey(event.startDate, event.allDay);
      const endDateKey = getDateKey(event.endDate, event.allDay);

      return startDateKey <= weekEndKey && endDateKey >= weekStartKey;
    })
    .map((event) => {
      const startDateKey = getDateKey(event.startDate, event.allDay);
      const endDateKey = getDateKey(event.endDate, event.allDay);
      const startIndex =
        startDateKey < weekStartKey ? 0 : weekDateKeys.indexOf(startDateKey);
      const endIndex =
        endDateKey > weekEndKey
          ? weekDateKeys.length - 1
          : weekDateKeys.indexOf(endDateKey);

      return {
        event,
        startDateKey,
        endDateKey,
        startIndex,
        endIndex,
        startsInWeek: startDateKey >= weekStartKey,
        endsInWeek: endDateKey <= weekEndKey,
      };
    })
    .sort((firstSegment, secondSegment) => {
      if (firstSegment.startIndex !== secondSegment.startIndex) {
        return firstSegment.startIndex - secondSegment.startIndex;
      }

      if (firstSegment.endIndex !== secondSegment.endIndex) {
        return secondSegment.endIndex - firstSegment.endIndex;
      }

      return (
        new Date(firstSegment.event.startDate) -
        new Date(secondSegment.event.startDate)
      );
    });
  const occupiedUntilByLane = [];

  segments.forEach((segment) => {
    let lane = occupiedUntilByLane.findIndex(
      (occupiedUntil) => occupiedUntil < segment.startIndex,
    );

    if (lane < 0) {
      lane = occupiedUntilByLane.length;
    }

    occupiedUntilByLane[lane] = segment.endIndex;
    segment.lane = lane;
  });

  return {
    segments,
    laneCount: occupiedUntilByLane.length,
  };
}

function setMultiDayEventHighlight(eventId, isHighlighted) {
  document.querySelectorAll(".calendar-multiday-event").forEach((eventBar) => {
    eventBar.classList.toggle(
      "is-related-highlighted",
      isHighlighted && eventBar.dataset.eventId === eventId,
    );
  });
}

function createMultiDayEventBar(segment, language, locale) {
  const { event, startIndex, endIndex, lane, startsInWeek, endsInWeek } =
    segment;
  const link = document.createElement("a");
  const title = getLocalizedText(event.title, language);
  const timeLabel = startsInWeek
    ? event.allDay
      ? getCalendarTranslation("all_day")
      : CMCENUtils.formatDate(event.startDate, {
          locale,
          hour: "numeric",
          minute: "2-digit",
        })
    : "";

  link.className = "calendar-multiday-event";
  link.href = `/event?id=${encodeURIComponent(event._id)}`;
  link.dataset.eventId = event._id;
  link.style.gridColumn = `${startIndex + 1} / ${endIndex + 2}`;
  link.style.gridRow = String(lane + 1);
  link.setAttribute(
    "aria-label",
    [
      title,
      !startsInWeek && getCalendarTranslation("calendar_continues"),
      formatEventDateRange(event, locale),
      formatEventTime(event, locale),
    ]
      .filter(Boolean)
      .join(", "),
  );

  if (!startsInWeek) {
    link.classList.add("is-continuing-from-previous-week");
  }

  if (!endsInWeek) {
    link.classList.add("is-continuing-into-next-week");
  }

  if (event.eventType) {
    link.dataset.eventType = event.eventType;
  }

  if (timeLabel) {
    const timeElement = document.createElement("span");

    timeElement.className = "calendar-multiday-event-time";
    timeElement.textContent = timeLabel;

    link.appendChild(timeElement);
  }

  const titleElement = document.createElement("span");

  titleElement.className = "calendar-multiday-event-title";
  titleElement.textContent = title;

  link.appendChild(titleElement);
  link.addEventListener("pointerenter", () => {
    setMultiDayEventHighlight(event._id, true);
  });
  link.addEventListener("pointerleave", () => {
    setMultiDayEventHighlight(event._id, false);
  });
  link.addEventListener("focus", () => {
    setMultiDayEventHighlight(event._id, true);
  });
  link.addEventListener("blur", () => {
    setMultiDayEventHighlight(event._id, false);
  });

  return link;
}

function createCalendarDayCell(date, language, locale) {
  const day = document.createElement("article");
  const dayKey = getLocalDateKey(date);
  const todayKey = getLocalDateKey(new Date());
  const isCurrentMonth =
    date.getMonth() === displayedMonth.getMonth() &&
    date.getFullYear() === displayedMonth.getFullYear();

  day.className = "calendar-day";
  day.dataset.date = dayKey;

  if (!isCurrentMonth) {
    day.classList.add("is-outside-month");
  }

  if (dayKey === todayKey) {
    day.classList.add("is-today");
  }

  const heading = document.createElement("h3");
  const dateLabel = document.createElement("time");

  heading.className = "calendar-day-heading";
  dateLabel.className = "calendar-day-number";
  dateLabel.dateTime = dayKey;
  dateLabel.textContent = String(date.getDate());
  dateLabel.setAttribute("aria-label", formatCalendarDate(date, locale));

  if (dayKey === todayKey) {
    const todayLabel = document.createElement("span");

    todayLabel.className = "calendar-today-label";
    todayLabel.textContent = getCalendarTranslation("calendar_today");

    heading.append(todayLabel);
  }

  heading.append(dateLabel);

  const events = getSingleDayEventsForDate(date);
  const visibleEvents = events.slice(0, MAX_EVENTS_PER_DAY);
  const eventList = document.createElement("div");

  eventList.className = "calendar-day-events";

  visibleEvents.forEach((event) => {
    eventList.appendChild(
      createCalendarEventChip(event, date, language, locale),
    );
  });

  day.append(heading, eventList);

  if (events.length > MAX_EVENTS_PER_DAY) {
    const overflowEvents = events.slice(MAX_EVENTS_PER_DAY);
    const overflowList = document.createElement("div");
    const moreButton = document.createElement("button");
    let expanded = false;

    overflowList.className = "calendar-day-events calendar-day-overflow";
    overflowList.hidden = true;

    overflowEvents.forEach((event) => {
      overflowList.appendChild(
        createCalendarEventChip(event, date, language, locale),
      );
    });

    moreButton.type = "button";
    moreButton.className = "calendar-more-events-button";
    moreButton.setAttribute("aria-expanded", "false");
    moreButton.textContent = getCalendarTranslation("calendar_more_events", {
      count: overflowEvents.length,
    });
    moreButton.addEventListener("click", () => {
      expanded = !expanded;
      overflowList.hidden = !expanded;
      moreButton.setAttribute("aria-expanded", String(expanded));
      moreButton.textContent = getCalendarTranslation(
        expanded ? "calendar_fewer_events" : "calendar_more_events",
        { count: overflowEvents.length },
      );
    });

    day.append(moreButton, overflowList);
  }

  return day;
}

function renderWeekdayHeadings(locale) {
  calendarWeekdaysElement.replaceChildren();

  for (let index = 0; index < 7; index += 1) {
    const weekday = document.createElement("span");
    const date = new Date(2024, 0, 7 + index);

    weekday.textContent = new Intl.DateTimeFormat(locale, {
      weekday: "short",
    }).format(date);

    calendarWeekdaysElement.appendChild(weekday);
  }
}

function renderMonthCalendar(language, locale) {
  const { dayCount, firstGridDay } = getCalendarGridRange(displayedMonth);

  calendarGridElement.replaceChildren();
  renderWeekdayHeadings(locale);

  for (let index = 0; index < dayCount; index += 7) {
    const week = document.createElement("section");
    const weekDates = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(firstGridDay);

      date.setDate(firstGridDay.getDate() + index + dayIndex);

      return date;
    });
    const { segments, laneCount } = getMultiDayEventSegments(weekDates);

    week.className = "calendar-week";
    week.style.setProperty("--calendar-multiday-space", `${laneCount * 27}px`);

    weekDates.forEach((date) => {
      week.appendChild(createCalendarDayCell(date, language, locale));
    });

    if (segments.length) {
      const eventBars = document.createElement("div");

      eventBars.className = "calendar-multiday-events";

      segments.forEach((segment) => {
        eventBars.appendChild(
          createMultiDayEventBar(segment, language, locale),
        );
      });

      week.appendChild(eventBars);
    }

    calendarGridElement.appendChild(week);
  }
}

function renderAgenda(language, locale) {
  eventListElement.replaceChildren();

  const heading = document.createElement("h2");

  heading.className = "visually-hidden";
  heading.id = "calendarAgendaHeading";
  heading.textContent = getCalendarTranslation("calendar_agenda_heading");
  eventListElement.appendChild(heading);

  // The event request includes the leading and trailing days that fill the
  // month grid. Agenda view shows only events in the selected month.
  const agendaEvents = publicEvents.filter(
    (event) => getMonthKey(event) === getDisplayedMonthKey(),
  );

  if (!agendaEvents.length) {
    const emptyMonth = document.createElement("section");
    emptyMonth.className = "calendar-month";

    const monthTitle = document.createElement("h3");
    monthTitle.className = "calendar-month-title";
    monthTitle.textContent = formatCalendarMonth(displayedMonth, locale);

    const emptyCard = document.createElement("div");
    emptyCard.className = "calendar-event calendar-event-empty";

    const emptyContent = document.createElement("div");
    emptyContent.className = "calendar-event-content";

    const emptyTitle = document.createElement("p");
    emptyTitle.className = "calendar-event-title";
    emptyTitle.textContent = getCalendarTranslation("calendar_no_events_in_view");

    emptyContent.append(emptyTitle);
    emptyCard.append(emptyContent);
    emptyMonth.append(monthTitle, emptyCard);
    eventListElement.append(emptyMonth);
    return;
  }

  let currentMonthKey = null;
  let currentMonthGroup = null;

  agendaEvents.forEach((event) => {
    const monthKey = getMonthKey(event);

    if (monthKey !== currentMonthKey) {
      currentMonthKey = monthKey;
      currentMonthGroup = document.createElement("section");

      currentMonthGroup.className = "calendar-month";

      const heading = document.createElement("h3");

      heading.className = "calendar-month-title";
      heading.textContent = formatMonthHeading(event, locale);

      currentMonthGroup.appendChild(heading);
      eventListElement.appendChild(currentMonthGroup);
    }

    currentMonthGroup.appendChild(
      createAgendaEventCard(event, language, locale),
    );
  });
}

function updateCalendarControls(locale) {
  const monthLabel = formatCalendarMonth(displayedMonth, locale);
  const isMonthView = selectedView === "month";

  calendarMonthLabelElement.textContent = monthLabel;
  calendarPreviousButton.disabled = isLoadingEvents;
  calendarNextButton.disabled = isLoadingEvents;
  calendarTodayButton.disabled = isLoadingEvents;
  calendarMonthViewButton.disabled = isLoadingEvents;
  calendarAgendaViewButton.disabled = isLoadingEvents;
  calendarFilterElements.forEach((filter) => {
    filter.disabled = isLoadingEvents;
  });
  calendarClearFiltersButton.disabled =
    isLoadingEvents || !hasCalendarFilters();
  calendarDownloadButton.disabled = isLoadingEvents || !publicEvents.length;
  calendarMonthViewButton.setAttribute("aria-pressed", String(isMonthView));
  calendarAgendaViewButton.setAttribute("aria-pressed", String(!isMonthView));
  calendarMonthViewButton.classList.toggle("is-active", isMonthView);
  calendarAgendaViewButton.classList.toggle("is-active", !isMonthView);
  calendarWeekdaysElement.hidden = !isMonthView;
  calendarGridElement.hidden = !isMonthView;
  eventListElement.hidden = isMonthView;
  calendarGridElement.setAttribute(
    "aria-label",
    getCalendarTranslation("calendar_month_grid_label", { month: monthLabel }),
  );
}

function showCalendarMessage(key, type = "") {
  calendarMessageElement.hidden = false;
  calendarMessageElement.className = ["calendar-message", type && `is-${type}`]
    .filter(Boolean)
    .join(" ");
  calendarMessageElement.textContent = getCalendarTranslation(key);
}

function hideCalendarMessage() {
  calendarMessageElement.hidden = true;
}

function renderCalendar() {
  const language = getCurrentLanguage();
  const locale = getLocale(language);

  updateCalendarControls(locale);
  renderMonthCalendar(language, locale);
  renderAgenda(language, locale);

  if (isLoadingEvents) {
    return;
  }

  if (!publicEvents.length && selectedView === "month") {
    showCalendarMessage("calendar_no_events_in_view");
    return;
  }

  hideCalendarMessage();
}

async function loadEvents() {
  const requestId = ++requestSequence;
  const { firstGridDay, lastGridDay } = getCalendarGridRange(displayedMonth);
  const query = new URLSearchParams({
    from: getLocalDateKey(firstGridDay),
    to: getLocalDateKey(lastGridDay),
  });
  const filters = getCalendarFilters();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  isLoadingEvents = true;
  publicEvents = [];
  renderCalendar();
  showCalendarMessage("loading_events", "loading");
  calendarGridElement.setAttribute("aria-busy", "true");
  calendarGridElement.classList.add("is-skeleton-loading");

  try {
    const response = await fetch(`/api/events?${query}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load events");
    }

    if (requestId !== requestSequence) {
      return;
    }

    publicEvents = (data.events || []).sort((firstEvent, secondEvent) => {
      return new Date(firstEvent.startDate) - new Date(secondEvent.startDate);
    });
    isLoadingEvents = false;
    renderCalendar();
  } catch (error) {
    if (requestId !== requestSequence) {
      return;
    }

    console.error(error);
    publicEvents = [];
    renderMonthCalendar(getCurrentLanguage(), getLocale(getCurrentLanguage()));
    renderAgenda(getCurrentLanguage(), getLocale(getCurrentLanguage()));
    showCalendarMessage("events_load_error", "error");
  } finally {
    if (requestId === requestSequence) {
      isLoadingEvents = false;
      calendarGridElement.removeAttribute("aria-busy");
      calendarGridElement.classList.remove("is-skeleton-loading");
      updateCalendarControls(getLocale(getCurrentLanguage()));
    }
  }
}

function changeDisplayedMonth(offset) {
  displayedMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + offset,
    1,
  );

  loadEvents();
}

calendarPreviousButton.addEventListener("click", () => {
  changeDisplayedMonth(-1);
});

calendarNextButton.addEventListener("click", () => {
  changeDisplayedMonth(1);
});

calendarTodayButton.addEventListener("click", () => {
  displayedMonth = getStartOfMonth(new Date());
  loadEvents();
});

[calendarMonthViewButton, calendarAgendaViewButton].forEach((button) => {
  button.addEventListener("click", () => {
    selectedView = button.dataset.calendarView;
    renderCalendar();
  });
});

calendarFilterElements.forEach((filter) => {
  filter.addEventListener("change", loadEvents);
});

calendarClearFiltersButton.addEventListener("click", () => {
  if (!hasCalendarFilters()) {
    return;
  }

  calendarFilterElements.forEach((filter) => {
    filter.value = "";
  });
  loadEvents();
});

calendarDownloadButton.addEventListener("click", downloadCalendarIcs);

document.addEventListener("languagechange", renderCalendar);

loadEvents();
