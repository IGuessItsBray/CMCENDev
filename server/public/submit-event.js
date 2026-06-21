const eventForm =
  document.getElementById("eventForm");

const eventPageMessage =
  document.getElementById("eventPageMessage");

const eventFormMessage =
  document.getElementById("eventFormMessage");

const eventSubmitButton =
  document.getElementById("eventSubmitButton");

const eventAllDay =
  document.getElementById("eventAllDay");

const eventStartDate =
  document.getElementById("eventStartDate");

const eventStartTime =
  document.getElementById("eventStartTime");

const eventEndDate =
  document.getElementById("eventEndDate");

const eventEndTime =
  document.getElementById("eventEndTime");

const startTimeField =
  document.getElementById("eventStartTimeField");

const endTimeField =
  document.getElementById("eventEndTimeField");

const timeZoneNote =
  document.getElementById("eventTimeZoneNote");

const publishNowContainer =
  document.getElementById("publishNowContainer");

const eventPublishNow =
  document.getElementById("eventPublishNow");

const reviewNote =
  document.getElementById("eventReviewNote");

const pageTitle =
  document.getElementById("submitEventTitle");

let currentUser = null;
let isSubmitting = false;
let accessDenied = false;

function translate(key) {
  return (
    translations[currentLang]?.[key] ??
    translations.en?.[key] ??
    key
  );
}

function redirectToLogin() {
  localStorage.removeItem("token");
  window.location.replace("/login.html");
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
  eventFormMessage.className =
    "event-form-message";

  eventFormMessage.hidden = true;
}

function showFormMessage(
  message,
  type = "error"
) {
  eventFormMessage.textContent = message;

  eventFormMessage.className =
    `event-form-message is-${type}`;

  eventFormMessage.hidden = false;

  eventFormMessage.scrollIntoView({
    block: "nearest"
  });
}

function setSubmitting(submitting) {
  isSubmitting = submitting;

  eventSubmitButton.disabled = submitting;

  eventSubmitButton.setAttribute(
    "aria-busy",
    String(submitting)
  );

  eventSubmitButton.textContent =
    translate(
      submitting
        ? "event_submitting"
        : "event_submit_button"
    );
}

function syncScheduleFields() {
  const isAllDay = eventAllDay.checked;

  startTimeField.hidden = isAllDay;
  endTimeField.hidden = isAllDay;
  timeZoneNote.hidden = isAllDay;

  eventStartTime.disabled = isAllDay;
  eventEndTime.disabled = isAllDay;

  eventStartTime.required = !isAllDay;
  eventEndDate.required = !isAllDay;
  eventEndTime.required = !isAllDay;

  if (
    !isAllDay &&
    !eventEndDate.value &&
    eventStartDate.value
  ) {
    eventEndDate.value =
      eventStartDate.value;
  }
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
      startDate:
        eventStartDate.value,

      endDate:
        eventEndDate.value || null
    };
  }

  if (
    !eventStartTime.value ||
    !eventEndDate.value ||
    !eventEndTime.value
  ) {
    throw new Error(
      translate(
        "event_timed_fields_required"
      )
    );
  }

  const start = new Date(
    `${eventStartDate.value}T` +
    `${eventStartTime.value}:00`
  );

  const end = new Date(
    `${eventEndDate.value}T` +
    `${eventEndTime.value}:00`
  );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error(
      translate(
        "event_timed_fields_required"
      )
    );
  }

  if (end <= start) {
    throw new Error(
      translate("event_end_after_start")
    );
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
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

  const dateValues =
    getEventDateValues();

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

    ...dateValues,

    allDay:
      eventAllDay.checked,

    contentArea:
      "general",

    publishNow:
      !publishNowContainer.hidden &&
      eventPublishNow.checked
  };
}

function resetEventForm() {
  eventForm.reset();

  eventAllDay.checked = true;

  syncScheduleFields();
  keepEndDateInRange();
}

async function initializeEventPage() {
  const token =
    localStorage.getItem("token");

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response =
      await fetch("/api/me", {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      });

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok) {
      throw new Error(
        translate(
          "event_permission_error"
        )
      );
    }

    currentUser =
      await response.json();

    if (
      !currentUser.permissions
        ?.canCreateDrafts
    ) {
      accessDenied = true;

      pageTitle.textContent =
        translate(
          "event_access_denied_title"
        );

      showPageMessage(
        translate("event_access_denied")
      );

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

    eventForm.hidden = false;
  } catch (error) {
    showPageMessage(
      error.message ||
      translate(
        "event_permission_error"
      )
    );
  }
}

eventAllDay.addEventListener(
  "change",
  syncScheduleFields
);

eventStartDate.addEventListener(
  "change",
  keepEndDateInRange
);

eventForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    clearFormMessage();

    const token =
      localStorage.getItem("token");

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
      const response =
        await fetch("/api/events", {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify(eventData)
        });

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          translate(
            "event_submit_error"
          )
        );
      }

      resetEventForm();

      showFormMessage(
        translate(
          eventData.publishNow
            ? "event_submit_success_published"
            : "event_submit_success_pending"
        ),
        "success"
      );
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
  }
);

window.addEventListener(
  "pageshow",
  () => {
    if (
      !localStorage.getItem("token")
    ) {
      redirectToLogin();
    }
  }
);

syncScheduleFields();
initializeEventPage();
