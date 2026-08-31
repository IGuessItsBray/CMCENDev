const eventDetailContent = document.getElementById("eventDetailContent");

const eventDetailMessage = document.getElementById("eventDetailMessage");

const eventDetailEyebrow = document.getElementById("eventDetailEyebrow");

const eventDetailTitle = document.getElementById("eventDetailTitle");

const eventDetailMonth = document.getElementById("eventDetailMonth");

const eventDetailDay = document.getElementById("eventDetailDay");

const eventDetailYear = document.getElementById("eventDetailYear");

const eventDetailSummary = document.getElementById("eventDetailSummary");

const eventDetailDescriptionSection = document.getElementById(
  "eventDetailDescriptionSection",
);

const eventDetailDescription = document.getElementById(
  "eventDetailDescription",
);

const eventDetailBrief = document.getElementById("eventDetailBrief");

const eventRegistrationSection = document.getElementById(
  "eventRegistrationSection",
);

const eventDetailRegistration = document.getElementById(
  "eventDetailRegistration",
);

const eventCalendarExportLink = document.getElementById(
  "eventCalendarExportLink",
);
const eventRsvpSection = document.getElementById("eventRsvpSection");
const eventRsvpMessage = document.getElementById("eventRsvpMessage");
const eventRsvpActions = document.getElementById("eventRsvpActions");

let currentEvent = null;
let currentEventId = "";
let canOpenEventWorkspace = false;
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
  document.querySelector("[data-content-workspace-shortcut='event']")?.remove();
}

function renderEventAdminActions() {
  removeEventAdminActions();

  if (!canOpenEventWorkspace || !currentEventId) {
    return;
  }

  const shortcut = CMCENUtils.createContentWorkspaceShortcut({
    contentType: "event",
    contentId: currentEventId,
    label: getEventTranslation(
      "content_workspace_open_record",
      "Open in Content Workspace",
    ),
  });
  if (shortcut) document.body.append(shortcut);
}

async function setupEventAdminAccess() {
  const token = getStoredToken();

  if (!token) {
    canOpenEventWorkspace = false;
    removeEventAdminActions();
    return;
  }

  CMCENUtils.storeAuthToken(token);

  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      errorMessage: "Could not verify event permissions",
    });

    canOpenEventWorkspace = user.permissions?.canReviewAndPublish === true;
    renderEventAdminActions();
  } catch (error) {
    canOpenEventWorkspace = false;
    removeEventAdminActions();
  }
}

function getLocalizedEventText(value) {
  return CMCENUtils.getLocalizedText(value, getEventLanguage());
}

function createEventLoadingContent(message) {
  const skeleton = document.createElement("div");
  skeleton.className = "content-detail-skeleton content-detail-skeleton--event";
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.append(
    CMCENUtils.createSkeleton("skeleton--detail-date"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-title"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
    CMCENUtils.createSkeleton("skeleton--detail-block"),
    CMCENUtils.createSkeleton(
      "skeleton--detail-block skeleton--detail-block-short",
    ),
  );

  const accessibleLabel = document.createElement("span");
  accessibleLabel.className = "visually-hidden";
  accessibleLabel.textContent = message;

  return [skeleton, accessibleLabel];
}

function showEventDetailMessage(message, type = "neutral") {
  eventDetailMessage.textContent = message;
  eventDetailMessage.className = `calendar-message is-${type}`;
  eventDetailMessage.removeAttribute("aria-label");
  eventDetailMessage.hidden = false;
  eventDetailContent.hidden = true;
}

function showEventDetailMessageKey(key, type = "neutral") {
  visibleEventMessageKey = key;
  visibleEventMessageType = type;

  if (key === "event_detail_loading") {
    const message = getEventTranslation(key);

    eventDetailMessage.replaceChildren(...createEventLoadingContent(message));
    eventDetailMessage.className = "calendar-message is-loading";
    eventDetailMessage.setAttribute("aria-label", message);
    eventDetailMessage.hidden = false;
    eventDetailContent.hidden = true;
    return;
  }

  showEventDetailMessage(getEventTranslation(key), type);
}

function getValidDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateTimeFormatter(event, options) {
  return new Intl.DateTimeFormat(getEventLocale(), {
    ...options,
    ...(event.allDay
      ? { timeZone: "UTC" }
      : event.timezone
        ? { timeZone: event.timezone }
        : {}),
  });
}

function formatEventDateRange(event) {
  const startDate = getValidDate(event.startDate);

  if (!startDate) {
    return "";
  }

  const endDate = getValidDate(event.endDate);

  if (event.allDay) {
    const formatter = getDateTimeFormatter(event, {
      dateStyle: "full",
    });

    if (!endDate) {
      return `${formatter.format(startDate)} / ${getEventTranslation("all_day")}`;
    }

    return `${formatter.format(startDate)} - ${formatter.format(endDate)} / ${getEventTranslation("all_day")}`;
  }

  const formatter = getDateTimeFormatter(event, {
    dateStyle: "full",
    timeStyle: "short",
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
      year: "",
    };
  }

  const formatter = getDateTimeFormatter(event, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const parts = {};

  formatter.formatToParts(startDate).forEach((part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  });

  return {
    month: parts.month || "",
    day: parts.day || "",
    year: parts.year || "",
  };
}

function getRegionLabel(value) {
  if (!value) return "";

  const key =
    value === "International"
      ? "region_international"
      : `region_${value.toLowerCase()}`;

  return getEventTranslation(key);
}

function getEntityLabel(value) {
  return value ? getEventTranslation(`entity_${value}`) : "";
}

function getEventTypeLabel(value) {
  return value
    ? getEventTranslation(`event_type_${value.replace(/-/g, "_")}`)
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
    createDescriptionListItem(getEventTranslation(labelKey), value),
  );
}

function getEventLocation(event) {
  const location = getLocalizedEventText(event.location);

  const cityRegion = [event.city, getRegionLabel(event.provinceRegion)]
    .filter(Boolean)
    .join(", ");

  return [location, cityRegion].filter(Boolean).join(" / ");
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
    punctuation: match?.[2] || "",
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
        document.createTextNode(value.slice(cursor, match.index)),
      );
    }

    const { url, punctuation } = splitTrailingUrlPunctuation(rawUrl);

    if (isPublicUrl(url)) {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = url;
      link.rel = "noopener noreferrer";
      link.target = "_blank";

      container.appendChild(link);
    } else {
      container.appendChild(document.createTextNode(url));
    }

    if (punctuation) {
      container.appendChild(document.createTextNode(punctuation));
    }

    cursor = match.index + rawUrl.length;
    match = urlPattern.exec(value);
  }

  if (cursor < value.length) {
    container.appendChild(document.createTextNode(value.slice(cursor)));
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
    appendLinkedRegistrationText(eventDetailRegistration, value);
  }

  eventRegistrationSection.hidden = false;
}

function formatRsvpDeadline(value) {
  const date = getValidDate(value);
  return date
    ? new Intl.DateTimeFormat(getEventLocale(), {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(date)
    : "";
}

async function submitRsvp(response) {
  try {
    const result = await CMCENUtils.apiJson(
      `/api/events/${encodeURIComponent(currentEventId)}/rsvp`,
      {
        method: "POST",
        token: getStoredToken(),
        body: { response },
        errorMessage: getEventTranslation(
          "event_rsvp_submit_error",
          "Could not save your RSVP.",
        ),
      },
    );
    if (
      currentEvent &&
      ["accepted", "declined"].includes(result.rsvp?.response)
    ) {
      currentEvent.myRsvp = { response: result.rsvp.response };
      renderRsvp(currentEvent);
      return;
    }
    eventRsvpMessage.textContent = getEventTranslation(
      result.rsvp?.response === "accepted"
        ? "event_rsvp_accepted"
        : "event_rsvp_declined",
      result.rsvp?.response === "accepted"
        ? "Your attendance has been recorded."
        : "Your decline has been recorded.",
    );
  } catch (error) {
    eventRsvpMessage.textContent = error.message;
  }
}

async function cancelRsvp() {
  try {
    await CMCENUtils.apiJson(
      `/api/events/${encodeURIComponent(currentEventId)}/rsvp`,
      {
        method: "DELETE",
        token: getStoredToken(),
        errorMessage: getEventTranslation(
          "event_rsvp_cancel_error",
          "Could not cancel your RSVP.",
        ),
      },
    );
    if (currentEvent) {
      delete currentEvent.myRsvp;
      renderRsvp(currentEvent);
      eventRsvpMessage.textContent = getEventTranslation(
        "event_rsvp_cancelled",
        "Your RSVP has been cancelled.",
      );
    }
  } catch (error) {
    eventRsvpMessage.textContent = error.message;
  }
}

function renderRsvp(event) {
  eventRsvpActions.replaceChildren();
  eventRsvpSection.classList.remove("is-rsvp-attending", "is-rsvp-declined");
  if (!event.rsvpEnabled) {
    eventRsvpSection.hidden = true;
    return;
  }

  eventRsvpSection.hidden = false;
  const deadline = formatRsvpDeadline(event.rsvpDeadline);
  const deadlinePassed =
    event.rsvpDeadline && new Date() > new Date(event.rsvpDeadline);
  const rsvpResponse = event.myRsvp?.response;
  eventRsvpSection.classList.toggle(
    "is-rsvp-attending",
    rsvpResponse === "accepted",
  );
  eventRsvpSection.classList.toggle(
    "is-rsvp-declined",
    rsvpResponse === "declined",
  );
  if (["accepted", "declined"].includes(rsvpResponse)) {
    eventRsvpMessage.textContent = getEventTranslation(
      rsvpResponse === "accepted"
        ? "event_rsvp_accepted"
        : "event_rsvp_declined",
      rsvpResponse === "accepted"
        ? "Your attendance has been recorded."
        : "Your decline has been recorded.",
    );
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "event-rsvp-button is-cancel";
    cancel.textContent = getEventTranslation(
      "event_rsvp_cancel",
      "Cancel RSVP",
    );
    cancel.addEventListener("click", cancelRsvp);
    eventRsvpActions.append(cancel);
  } else if (deadlinePassed) {
    eventRsvpMessage.textContent = getEventTranslation(
      "event_rsvp_closed",
      "RSVPs are now closed.",
    );
  } else if (!getStoredToken()) {
    eventRsvpMessage.textContent = getEventTranslation(
      "event_rsvp_login_required",
      "Sign in to RSVP for this event.",
    );
    const login = document.createElement("a");
    login.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    login.textContent = getEventTranslation("login", "Sign in");
    eventRsvpActions.append(login);
  } else {
    eventRsvpMessage.textContent = deadline
      ? getEventTranslation("event_rsvp_deadline_message", { deadline })
      : getEventTranslation("event_rsvp_prompt", "Will you attend?");
    [
      ["accepted", "event_rsvp_accept", "Accept"],
      ["declined", "event_rsvp_decline", "Decline"],
    ].forEach(([response, key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `event-rsvp-button is-${response}`;
      button.textContent = getEventTranslation(key, label);
      button.addEventListener("click", () => submitRsvp(response));
      eventRsvpActions.append(button);
    });
  }
}

function renderEvent(event) {
  const title =
    getLocalizedEventText(event.title) ||
    getEventTranslation("home_event_untitled");

  const description = getLocalizedEventText(event.description);

  const registration = getLocalizedEventText(event.registration);

  currentEvent = event;

  document.title = `${getEventTranslation("event_detail_document_title", {
    title,
  })} | CMCEN / RCMCE`;

  const dateCard = formatEventDateCard(event);
  const dateRange = formatEventDateRange(event);
  const location =
    getEventLocation(event) ||
    getEventTranslation("home_event_location_pending");

  eventDetailTitle.textContent = title;
  eventDetailMonth.textContent = dateCard.month;
  eventDetailDay.textContent = dateCard.day;
  eventDetailYear.textContent = dateCard.year;
  eventDetailSummary.textContent = [dateRange, location]
    .filter(Boolean)
    .join(" / ");

  eventDetailEyebrow.textContent =
    [getEventTypeLabel(event.eventType), getEntityLabel(event.organizingEntity)]
      .filter(Boolean)
      .join(" / ") || getEventTranslation("event_details_eyebrow");

  eventDetailDescription.textContent = description;
  eventDetailDescriptionSection.hidden = !description;

  eventDetailBrief.replaceChildren();
  appendDetailRow(eventDetailBrief, "event_date_label", dateRange);
  appendDetailRow(eventDetailBrief, "event_location_label", location);
  appendDetailRow(
    eventDetailBrief,
    "event_organizing_entity",
    getEntityLabel(event.organizingEntity),
  );
  appendDetailRow(
    eventDetailBrief,
    "event_type",
    getEventTypeLabel(event.eventType),
  );

  renderRegistration(registration);
  renderRsvp(event);

  eventCalendarExportLink.href = `/api/events/${encodeURIComponent(currentEventId)}/calendar.ics?lang=${encodeURIComponent(getEventLanguage())}`;
  eventCalendarExportLink.hidden = false;

  eventDetailMessage.hidden = true;
  visibleEventMessageKey = "";
  eventDetailContent.hidden = false;
}

async function loadEvent() {
  const eventId = new URLSearchParams(window.location.search).get("id");

  if (!eventId) {
    showEventDetailMessageKey("event_detail_no_selection", "error");
    return;
  }

  currentEventId = eventId;

  showEventDetailMessageKey("event_detail_loading");

  try {
    const token = getStoredToken();
    const response = await fetch(
      `/api/events/${encodeURIComponent(eventId)}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || getEventTranslation("event_detail_load_error"),
      );
    }

    renderEvent(data.event);
    await setupEventAdminAccess();
  } catch (error) {
    showEventDetailMessage(
      error.message || getEventTranslation("event_detail_load_error"),
      "error",
    );
  }
}

document.addEventListener("languagechange", () => {
  if (currentEvent) {
    renderEvent(currentEvent);
    renderEventAdminActions();
  } else if (visibleEventMessageKey) {
    showEventDetailMessageKey(visibleEventMessageKey, visibleEventMessageType);
  }
});

loadEvent();
