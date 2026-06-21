const reviewQueue = document.getElementById("reviewQueue");

const reviewPageMessage =
  document.getElementById("reviewPageMessage");

const reviewNotice =
  document.getElementById("reviewNotice");

const reviewQueueCount =
  document.getElementById("reviewQueueCount");

let pendingEvents = [];
let accessDenied = false;
let loadFailed = false;
let noticeTimer = null;

function getReviewLanguage() {
  if (typeof currentLang === "string") {
    return currentLang;
  }

  return localStorage.getItem("lang") || "en";
}

function reviewTranslate(key) {
  const language = getReviewLanguage();

  return (
    translations[language]?.[key] ??
    translations.en?.[key] ??
    key
  );
}

function getReviewLocale() {
  return getReviewLanguage() === "fr"
    ? "fr-CA"
    : "en-CA";
}

function redirectToLogin() {
  localStorage.removeItem("token");
  window.location.replace("/login.html");
}

function getContentValue(value, language) {
  if (typeof value?.[language] !== "string") {
    return "";
  }

  return value[language].trim();
}

function getDisplayTitle(event) {
  const language = getReviewLanguage();

  const fallbackLanguage =
    language === "fr" ? "en" : "fr";

  return (
    getContentValue(event.title, language) ||
    getContentValue(event.title, fallbackLanguage) ||
    reviewTranslate("translation_missing")
  );
}

function formatSubmittedDate(dateValue) {
  return new Intl.DateTimeFormat(
    getReviewLocale(),
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(dateValue));
}

function formatEventSchedule(event) {
  const locale = getReviewLocale();

  const start = new Date(event.startDate);

  const end = event.endDate
    ? new Date(event.endDate)
    : null;

  if (event.allDay) {
    const dateFormatter =
      new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeZone: "UTC"
      });

    const startLabel =
      dateFormatter.format(start);

    if (
      !end ||
      start.getTime() === end.getTime()
    ) {
      return (
        `${startLabel} · ` +
        reviewTranslate("all_day")
      );
    }

    return (
      `${startLabel} – ` +
      `${dateFormatter.format(end)} · ` +
      reviewTranslate("all_day")
    );
  }

  const timeZone =
    event.timezone || undefined;

  const dateFormatter =
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone
    });

  const timeFormatter =
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone
    });

  const dayFormatter =
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone
    });

  const startDateLabel =
    dateFormatter.format(start);

  const startTimeLabel =
    timeFormatter.format(start);

  if (!end) {
    return (
      `${startDateLabel} · ` +
      startTimeLabel
    );
  }

  const sameDay =
    dayFormatter.format(start) ===
    dayFormatter.format(end);

  if (sameDay) {
    return (
      `${startDateLabel} · ` +
      `${startTimeLabel}–` +
      timeFormatter.format(end)
    );
  }

  return (
    `${startDateLabel}, ${startTimeLabel} – ` +
    `${dateFormatter.format(end)}, ` +
    timeFormatter.format(end)
  );
}

function formatContentArea(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(
      /\b\w/g,
      character => character.toUpperCase()
    );
}

const timezoneTranslationKeys = {
  "America/St_Johns":
    "timezone_newfoundland",

  "America/Halifax":
    "timezone_atlantic",

  "America/Toronto":
    "timezone_eastern",

  "America/Winnipeg":
    "timezone_central",

  "America/Edmonton":
    "timezone_mountain",

  "America/Vancouver":
    "timezone_pacific",

  "America/Regina":
    "timezone_central",

  "America/Whitehorse":
    "timezone_mountain"
};

function formatTranslatedOption(
  prefix,
  value
) {
  if (!value) {
    return "—";
  }

  const normalizedValue = String(value)
    .toLowerCase()
    .replace(/-/g, "_");

  const key =
    `${prefix}_${normalizedValue}`;

  const translated =
    reviewTranslate(key);

  if (translated === key) {
    return formatContentArea(value);
  }

  return translated;
}

function formatEventTimezone(value) {
  if (!value) {
    return "—";
  }

  const translationKey =
    timezoneTranslationKeys[value];

  if (!translationKey) {
    return value;
  }

  return (
    `${reviewTranslate(translationKey)} ` +
    `(${value})`
  );
}

function formatReviewUser(user) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return "—";
  }

  return (
    user.accountName ||
    user.username ||
    user.email ||
    "—"
  );
}

function createReviewRecordSection(
  titleKey,
  items,
  additionalClass = ""
) {
  const section =
    document.createElement("section");

  section.className =
    `review-record-section ${additionalClass}`
      .trim();

  const heading =
    document.createElement("h3");

  heading.textContent =
    reviewTranslate(titleKey);

  const grid =
    document.createElement("div");

  grid.className =
    "review-record-data";

  items.forEach(item => {
    const record =
      document.createElement("div");

    record.className =
      "review-record-item";

    if (item.wide) {
      record.classList.add("is-wide");
    }

    const label =
      document.createElement("span");

    label.className =
      "review-record-label";

    label.textContent =
      reviewTranslate(item.labelKey);

    const value =
      document.createElement("span");

    value.className =
      "review-record-value";

    if (item.valueClass) {
      value.classList.add(
        item.valueClass
      );
    }

    value.textContent =
      item.value || "—";

    record.append(label, value);
    grid.appendChild(record);
  });

  section.append(heading, grid);

  return section;
}

function createMetaItem(labelKey, value) {
  const item =
    document.createElement("div");

  item.className =
    "review-event-meta-item";

  const label =
    document.createElement("span");

  label.className =
    "review-event-meta-label";

  label.textContent =
    reviewTranslate(labelKey);

  const content =
    document.createElement("span");

  content.className =
    "review-event-meta-value";

  content.textContent = value || "—";

  item.append(label, content);

  return item;
}

function createContentValue(
  className,
  value
) {
  const element =
    document.createElement("p");

  element.className = className;

  if (value) {
    element.textContent = value;
  } else {
    element.textContent =
      reviewTranslate("translation_missing");

    element.classList.add("is-missing");
  }

  return element;
}

function createContentSection(
  event,
  language,
  heading
) {
  const section =
    document.createElement("section");

  section.className =
    "review-language-panel";

  section.lang = language;

  const header =
    document.createElement("header");

  header.className =
    "review-language-heading";

  const code =
    document.createElement("span");

  code.className =
    "review-language-code";

  code.textContent =
    language.toUpperCase();

  const sectionHeading =
    document.createElement("h3");

  sectionHeading.textContent = heading;

  header.append(code, sectionHeading);

  const body =
    document.createElement("div");

  body.className =
    "review-language-body";

  const titleLabel =
    document.createElement("span");

  titleLabel.className =
    "review-content-label";

  titleLabel.textContent =
    reviewTranslate("review_title_label");

  const title = createContentValue(
    "review-event-title-value",
    getContentValue(event.title, language)
  );

  const locationLabel =
    document.createElement("span");

  locationLabel.className =
    "review-content-label";

  locationLabel.textContent =
    reviewTranslate(
      "event_location_label"
    );

  const location = createContentValue(
    "review-event-location",
    getContentValue(
      event.location,
      language
    )
  );

  const descriptionLabel =
    document.createElement("span");

  descriptionLabel.className =
    "review-content-label";

  descriptionLabel.textContent =
    reviewTranslate(
      "review_description_label"
    );

  const description = createContentValue(
    "review-event-description",
    getContentValue(
      event.description,
      language
    )
  );

  const registrationLabel =
    document.createElement("span");

  registrationLabel.className =
    "review-content-label";

  registrationLabel.textContent =
    reviewTranslate(
      "event_registration_label"
    );

  const registration =
    document.createElement("p");

  registration.className =
    "review-event-registration";

  registration.textContent =
    getContentValue(
      event.registration,
      language
    ) || "—";

  body.append(
    titleLabel,
    title,
    locationLabel,
    location,
    descriptionLabel,
    description,
    registrationLabel,
    registration
  );

  section.append(header, body);

  return section;
}

function createReviewCard(event) {
  const article =
    document.createElement("article");

  article.className =
    "review-event-card";

  article.dataset.eventId = event._id;

  const cardHeader =
    document.createElement("header");

  cardHeader.className =
    "review-event-card-header";

  const headingCopy =
    document.createElement("div");

  headingCopy.className =
    "review-event-card-heading";

  const eyebrow =
    document.createElement("p");

  eyebrow.textContent =
    reviewTranslate(
      "review_pending_submission"
    );

  const title =
    document.createElement("h2");

  title.textContent =
    getDisplayTitle(event);

  headingCopy.append(eyebrow, title);

  const status =
    document.createElement("span");

  status.className =
    "review-status-badge";

  status.textContent =
    reviewTranslate(
      "review_status_pending"
    );

  cardHeader.append(
    headingCopy,
    status
  );

  const submittedBy =
    event.createdBy?.accountName ||
    event.createdBy?.username ||
    reviewTranslate("unknown_user");

  const meta =
    document.createElement("div");

  meta.className = "review-event-meta";

  meta.append(
    createMetaItem(
      "submitted_by",
      submittedBy
    ),

    createMetaItem(
      "submitted_on",
      formatSubmittedDate(
        event.createdAt
      )
    ),

    createMetaItem(
      "event_date_label",
      formatEventSchedule(event)
    ),

    createMetaItem(
      "review_content_area",
      formatContentArea(
        event.contentArea
      )
    )
  );

  const eventInformation =
    createReviewRecordSection(
      "review_event_information",
      [
        {
          labelKey: "event_city",
          value: event.city
        },

        {
          labelKey:
            "event_province_region",

          value:
            formatTranslatedOption(
              "region",
              event.provinceRegion
            )
        },

        {
          labelKey:
            "event_organizing_entity",

          value:
            formatTranslatedOption(
              "entity",
              event.organizingEntity
            )
        },

        {
          labelKey: "event_type",

          value:
            formatTranslatedOption(
              "event_type",
              event.eventType
            )
        },

        {
          labelKey: "event_timezone",

          value:
            formatEventTimezone(
              event.timezone
            ),

          wide: true
        }
      ],
      "review-event-information"
    );

  const languages =
    document.createElement("div");

  languages.className =
    "review-language-grid";

  languages.append(
    createContentSection(
      event,
      "en",
      "English"
    ),
    createContentSection(
      event,
      "fr",
      "Français"
    )
  );

  const submitterInformation =
    createReviewRecordSection(
      "review_submitter_record",
      [
        {
          labelKey:
            "event_submitter_rank",

          value:
            event.submitter?.rank
        },

        {
          labelKey:
            "event_submitter_first_name",

          value:
            event.submitter?.firstName
        },

        {
          labelKey:
            "event_submitter_last_name",

          value:
            event.submitter?.lastName
        },

        {
          labelKey:
            "event_submitter_unit_role",

          value:
            event.submitter?.unitRole,

          wide: true
        },

        {
          labelKey:
            "event_submitter_email",

          value:
            event.submitter?.email,

          wide: true
        },

        {
          labelKey:
            "event_submitter_phone",

          value:
            event.submitter?.phone || "—",

          wide: true
        }
      ]
    );

  const permissionConfirmed =
    event.publicationPermission
      ?.confirmed === true;

  const authorizationInformation =
    createReviewRecordSection(
      "review_authorization_record",
      [
        {
          labelKey:
            "review_permission_status",

          value: reviewTranslate(
            permissionConfirmed
              ? "review_permission_confirmed"
              : "review_permission_not_recorded"
          ),

          valueClass:
            permissionConfirmed
              ? "is-confirmed"
              : "is-unconfirmed"
        },

        {
          labelKey:
            "review_confirmed_by",

          value:
            formatReviewUser(
              event.publicationPermission
                ?.confirmedBy
            ),

          wide: true
        },

        {
          labelKey:
            "review_confirmed_on",

          value:
            event.publicationPermission
              ?.confirmedAt
              ? formatSubmittedDate(
                event.publicationPermission
                  .confirmedAt
              )
              : "—",

          wide: true
        }
      ]
    );

  const submissionRecord =
    document.createElement("div");

  submissionRecord.className =
    "review-submission-record";

  submissionRecord.append(
    submitterInformation,
    authorizationInformation
  );

  const decision =
    document.createElement("section");

  decision.className =
    "review-decision";

  const decisionCopy =
    document.createElement("div");

  decisionCopy.className =
    "review-decision-copy";

  const decisionHeading =
    document.createElement("h3");

  decisionHeading.textContent =
    reviewTranslate("review_decision");

  const decisionHelp =
    document.createElement("p");

  decisionHelp.textContent =
    reviewTranslate(
      "rejection_reason_help"
    );

  decisionCopy.append(
    decisionHeading,
    decisionHelp
  );

  const rejectionField =
    document.createElement("div");

  rejectionField.className =
    "review-rejection-field";

  const rejectionLabel =
    document.createElement("label");

  rejectionLabel.textContent =
    reviewTranslate(
      "rejection_reason_label"
    );

  const rejectionReason =
    document.createElement("textarea");

  rejectionReason.className =
    "review-rejection-reason";

  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;

  rejectionReason.placeholder =
    reviewTranslate(
      "rejection_reason_placeholder"
    );

  rejectionLabel.htmlFor =
    `rejection-${event._id}`;

  rejectionReason.id =
    `rejection-${event._id}`;

  rejectionField.append(
    rejectionLabel,
    rejectionReason
  );

  const actionMessage =
    document.createElement("p");

  actionMessage.className =
    "review-action-message";

  actionMessage.setAttribute(
    "role",
    "alert"
  );

  actionMessage.hidden = true;

  const actions =
    document.createElement("div");

  actions.className = "review-actions";

  const publishButton =
    document.createElement("button");

  publishButton.type = "button";

  publishButton.className =
    "review-publish-button";

  publishButton.textContent =
    reviewTranslate("publish_event");

  const rejectButton =
    document.createElement("button");

  rejectButton.type = "button";

  rejectButton.className =
    "review-reject-button";

  rejectButton.textContent =
    reviewTranslate("reject_event");

  publishButton.addEventListener(
    "click",
    () => {
      submitReview(
        event._id,
        "publish",
        article
      );
    }
  );

  rejectButton.addEventListener(
    "click",
    () => {
      submitReview(
        event._id,
        "reject",
        article
      );
    }
  );

  actions.append(
    rejectButton,
    publishButton
  );

  decision.append(
    decisionCopy,
    rejectionField,
    actionMessage,
    actions
  );

  article.append(
    cardHeader,
    meta,
    eventInformation,
    languages,
    submissionRecord,
    decision
  );

  return article;
}

function updateQueueCount() {
  const count = pendingEvents.length;

  const labelKey =
    count === 1
      ? "review_pending_event_singular"
      : "review_pending_events_plural";

  reviewQueueCount.textContent =
    `${count} ${reviewTranslate(labelKey)}`;

  reviewQueueCount.hidden = false;
}

function showPageMessage(
  message,
  type = "neutral"
) {
  reviewPageMessage.textContent =
    message;

  reviewPageMessage.className =
    `review-page-message is-${type}`;

  reviewPageMessage.hidden = false;
}

function showNotice(
  message,
  type = "success"
) {
  clearTimeout(noticeTimer);

  reviewNotice.textContent = message;

  reviewNotice.className =
    `review-notice is-${type}`;

  reviewNotice.hidden = false;

  noticeTimer = window.setTimeout(
    () => {
      reviewNotice.hidden = true;
    },
    3500
  );
}

function renderReviewQueue() {
  reviewQueue.replaceChildren();

  updateQueueCount();

  if (!pendingEvents.length) {
    reviewQueue.hidden = true;

    showPageMessage(
      reviewTranslate(
        "no_pending_events"
      ),
      "empty"
    );

    return;
  }

  reviewPageMessage.hidden = true;
  reviewQueue.hidden = false;

  pendingEvents.forEach(event => {
    reviewQueue.appendChild(
      createReviewCard(event)
    );
  });
}

async function submitReview(
  eventId,
  action,
  card
) {
  const token =
    localStorage.getItem("token");

  if (!token) {
    redirectToLogin();
    return;
  }

  const reasonInput =
    card.querySelector(
      ".review-rejection-reason"
    );

  const messageElement =
    card.querySelector(
      ".review-action-message"
    );

  const buttons =
    card.querySelectorAll("button");

  const rejectionReason =
    reasonInput.value.trim();

  messageElement.textContent = "";
  messageElement.hidden = true;

  if (
    action === "reject" &&
    !rejectionReason
  ) {
    messageElement.textContent =
      reviewTranslate(
        "rejection_reason_required"
      );

    messageElement.hidden = false;

    reasonInput.focus();

    return;
  }

  buttons.forEach(button => {
    button.disabled = true;
  });

  const activeButton =
    action === "publish"
      ? card.querySelector(
        ".review-publish-button"
      )
      : card.querySelector(
        ".review-reject-button"
      );

  activeButton.textContent =
    reviewTranslate(
      action === "publish"
        ? "review_publishing"
        : "review_rejecting"
    );

  try {
    const response = await fetch(
      `/api/events/${eventId}/review`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`
        },

        body: JSON.stringify({
          action,

          rejectionReason:
            action === "reject"
              ? rejectionReason
              : undefined
        })
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (response.status === 403) {
      throw new Error(
        reviewTranslate(
          "review_access_denied"
        )
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        reviewTranslate(
          "review_failed"
        )
      );
    }

    pendingEvents =
      pendingEvents.filter(
        event => event._id !== eventId
      );

    card.classList.add("is-resolved");

    window.setTimeout(() => {
      card.remove();
      renderReviewQueue();
    }, 160);

    showNotice(
      reviewTranslate(
        action === "publish"
          ? "review_publish_success"
          : "review_reject_success"
      )
    );
  } catch (error) {
    messageElement.textContent =
      error.message;

    messageElement.hidden = false;

    buttons.forEach(button => {
      button.disabled = false;
    });

    card.querySelector(
      ".review-publish-button"
    ).textContent =
      reviewTranslate("publish_event");

    card.querySelector(
      ".review-reject-button"
    ).textContent =
      reviewTranslate("reject_event");
  }
}

async function loadReviewQueue() {
  const token =
    localStorage.getItem("token");

  if (!token) {
    redirectToLogin();
    return;
  }

  accessDenied = false;
  loadFailed = false;
  reviewQueueCount.hidden = true;

  showPageMessage(
    reviewTranslate("loading_events"),
    "neutral"
  );

  try {
    const userResponse =
      await fetch("/api/me", {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      });

    if (userResponse.status === 401) {
      redirectToLogin();
      return;
    }

    const user =
      await userResponse
        .json()
        .catch(() => ({}));

    if (
      !userResponse.ok ||
      !user.permissions
        ?.canReviewAndPublish
    ) {
      accessDenied = true;

      showPageMessage(
        reviewTranslate(
          "review_access_denied"
        ),
        "error"
      );

      return;
    }

    const response = await fetch(
      "/api/events/review",
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        }
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (response.status === 403) {
      accessDenied = true;

      throw new Error(
        reviewTranslate(
          "review_access_denied"
        )
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        reviewTranslate(
          "review_load_error"
        )
      );
    }

    pendingEvents =
      Array.isArray(data.events)
        ? data.events
        : [];

    renderReviewQueue();
  } catch (error) {
    loadFailed = !accessDenied;

    showPageMessage(
      error.message ||
      reviewTranslate(
        "review_load_error"
      ),
      "error"
    );
  }
}

document.addEventListener(
  "languagechange",
  () => {
    if (accessDenied) {
      showPageMessage(
        reviewTranslate(
          "review_access_denied"
        ),
        "error"
      );

      return;
    }

    if (loadFailed) {
      showPageMessage(
        reviewTranslate(
          "review_load_error"
        ),
        "error"
      );

      return;
    }

    renderReviewQueue();
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

loadReviewQueue();