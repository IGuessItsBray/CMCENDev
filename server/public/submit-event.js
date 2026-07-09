const eventForm = document.getElementById("eventForm");
const eventPageMessage = document.getElementById("eventPageMessage");
const eventFormMessage = document.getElementById("eventFormMessage");
const eventEditLoading = document.getElementById("eventEditLoading");

const myEventsSection = document.getElementById("myEventsSection");
const myEventsList = document.getElementById("myEventsList");
const myEventsCount = document.getElementById("myEventsCount");
const eventTabs = document.querySelectorAll("[data-event-tab]");
const eventPanels = document.querySelectorAll("[data-event-panel]");
const eventFormTabLabel = document.getElementById("eventFormTabLabel");

const submitEventTitle = document.getElementById("submitEventTitle");
const submitEventIntro = document.getElementById("submitEventIntro");
const eventSubmitButtonLabel = document.getElementById("eventSubmitButtonLabel");
const eventSubmitButton = document.getElementById("eventSubmitButton");

const eventAllDay = document.getElementById("eventAllDay");
const eventStartDate = document.getElementById("eventStartDate");
const eventStartHour = document.getElementById("eventStartHour");
const eventStartMinute = document.getElementById("eventStartMinute");
const eventEndHour = document.getElementById("eventEndHour");
const eventEndMinute = document.getElementById("eventEndMinute");
const eventEndDate = document.getElementById("eventEndDate");
const startTimeField = document.getElementById("eventStartTimeField");
const endTimeField = document.getElementById("eventEndTimeField");
const timeZoneNote = document.getElementById("eventTimeZoneNote");
const publishNowContainer = document.getElementById("publishNowContainer");
const eventPublishNow = document.getElementById("eventPublishNow");
const reviewNote = document.getElementById("eventReviewNote");
const pageTitle = document.getElementById("submitEventTitle");
const createLoadingSpinner = CMCENUtils.createLoadingSpinner;
const redirectToLogin = CMCENUtils.redirectToLogin;

let currentUser = null;
let isSubmitting = false;
let accessDenied = false;
let myEvents = [];
let editingEvent = null;

const eventPageParams = new URLSearchParams(window.location.search);
let editingEventId = eventPageParams.get("id");
const initialEventPanel =
  eventPageParams.get("panel") === "form"
    ? "form"
    : "events";

function eventApiJson(path, token, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("event_permission_error")
  });
}

function showMyEventsLoading() {
  myEventsSection.hidden = false;
  myEventsCount.hidden = true;
  myEventsList.replaceChildren(
    createLoadingSpinner(
      translate("my_events_loading")
    )
  );
}

function setEventEditLoading(isLoading) {
  if (!eventEditLoading) {
    return;
  }

  eventEditLoading.hidden = !isLoading;

  if (isLoading) {
    eventForm.hidden = true;
  }
}

function getLocalizedEventTitle(event) {
  return (
    CMCENUtils.getLocalizedText(event.title) ||
    translate("my_events_untitled")
  );
}

function formatMyEventDate(event) {
  if (event.allDay) {
    return CMCENUtils.formatDate(event.startDate, {
      timeZone: "UTC"
    });
  }

  return CMCENUtils.formatDate(event.startDate, {
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: event.timezone || undefined
  });
}

function formatMyEventUpdatedDate(value) {
  return CMCENUtils.formatDate(value, {
    fallback: "—"
  });
}

function createMyEventCard(submittedEvent) {
  const article = document.createElement("article");
  article.className = "my-event-card";

  const header = document.createElement("div");
  header.className = "my-event-card-header";

  const title = document.createElement("h3");
  title.textContent = getLocalizedEventTitle(submittedEvent);

  const status = document.createElement("span");
  status.className = `my-event-status status-${submittedEvent.status}`;
  status.textContent = translate(`my_events_status_${submittedEvent.status}`);

  header.append(title, status);

  const details = document.createElement("div");
  details.className = "my-event-card-details";

  const date = document.createElement("span");
  date.textContent = formatMyEventDate(submittedEvent);

  const location = document.createElement("span");

  location.textContent = [
    submittedEvent.city,
    submittedEvent.provinceRegion
  ].filter(Boolean).join(", ");

  const updated = document.createElement("span");

  updated.textContent = `${translate("my_events_last_updated")}: ` + formatMyEventUpdatedDate(submittedEvent.updatedAt);

  details.append(
    date,
    location,
    updated
  );

  const footer = document.createElement("div");
  footer.className = "my-event-card-footer";

  if (submittedEvent.status === "rejected" && submittedEvent.rejectionReason) {
    const rejection = document.createElement("p");

    rejection.className = "my-event-rejection";

    rejection.textContent = `${translate("my_events_rejection_reason")}: ` + submittedEvent.rejectionReason;

    footer.appendChild(rejection);
  }

  const editLink = document.createElement("a");
  editLink.className = "my-event-edit-link";
  editLink.href = `/submit-event.html?id=${encodeURIComponent(submittedEvent._id)}`;
  editLink.textContent = submittedEvent.status === "rejected" ? translate("my_events_edit_resubmit") : translate("my_events_edit");
  editLink.addEventListener("click", event => {
    event.preventDefault();
    startEditingEvent(submittedEvent._id);
  });

  footer.appendChild(editLink);

  article.append(
    header,
    details,
    footer
  );

  return article;
}

function renderMyEvents() {
  myEventsList.replaceChildren();

  const count = myEvents.length;

  myEventsCount.textContent = count === 1 ?
    translate("my_events_count_singular") :
    translate(
      "my_events_count_plural",
      { count }
    );

  myEventsCount.hidden = false;
  myEventsSection.hidden = false;

  if (!count) {
    const message = document.createElement("p");

    message.className = "my-events-message";
    message.textContent = translate("my_events_empty");

    myEventsList.appendChild(message);
    return;
  }

  myEvents.forEach(event => {
    myEventsList.appendChild(
      createMyEventCard(event)
    );
  });
}

async function loadMyEvents(token) {
  showMyEventsLoading();

  try {
    const data = await eventApiJson("/api/events/mine", token, {
      errorMessage: translate("my_events_load_error")
    });

    myEvents =
      Array.isArray(data.events)
        ? data.events
        : [];

    renderMyEvents();
  } catch (error) {
    myEventsSection.hidden = false;

    myEventsList.textContent =
      error.message ||
      translate(
        "my_events_load_error"
      );
  }
}

function populateTimeSelect(select, values) {
  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = "--";
  placeholder.selected = true;

  select.appendChild(placeholder);

  values.forEach(value => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  });
}

function initializeTimeControls() {
  const hours = Array.from(
    { length: 24 },
    (_, index) =>
      String(index).padStart(2, "0")
  );

  const minutes = Array.from(
    { length: 12 },
    (_, index) =>
      String(index * 5).padStart(2, "0")
  );

  populateTimeSelect(
    eventStartHour,
    hours
  );

  populateTimeSelect(
    eventStartMinute,
    minutes
  );

  populateTimeSelect(
    eventEndHour,
    hours
  );

  populateTimeSelect(
    eventEndMinute,
    minutes
  );
}

function showPageMessage(
  message,
  type = "error"
) {
  eventPageMessage.textContent = message;

  eventPageMessage.className =
    `event-page-message is-${type}`;

  eventPageMessage.hidden = false;
}

function clearFormMessage() {
  eventFormMessage.textContent = "";
  eventFormMessage.className = "event-form-message";
  eventFormMessage.hidden = true;
}

function showFormMessage(message, type = "error") {
  eventFormMessage.textContent = message;
  eventFormMessage.className = `event-form-message is-${type}`;
  eventFormMessage.hidden = false;
  eventFormMessage.scrollIntoView({
    block: "nearest"
  });
}

function setSubmitting(submitting) {
  isSubmitting = submitting;

  eventSubmitButton.disabled = submitting;
  eventSubmitButton.setAttribute("aria-busy", String(submitting));
  updateEventFormModeText();
  eventSubmitButton.setAttribute(
    "aria-label",
    translate(
      submitting
        ? "event_submitting"
        : editingEventId
          ? "save_event_changes"
          : "submit_event_button"
    )
  );
}

function syncScheduleFields() {
  const isAllDay = eventAllDay.checked;

  startTimeField.hidden = isAllDay;
  endTimeField.hidden = isAllDay;
  timeZoneNote.hidden = isAllDay;

  const timeControls = [
    eventStartHour,
    eventStartMinute,
    eventEndHour,
    eventEndMinute
  ];

  timeControls.forEach(control => {
    control.disabled = isAllDay;
    control.required = !isAllDay;
  });

  eventEndDate.required = !isAllDay;

  if (
    !isAllDay &&
    !eventEndDate.value &&
    eventStartDate.value
  ) {
    eventEndDate.value =
      eventStartDate.value;
  }
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function syncStartDateMinimum() {
  eventStartDate.min = getTodayDateValue();
}

function keepEndDateInRange() {
  eventEndDate.min =
    eventStartDate.value;

  if (
    eventStartDate.value &&
    eventEndDate.value &&
    eventEndDate.value < eventStartDate.value
  ) {
    eventEndDate.value =
      eventStartDate.value;
  }

  if (
    !eventAllDay.checked &&
    !eventEndDate.value
  ) {
    eventEndDate.value =
      eventStartDate.value;
  }
}

function getEventDateValues() {
  if (!eventStartDate.value) {
    throw new Error(
      translate("event_start_required")
    );
  }

  if (eventStartDate.value < getTodayDateValue()) {
    throw new Error(
      translate("event_start_in_past")
    );
  }

  if (eventAllDay.checked) {
    if (
      eventEndDate.value &&
      eventEndDate.value <
      eventStartDate.value
    ) {
      throw new Error(
        translate("event_end_after_start")
      );
    }

    return {
      startDate: eventStartDate.value,
      endDate:
        eventEndDate.value || null
    };
  }

  if (
    !eventStartHour.value ||
    !eventStartMinute.value ||
    !eventEndDate.value ||
    !eventEndHour.value ||
    !eventEndMinute.value
  ) {
    throw new Error(
      translate(
        "event_timed_fields_required"
      )
    );
  }

  const startDateTime =
    `${eventStartDate.value}T` +
    `${eventStartHour.value}:` +
    `${eventStartMinute.value}:00`;

  const endDateTime =
    `${eventEndDate.value}T` +
    `${eventEndHour.value}:` +
    `${eventEndMinute.value}:00`;

  if (endDateTime <= startDateTime) {
    throw new Error(
      translate("event_end_after_start")
    );
  }

  return {
    startDate: startDateTime,
    endDate: endDateTime
  };
}

const eventTabController = CMCENUtils.bindTabs({
  panels: eventPanels,
  panelKey: "eventPanel",
  tabs: eventTabs,
  tabKey: "eventTab"
});

function activateEventTab(tabName) {
  eventTabController.activate(tabName);
}

function buildEventData() {
  const title = {
    en: document
      .getElementById("eventTitleEn")
      .value
      .trim(),

    fr: document
      .getElementById("eventTitleFr")
      .value
      .trim()
  };

  if (!title.en && !title.fr) {
    throw new Error(
      translate("event_title_required")
    );
  }

  const dateValues = getEventDateValues();

  const permissionConfirmed = document.getElementById("eventPublicationPermission").checked;

  if (!permissionConfirmed) {
    throw new Error(translate("event_permission_required"));
  }

  return {
    title,

    location: {
      en: document
        .getElementById("eventLocationEn")
        .value
        .trim(),

      fr: document
        .getElementById("eventLocationFr")
        .value
        .trim()
    },

    description: {
      en: document
        .getElementById(
          "eventDescriptionEn"
        )
        .value
        .trim(),

      fr: document
        .getElementById(
          "eventDescriptionFr"
        )
        .value
        .trim()
    },

    registration: {
      en: document
        .getElementById("eventRegistrationEn")
        .value
        .trim(),

      fr: document
        .getElementById("eventRegistrationFr")
        .value
        .trim()
    },

    timezone: document
      .getElementById("eventTimezone")
      .value,

    ...dateValues,

    allDay:
      eventAllDay.checked,

    submitter: {
      rank: document
        .getElementById("eventSubmitterRank")
        .value
        .trim(),

      firstName: document
        .getElementById("eventSubmitterFirstName")
        .value
        .trim(),

      lastName: document
        .getElementById("eventSubmitterLastName")
        .value
        .trim(),

      unitRole: document
        .getElementById("eventSubmitterUnitRole")
        .value
        .trim(),

      email: document
        .getElementById("eventSubmitterEmail")
        .value
        .trim(),

      phone: document
        .getElementById("eventSubmitterPhone")
        .value
        .trim()
    },

    publicationPermissionConfirmed: permissionConfirmed,

    contentArea:
      "general",

    publishNow:
      !publishNowContainer.hidden &&
      eventPublishNow.checked,

    city: document
      .getElementById("eventCity")
      .value
      .trim(),

    provinceRegion: document
      .getElementById("eventProvinceRegion")
      .value,

    organizingEntity: document
      .getElementById("eventOrganizingEntity")
      .value,

    eventType: document
      .getElementById("eventType")
      .value,


  };
}

function resetEventForm() {
  eventForm.reset();

  eventAllDay.checked = true;

  syncScheduleFields();
  keepEndDateInRange();
}

function setEventFieldIfEmpty(id, value = "") {
  const field = document.getElementById(id);
  const cleanValue = String(value || "").trim();

  if (field && !field.value && cleanValue) {
    field.value = cleanValue;
  }
}

function autofillSubmitterFromProfile(user) {
  if (!user) {
    return;
  }

  setEventFieldIfEmpty("eventSubmitterRank", user.rank);
  setEventFieldIfEmpty("eventSubmitterFirstName", user.firstName);
  setEventFieldIfEmpty("eventSubmitterLastName", user.lastName);
  setEventFieldIfEmpty(
    "eventSubmitterUnitRole",
    user.currentUnit || user.company
  );
  setEventFieldIfEmpty("eventSubmitterEmail", user.email);
}

async function initializeEventPage() {
  const token = CMCENUtils.requireAuthToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    currentUser = await eventApiJson("/api/me", token, {
      errorMessage: translate("event_permission_error")
    });

    autofillSubmitterFromProfile(currentUser);

    if (!currentUser.permissions?.canCreateDrafts) {
      accessDenied = true;

      pageTitle.textContent = translate("event_access_denied_title");

      showPageMessage(translate("event_access_denied"));

      return;
    }

    const canPublishGeneral =
      currentUser.permissions
        ?.canReviewAndPublish === true ||
      (
        currentUser.permissions
          ?.canPublishOwnContent === true &&
        currentUser.contentAreas
          ?.includes("general")
      );

    publishNowContainer.hidden =
      !canPublishGeneral;

    reviewNote.hidden =
      canPublishGeneral;

    await loadMyEvents(token);
    if (editingEventId) {
      activateEventTab("form");
      setEventEditLoading(true);
      await loadEventForEditing(
        token,
        editingEventId
      );
    }
    setEventEditLoading(false);
    eventForm.hidden = false;
  } catch (error) {
    setEventEditLoading(false);
    showPageMessage(
      error.message ||
      translate(
        "event_permission_error"
      )
    );
  }
}

eventAllDay.addEventListener("change", syncScheduleFields);
eventStartDate.addEventListener("change", keepEndDateInRange);
syncStartDateMinimum();
eventForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    clearFormMessage();

    const token =
      CMCENUtils.requireAuthToken();

    if (!token) {
      redirectToLogin();
      return;
    }

    let eventData;

    try {
      eventData = buildEventData();
    } catch (error) {
      showFormMessage(error.message);
      return;
    }

    setSubmitting(true);

    try {
      const requestUrl =
        editingEventId
          ? `/api/events/${encodeURIComponent(editingEventId)}`
          : "/api/events";

      const requestMethod =
        editingEventId
          ? "PATCH"
          : "POST";

      const data = await eventApiJson(requestUrl, token, {
        method: requestMethod,
        body: eventData,
        errorMessage: translate("event_submit_error")
      });

      if (!editingEventId) {
        resetEventForm();
        autofillSubmitterFromProfile(currentUser);
      }

      showFormMessage(
        data.message ||
        translate(
          editingEventId
            ? "event_update_success"
            : eventData.publishNow
              ? "event_submit_success_published"
              : "event_submit_success_pending"
        ),
        "success"
      );

      if (typeof window.refreshAuthUI === "function") {
        window.refreshAuthUI();
      }
    } catch (error) {
      showFormMessage(
        error.message ||
        translate(
          "event_submit_error"
        )
      );
    } finally {
      setSubmitting(false);
    }
  }
);

document.addEventListener(
  "languagechange",
  () => {
    setSubmitting(isSubmitting);

    if (accessDenied) {
      pageTitle.textContent =
        translate(
          "event_access_denied_title"
        );

      showPageMessage(
        translate("event_access_denied")
      );
    }
    if (myEventsSection.hidden === false) {
      const isMyEventsLoading =
        myEventsList.querySelector(".loading-state");

      if (isMyEventsLoading) {
        showMyEventsLoading();
      } else {
        renderMyEvents();
      }
    }
    updateEventFormModeText();
  }
);

window.addEventListener(
  "pageshow", () => {
    if (!CMCENUtils.requireAuthToken()) {
      redirectToLogin();
    }
  }
);

function setEventField(id, value = "") {
  const field = document.getElementById(id);

  if (field) {
    field.value = value ?? "";
  }
}

function setEventCheckbox(id, checked) {
  const field = document.getElementById(id);

  if (field) {
    field.checked = Boolean(checked);
  }
}

function getEventFormDateParts(
  dateValue,
  timezone,
  allDay
) {
  if (!dateValue) {
    return {
      date: "",
      hour: "",
      minute: ""
    };
  }

  const date = new Date(dateValue);

  const formatter =
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone:
        allDay
          ? "UTC"
          : timezone || "UTC"
    });

  const parts = {};

  formatter
    .formatToParts(date)
    .forEach(part => {
      parts[part.type] = part.value;
    });

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,
    hour: parts.hour || "",
    minute: parts.minute || ""
  };
}

function populateEventForm(event) {
  setEventField("eventTitleEn", event.title?.en);
  setEventField("eventTitleFr", event.title?.fr);
  setEventField("eventLocationEn", event.location?.en);
  setEventField("eventLocationFr", event.location?.fr);
  setEventField("eventDescriptionEn", event.description?.en);
  setEventField("eventDescriptionFr", event.description?.fr);
  setEventField("eventRegistrationEn", event.registration?.en);
  setEventField("eventRegistrationFr", event.registration?.fr);
  setEventField("eventCity", event.city);
  setEventField("eventProvinceRegion", event.provinceRegion);
  setEventField("eventOrganizingEntity", event.organizingEntity);
  setEventField("eventType", event.eventType);
  setEventField("eventTimezone", event.timezone);
  setEventCheckbox("eventAllDay", event.allDay);

  const allDayCheckbox = document.getElementById("eventAllDay");
  allDayCheckbox?.dispatchEvent(new Event("change"));

  const start = getEventFormDateParts(
    event.startDate,
    event.timezone,
    event.allDay
  );

  const end = getEventFormDateParts(
    event.endDate,
    event.timezone,
    event.allDay
  );

  setEventField("eventStartDate", start.date);
  setEventField("eventStartHour", start.hour);
  setEventField("eventStartMinute", start.minute);
  setEventField("eventEndDate", end.date);
  setEventField("eventEndHour", end.hour);
  setEventField("eventEndMinute", end.minute);
  setEventField("eventSubmitterRank", event.submitter?.rank);
  setEventField("eventSubmitterFirstName", event.submitter?.firstName);
  setEventField("eventSubmitterLastName", event.submitter?.lastName);
  setEventField("eventSubmitterUnitRole", event.submitter?.unitRole);
  setEventField("eventSubmitterEmail", event.submitter?.email);
  setEventField("eventSubmitterPhone", event.submitter?.phone);
  setEventCheckbox("eventPublicationPermission", event.publicationPermission?.confirmed);
}

async function loadEventForEditing(token, eventId) {
  const data = await eventApiJson(
    `/api/events/${encodeURIComponent(eventId)}/edit`,
    token,
    {
      errorMessage: "Could not load event for editing"
    }
  );

  editingEvent = data.event;

  populateEventForm(editingEvent);
  setEventEditLoading(false);
  eventForm.hidden = false;
}

async function startEditingEvent(eventId) {
  const token = CMCENUtils.requireAuthToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  editingEventId = eventId;
  clearFormMessage();
  eventPageMessage.hidden = true;
  activateEventTab("form");
  updateEventFormModeText();
  setEventEditLoading(true);

  const editUrl =
    `/submit-event.html?id=${encodeURIComponent(eventId)}`;

  if (window.location.pathname + window.location.search !== editUrl) {
    window.history.pushState({}, "", editUrl);
  }

  try {
    await loadEventForEditing(token, eventId);
  } catch (error) {
    setEventEditLoading(false);
    eventForm.hidden = true;
    showPageMessage(
      error.message ||
      translate("event_permission_error")
    );
  }
}

function updateEventFormModeText() {
  const isEditing = Boolean(editingEventId);

  eventFormTabLabel.textContent = translate(isEditing ? "edit_event_tab" : "submit_new_event_tab");
  submitEventTitle.textContent = translate(isEditing ? "edit_event_heading" : "submit_event_heading");
  submitEventIntro.textContent = translate(isEditing ? "edit_event_intro" : "submit_event_intro");
  eventSubmitButtonLabel.textContent = translate(isEditing ? "save_event_changes" : "submit_event_button");
  eventSubmitButton.setAttribute(
    "aria-label",
    translate(isEditing ? "save_event_changes" : "submit_event_button")
  );
}

activateEventTab(editingEventId ? "form" : initialEventPanel);
updateEventFormModeText();
showMyEventsLoading();

if (editingEventId) {
  setEventEditLoading(true);
}

initializeTimeControls();
syncScheduleFields();
initializeEventPage();
