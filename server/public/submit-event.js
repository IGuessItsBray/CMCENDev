const eventForm = document.getElementById("eventForm");
const eventPageMessage = document.getElementById("eventPageMessage");
const eventEditLoading = document.getElementById("eventEditLoading");
const eventEditContext = document.getElementById("eventEditContext");
const eventEditRejection = document.getElementById("eventEditRejection");
const eventEditRejectionReason = document.getElementById("eventEditRejectionReason");

const myEventsSection = document.getElementById("myEventsSection");
const myEventsList = document.getElementById("myEventsList");
const myEventsCount = document.getElementById("myEventsCount");
const eventTabs = document.querySelectorAll("[data-event-tab]");
const eventPanels = document.querySelectorAll("[data-event-panel]");
const eventFormTabLabel = document.getElementById("eventFormTabLabel");
const cancelEventEditing = document.getElementById("cancelEventEditing");

const eventPageEyebrow = document.getElementById("eventPageEyebrow");
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

function formatMyEventType(eventType) {
  if (!eventType) {
    return "";
  }

  const translationKey = `event_type_${eventType}`;
  const translation = translate(translationKey);

  return translation === translationKey
    ? CMCENUtils.formatTitleCaseValue(eventType, "")
    : translation;
}

function createMyEventCard(submittedEvent) {
  const article = document.createElement("article");
  article.className = "my-event-card";

  const isPublished = submittedEvent.status === "published";

  if (isPublished) {
    article.classList.add("is-published");
  }

  const header = document.createElement("div");
  header.className = "my-event-card-header";

  const title = document.createElement("h3");
  title.textContent = getLocalizedEventTitle(submittedEvent);

  const status = document.createElement("span");
  status.className = `my-event-status status-${submittedEvent.status}`;
  status.textContent = translate(`my_events_status_${submittedEvent.status}`);

  const details = document.createElement("div");
  details.className = "my-event-card-details";

  const location = [
    submittedEvent.city,
    submittedEvent.provinceRegion
  ].filter(Boolean).join(", ");

  [
    formatMyEventDate(submittedEvent),
    location,
    formatMyEventType(submittedEvent.eventType),
    `${translate("my_events_last_updated")}: ` + formatMyEventUpdatedDate(submittedEvent.updatedAt)
  ].filter(Boolean).forEach(value => {
    const item = document.createElement("span");
    item.textContent = value;
    details.appendChild(item);
  });

  header.append(status, title, details);

  if (!isPublished) {
    const editLink = document.createElement("a");
    editLink.className = "my-event-edit-link";
    editLink.href = `/submit-event?id=${encodeURIComponent(submittedEvent._id)}`;
    editLink.textContent = translate("my_events_edit");
    editLink.addEventListener("click", event => {
      event.preventDefault();
      startEditingEvent(submittedEvent._id);
    });

    header.appendChild(editLink);
  }

  const row = isPublished
    ? document.createElement("a")
    : document.createElement("div");

  row.className = "my-event-card-row";

  if (isPublished) {
    row.href = `/event?id=${encodeURIComponent(submittedEvent._id)}`;
  }

  row.appendChild(header);
  article.appendChild(row);

  if (submittedEvent.status === "rejected" && submittedEvent.rejectionReason) {
    const rejection = document.createElement("p");

    rejection.className = "my-event-rejection";

    rejection.textContent = `${translate("my_events_rejection_reason")}: ` + submittedEvent.rejectionReason;

    article.appendChild(rejection);
  }

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

  myEventsCount.hidden = !isEventTabActive("events");
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
  // Form results are presented as transient toasts.
}

function showFormMessage(message, type = "error") {
  CMCENUtils.showToast(message, {
    color: type === "success" ? "success" : type === "info" ? "info" : "error",
    position: "bottom-right",
    animation: "slide"
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
  onActivate: updateEventPageHeader,
  panels: eventPanels,
  panelKey: "eventPanel",
  tabs: eventTabs,
  tabKey: "eventTab"
});

function activateEventTab(tabName) {
  eventTabController.activate(tabName);
  updateEventPageHeader(tabName);
}

function isEventTabActive(tabName) {
  return Array.from(eventTabs).some(
    tab =>
      tab.dataset.eventTab === tabName &&
      tab.classList.contains("is-active")
  );
}

function updateEventPageHeader(tabName) {
  if (accessDenied) {
    return;
  }

  const isMyEvents = tabName === "events";

  cancelEventEditing.hidden =
    isMyEvents ||
    !editingEventId;

  eventPageEyebrow.textContent = translate(
    isMyEvents
      ? "my_events_eyebrow"
      : "event_submission_eyebrow"
  );
  submitEventTitle.textContent = translate(
    isMyEvents
      ? "my_events_heading"
      : editingEventId
        ? "edit_event_heading"
        : "submit_event_heading"
  );
  submitEventIntro.textContent = translate(
    isMyEvents
      ? "my_events_intro"
      : editingEventId
        ? "edit_event_intro"
        : "submit_event_intro"
  );
  myEventsCount.hidden =
    !isMyEvents ||
    !myEventsCount.textContent;
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
  refreshEventScheduleControls();
}

function scrollEventPageToTop() {
  const resetScrollPosition = () => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  resetScrollPosition();
  window.requestAnimationFrame(resetScrollPosition);
}

async function finishEditingEvent(token) {
  editingEventId = null;
  editingEvent = null;
  clearFormMessage();
  eventPageMessage.hidden = true;
  setEventEditLoading(false);
  resetEventForm();
  autofillSubmitterFromProfile(currentUser);
  activateEventTab("events");
  updateEventFormModeText();
  scrollEventPageToTop();

  const myEventsUrl = "/submit-event";

  if (window.location.pathname + window.location.search !== myEventsUrl) {
    window.history.replaceState({}, "", myEventsUrl);
  }

  await loadMyEvents(token);
}

function cancelEditingEvent() {
  if (isSubmitting) {
    return;
  }

  editingEventId = null;
  editingEvent = null;
  clearFormMessage();
  eventPageMessage.hidden = true;
  setEventEditLoading(false);
  resetEventForm();
  autofillSubmitterFromProfile(currentUser);
  eventForm.hidden = false;
  activateEventTab("form");
  updateEventFormModeText();

  const createUrl = "/submit-event?panel=form";

  if (window.location.pathname + window.location.search !== createUrl) {
    window.history.pushState({}, "", createUrl);
  }
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
      const eventId = editingEventId;

      activateEventTab("form");
      setEventEditLoading(true);
      try {
        await loadEventForEditing(token, eventId);
      } catch (error) {
        if (editingEventId === eventId) {
          throw error;
        }
      }
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
cancelEventEditing.addEventListener("click", cancelEditingEvent);
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
      const wasEditing = Boolean(editingEventId);
      const requestUrl =
        wasEditing
          ? `/api/events/${encodeURIComponent(editingEventId)}`
          : "/api/events";

      const requestMethod =
        wasEditing
          ? "PATCH"
          : "POST";

      const data = await eventApiJson(requestUrl, token, {
        method: requestMethod,
        body: eventData,
        errorMessage: translate("event_submit_error")
      });

      if (wasEditing) {
        await finishEditingEvent(token);
      } else {
        resetEventForm();
        autofillSubmitterFromProfile(currentUser);

        showFormMessage(
          data.message ||
          translate(
            eventData.publishNow
              ? "event_submit_success_published"
              : "event_submit_success_pending"
          ),
          "success"
        );
      }

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

function refreshEventScheduleControls() {
  window.CMCENDateTimePicker?.refreshDateInput(eventStartDate);
  window.CMCENDateTimePicker?.refreshDateInput(eventEndDate);

  [
    eventStartHour,
    eventStartMinute,
    eventEndHour,
    eventEndMinute,
    document.getElementById("eventTimezone")
  ].forEach(control => {
    control?.dispatchEvent(new Event("change"));
  });
}

function updateEventEditContext() {
  const isEditing = Boolean(editingEventId);

  eventEditContext.hidden = !isEditing;

  if (!isEditing) {
    eventEditRejection.hidden = true;
    eventEditRejectionReason.textContent = "";
    return;
  }

  const rejectionReason =
    editingEvent?.status === "rejected"
      ? String(editingEvent.rejectionReason || "").trim()
      : "";

  eventEditRejection.hidden = !rejectionReason;
  eventEditRejectionReason.textContent = rejectionReason;
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
  keepEndDateInRange();
  refreshEventScheduleControls();
  setEventField("eventSubmitterRank", event.submitter?.rank);
  setEventField("eventSubmitterFirstName", event.submitter?.firstName);
  setEventField("eventSubmitterLastName", event.submitter?.lastName);
  setEventField("eventSubmitterUnitRole", event.submitter?.unitRole);
  setEventField("eventSubmitterEmail", event.submitter?.email);
  setEventField("eventSubmitterPhone", event.submitter?.phone);
  setEventCheckbox("eventPublicationPermission", event.publicationPermission?.confirmed);
  updateEventEditContext();
}

async function loadEventForEditing(token, eventId) {
  const data = await eventApiJson(
    `/api/events/${encodeURIComponent(eventId)}/edit`,
    token,
    {
      errorMessage: "Could not load event for editing"
    }
  );

  if (editingEventId !== eventId) {
    return;
  }

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
  scrollEventPageToTop();
  updateEventFormModeText();
  setEventEditLoading(true);

  const editUrl =
    `/submit-event?id=${encodeURIComponent(eventId)}`;

  if (window.location.pathname + window.location.search !== editUrl) {
    window.history.pushState({}, "", editUrl);
  }

  try {
    await loadEventForEditing(token, eventId);
  } catch (error) {
    if (editingEventId !== eventId) {
      return;
    }

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

  updateEventEditContext();
  cancelEventEditing.hidden =
    !isEditing ||
    isEventTabActive("events");
  cancelEventEditing.disabled = isSubmitting;
  eventFormTabLabel.textContent = translate(isEditing ? "edit_event_tab" : "submit_new_event_tab");
  updateEventPageHeader(
    isEventTabActive("events")
      ? "events"
      : "form"
  );
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
