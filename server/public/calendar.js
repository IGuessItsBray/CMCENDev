const eventListElement = document.getElementById('eventList');
const calendarMessageElement = document.getElementById('calendarMessage');

let publicEvents = [];

function getCurrentLanguage() {
    return localStorage.getItem('lang') || 'en';
}

function getLocale(language) {
    return language === 'fr'
        ? 'fr-CA'
        : 'en-CA';
}

function getLocalizedText(value, language) {
    if (!value) return '';

    const preferred = typeof value[language] === 'string' ? value[language].trim() : '';

    if (preferred) return preferred;

    const fallbackLanguage = language === 'en' ? 'fr' : 'en';

    return typeof value[fallbackLanguage] === 'string' ? value[fallbackLanguage].trim() : '';
}

function getCalendarTranslation(key, replacements = {}) {
    if (typeof translate === "function") {
        return translate(key, replacements);
    }

    return key;
}

function getRegionLabel(value) {
    if (!value) return "";

    const key = value === "International"
        ? "region_international"
        : `region_${value.toLowerCase()}`;

    return getCalendarTranslation(key);
}

function getEntityLabel(value) {
    return value
        ? getCalendarTranslation(`entity_${value}`)
        : "";
}

function getEventTypeLabel(value) {
    return value
        ? getCalendarTranslation(
            `event_type_${value.replace(/-/g, "_")}`
        )
        : "";
}

function getDateParts(event) {
    const date = new Date(event.startDate);

    if (event.allDay) {
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth()
        };
    }

    return {
        year: date.getFullYear(),
        month: date.getMonth()
    };
}

function getMonthKey(event) {
    const { year, month } = getDateParts(event);

    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatMonthHeading(event, locale) {
    const date = new Date(event.startDate);

    return new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        ...(event.allDay
            ? { timeZone: 'UTC' }
            : {})
    }).format(date);
}

function formatMonthAbbreviation(event, locale) {
    const date = new Date(event.startDate);

    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        ...(event.allDay
            ? { timeZone: 'UTC' }
            : {})
    }).format(date);
}

function getDayNumber(dateValue, allDay) {
    const date = new Date(dateValue);

    return allDay
        ? date.getUTCDate()
        : date.getDate();
}

function getMonthNumber(dateValue, allDay) {
    const date = new Date(dateValue);

    return allDay
        ? date.getUTCMonth()
        : date.getMonth();
}

function getYearNumber(dateValue, allDay) {
    const date = new Date(dateValue);

    return allDay
        ? date.getUTCFullYear()
        : date.getFullYear();
}

function formatDayLabel(event) {
    const startDay =
        getDayNumber(event.startDate, event.allDay);

    if (!event.endDate) {
        return String(startDay);
    }

    const sameMonth =
        getMonthNumber(event.startDate, event.allDay) ===
        getMonthNumber(event.endDate, event.allDay);

    const sameYear =
        getYearNumber(event.startDate, event.allDay) ===
        getYearNumber(event.endDate, event.allDay);

    const endDay =
        getDayNumber(event.endDate, event.allDay);

    if (
        sameMonth &&
        sameYear &&
        endDay !== startDay
    ) {
        return `${startDay}-${endDay}`;
    }

    return String(startDay);
}

function formatEventTime(event, locale) {
    if (event.allDay) {
        return getCalendarTranslation("all_day");
    }

    const formatter =
        new Intl.DateTimeFormat(
            locale,
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );

    const startTime = formatter.format(new Date(event.startDate));

    if (!event.endDate) {
        return startTime;
    }

    const endTime =
        formatter.format(
            new Date(event.endDate)
        );

    return `${startTime}-${endTime}`;
}

function formatEventDateRange(event, locale) {
    const formatter = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(event.allDay
            ? { timeZone: "UTC" }
            : {})
    });

    const startLabel = formatter.format(new Date(event.startDate));

    if (!event.endDate) {
        return startLabel;
    }

    const endLabel = formatter.format(new Date(event.endDate));

    return endLabel === startLabel
        ? startLabel
        : `${startLabel}-${endLabel}`;
}

function createCalendarMeta(label, value) {
    if (!value) return null;

    const item = document.createElement('span');
    item.className = 'calendar-event-meta-item';

    const labelElement = document.createElement('span');
    labelElement.className = 'calendar-event-meta-label';
    labelElement.textContent = label;

    const valueElement = document.createElement('span');
    valueElement.className = 'calendar-event-meta-value';
    valueElement.textContent = value;

    item.append(labelElement, valueElement);

    return item;
}

function createEventCard(event, language, locale) {
    const article = document.createElement('a');
    article.className = 'calendar-event';
    article.href =
        `/event.html?id=${encodeURIComponent(event._id)}`;

    const dayColumn = document.createElement('div');
    dayColumn.className = 'calendar-event-day';

    const dayNumber = document.createElement('span');
    dayNumber.className = 'calendar-event-day-number';
    dayNumber.textContent = formatDayLabel(event);

    const monthLabel = document.createElement('span');
    monthLabel.className = 'calendar-event-month';
    monthLabel.textContent = formatMonthAbbreviation(event, locale);

    const eventTime = document.createElement('span');
    eventTime.className = 'calendar-event-time';
    eventTime.textContent = formatEventTime(event, locale);

    dayColumn.append(monthLabel, dayNumber, eventTime);

    const content = document.createElement('div');
    content.className = 'calendar-event-content';

    const body = document.createElement('div');
    body.className = 'calendar-event-body';

    const dateLine = document.createElement('p');
    dateLine.className = 'calendar-event-date-line';
    dateLine.textContent = formatEventDateRange(event, locale);

    const titleElement = document.createElement('h3');
    titleElement.className = 'calendar-event-title';
    titleElement.textContent = getLocalizedText(event.title, language);
    article.setAttribute(
        'aria-label',
        titleElement.textContent
    );

    body.append(dateLine, titleElement);

    const location = getLocalizedText(event.location, language);

    if (location) {
        const locationElement = document.createElement('p');
        locationElement.className = 'calendar-event-location';
        locationElement.textContent = location;

        body.appendChild(locationElement);
    }

    const description = getLocalizedText(event.description, language);

    if (description) {
        const descriptionElement = document.createElement('p');
        descriptionElement.className = 'calendar-event-description';
        descriptionElement.textContent = description;

        body.appendChild(descriptionElement);
    }

    const metaRail = document.createElement('div');
    metaRail.className = 'calendar-event-meta';

    const cityRegion = [
        event.city,
        getRegionLabel(event.provinceRegion)
    ].filter(Boolean).join(', ');

    [
        createCalendarMeta(
            getCalendarTranslation("calendar_meta_type"),
            getEventTypeLabel(event.eventType)
        ),
        createCalendarMeta(
            getCalendarTranslation("calendar_meta_area"),
            cityRegion
        ),
        createCalendarMeta(
            getCalendarTranslation("calendar_meta_host"),
            getEntityLabel(event.organizingEntity)
        )
    ].forEach(item => {
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

function renderEvents() {
    const language = getCurrentLanguage();
    const locale = getLocale(language);

    eventListElement.replaceChildren();

    if (!publicEvents.length) {
        calendarMessageElement.hidden = false;
        calendarMessageElement.textContent = getCalendarTranslation("no_upcoming_events");

        return;
    }

    calendarMessageElement.hidden = true;

    let currentMonthKey = null;
    let currentMonthGroup = null;

    publicEvents.forEach(event => {
        const monthKey = getMonthKey(event);

        if (monthKey !== currentMonthKey) {
            currentMonthKey = monthKey;
            currentMonthGroup = document.createElement('section');

            currentMonthGroup.className = 'calendar-month';

            const heading = document.createElement('h2');
            heading.className = 'calendar-month-title';
            heading.textContent = formatMonthHeading(event, locale);

            currentMonthGroup.appendChild(heading);
            eventListElement.appendChild(currentMonthGroup);
        }

        currentMonthGroup.appendChild(createEventCard(event, language, locale));
    });
}

async function loadEvents() {
    calendarMessageElement.hidden = false;
    calendarMessageElement.textContent = getCalendarTranslation("loading_events");

    try {
        const response = await fetch('/api/events');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Could not load events');
        }

        publicEvents = (data.events || []).sort((firstEvent, secondEvent) => {
            return (
                new Date(firstEvent.startDate) -
                new Date(secondEvent.startDate)
            );
        });
        renderEvents();
    } catch (error) {
        console.error(error);

        calendarMessageElement.hidden = false;
        calendarMessageElement.textContent = getCalendarTranslation("events_load_error");
    }
}

document.addEventListener('languagechange', renderEvents);

loadEvents();
