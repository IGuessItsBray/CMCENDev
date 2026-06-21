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

function formatEventDate(event, locale) {
    const startDate = new Date(event.startDate);

    const dateOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    };

    if (event.allDay) {
        dateOptions.timeZone = 'UTC';
    } else {
        dateOptions.hour = 'numeric';
        dateOptions.minute = '2-digit';
    }

    const formattedStart =
        new Intl.DateTimeFormat(
            locale,
            dateOptions
        ).format(startDate);

    if (!event.endDate) {
        return formattedStart;
    }

    const endDate = new Date(event.endDate);

    const endOptions = {
        month: 'long',
        day: 'numeric'
    };

    if (event.allDay) {
        endOptions.timeZone = 'UTC';
    } else {
        endOptions.hour = 'numeric';
        endOptions.minute = '2-digit';
    }

    const formattedEnd =
        new Intl.DateTimeFormat(
            locale,
            endOptions
        ).format(endDate);

    return `${formattedStart} – ${formattedEnd}`;
}

function createEventCard(event, language, locale) {
    const article = document.createElement('article');
    article.className = 'calendar-event';

    const dateElement = document.createElement('p');
    dateElement.className = 'calendar-event-date';
    dateElement.textContent =
        formatEventDate(event, locale);

    const titleElement = document.createElement('h3');
    titleElement.className = 'calendar-event-title';
    titleElement.textContent =
        getLocalizedText(event.title, language);

    article.append(dateElement, titleElement);

    const location =
        getLocalizedText(event.location, language);

    if (location) {
        const locationElement =
            document.createElement('p');

        locationElement.className =
            'calendar-event-location';

        locationElement.textContent = location;

        article.appendChild(locationElement);
    }

    const description =
        getLocalizedText(event.description, language);

    if (description) {
        const descriptionElement =
            document.createElement('p');

        descriptionElement.className =
            'calendar-event-description';

        descriptionElement.textContent =
            description;

        article.appendChild(descriptionElement);
    }

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

        publicEvents = data.events || [];
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