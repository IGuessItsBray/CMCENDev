const eventListElement =
    document.getElementById('eventList');

const calendarMessageElement =
    document.getElementById('calendarMessage');

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

    const preferred =
        typeof value[language] === 'string'
            ? value[language].trim()
            : '';

    if (preferred) return preferred;

    const fallbackLanguage =
        language === 'en' ? 'fr' : 'en';

    return typeof value[fallbackLanguage] === 'string'
        ? value[fallbackLanguage].trim()
        : '';
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
        return `${startDay}–${endDay}`;
    }

    return String(startDay);
}

function formatEventTime(
    event,
    locale
) {
    if (event.allDay) {
        return (
            translations[currentLang]
                ?.all_day ||
            "All day"
        );
    }

    const formatter =
        new Intl.DateTimeFormat(
            locale,
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );

    const startTime =
        formatter.format(
            new Date(event.startDate)
        );

    if (!event.endDate) {
        return startTime;
    }

    const endTime =
        formatter.format(
            new Date(event.endDate)
        );

    return `${startTime}–${endTime}`;
}

function createEventCard(event, language, locale) {
    const article =
        document.createElement('article');

    article.className = 'calendar-event';

    const dayColumn =
        document.createElement('div');

    dayColumn.className =
        'calendar-event-day';

    const dayNumber =
        document.createElement('span');

    dayNumber.className =
        'calendar-event-day-number';

    dayNumber.textContent =
        formatDayLabel(event);

    const eventTime =
        document.createElement('span');

    eventTime.className =
        'calendar-event-time';

    eventTime.textContent =
        formatEventTime(event, locale);

    dayColumn.append(
        dayNumber,
        eventTime
    );

    const content =
        document.createElement('div');

    content.className =
        'calendar-event-content';

    const titleElement =
        document.createElement('h3');

    titleElement.className =
        'calendar-event-title';

    titleElement.textContent =
        getLocalizedText(
            event.title,
            language
        );

    content.appendChild(titleElement);

    const location =
        getLocalizedText(
            event.location,
            language
        );

    if (location) {
        const locationElement =
            document.createElement('p');

        locationElement.className =
            'calendar-event-location';

        locationElement.textContent =
            location;

        content.appendChild(
            locationElement
        );
    }

    const description =
        getLocalizedText(
            event.description,
            language
        );

    if (description) {
        const descriptionElement =
            document.createElement('p');

        descriptionElement.className =
            'calendar-event-description';

        descriptionElement.textContent =
            description;

        content.appendChild(
            descriptionElement
        );
    }

    article.append(
        dayColumn,
        content
    );

    return article;
}

function renderEvents() {
    const language = getCurrentLanguage();
    const locale = getLocale(language);

    eventListElement.replaceChildren();

    if (!publicEvents.length) {
        calendarMessageElement.hidden = false;
        calendarMessageElement.textContent =
            translations[language].no_upcoming_events;

        return;
    }

    calendarMessageElement.hidden = true;

    let currentMonthKey = null;
    let currentMonthGroup = null;

    publicEvents.forEach(event => {
        const monthKey = getMonthKey(event);

        if (monthKey !== currentMonthKey) {
            currentMonthKey = monthKey;

            currentMonthGroup =
                document.createElement('section');

            currentMonthGroup.className =
                'calendar-month';

            const heading =
                document.createElement('h2');

            heading.className =
                'calendar-month-title';

            heading.textContent =
                formatMonthHeading(event, locale);

            currentMonthGroup.appendChild(heading);
            eventListElement.appendChild(currentMonthGroup);
        }

        currentMonthGroup.appendChild(
            createEventCard(event, language, locale)
        );
    });
}

async function loadEvents() {
    const language = getCurrentLanguage();

    calendarMessageElement.hidden = false;
    calendarMessageElement.textContent =
        translations[language].loading_events;

    try {
        const response = await fetch('/api/events');

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || 'Could not load events'
            );
        }

        publicEvents = (data.events || [])
            .sort((firstEvent, secondEvent) => {
                return (
                    new Date(firstEvent.startDate) -
                    new Date(secondEvent.startDate)
                );
            });
        renderEvents();
    } catch (error) {
        console.error(error);

        calendarMessageElement.hidden = false;
        calendarMessageElement.textContent =
            translations[language].events_load_error;
    }
}

document.addEventListener(
    'languagechange',
    renderEvents
);

loadEvents();