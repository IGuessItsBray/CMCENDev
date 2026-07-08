const eventDetailContent =
    document.getElementById("eventDetailContent");

const eventDetailMessage =
    document.getElementById("eventDetailMessage");

const eventDetailEyebrow =
    document.getElementById("eventDetailEyebrow");

const eventDetailTitle =
    document.getElementById("eventDetailTitle");

const eventDetailMonth =
    document.getElementById("eventDetailMonth");

const eventDetailDay =
    document.getElementById("eventDetailDay");

const eventDetailYear =
    document.getElementById("eventDetailYear");

const eventDetailSummary =
    document.getElementById("eventDetailSummary");

const eventDetailDescriptionSection =
    document.getElementById("eventDetailDescriptionSection");

const eventDetailDescription =
    document.getElementById("eventDetailDescription");

const eventDetailBrief =
    document.getElementById("eventDetailBrief");

const eventRegistrationSection =
    document.getElementById("eventRegistrationSection");

const eventDetailRegistration =
    document.getElementById("eventDetailRegistration");

const eventDetailHero =
    document.querySelector(".event-detail-hero");

let currentEvent = null;
let currentEventId = "";
let canManageEvents = false;
let visibleEventMessageKey = "";
let visibleEventMessageType = "neutral";

function getEventLanguage() {
    return CMCENUtils.getCurrentLanguage();
}

function getEventLocale() {
    return CMCENUtils.getCurrentLocale();
}

function getEventTranslation(key, replacements = {}) {
    if (typeof translate === "function") {
        return translate(key, replacements);
    }

    return key;
}

function getStoredToken() {
    return CMCENUtils.getStoredAuthToken();
}

function removeEventAdminActions() {
    eventDetailHero
        ?.querySelector(".event-detail-admin-actions")
        ?.remove();
}

async function deletePublishedEvent() {
    const token = getStoredToken();

    if (!token) {
        await setupEventAdminAccess();
        return;
    }

    if (
        !window.confirm(
            "Delete this event? This will be recorded in the audit log."
        )
    ) {
        return;
    }

    const button = eventDetailHero
        ?.querySelector("[data-action='delete-event']");

    if (button) {
        button.disabled = true;
        button.textContent = "Deleting...";
    }

    try {
        const response = await fetch(
            `/api/admin/events/${encodeURIComponent(currentEventId)}`,
            {
                method: "DELETE",
                headers: CMCENUtils.authHeaders(token)
            }
        );

        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            CMCENUtils.clearAuthToken();
            await setupEventAdminAccess();
            throw new Error("Sign in again to delete events.");
        }

        if (response.status === 403) {
            canManageEvents = false;
            removeEventAdminActions();
            throw new Error("You do not have permission to delete events.");
        }

        if (!response.ok) {
            throw new Error(data.error || "Could not delete event");
        }

        showEventDetailMessage(
            "Event deleted and recorded in the audit log.",
            "success"
        );

        setTimeout(() => {
            window.location.href = "/calendar.html";
        }, 900);
    } catch (error) {
        window.alert(error.message || "Could not delete event");

        if (button) {
            button.disabled = false;
            button.textContent = "Delete event";
        }
    }
}

function renderEventAdminActions() {
    removeEventAdminActions();

    if (!canManageEvents || !currentEventId) {
        return;
    }

    const actions = document.createElement("div");
    actions.className = "event-detail-admin-actions";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className =
        "app-button is-danger is-small published-content-delete event-delete";
    deleteButton.dataset.action = "delete-event";
    deleteButton.textContent = "Delete event";
    deleteButton.addEventListener("click", deletePublishedEvent);

    actions.append(deleteButton);
    eventDetailHero?.append(actions);
}

async function setupEventAdminAccess() {
    const token = getStoredToken();

    if (!token) {
        canManageEvents = false;
        removeEventAdminActions();
        return;
    }

    CMCENUtils.storeAuthToken(token);

    try {
        const response = await fetch("/api/me", {
            headers: CMCENUtils.authHeaders(token)
        });

        if (response.status === 401) {
            CMCENUtils.clearAuthToken();
            canManageEvents = false;
            removeEventAdminActions();
            return;
        }

        if (!response.ok) {
            canManageEvents = false;
            removeEventAdminActions();
            return;
        }

        const user = await response.json().catch(() => ({}));

        canManageEvents =
            user.permissions?.canManageUsers === true;
        renderEventAdminActions();
    } catch (error) {
        canManageEvents = false;
        removeEventAdminActions();
    }
}

function getLocalizedEventText(value) {
    return CMCENUtils.getLocalizedText(value, getEventLanguage());
}

function createEventLoadingContent(message) {
    const loading = CMCENUtils.createLoadingSpinner(message);

    return Array.from(loading.childNodes);
}

function showEventDetailMessage(message, type = "neutral") {
    eventDetailMessage.textContent = message;
    eventDetailMessage.className =
        `app-status calendar-message is-${type}`;
    eventDetailMessage.removeAttribute("aria-label");
    eventDetailMessage.hidden = false;
    eventDetailContent.hidden = true;
}

function showEventDetailMessageKey(key, type = "neutral") {
    visibleEventMessageKey = key;
    visibleEventMessageType = type;

    if (key === "event_detail_loading") {
        const message = getEventTranslation(key);

        eventDetailMessage.replaceChildren(
            ...createEventLoadingContent(message)
        );
        eventDetailMessage.className =
            "app-status is-loading calendar-message";
        eventDetailMessage.setAttribute("aria-label", message);
        eventDetailMessage.hidden = false;
        eventDetailContent.hidden = true;
        return;
    }

    showEventDetailMessage(
        getEventTranslation(key),
        type
    );
}

function getValidDate(value) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

function getDateTimeFormatter(event, options) {
    return new Intl.DateTimeFormat(
        getEventLocale(),
        {
            ...options,
            ...(event.allDay
                ? { timeZone: "UTC" }
                : event.timezone
                    ? { timeZone: event.timezone }
                    : {})
        }
    );
}

function formatEventDateRange(event) {
    const startDate = getValidDate(event.startDate);

    if (!startDate) {
        return "";
    }

    const endDate = getValidDate(event.endDate);

    if (event.allDay) {
        const formatter =
            getDateTimeFormatter(event, {
                dateStyle: "full"
            });

        if (!endDate) {
            return `${formatter.format(startDate)} / ${getEventTranslation("all_day")}`;
        }

        return `${formatter.format(startDate)} - ${formatter.format(endDate)} / ${getEventTranslation("all_day")}`;
    }

    const formatter =
        getDateTimeFormatter(event, {
            dateStyle: "full",
            timeStyle: "short"
        });

    if (!endDate) {
        return formatter.format(startDate);
    }

    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function formatEventDateCard(event) {
    const startDate = getValidDate(event.startDate);

    if (!startDate) {
        return {
            month: "",
            day: "",
            year: ""
        };
    }

    const formatter =
        getDateTimeFormatter(event, {
            month: "short",
            day: "numeric",
            year: "numeric"
        });

    const parts = {};

    formatter.formatToParts(startDate).forEach(part => {
        if (part.type !== "literal") {
            parts[part.type] = part.value;
        }
    });

    return {
        month: parts.month || "",
        day: parts.day || "",
        year: parts.year || ""
    };
}

function getRegionLabel(value) {
    if (!value) return "";

    const key = value === "International"
        ? "region_international"
        : `region_${value.toLowerCase()}`;

    return getEventTranslation(key);
}

function getEntityLabel(value) {
    return value
        ? getEventTranslation(`entity_${value}`)
        : "";
}

function getEventTypeLabel(value) {
    return value
        ? getEventTranslation(
            `event_type_${value.replace(/-/g, "_")}`
        )
        : "";
}

function createDescriptionListItem(label, value) {
    const fragment = document.createDocumentFragment();

    const term = document.createElement("dt");
    term.textContent = label;

    const description = document.createElement("dd");
    description.textContent = value;

    fragment.append(term, description);

    return fragment;
}

function appendDetailRow(list, labelKey, value) {
    if (!value) return;

    list.appendChild(
        createDescriptionListItem(
            getEventTranslation(labelKey),
            value
        )
    );
}

function getEventLocation(event) {
    const location =
        getLocalizedEventText(event.location);

    const cityRegion = [
        event.city,
        getRegionLabel(event.provinceRegion)
    ]
        .filter(Boolean)
        .join(", ");

    return [
        location,
        cityRegion
    ]
        .filter(Boolean)
        .join(" / ");
}

function isPublicUrl(value) {
    try {
        const url = new URL(value);

        return ["http:", "https:"].includes(url.protocol);
    } catch {
        return false;
    }
}

function splitTrailingUrlPunctuation(value) {
    const match = value.match(/^(.*?)([.,!?;:)]*)$/);

    return {
        url: match?.[1] || value,
        punctuation: match?.[2] || ""
    };
}

function appendLinkedRegistrationText(container, value) {
    const urlPattern = /https?:\/\/[^\s<>"']+/g;
    let cursor = 0;
    let match = urlPattern.exec(value);

    while (match) {
        const [rawUrl] = match;

        if (match.index > cursor) {
            container.appendChild(
                document.createTextNode(
                    value.slice(cursor, match.index)
                )
            );
        }

        const { url, punctuation } =
            splitTrailingUrlPunctuation(rawUrl);

        if (isPublicUrl(url)) {
            const link = document.createElement("a");
            link.href = url;
            link.textContent = url;
            link.rel = "noopener noreferrer";
            link.target = "_blank";

            container.appendChild(link);
        } else {
            container.appendChild(
                document.createTextNode(url)
            );
        }

        if (punctuation) {
            container.appendChild(
                document.createTextNode(punctuation)
            );
        }

        cursor = match.index + rawUrl.length;
        match = urlPattern.exec(value);
    }

    if (cursor < value.length) {
        container.appendChild(
            document.createTextNode(value.slice(cursor))
        );
    }
}

function renderRegistration(value) {
    eventDetailRegistration.replaceChildren();

    if (!value) {
        eventRegistrationSection.hidden = true;
        return;
    }

    if (isPublicUrl(value)) {
        const link = document.createElement("a");
        link.href = value;
        link.textContent = value;
        link.rel = "noopener noreferrer";
        link.target = "_blank";

        eventDetailRegistration.appendChild(link);
    } else {
        appendLinkedRegistrationText(
            eventDetailRegistration,
            value
        );
    }

    eventRegistrationSection.hidden = false;
}

function renderEvent(event) {
    const title =
        getLocalizedEventText(event.title) ||
        getEventTranslation("home_event_untitled");

    const description =
        getLocalizedEventText(event.description);

    const registration =
        getLocalizedEventText(event.registration);

    currentEvent = event;

    document.title =
        `${getEventTranslation(
            "event_detail_document_title",
            { title }
        )} | CMCEN / RCMCE`;

    const dateCard = formatEventDateCard(event);
    const dateRange = formatEventDateRange(event);
    const location = getEventLocation(event) ||
        getEventTranslation("home_event_location_pending");

    eventDetailTitle.textContent = title;
    eventDetailMonth.textContent = dateCard.month;
    eventDetailDay.textContent = dateCard.day;
    eventDetailYear.textContent = dateCard.year;
    eventDetailSummary.textContent =
        [
            dateRange,
            location
        ]
            .filter(Boolean)
            .join(" / ");

    eventDetailEyebrow.textContent =
        [
            getEventTypeLabel(event.eventType),
            getEntityLabel(event.organizingEntity)
        ]
            .filter(Boolean)
            .join(" / ") ||
        getEventTranslation("event_details_eyebrow");

    eventDetailDescription.textContent = description;
    eventDetailDescriptionSection.hidden = !description;

    eventDetailBrief.replaceChildren();
    appendDetailRow(
        eventDetailBrief,
        "event_date_label",
        dateRange
    );
    appendDetailRow(
        eventDetailBrief,
        "event_location_label",
        location
    );
    appendDetailRow(
        eventDetailBrief,
        "event_organizing_entity",
        getEntityLabel(event.organizingEntity)
    );
    appendDetailRow(
        eventDetailBrief,
        "event_type",
        getEventTypeLabel(event.eventType)
    );

    renderRegistration(registration);

    eventDetailMessage.hidden = true;
    visibleEventMessageKey = "";
    eventDetailContent.hidden = false;
}

async function loadEvent() {
    const eventId =
        new URLSearchParams(window.location.search).get("id");

    if (!eventId) {
        showEventDetailMessageKey(
            "event_detail_no_selection",
            "error"
        );
        return;
    }

    currentEventId = eventId;

    showEventDetailMessageKey("event_detail_loading");

    try {
        const response =
            await fetch(
                `/api/events/${encodeURIComponent(eventId)}`
            );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                    getEventTranslation("event_detail_load_error")
            );
        }

        renderEvent(data.event);
        await setupEventAdminAccess();
    } catch (error) {
        showEventDetailMessage(
            error.message ||
                getEventTranslation("event_detail_load_error"),
            "error"
        );
    }
}

document.addEventListener(
    "languagechange",
    () => {
        if (currentEvent) {
            renderEvent(currentEvent);
        } else if (visibleEventMessageKey) {
            showEventDetailMessageKey(
                visibleEventMessageKey,
                visibleEventMessageType
            );
        }
    }
);

loadEvent();
