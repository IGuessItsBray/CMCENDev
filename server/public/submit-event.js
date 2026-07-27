const eventForm = document.getElementById("eventForm");
const eventPageMessage = document.getElementById("eventPageMessage");
const eventEditLoading = document.getElementById("eventEditLoading");
const eventEditContext = document.getElementById("eventEditContext");
const eventEditRejection = document.getElementById("eventEditRejection");
const eventEditRejectionReason = document.getElementById(
  "eventEditRejectionReason",
);

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
const eventSubmitButtonLabel = document.getElementById(
  "eventSubmitButtonLabel",
);
const eventSubmitButton = document.getElementById("eventSubmitButton");

const eventAllDay = document.getElementById("eventAllDay");
const eventStartDate = document.getElementById("eventStartDate");
const eventStartTime = document.getElementById("eventStartTime");
const eventEndDate = document.getElementById("eventEndDate");
const eventEndTime = document.getElementById("eventEndTime");
const eventStartPickerMount = document.getElementById("eventStartPicker");
const eventEndPickerMount = document.getElementById("eventEndPicker");
const eventStartPickerLabel = document.getElementById("eventStartPickerLabel");
const eventEndPickerLabel = document.getElementById("eventEndPickerLabel");
const eventEndDateHint = document.getElementById("eventEndDateHint");
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
let eventStartPicker = null;
let eventEndPicker = null;

const eventPageParams = new URLSearchParams(window.location.search);
let editingEventId = eventPageParams.get("id");
const initialEventPanel =
  eventPageParams.get("panel") === "form" ? "form" : "events";

function eventApiJson(path, token, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("event_permission_error"),
  });
}

function showMyEventsLoading() {
  myEventsSection.hidden = false;
  myEventsCount.hidden = true;
  myEventsList.replaceChildren(
    createLoadingSpinner(translate("my_events_loading")),
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
    CMCENUtils.getLocalizedText(event.title) || translate("my_events_untitled")
  );
}

function formatMyEventDate(event) {
  if (event.allDay) {
    return CMCENUtils.formatDate(event.startDate, {
      timeZone: "UTC",
    });
  }

  return CMCENUtils.formatDate(event.startDate, {
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: event.timezone || undefined,
  });
}

function formatMyEventUpdatedDate(value) {
  return CMCENUtils.formatDate(value, {
    fallback: "—",
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

  const location = [submittedEvent.city, submittedEvent.provinceRegion]
    .filter(Boolean)
    .join(", ");

  [
    formatMyEventDate(submittedEvent),
    location,
    formatMyEventType(submittedEvent.eventType),
    `${translate("my_events_last_updated")}: ` +
    formatMyEventUpdatedDate(submittedEvent.updatedAt),
  ]
    .filter(Boolean)
    .forEach((value) => {
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
    editLink.addEventListener("click", (event) => {
      event.preventDefault();
      startEditingEvent(submittedEvent._id);
    });

    header.appendChild(editLink);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "my-event-edit-link is-danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        !(await CMCENModal.confirm(
          "Delete this submitted event? This cannot be undone.",
          { title: "Delete event", confirmText: "Delete", destructive: true },
        ))
      )
        return;

      try {
        await eventApiJson(
          `/api/admin/events/${encodeURIComponent(submittedEvent._id)}`,
          token,
          { method: "DELETE", errorMessage: "Could not delete event" },
        );
        await loadMyEvents(token);
        CMCENUtils.showToast("Event deleted", {
          color: "success",
          position: "bottom-right",
          animation: "slide",
        });
      } catch (error) {
        CMCENUtils.showToast(error.message || "Could not delete event", {
          color: "error",
          position: "bottom-right",
          animation: "slide",
        });
      }
    });

    header.appendChild(deleteButton);
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

    rejection.textContent =
      `${translate("my_events_rejection_reason")}: ` +
      submittedEvent.rejectionReason;

    article.appendChild(rejection);
  }

  return article;
}

function renderMyEvents() {
  myEventsList.replaceChildren();

  const count = myEvents.length;

  myEventsCount.textContent =
    count === 1
      ? translate("my_events_count_singular")
      : translate("my_events_count_plural", { count });

  myEventsCount.hidden = !isEventTabActive("events");
  myEventsSection.hidden = false;

  if (!count) {
    const message = document.createElement("p");

    message.className = "my-events-message";
    message.textContent = translate("my_events_empty");

    myEventsList.appendChild(message);
    return;
  }

  myEvents.forEach((event) => {
    myEventsList.appendChild(createMyEventCard(event));
  });
}

async function loadMyEvents(token) {
  showMyEventsLoading();

  try {
    const data = await eventApiJson("/api/events/mine", token, {
      errorMessage: translate("my_events_load_error"),
    });

    myEvents = Array.isArray(data.events) ? data.events : [];

    renderMyEvents();
  } catch (error) {
    myEventsSection.hidden = false;

    myEventsList.textContent =
      error.message || translate("my_events_load_error");
  }
}

function showPageMessage(message, type = "error") {
  eventPageMessage.textContent = message;

  eventPageMessage.className = `event-page-message is-${type}`;

  eventPageMessage.hidden = false;
}

function clearFormMessage() {
  // Form results are presented as transient toasts.
}

function showFormMessage(message, type = "error") {
  CMCENUtils.showToast(message, {
    color: type === "success" ? "success" : type === "info" ? "info" : "error",
    position: "bottom-right",
    animation: "slide",
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
          : "submit_event_button",
    ),
  );
}

function syncScheduleFields() {
  const isAllDay = eventAllDay.checked;

  timeZoneNote.hidden = isAllDay;
  eventEndDate.required = !isAllDay;
  eventEndDateHint.hidden = !isAllDay;

  if (!isAllDay && !eventEndDate.value && eventStartDate.value) {
    eventEndDate.value = eventStartDate.value;
  }

  refreshEventSchedulePickers();
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function keepEndDateInRange() {
  const previousEndDate = eventEndDate.value;

  if (
    eventStartDate.value &&
    eventEndDate.value &&
    eventEndDate.value < eventStartDate.value
  ) {
    eventEndDate.value = eventStartDate.value;
  }

  if (
    !eventAllDay.checked &&
    !eventEndDate.value
  ) {
    eventEndDate.value =
      eventStartDate.value;
  }

  if (
    eventEndDate.value !== previousEndDate &&
    eventEndPicker?.setValue
  ) {
    eventEndPicker.setValue({
      date: eventEndDate.value,
      time: eventEndTime.value
    });
  }
}

function syncSchedulePickerValues() {
  [
    {
      picker: eventStartPicker,
      dateInput: eventStartDate,
      timeInput: eventStartTime
    },
    {
      picker: eventEndPicker,
      dateInput: eventEndDate,
      timeInput: eventEndTime
    }
  ].forEach(({ picker, dateInput, timeInput }) => {
    const value = picker?.getValue?.();

    if (!value) {
      return;
    }

    dateInput.value = value.date || "";
    timeInput.value = value.time || "";
  });
}

function getEventDateValues() {
  syncSchedulePickerValues();

  if (!eventStartDate.value) {
    throw new Error(translate("event_start_required"));
  }

  if (eventStartDate.value < getTodayDateValue()) {
    throw new Error(translate("event_start_in_past"));
  }

  if (eventAllDay.checked) {
    if (eventEndDate.value && eventEndDate.value < eventStartDate.value) {
      throw new Error(translate("event_end_after_start"));
    }

    return {
      startDate: eventStartDate.value,
      endDate: eventEndDate.value || null,
    };
  }

  if (
    !eventStartTime.value ||
    !eventEndDate.value ||
    !eventEndTime.value
  ) {
    throw new Error(translate("event_timed_fields_required"));
  }

  const startDateTime =
    `${eventStartDate.value}T` +
    `${eventStartTime.value}:00`;

  const endDateTime =
    `${eventEndDate.value}T` +
    `${eventEndTime.value}:00`;

  if (endDateTime <= startDateTime) {
    throw new Error(translate("event_end_after_start"));
  }

  return {
    startDate: startDateTime,
    endDate: endDateTime,
  };
}

const eventTabController = CMCENUtils.bindTabs({
  onActivate: updateEventPageHeader,
  panels: eventPanels,
  panelKey: "eventPanel",
  tabs: eventTabs,
  tabKey: "eventTab",
});

function activateEventTab(tabName) {
  eventTabController.activate(tabName);
  updateEventPageHeader(tabName);
}

function isEventTabActive(tabName) {
  return Array.from(eventTabs).some(
    (tab) =>
      tab.dataset.eventTab === tabName && tab.classList.contains("is-active"),
  );
}

function updateEventPageHeader(tabName) {
  if (accessDenied) {
    return;
  }

  const isMyEvents = tabName === "events";

  cancelEventEditing.hidden = isMyEvents || !editingEventId;

  eventPageEyebrow.textContent = translate(
    isMyEvents ? "my_events_eyebrow" : "event_submission_eyebrow",
  );
  submitEventTitle.textContent = translate(
    isMyEvents
      ? "my_events_heading"
      : editingEventId
        ? "edit_event_heading"
        : "submit_event_heading",
  );
  submitEventIntro.textContent = translate(
    isMyEvents
      ? "my_events_intro"
      : editingEventId
        ? "edit_event_intro"
        : "submit_event_intro",
  );
  myEventsCount.hidden = !isMyEvents || !myEventsCount.textContent;
}

function buildEventData() {
  const title = {
    en: document.getElementById("eventTitleEn").value.trim(),

    fr: document.getElementById("eventTitleFr").value.trim(),
  };

  if (!title.en && !title.fr) {
    throw new Error(translate("event_title_required"));
  }

  const dateValues = getEventDateValues();

  const permissionConfirmed = document.getElementById(
    "eventPublicationPermission",
  ).checked;

  if (!permissionConfirmed) {
    throw new Error(translate("event_permission_required"));
  }

  return {
    title,

    location: {
      en: document.getElementById("eventLocationEn").value.trim(),

      fr: document.getElementById("eventLocationFr").value.trim(),
    },

    description: {
      en: document.getElementById("eventDescriptionEn").value.trim(),

      fr: document.getElementById("eventDescriptionFr").value.trim(),
    },

    registration: {
      en: document.getElementById("eventRegistrationEn").value.trim(),

      fr: document.getElementById("eventRegistrationFr").value.trim(),
    },

    timezone: document.getElementById("eventTimezone").value,

    ...dateValues,

    allDay: eventAllDay.checked,

    publicationPermissionConfirmed: permissionConfirmed,

    contentArea: "general",

    publishNow: !publishNowContainer.hidden && eventPublishNow.checked,

    city: document.getElementById("eventCity").value.trim(),

    provinceRegion: document.getElementById("eventProvinceRegion").value,

    organizingEntity: document.getElementById("eventOrganizingEntity").value,

    eventType: document.getElementById("eventType").value,
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
  eventForm.hidden = false;
  activateEventTab("form");
  updateEventFormModeText();

  const createUrl = "/submit-event?panel=form";

  if (window.location.pathname + window.location.search !== createUrl) {
    window.history.pushState({}, "", createUrl);
  }
}

async function initializeEventPage() {
  const token = CMCENUtils.requireAuthToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    currentUser = await eventApiJson("/api/me", token, {
      errorMessage: translate("event_permission_error"),
    });

    if (!currentUser.permissions?.canCreateDrafts) {
      accessDenied = true;

      pageTitle.textContent = translate("event_access_denied_title");

      showPageMessage(translate("event_access_denied"));

      return;
    }

    const canPublishGeneral =
      currentUser.permissions?.canReviewAndPublish === true ||
      (currentUser.permissions?.canPublishOwnContent === true &&
        currentUser.contentAreas?.includes("general"));

    publishNowContainer.hidden = !canPublishGeneral;

    reviewNote.hidden = canPublishGeneral;

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
    showPageMessage(error.message || translate("event_permission_error"));
  }
}

eventAllDay.addEventListener("change", syncScheduleFields);
cancelEventEditing.addEventListener("click", cancelEditingEvent);
eventForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    clearFormMessage();

    const token = CMCENUtils.requireAuthToken();

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
      const requestUrl = wasEditing
        ? `/api/events/${encodeURIComponent(editingEventId)}`
        : "/api/events";

      const requestMethod = wasEditing ? "PATCH" : "POST";

      const data = await eventApiJson(requestUrl, token, {
        method: requestMethod,
        body: eventData,
        errorMessage: translate("event_submit_error"),
      });

      if (wasEditing) {
        await finishEditingEvent(token);
      } else {
        resetEventForm();

        showFormMessage(
          data.message ||
          translate(
            eventData.publishNow
              ? "event_submit_success_published"
              : "event_submit_success_pending",
          ),
          "success",
        );
      }

      if (typeof window.refreshAuthUI === "function") {
        window.refreshAuthUI();
      }
    } catch (error) {
      showFormMessage(error.message || translate("event_submit_error"));
    } finally {
      setSubmitting(false);
    }
  });

document.addEventListener("languagechange", () => {
  setSubmitting(isSubmitting);

  if (accessDenied) {
    pageTitle.textContent = translate("event_access_denied_title");

    showPageMessage(translate("event_access_denied"));
  }
  if (myEventsSection.hidden === false) {
    const isMyEventsLoading = myEventsList.querySelector(".loading-state");

    if (isMyEventsLoading) {
      showMyEventsLoading();
    } else {
      renderMyEvents();
    }
  }
  updateEventFormModeText();
  refreshEventSchedulePickers();
}
);

window.addEventListener("pageshow", () => {
  if (!CMCENUtils.requireAuthToken()) {
    redirectToLogin();
  }
});

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

function getEventFormDateParts(dateValue, timezone, allDay) {
  if (!dateValue) {
    return {
      date: "",
      time: ""
    };
  }

  const date = new Date(dateValue);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: allDay ? "UTC" : timezone || "UTC",
  });

  const parts = {};

  formatter.formatToParts(date).forEach((part) => {
    parts[part.type] = part.value;
  });

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,
    time:
      parts.hour && parts.minute
        ? `${parts.hour}:${parts.minute}`
        : ""
  };
}

function createEventSchedulePicker({
  dateInput,
  timeInput,
  labelElement,
  mount,
  dateLabelKey,
  dateTimeLabelKey,
  name
}) {
  const includeTime = !eventAllDay.checked;
  const labelKey = includeTime
    ? dateTimeLabelKey
    : dateLabelKey;
  const label = translate(labelKey);

  labelElement.textContent = label;

  const picker = window.CMCENDateTimePicker?.create({
    name,
    dateName: `${name}PickerDate`,
    timeName: `${name}PickerTime`,
    date: dateInput.value,
    time: timeInput.value,
    includeTime,
    label,
    placeholder: includeTime
      ? translate("timers_date_time_placeholder")
      : label,
    timeLabel: translate("timers_picker_time"),
    clearLabel: translate("timers_picker_clear"),
    doneLabel: translate("timers_picker_done"),
    locale: CMCENUtils.getCurrentLocale(),
    onInput: ({ date, time }) => {
      dateInput.value = date;
      timeInput.value = time;

      if (dateInput === eventStartDate) {
        keepEndDateInRange();
      }
    }
  });

  if (picker) {
    mount.replaceChildren(picker);
  }

  return picker;
}

function refreshEventSchedulePickers() {
  eventStartPicker?.destroy?.();
  eventEndPicker?.destroy?.();

  eventStartPicker = createEventSchedulePicker({
    dateInput: eventStartDate,
    timeInput: eventStartTime,
    labelElement: eventStartPickerLabel,
    mount: eventStartPickerMount,
    dateLabelKey: "event_start_date",
    dateTimeLabelKey: "event_start_date_time",
    name: "eventStart"
  });

  eventEndPicker = createEventSchedulePicker({
    dateInput: eventEndDate,
    timeInput: eventEndTime,
    labelElement: eventEndPickerLabel,
    mount: eventEndPickerMount,
    dateLabelKey: "event_end_date",
    dateTimeLabelKey: "event_end_date_time",
    name: "eventEnd"
  });
}

function refreshEventScheduleControls() {
  if (eventStartPicker && eventEndPicker) {
    eventStartPicker.setValue({
      date: eventStartDate.value,
      time: eventStartTime.value
    });
    eventEndPicker.setValue({
      date: eventEndDate.value,
      time: eventEndTime.value
    });
  } else {
    refreshEventSchedulePickers();
  }

  [
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
    event.allDay,
  );

  const end = getEventFormDateParts(
    event.endDate,
    event.timezone,
    event.allDay,
  );

  setEventField("eventStartDate", start.date);
  setEventField("eventStartTime", start.time);
  setEventField("eventEndDate", end.date);
  setEventField("eventEndTime", end.time);
  keepEndDateInRange();
  refreshEventScheduleControls();
  setEventCheckbox("eventPublicationPermission", event.publicationPermission?.confirmed);
  updateEventEditContext();
}

async function loadEventForEditing(token, eventId) {
  const data = await eventApiJson(
    `/api/events/${encodeURIComponent(eventId)}/edit`,
    token,
    {
      errorMessage: "Could not load event for editing",
    },
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

  const editUrl = `/submit-event?id=${encodeURIComponent(eventId)}`;

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
    showPageMessage(error.message || translate("event_permission_error"));
  }
}

function updateEventFormModeText() {
  const isEditing = Boolean(editingEventId);

  updateEventEditContext();
  cancelEventEditing.hidden = !isEditing || isEventTabActive("events");
  cancelEventEditing.disabled = isSubmitting;
  eventFormTabLabel.textContent = translate(
    isEditing ? "edit_event_tab" : "submit_new_event_tab",
  );
  updateEventPageHeader(isEventTabActive("events") ? "events" : "form");
  eventSubmitButtonLabel.textContent = translate(
    isEditing ? "save_event_changes" : "submit_event_button",
  );
  eventSubmitButton.setAttribute(
    "aria-label",
    translate(isEditing ? "save_event_changes" : "submit_event_button"),
  );
}

activateEventTab(editingEventId ? "form" : initialEventPanel);
updateEventFormModeText();
showMyEventsLoading();

if (editingEventId) {
  setEventEditLoading(true);
}

syncScheduleFields();
initializeEventPage();
