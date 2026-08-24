const eventForm = document.getElementById("eventForm");
const eventPageMessage = document.getElementById("eventPageMessage");
const eventEditLoading = document.getElementById("eventEditLoading");
const eventEditContext = document.getElementById("eventEditContext");
const eventEditRejection = document.getElementById("eventEditRejection");
const eventEditRejectionReason = document.getElementById(
  "eventEditRejectionReason",
);

const cancelEventEditing = document.getElementById("cancelEventEditing");

const eventPageEyebrow = document.getElementById("eventPageEyebrow");
const submitEventTitle = document.getElementById("submitEventTitle");
const submitEventIntro = document.getElementById("submitEventIntro");
const eventSubmitButtonLabel = document.getElementById(
  "eventSubmitButtonLabel",
);
const eventSubmitButton = document.getElementById("eventSubmitButton");
const eventTitleEn = document.getElementById("eventTitleEn");
const eventTitleFr = document.getElementById("eventTitleFr");
const eventTitleError = document.getElementById("eventTitleError");

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
const redirectToLogin = CMCENUtils.redirectToLogin;

let currentUser = null;
let isSubmitting = false;
let accessDenied = false;
let editingEvent = null;
let eventStartPicker = null;
let eventEndPicker = null;

const eventPageParams = new URLSearchParams(window.location.search);
let editingEventId = eventPageParams.get("id");

function eventApiJson(path, token, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("event_permission_error"),
  });
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

function showPageMessage(message, type = "error") {
  eventPageMessage.textContent = message;

  eventPageMessage.className = `event-page-message is-${type}`;

  eventPageMessage.hidden = false;
}

function clearFormMessage() {
  // Form results are presented as transient toasts.
}

function syncEventTitleValidation({ showError = false } = {}) {
  const hasTitle = Boolean(
    eventTitleEn.value.trim() || eventTitleFr.value.trim(),
  );
  const message = hasTitle ? "" : translate("event_title_required");

  [eventTitleEn, eventTitleFr].forEach((field) => {
    field.setCustomValidity(message);
    field.setAttribute("aria-invalid", String(!hasTitle));
  });

  eventTitleError.textContent = message;
  eventTitleError.hidden = hasTitle || !showError;

  return hasTitle;
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

  if (!eventAllDay.checked && !eventEndDate.value) {
    eventEndDate.value = eventStartDate.value;
  }

  if (eventEndDate.value !== previousEndDate && eventEndPicker?.setValue) {
    eventEndPicker.setValue({
      date: eventEndDate.value,
      time: eventEndTime.value,
    });
  }
}

function syncSchedulePickerValues() {
  [
    {
      picker: eventStartPicker,
      dateInput: eventStartDate,
      timeInput: eventStartTime,
    },
    {
      picker: eventEndPicker,
      dateInput: eventEndDate,
      timeInput: eventEndTime,
    },
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

  if (!eventStartTime.value || !eventEndDate.value || !eventEndTime.value) {
    throw new Error(translate("event_timed_fields_required"));
  }

  const startDateTime =
    `${eventStartDate.value}T` + `${eventStartTime.value}:00`;

  const endDateTime = `${eventEndDate.value}T` + `${eventEndTime.value}:00`;

  if (endDateTime <= startDateTime) {
    throw new Error(translate("event_end_after_start"));
  }

  return {
    startDate: startDateTime,
    endDate: endDateTime,
  };
}

function updateEventPageHeader() {
  if (accessDenied) {
    return;
  }

  cancelEventEditing.hidden = !editingEventId;
  eventPageEyebrow.textContent = translate("event_submission_eyebrow");
  submitEventTitle.textContent = translate(
    editingEventId ? "edit_event_heading" : "submit_event_heading",
  );
  submitEventIntro.textContent = translate(
    editingEventId ? "edit_event_intro" : "submit_event_intro",
  );
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
  CMCENUtils.bindCharacterCounters();

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

function finishEditingEvent() {
  editingEventId = null;
  editingEvent = null;
  clearFormMessage();
  eventPageMessage.hidden = true;
  setEventEditLoading(false);
  resetEventForm();
  updateEventFormModeText();
  scrollEventPageToTop();

  const submitEventUrl = "/submit-event";

  if (window.location.pathname + window.location.search !== submitEventUrl) {
    window.history.replaceState({}, "", submitEventUrl);
  }
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
  updateEventFormModeText();

  const createUrl = "/submit-event";

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

    if (editingEventId) {
      const eventId = editingEventId;

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
cancelEventEditing?.addEventListener("click", cancelEditingEvent);
eventTitleEn.addEventListener("input", () => syncEventTitleValidation());
eventTitleFr.addEventListener("input", () => syncEventTitleValidation());
eventForm.addEventListener(
  "invalid",
  (event) => {
    if (event.target === eventTitleEn || event.target === eventTitleFr) {
      syncEventTitleValidation({ showError: true });
    }
  },
  true,
);
eventForm.addEventListener("submit", async (event) => {
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
      finishEditingEvent();
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
  syncEventTitleValidation({ showError: !eventTitleError.hidden });
  setSubmitting(isSubmitting);

  if (accessDenied) {
    pageTitle.textContent = translate("event_access_denied_title");

    showPageMessage(translate("event_access_denied"));
  }
  updateEventFormModeText();
  refreshEventSchedulePickers();
});

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
      time: "",
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
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: parts.hour && parts.minute ? `${parts.hour}:${parts.minute}` : "",
  };
}

function createEventSchedulePicker({
  dateInput,
  timeInput,
  labelElement,
  mount,
  dateLabelKey,
  dateTimeLabelKey,
  name,
}) {
  const includeTime = !eventAllDay.checked;
  const labelKey = includeTime ? dateTimeLabelKey : dateLabelKey;
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
    },
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
    name: "eventStart",
  });

  eventEndPicker = createEventSchedulePicker({
    dateInput: eventEndDate,
    timeInput: eventEndTime,
    labelElement: eventEndPickerLabel,
    mount: eventEndPickerMount,
    dateLabelKey: "event_end_date",
    dateTimeLabelKey: "event_end_date_time",
    name: "eventEnd",
  });
}

function refreshEventScheduleControls() {
  if (eventStartPicker && eventEndPicker) {
    eventStartPicker.setValue({
      date: eventStartDate.value,
      time: eventStartTime.value,
    });
    eventEndPicker.setValue({
      date: eventEndDate.value,
      time: eventEndTime.value,
    });
  } else {
    refreshEventSchedulePickers();
  }

  [document.getElementById("eventTimezone")].forEach((control) => {
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
  syncEventTitleValidation();
  setEventField("eventLocationEn", event.location?.en);
  setEventField("eventLocationFr", event.location?.fr);
  setEventField("eventDescriptionEn", event.description?.en);
  setEventField("eventDescriptionFr", event.description?.fr);
  setEventField("eventRegistrationEn", event.registration?.en);
  setEventField("eventRegistrationFr", event.registration?.fr);
  CMCENUtils.bindCharacterCounters();
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
  setEventCheckbox(
    "eventPublicationPermission",
    event.publicationPermission?.confirmed,
  );
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

function updateEventFormModeText() {
  const isEditing = Boolean(editingEventId);

  updateEventEditContext();
  cancelEventEditing.hidden = !isEditing;
  cancelEventEditing.disabled = isSubmitting;
  updateEventPageHeader();
  eventSubmitButtonLabel.textContent = translate(
    isEditing ? "save_event_changes" : "submit_event_button",
  );
  eventSubmitButton.setAttribute(
    "aria-label",
    translate(isEditing ? "save_event_changes" : "submit_event_button"),
  );
}

updateEventFormModeText();
syncEventTitleValidation();

if (editingEventId) {
  setEventEditLoading(true);
}

syncScheduleFields();
initializeEventPage();
