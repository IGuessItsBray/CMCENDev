const reviewQueue = document.getElementById("reviewQueue");
const reviewPageMessage = document.getElementById("reviewPageMessage");
const retirementReviewQueue = document.getElementById("retirementReviewQueue");
const retirementReviewPageMessage = document.getElementById(
  "retirementReviewPageMessage",
);
const lastPostReviewQueue = document.getElementById("lastPostReviewQueue");
const lastPostReviewPageMessage = document.getElementById(
  "lastPostReviewPageMessage",
);
const commentReviewQueue = document.getElementById("commentReviewQueue");
const commentReviewPageMessage = document.getElementById(
  "commentReviewPageMessage",
);
const reviewTabs = document.querySelectorAll("[data-review-tab]");
const reviewPanels = document.querySelectorAll("[data-review-panel]");
const reviewTabNames = ["events", "retirements", "last-posts", "comments"];
const requestedReviewTab = new URLSearchParams(window.location.search).get(
  "tab",
);

let pendingEvents = [];
let pendingRetirementMessages = [];
let pendingLastPosts = [];
let pendingComments = [];
let accessDenied = false;
let loadFailed = false;
let retirementLoadFailed = false;
let lastPostLoadFailed = false;
let commentLoadFailed = false;

function getReviewLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function getReviewLocale() {
  return CMCENUtils.getCurrentLocale();
}

function redirectToLogin() {
  CMCENUtils.redirectToLogin();
}

function getReviewToken() {
  return CMCENUtils.requireAuthToken();
}

async function reviewApiJson(path, options = {}) {
  const token = getReviewToken();

  if (!token) {
    redirectToLogin();
    throw new Error(translate("sign_in_to_continue"));
  }

  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("sign_in_to_continue"),
    });
  } catch (error) {
    if (error.status === 403) {
      error.message = translate("review_access_denied");
    }

    throw error;
  }
}

function getContentValue(value, language) {
  if (typeof value?.[language] !== "string") {
    return "";
  }

  return value[language].trim();
}

function getRetirementReviewMessage(retirementMessage, language) {
  return (
    getContentValue(retirementMessage.messages, language) ||
    (retirementMessage.messageLanguage === language
      ? String(retirementMessage.message || "").trim()
      : "")
  );
}

function getDisplayTitle(event) {
  return (
    CMCENUtils.getLocalizedText(event.title, getReviewLanguage()) ||
    translate("translation_missing")
  );
}

function formatSubmittedDate(dateValue) {
  return CMCENUtils.formatDate(dateValue, {
    locale: getReviewLocale(),
    timeStyle: "short",
  });
}

function formatContentArea(value) {
  return CMCENUtils.formatTitleCaseValue(value, "—");
}

const timezoneTranslationKeys = {
  "America/St_Johns": "timezone_newfoundland",

  "America/Halifax": "timezone_atlantic",

  "America/Toronto": "timezone_eastern",

  "America/Winnipeg": "timezone_central",

  "America/Edmonton": "timezone_mountain",

  "America/Vancouver": "timezone_pacific",

  "America/Regina": "timezone_central",

  "America/Whitehorse": "timezone_mountain",
};

function formatTranslatedOption(prefix, value) {
  if (!value) {
    return "—";
  }

  const normalizedValue = String(value).toLowerCase().replace(/-/g, "_");

  const key = `${prefix}_${normalizedValue}`;

  const translated = translate(key);

  if (translated === key) {
    return formatContentArea(value);
  }

  return translated;
}

function formatEventTimezone(value) {
  if (!value) {
    return "—";
  }

  const translationKey = timezoneTranslationKeys[value];

  if (!translationKey) {
    return value;
  }

  return `${translate(translationKey)} ` + `(${value})`;
}

function getEventDateTimeFormatOptions(event) {
  if (event.allDay) {
    return { timeZone: "UTC" };
  }

  return event.timezone ? { timeZone: event.timezone } : {};
}

function formatEventReviewDate(event, value) {
  if (!value) {
    return "—";
  }

  return CMCENUtils.formatDate(value, {
    locale: getReviewLocale(),
    dateStyle: "medium",
    ...getEventDateTimeFormatOptions(event),
  });
}

function formatEventReviewTime(event, value) {
  if (!value) {
    return "—";
  }

  if (event.allDay) {
    return translate("all_day");
  }

  return CMCENUtils.formatDate(value, {
    locale: getReviewLocale(),
    hour: "numeric",
    minute: "2-digit",
    ...getEventDateTimeFormatOptions(event),
  });
}

function formatReviewUser(user) {
  return CMCENUtils.getUserDisplayName(user, "—");
}

function formatRetireeName(retirementMessage) {
  const { name, postNominals } = CMCENUtils.getRetireeNameParts(
    retirementMessage?.retiree,
  );

  return (
    [name, postNominals].filter(Boolean).join(", ") ||
    translate("retirement_review_untitled")
  );
}

function formatLastPostName(lastPost) {
  const deceased = lastPost?.deceased || {};
  const name = [deceased.fullRank, deceased.firstName, deceased.surname]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return (
    [name, deceased.postNominal].filter(Boolean).join(", ") ||
    translate("last_post_default_name")
  );
}

function formatCommentAuthor(comment) {
  const author = comment.author || {};

  return (
    [author.firstName, author.lastName].filter(Boolean).join(" ") ||
    author.accountName ||
    author.username ||
    author.email ||
    translate("unknown_user")
  );
}

function formatDateOnly(dateValue) {
  return CMCENUtils.formatDate(dateValue, {
    locale: getReviewLocale(),
    dateStyle: "long",
    timeZone: "UTC",
    fallback: "—",
  });
}

function setTranslatedText(element, key) {
  element.dataset.i18n = key;
  element.textContent = translate(key);
}

function setTranslatedPlaceholder(element, key) {
  element.dataset.i18nPlaceholder = key;
  element.placeholder = translate(key);
}

function createSubmissionDetails(content, summaryKey) {
  const submissionDetails = document.createElement("details");
  submissionDetails.className = "review-submission-details";

  const submissionSummary = document.createElement("summary");
  setTranslatedText(submissionSummary, summaryKey);

  submissionDetails.append(submissionSummary, content);
  return submissionDetails;
}

function configureTwoStepDecision({
  decision,
  decisionCopy,
  rejectionField,
  actionMessage,
  actions,
  publishButton,
  rejectButton,
  publishLabelKey,
  rejectLabelKey,
  publishConfirmationKey,
  rejectConfirmationKey,
  confirmPublishLabelKey = "confirm_publish_submission",
  confirmRejectLabelKey = "confirm_reject_submission",
  submit,
}) {
  const decisionPrompt = document.createElement("p");
  decisionPrompt.className = "review-decision-prompt";
  decisionPrompt.setAttribute("role", "status");
  decisionPrompt.hidden = true;

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "review-cancel-action";
  setTranslatedText(cancelButton, "cancel_review_decision");
  cancelButton.hidden = true;

  let pendingAction = null;

  function resetDecision() {
    pendingAction = null;
    decisionPrompt.hidden = true;
    rejectionField.hidden = true;
    rejectButton.hidden = false;
    publishButton.hidden = false;
    cancelButton.hidden = true;
    setTranslatedText(rejectButton, rejectLabelKey);
    setTranslatedText(publishButton, publishLabelKey);
  }

  function prepareDecision(action) {
    if (pendingAction === action) {
      submit(action);
      return;
    }

    pendingAction = action;
    setTranslatedText(
      decisionPrompt,
      action === "publish" ? publishConfirmationKey : rejectConfirmationKey,
    );
    decisionPrompt.hidden = false;
    rejectionField.hidden = action !== "reject";
    rejectButton.hidden = action !== "reject";
    publishButton.hidden = action !== "publish";
    cancelButton.hidden = false;

    if (action === "publish") {
      setTranslatedText(publishButton, confirmPublishLabelKey);
      publishButton.focus();
      return;
    }

    setTranslatedText(rejectButton, confirmRejectLabelKey);
    rejectionField.querySelector("textarea")?.focus();
  }

  resetDecision();

  publishButton.addEventListener("click", () => {
    prepareDecision("publish");
  });

  rejectButton.addEventListener("click", () => {
    prepareDecision("reject");
  });

  cancelButton.addEventListener("click", resetDecision);

  actions.append(rejectButton, publishButton, cancelButton);
  decision.append(
    decisionCopy,
    decisionPrompt,
    rejectionField,
    actionMessage,
    actions,
  );
}

function createReviewRecordSection(titleKey, items, additionalClass = "") {
  const section = document.createElement("section");
  section.className = `review-record-section ${additionalClass}`.trim();

  const heading = document.createElement("h3");
  setTranslatedText(heading, titleKey);

  const grid = document.createElement("div");
  grid.className = "review-record-data";

  items.forEach((item) => {
    const record = document.createElement("div");

    record.className = "review-record-item";

    if (item.wide) {
      record.classList.add("is-wide");
    }

    const label = document.createElement("span");

    label.className = "review-record-label";
    setTranslatedText(label, item.labelKey);

    const value = document.createElement("span");

    value.className = "review-record-value";

    if (item.valueClass) {
      value.classList.add(item.valueClass);
    }

    value.textContent = item.value || "—";

    record.append(label, value);
    grid.appendChild(record);
  });

  section.append(heading, grid);

  return section;
}

function createContentValue(className, value) {
  const element = document.createElement("p");

  element.className = className;

  if (value) {
    element.textContent = value;
  } else {
    setTranslatedText(element, "translation_missing");

    element.classList.add("is-missing");
  }

  return element;
}

function updateContentValue(element, value) {
  const content = String(value || "").trim();

  if (content) {
    element.textContent = content;
    element.classList.remove("is-missing");
    element.removeAttribute("data-i18n");
    return;
  }

  setTranslatedText(element, "translation_missing");
  element.classList.add("is-missing");
}

function createReviewEditIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M4 16.5V20h3.5L18.3 9.2l-3.5-3.5L4 16.5Zm16-9.2a1 1 0 0 0 0-1.4l-1.9-1.9a1 1 0 0 0-1.4 0l-1.5 1.5 3.5 3.5L20 7.3Z",
  );
  icon.appendChild(path);

  return icon;
}

function createLanguageEditorField({
  eventId,
  language,
  field,
  labelKey,
  maxLength,
  multiline = false,
  rows,
  value,
}) {
  const fieldGroup = document.createElement("div");
  fieldGroup.className = "review-language-editor-field";

  const label = document.createElement("label");
  label.className = "review-content-label";
  label.htmlFor = `review-event-${eventId}-${language}-${field}`;
  setTranslatedText(label, labelKey);

  const input = document.createElement(multiline ? "textarea" : "input");
  input.id = label.htmlFor;
  input.name = field;
  input.maxLength = maxLength;
  input.value = value;

  if (multiline) {
    input.rows = rows;
  } else {
    input.type = "text";
  }

  fieldGroup.append(label, input);

  return { fieldGroup, input };
}

function createContentSection(event, language, heading) {
  const section = document.createElement("section");
  section.className = "review-language-panel";
  section.lang = language;
  const editorId = `review-event-${event._id}-${language}-editor`;

  const header = document.createElement("header");
  header.className = "review-language-heading";

  const code = document.createElement("span");
  code.className = "review-language-code";
  code.textContent = language.toUpperCase();

  const sectionHeading = document.createElement("h3");
  sectionHeading.textContent = heading;

  const controls = document.createElement("div");
  controls.className = "review-language-controls";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "review-language-edit-button";
  editButton.setAttribute("data-i18n-aria-label", "review_edit_event_content");
  editButton.appendChild(createReviewEditIcon());

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "event-submit-button review-language-save-button";
  saveButton.setAttribute("form", editorId);
  saveButton.hidden = true;

  const saveButtonLabel = document.createElement("span");
  setTranslatedText(saveButtonLabel, "save_event_changes");
  saveButton.appendChild(saveButtonLabel);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "review-language-cancel-button";
  cancelButton.setAttribute("data-i18n-aria-label", "cancel_event_editing");
  cancelButton.textContent = "×";
  cancelButton.hidden = true;

  controls.append(editButton, saveButton, cancelButton);
  header.append(code, sectionHeading, controls);

  const body = document.createElement("div");
  body.className = "review-language-body";

  const content = document.createElement("div");
  content.className = "review-language-content";

  const titleLabel = document.createElement("span");
  titleLabel.className = "review-content-label";
  setTranslatedText(titleLabel, "review_title_label");

  const title = createContentValue(
    "review-event-title-value",
    getContentValue(event.title, language),
  );

  const locationLabel = document.createElement("span");
  locationLabel.className = "review-content-label";
  setTranslatedText(locationLabel, "event_location_label");

  const location = createContentValue(
    "review-event-location",
    getContentValue(event.location, language),
  );

  const descriptionLabel = document.createElement("span");
  descriptionLabel.className = "review-content-label";
  setTranslatedText(descriptionLabel, "review_description_label");

  const description = createContentValue(
    "review-event-description",
    getContentValue(event.description, language),
  );

  const registrationLabel = document.createElement("span");
  registrationLabel.className = "review-content-label";
  setTranslatedText(registrationLabel, "event_registration_label");

  const registration = document.createElement("p");
  registration.className = "review-event-registration";
  registration.textContent =
    getContentValue(event.registration, language) || "—";

  content.append(
    titleLabel,
    title,
    locationLabel,
    location,
    descriptionLabel,
    description,
    registrationLabel,
    registration,
  );

  const editor = document.createElement("form");
  editor.id = editorId;
  editor.className = "review-language-editor";
  editor.hidden = true;

  const titleField = createLanguageEditorField({
    eventId: event._id,
    language,
    field: "title",
    labelKey: "review_title_label",
    maxLength: 500,
    value: getContentValue(event.title, language),
  });
  const locationField = createLanguageEditorField({
    eventId: event._id,
    language,
    field: "location",
    labelKey: "event_location_label",
    maxLength: 500,
    value: getContentValue(event.location, language),
  });
  const descriptionField = createLanguageEditorField({
    eventId: event._id,
    language,
    field: "description",
    labelKey: "review_description_label",
    maxLength: 10000,
    multiline: true,
    rows: 6,
    value: getContentValue(event.description, language),
  });
  const registrationField = createLanguageEditorField({
    eventId: event._id,
    language,
    field: "registration",
    labelKey: "event_registration_label",
    maxLength: 10000,
    multiline: true,
    rows: 5,
    value: getContentValue(event.registration, language),
  });

  editor.append(
    titleField.fieldGroup,
    locationField.fieldGroup,
    descriptionField.fieldGroup,
    registrationField.fieldGroup,
  );

  const fields = {
    title: titleField.input,
    location: locationField.input,
    description: descriptionField.input,
    registration: registrationField.input,
  };
  const contentValues = { title, location, description, registration };

  function setEditing(editing) {
    content.hidden = editing;
    editor.hidden = !editing;
    editButton.hidden = editing;
    saveButton.hidden = !editing;
    cancelButton.hidden = !editing;
  }

  function setSaving(saving) {
    saveButton.disabled = saving;
    cancelButton.disabled = saving;
    saveButton.setAttribute("aria-busy", String(saving));
    saveButton.setAttribute(
      "data-i18n-aria-label",
      saving ? "review_saving_event_content" : "save_event_changes",
    );
    setTranslatedText(
      saveButtonLabel,
      saving ? "review_saving_event_content" : "save_event_changes",
    );
  }

  function updateDisplayedContent(updatedContent) {
    updateContentValue(contentValues.title, updatedContent.title);
    updateContentValue(contentValues.location, updatedContent.location);
    updateContentValue(contentValues.description, updatedContent.description);
    contentValues.registration.textContent = updatedContent.registration || "—";
  }

  function restoreFields() {
    fields.title.value = getContentValue(event.title, language);
    fields.location.value = getContentValue(event.location, language);
    fields.description.value = getContentValue(event.description, language);
    fields.registration.value = getContentValue(event.registration, language);
  }

  editButton.addEventListener("click", () => {
    restoreFields();
    setEditing(true);
    fields.title.focus();
  });

  cancelButton.addEventListener("click", () => {
    restoreFields();
    setEditing(false);
    editButton.focus();
  });

  editor.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();

    if (saveButton.disabled) {
      return;
    }

    const updatedContent = {
      title: fields.title.value,
      location: fields.location.value,
      description: fields.description.value,
      registration: fields.registration.value,
    };

    setSaving(true);

    try {
      const result = await reviewApiJson(
        `/api/events/${event._id}/review-content`,
        {
          method: "PATCH",
          body: { language, content: updatedContent },
          errorMessage: translate("review_event_content_update_failed"),
        },
      );
      const savedEvent = result.event || {};

      ["title", "location", "description", "registration"].forEach((field) => {
        event[field] = {
          ...(event[field] || {}),
          [language]: getContentValue(savedEvent[field], language),
        };
      });

      updateDisplayedContent({
        title: event.title[language],
        location: event.location[language],
        description: event.description[language],
        registration: event.registration[language],
      });
      setEditing(false);
      updateEventReviewCardsLanguage();
      showNotice(translate("review_event_content_updated"));
    } catch (error) {
      showNotice(
        error.message || translate("review_event_content_update_failed"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  });

  body.append(content, editor);
  section.append(header, body);

  return section;
}

function createReviewCard(event) {
  const article = document.createElement("article");
  article.className = "review-event-card review-event-card--event";
  article.dataset.eventId = event._id;

  const cardHeader = document.createElement("header");
  cardHeader.className = "review-event-card-header";

  const headingCopy = document.createElement("div");
  headingCopy.className = "review-event-card-heading";

  const eyebrow = document.createElement("p");
  setTranslatedText(eyebrow, "review_pending_submission");

  const title = document.createElement("h2");

  title.textContent = getDisplayTitle(event);

  headingCopy.append(eyebrow, title);

  const status = document.createElement("span");
  status.className = "review-status-badge";
  setTranslatedText(status, "review_status_pending");

  cardHeader.append(headingCopy, status);

  const eventInformation = createReviewRecordSection(
    "review_event_information",
    [
      {
        labelKey: "event_city",
        value: event.city,
      },

      {
        labelKey: "event_province_region",

        value: formatTranslatedOption("region", event.provinceRegion),
      },

      {
        labelKey: "event_organizing_entity",

        value: formatTranslatedOption("entity", event.organizingEntity),
      },

      {
        labelKey: "event_type",

        value: formatTranslatedOption("event_type", event.eventType),
      },

      {
        labelKey: "event_start_date",

        value: formatEventReviewDate(event, event.startDate),
      },

      {
        labelKey: "event_start_time",

        value: formatEventReviewTime(event, event.startDate),
      },

      {
        labelKey: "event_end_date",

        value: formatEventReviewDate(event, event.endDate),
      },

      {
        labelKey: "event_end_time",

        value: formatEventReviewTime(event, event.endDate),
      },

      {
        labelKey: "event_timezone",

        value: formatEventTimezone(event.timezone),
      },
    ],
    "review-event-information",
  );

  const languages = document.createElement("div");
  languages.className = "review-language-grid";
  languages.append(
    createContentSection(event, "en", "English"),
    createContentSection(event, "fr", "Français"),
  );

  const submitterInformation = createReviewRecordSection(
    "review_submitter_record",
    [
      {
        labelKey: "event_submitter_rank",

        value: event.submitter?.rank,
      },

      {
        labelKey: "event_submitter_first_name",

        value: event.submitter?.firstName,
      },

      {
        labelKey: "event_submitter_last_name",

        value: event.submitter?.lastName,
      },

      {
        labelKey: "event_submitter_unit_role",

        value: event.submitter?.unitRole,

        wide: true,
      },

      {
        labelKey: "event_submitter_email",

        value: event.submitter?.email,

        wide: true,
      },

      {
        labelKey: "event_submitter_phone",

        value: event.submitter?.phone || "—",

        wide: true,
      },
    ],
  );

  const permissionConfirmed = event.publicationPermission?.confirmed === true;

  const authorizationInformation = createReviewRecordSection(
    "review_authorization_record",
    [
      {
        labelKey: "review_permission_status",

        value: translate(
          permissionConfirmed
            ? "review_permission_confirmed"
            : "review_permission_not_recorded",
        ),

        valueClass: permissionConfirmed ? "is-confirmed" : "is-unconfirmed",
      },

      {
        labelKey: "review_confirmed_by",

        value: formatReviewUser(event.publicationPermission?.confirmedBy),

        wide: true,
      },

      {
        labelKey: "review_confirmed_on",

        value: event.publicationPermission?.confirmedAt
          ? formatSubmittedDate(event.publicationPermission.confirmedAt)
          : "—",

        wide: true,
      },
    ],
  );

  const submissionRecord = document.createElement("div");
  submissionRecord.className = "review-submission-record";
  submissionRecord.append(submitterInformation, authorizationInformation);

  const submissionDetails = createSubmissionDetails(
    submissionRecord,
    "review_submission_details",
  );

  const decision = document.createElement("section");
  decision.className = "review-decision";

  const decisionCopy = document.createElement("div");
  decisionCopy.className = "review-decision-copy";

  const decisionHeading = document.createElement("h3");
  setTranslatedText(decisionHeading, "review_decision");

  const decisionHelp = document.createElement("p");
  setTranslatedText(decisionHelp, "rejection_reason_help");

  decisionCopy.append(decisionHeading, decisionHelp);

  const rejectionField = document.createElement("div");

  rejectionField.className = "review-rejection-field";

  const rejectionLabel = document.createElement("label");

  setTranslatedText(rejectionLabel, "rejection_reason_label");

  const rejectionReason = document.createElement("textarea");

  rejectionReason.className = "review-rejection-reason";

  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;

  setTranslatedPlaceholder(rejectionReason, "rejection_reason_placeholder");

  rejectionLabel.htmlFor = `rejection-${event._id}`;

  rejectionReason.id = `rejection-${event._id}`;

  rejectionField.append(rejectionLabel, rejectionReason);

  const actionMessage = document.createElement("p");

  actionMessage.className = "review-action-message";

  actionMessage.setAttribute("role", "alert");

  actionMessage.hidden = true;

  const actions = document.createElement("div");

  actions.className = "review-actions review-event-actions";

  const publishButton = document.createElement("button");

  publishButton.type = "button";

  publishButton.className = "review-publish-button";

  setTranslatedText(publishButton, "publish_event");

  const rejectButton = document.createElement("button");

  rejectButton.type = "button";

  rejectButton.className = "review-reject-button";

  setTranslatedText(rejectButton, "reject_event");

  configureTwoStepDecision({
    decision,
    decisionCopy,
    rejectionField,
    actionMessage,
    actions,
    publishButton,
    rejectButton,
    publishLabelKey: "publish_event",
    rejectLabelKey: "reject_event",
    publishConfirmationKey: "event_review_publish_confirmation",
    rejectConfirmationKey: "event_review_reject_confirmation",
    confirmPublishLabelKey: "confirm_publish_event",
    confirmRejectLabelKey: "confirm_reject_event",
    submit(action) {
      submitReview(event._id, action, article);
    },
  });

  article.append(
    cardHeader,
    eventInformation,
    languages,
    submissionDetails,
    decision,
  );

  return article;
}

function createRetirementMessageFields(retirementMessage) {
  const grid = document.createElement("div");
  grid.className =
    "review-language-grid retirement-review-language-grid retirement-review-message-fields";

  ["en", "fr"].forEach((languageCode) => {
    const panel = document.createElement("section");
    panel.className = "review-language-panel";
    panel.lang = languageCode;
    const editorId = `retirement-message-${retirementMessage._id}-${languageCode}-editor`;

    const panelHeading = document.createElement("header");
    panelHeading.className = "review-language-heading";

    const code = document.createElement("span");
    code.className = "review-language-code";
    code.textContent = languageCode.toUpperCase();

    const title = document.createElement("h3");
    title.textContent = translate(
      languageCode === "en"
        ? "retirement_review_english_message"
        : "retirement_review_french_message",
    );

    const controls = document.createElement("div");
    controls.className = "review-language-controls";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className =
      "review-language-edit-button review-retirement-message-edit-button";
    editButton.dataset.retirementMessageLanguage = languageCode;
    editButton.setAttribute(
      "data-i18n-aria-label",
      "review_edit_retirement_message",
    );
    editButton.appendChild(createReviewEditIcon());

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "event-submit-button review-language-save-button";
    saveButton.setAttribute("form", editorId);
    saveButton.hidden = true;

    const saveButtonLabel = document.createElement("span");
    setTranslatedText(saveButtonLabel, "save_event_changes");
    saveButton.appendChild(saveButtonLabel);

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "review-language-cancel-button";
    cancelButton.setAttribute("data-i18n-aria-label", "cancel_event_editing");
    cancelButton.textContent = "×";
    cancelButton.hidden = true;

    controls.append(editButton, saveButton, cancelButton);
    panelHeading.append(code, title, controls);

    const body = document.createElement("div");
    body.className = "review-language-body";

    const messageValue = document.createElement("p");
    messageValue.className = "retirement-review-message-value";

    const label = document.createElement("label");
    label.className = "review-content-label";
    label.htmlFor = `retirementMessage${retirementMessage._id}${languageCode}`;
    setTranslatedText(label, "retirement_message_text");

    const editor = document.createElement("form");
    editor.id = editorId;
    editor.className = "retirement-review-message-editor";
    editor.hidden = true;

    const textarea = document.createElement("textarea");
    textarea.id = `retirementMessage${retirementMessage._id}${languageCode}`;
    textarea.className = "retirement-review-message-input";
    textarea.dataset.retirementMessageLanguage = languageCode;
    textarea.rows = 9;
    textarea.minLength = 100;
    textarea.maxLength = 10000;
    textarea.required = true;
    textarea.value = getRetirementReviewMessage(
      retirementMessage,
      languageCode,
    );

    const hint = document.createElement("small");
    hint.className = "retirement-review-message-hint";
    setTranslatedText(
      hint,
      textarea.value.trim().length >= 100
        ? "retirement_review_translation_ready"
        : "retirement_review_translation_missing",
    );

    textarea.addEventListener("input", () => {
      setTranslatedText(
        hint,
        textarea.value.trim().length >= 100
          ? "retirement_review_translation_ready"
          : "retirement_review_translation_missing",
      );
    });

    function updateMessageValue(value) {
      const message = String(value || "").trim();

      if (message) {
        messageValue.textContent = message;
        messageValue.classList.remove("is-missing");
        messageValue.removeAttribute("data-i18n");
        return;
      }

      setTranslatedText(messageValue, "retirement_review_translation_missing");
      messageValue.classList.add("is-missing");
    }

    function setEditing(editing) {
      messageValue.hidden = editing;
      editor.hidden = !editing;
      editButton.hidden = editing;
      saveButton.hidden = !editing;
      cancelButton.hidden = !editing;
    }

    function setSaving(saving) {
      saveButton.disabled = saving;
      cancelButton.disabled = saving;
      saveButton.setAttribute("aria-busy", String(saving));
      saveButton.setAttribute(
        "data-i18n-aria-label",
        saving ? "review_saving_retirement_message" : "save_event_changes",
      );
      setTranslatedText(
        saveButtonLabel,
        saving ? "review_saving_retirement_message" : "save_event_changes",
      );
    }

    function restoreMessage() {
      textarea.value = getRetirementReviewMessage(
        retirementMessage,
        languageCode,
      );
      setTranslatedText(
        hint,
        textarea.value.trim().length >= 100
          ? "retirement_review_translation_ready"
          : "retirement_review_translation_missing",
      );
    }

    updateMessageValue(textarea.value);

    editButton.addEventListener("click", () => {
      restoreMessage();
      setEditing(true);
      textarea.focus();
    });

    cancelButton.addEventListener("click", () => {
      restoreMessage();
      setEditing(false);
      editButton.focus();
    });

    editor.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();

      if (saveButton.disabled) {
        return;
      }

      setSaving(true);

      try {
        const result = await reviewApiJson(
          `/api/retirement-messages/${retirementMessage._id}/review-content`,
          {
            method: "PATCH",
            body: {
              language: languageCode,
              message: textarea.value,
            },
            errorMessage: translate("retirement_review_content_update_failed"),
          },
        );
        const savedRetirementMessage = result.retirementMessage || {};

        retirementMessage.messages = {
          ...(retirementMessage.messages || {}),
          [languageCode]: getRetirementReviewMessage(
            savedRetirementMessage,
            languageCode,
          ),
        };

        if (typeof savedRetirementMessage.message === "string") {
          retirementMessage.message = savedRetirementMessage.message;
        }

        updateMessageValue(
          getRetirementReviewMessage(retirementMessage, languageCode),
        );
        setEditing(false);
        showNotice(translate("retirement_review_content_updated"));
      } catch (error) {
        showNotice(
          error.message || translate("retirement_review_content_update_failed"),
          "error",
        );
      } finally {
        setSaving(false);
      }
    });

    editor.append(label, textarea, hint);
    body.append(messageValue, editor);
    panel.append(panelHeading, body);
    grid.appendChild(panel);
  });

  return grid;
}

function createRetirementPhotoSection(retirementMessage) {
  if (!retirementMessage.photoUrl) {
    return null;
  }

  const section = document.createElement("section");
  section.className = "review-record-section retirement-review-photo-section";

  const heading = document.createElement("h3");
  heading.textContent = translate("retirement_review_photo_record");

  const link = document.createElement("a");
  link.className = "retirement-review-photo-link";
  link.href = retirementMessage.photoUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const image = document.createElement("img");
  image.src = retirementMessage.photoUrl;
  image.alt = translate("retirement_review_photo_alt", {
    name: formatRetireeName(retirementMessage),
  });
  image.loading = "lazy";

  const label = document.createElement("span");
  label.textContent = translate("retirement_review_open_photo");

  link.append(image, label);
  section.append(heading, link);

  return section;
}

function createRetirementReviewCard(retirementMessage) {
  const article = document.createElement("article");
  article.className = "review-event-card";
  article.dataset.retirementMessageId = retirementMessage._id;

  const cardHeader = document.createElement("header");
  cardHeader.className = "review-event-card-header";

  const headingCopy = document.createElement("div");
  headingCopy.className = "review-event-card-heading";

  const eyebrow = document.createElement("p");
  eyebrow.textContent = translate("retirement_review_pending_submission");

  const title = document.createElement("h2");
  title.textContent = formatRetireeName(retirementMessage);

  headingCopy.append(eyebrow, title);

  const status = document.createElement("span");
  status.className = "review-status-badge";
  status.textContent = translate("review_status_pending");

  cardHeader.append(headingCopy, status);

  const retireeInformation = createReviewRecordSection(
    "retirement_review_retiree_record",
    [
      {
        labelKey: "retirement_rank",
        value: retirementMessage.retiree?.rank,
      },

      {
        labelKey: "retirement_first_name",
        value: retirementMessage.retiree?.firstName,
      },

      {
        labelKey: "retirement_last_name",
        value: retirementMessage.retiree?.lastName,
      },

      {
        labelKey: "retirement_post_nominals",
        value: retirementMessage.retiree?.postNominals,
      },

      {
        labelKey: "retirement_date",
        value: formatDateOnly(retirementMessage.retiree?.retirementDate),
      },

      {
        labelKey: "retirement_trade_role",
        value: retirementMessage.retiree?.tradeRole,
        wide: true,
      },
    ],
    "review-event-information",
  );

  const messageFields = createRetirementMessageFields(retirementMessage);

  const submitterInformation = createReviewRecordSection(
    "review_submitter_record",
    [
      {
        labelKey: "retirement_submitter_first_name",
        value: retirementMessage.submitter?.firstName,
      },

      {
        labelKey: "retirement_submitter_last_name",
        value: retirementMessage.submitter?.lastName,
      },

      {
        labelKey: "retirement_submitter_relationship",
        value: formatTranslatedOption(
          "relationship",
          retirementMessage.submitter?.relationship,
        ),
      },

      {
        labelKey: "retirement_submitter_email",
        value: retirementMessage.submitter?.email,
        wide: true,
      },

      {
        labelKey: "retirement_submitter_unit",
        value: retirementMessage.submitter?.unit,
        wide: true,
      },
    ],
  );

  const consentConfirmed =
    retirementMessage.publicationConsent?.confirmed === true;

  const memberReviewConfirmed =
    retirementMessage.memberReviewConfirmation?.confirmed === true;

  const authorizationInformation = createReviewRecordSection(
    "review_authorization_record",
    [
      {
        labelKey: "retirement_member_review_status",
        value: translate(
          memberReviewConfirmed
            ? "review_permission_confirmed"
            : "review_permission_not_recorded",
        ),
        valueClass: memberReviewConfirmed ? "is-confirmed" : "is-unconfirmed",
      },

      {
        labelKey: "review_confirmed_on",
        value: retirementMessage.memberReviewConfirmation?.confirmedAt
          ? formatSubmittedDate(
              retirementMessage.memberReviewConfirmation.confirmedAt,
            )
          : "—",
      },

      {
        labelKey: "retirement_publication_ack_status",
        value: translate(
          consentConfirmed
            ? "review_permission_confirmed"
            : "review_permission_not_recorded",
        ),
        valueClass: consentConfirmed ? "is-confirmed" : "is-unconfirmed",
      },

      {
        labelKey: "review_confirmed_on",
        value: retirementMessage.publicationConsent?.confirmedAt
          ? formatSubmittedDate(
              retirementMessage.publicationConsent.confirmedAt,
            )
          : "—",
        wide: true,
      },
    ],
  );

  const submissionRecord = document.createElement("div");
  submissionRecord.className = "review-submission-record";
  submissionRecord.append(submitterInformation, authorizationInformation);

  const submissionDetails = createSubmissionDetails(
    submissionRecord,
    "review_submission_details",
  );

  const photoSection = createRetirementPhotoSection(retirementMessage);

  const decision = document.createElement("section");
  decision.className = "review-decision";

  const decisionCopy = document.createElement("div");
  decisionCopy.className = "review-decision-copy";

  const decisionHeading = document.createElement("h3");
  setTranslatedText(decisionHeading, "review_decision");

  const decisionHelp = document.createElement("p");
  setTranslatedText(decisionHelp, "retirement_rejection_reason_help");

  decisionCopy.append(decisionHeading, decisionHelp);

  const rejectionField = document.createElement("div");

  rejectionField.className = "review-rejection-field";

  const rejectionLabel = document.createElement("label");

  setTranslatedText(rejectionLabel, "rejection_reason_label");

  const rejectionReason = document.createElement("textarea");

  rejectionReason.className = "review-rejection-reason";

  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;
  setTranslatedPlaceholder(rejectionReason, "rejection_reason_placeholder");

  rejectionLabel.htmlFor = `retirement-rejection-${retirementMessage._id}`;

  rejectionReason.id = `retirement-rejection-${retirementMessage._id}`;

  rejectionField.append(rejectionLabel, rejectionReason);

  const actionMessage = document.createElement("p");

  actionMessage.className = "review-action-message";

  actionMessage.setAttribute("role", "alert");

  actionMessage.hidden = true;

  const actions = document.createElement("div");

  actions.className = "review-actions";

  const publishButton = document.createElement("button");

  publishButton.type = "button";
  publishButton.className = "review-publish-button";
  setTranslatedText(publishButton, "publish_retirement_message");

  const rejectButton = document.createElement("button");

  rejectButton.type = "button";
  rejectButton.className = "review-reject-button";
  setTranslatedText(rejectButton, "reject_retirement_message");

  configureTwoStepDecision({
    decision,
    decisionCopy,
    rejectionField,
    actionMessage,
    actions,
    publishButton,
    rejectButton,
    publishLabelKey: "publish_retirement_message",
    rejectLabelKey: "reject_retirement_message",
    publishConfirmationKey: "review_publish_confirmation",
    rejectConfirmationKey: "review_reject_confirmation",
    submit(action) {
      submitRetirementReview(retirementMessage._id, action, article);
    },
  });

  article.append(cardHeader, retireeInformation, messageFields);

  if (photoSection) {
    article.append(photoSection);
  }

  article.append(submissionDetails, decision);

  return article;
}

function createLastPostMessageSection(lastPost) {
  const grid = document.createElement("div");
  grid.className = "review-language-grid";

  ["en", "fr"].forEach((languageCode) => {
    const panel = document.createElement("section");
    panel.className = "review-language-panel";
    panel.lang = languageCode;
    const editorId = `last-post-message-${lastPost._id}-${languageCode}-editor`;

    const panelHeading = document.createElement("header");
    panelHeading.className = "review-language-heading";

    const code = document.createElement("span");
    code.className = "review-language-code";
    code.textContent = languageCode.toUpperCase();

    const title = document.createElement("h3");
    title.textContent = translate(
      languageCode === "en"
        ? "last_post_review_english_notice"
        : "last_post_review_french_notice",
    );

    const controls = document.createElement("div");
    controls.className = "review-language-controls";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className =
      "review-language-edit-button review-last-post-message-edit-button";
    editButton.dataset.lastPostMessageLanguage = languageCode;
    editButton.setAttribute(
      "data-i18n-aria-label",
      "review_edit_last_post_message",
    );
    editButton.appendChild(createReviewEditIcon());

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "event-submit-button review-language-save-button";
    saveButton.setAttribute("form", editorId);
    saveButton.hidden = true;

    const saveButtonLabel = document.createElement("span");
    setTranslatedText(saveButtonLabel, "save_event_changes");
    saveButton.appendChild(saveButtonLabel);

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "review-language-cancel-button";
    cancelButton.setAttribute("data-i18n-aria-label", "cancel_event_editing");
    cancelButton.textContent = "×";
    cancelButton.hidden = true;

    controls.append(editButton, saveButton, cancelButton);
    panelHeading.append(code, title, controls);

    const body = document.createElement("div");
    body.className = "review-language-body";

    const messageValue = document.createElement("p");
    messageValue.className = "last-post-review-message-value";

    const label = document.createElement("label");
    label.className = "review-content-label";
    label.htmlFor = `lastPostMessage${lastPost._id}${languageCode}`;
    setTranslatedText(label, "last_post_message");

    const editor = document.createElement("form");
    editor.id = editorId;
    editor.className = "last-post-review-message-editor";
    editor.hidden = true;

    const textarea = document.createElement("textarea");
    textarea.id = `lastPostMessage${lastPost._id}${languageCode}`;
    textarea.className = "last-post-review-message-input";
    textarea.dataset.lastPostMessageLanguage = languageCode;
    textarea.rows = 9;
    textarea.maxLength = 10000;
    textarea.required = true;
    textarea.value = getContentValue(lastPost.messages, languageCode);

    const hint = document.createElement("small");
    hint.className = "retirement-review-message-hint";
    const updateHint = () => {
      setTranslatedText(
        hint,
        textarea.value.trim()
          ? "last_post_review_translation_ready"
          : "last_post_review_translation_missing",
      );
    };
    textarea.addEventListener("input", updateHint);
    updateHint();

    function updateMessageValue(value) {
      const message = String(value || "").trim();

      if (message) {
        messageValue.textContent = message;
        messageValue.classList.remove("is-missing");
        messageValue.removeAttribute("data-i18n");
        return;
      }

      setTranslatedText(messageValue, "last_post_review_translation_missing");
      messageValue.classList.add("is-missing");
    }

    function setEditing(editing) {
      messageValue.hidden = editing;
      editor.hidden = !editing;
      editButton.hidden = editing;
      saveButton.hidden = !editing;
      cancelButton.hidden = !editing;
    }

    function setSaving(saving) {
      saveButton.disabled = saving;
      cancelButton.disabled = saving;
      saveButton.setAttribute("aria-busy", String(saving));
      saveButton.setAttribute(
        "data-i18n-aria-label",
        saving ? "review_saving_last_post_message" : "save_event_changes",
      );
      setTranslatedText(
        saveButtonLabel,
        saving ? "review_saving_last_post_message" : "save_event_changes",
      );
    }

    function restoreMessage() {
      textarea.value = getContentValue(lastPost.messages, languageCode);
      updateHint();
    }

    updateMessageValue(textarea.value);

    editButton.addEventListener("click", () => {
      restoreMessage();
      setEditing(true);
      textarea.focus();
    });

    cancelButton.addEventListener("click", () => {
      restoreMessage();
      setEditing(false);
      editButton.focus();
    });

    editor.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();

      if (saveButton.disabled) {
        return;
      }

      setSaving(true);

      try {
        const result = await reviewApiJson(
          `/api/last-posts/${lastPost._id}/review-content`,
          {
            method: "PATCH",
            body: {
              language: languageCode,
              message: textarea.value,
            },
            errorMessage: translate("last_post_review_content_update_failed"),
          },
        );
        const savedLastPost = result.lastPost || {};

        lastPost.messages = {
          ...(lastPost.messages || {}),
          [languageCode]: getContentValue(savedLastPost.messages, languageCode),
        };

        updateMessageValue(getContentValue(lastPost.messages, languageCode));
        setEditing(false);
        showNotice(translate("last_post_review_content_updated"));
      } catch (error) {
        showNotice(
          error.message || translate("last_post_review_content_update_failed"),
          "error",
        );
      } finally {
        setSaving(false);
      }
    });

    editor.append(label, textarea, hint);
    body.append(messageValue, editor);
    panel.append(panelHeading, body);
    grid.appendChild(panel);
  });

  return grid;
}

function createLastPostImageSection(lastPost) {
  if (!lastPost.imageUrl) return null;

  const section = document.createElement("section");
  section.className = "review-record-section retirement-review-photo-section";

  const heading = document.createElement("h3");
  heading.textContent = translate("last_post_review_image_record");

  const link = document.createElement("a");
  link.className = "retirement-review-photo-link";
  link.href = lastPost.imageUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const image = document.createElement("img");
  image.src = lastPost.imageUrl;
  image.alt = translate("last_post_image_alt", {
    name: formatLastPostName(lastPost),
  });
  image.loading = "lazy";

  const label = document.createElement("span");
  label.textContent = translate("last_post_review_open_image");
  link.append(image, label);
  section.append(heading, link);
  return section;
}

function createLastPostReviewCard(lastPost) {
  const article = document.createElement("article");
  article.className = "review-event-card";
  article.dataset.lastPostId = lastPost._id;

  const cardHeader = document.createElement("header");
  cardHeader.className = "review-event-card-header";

  const headingCopy = document.createElement("div");
  headingCopy.className = "review-event-card-heading";
  const eyebrow = document.createElement("p");
  eyebrow.textContent = translate("last_post_review_pending_submission");
  const title = document.createElement("h2");
  title.textContent = formatLastPostName(lastPost);
  headingCopy.append(eyebrow, title);

  const status = document.createElement("span");
  status.className = "review-status-badge";
  status.textContent = translate("review_status_pending");
  cardHeader.append(headingCopy, status);

  const deceasedInformation = createReviewRecordSection(
    "last_post_review_deceased_record",
    [
      { labelKey: "last_post_full_rank", value: lastPost.deceased?.fullRank },
      { labelKey: "last_post_first_name", value: lastPost.deceased?.firstName },
      { labelKey: "last_post_surname", value: lastPost.deceased?.surname },
      {
        labelKey: "last_post_post_nominal",
        value: lastPost.deceased?.postNominal,
      },
    ],
    "review-event-information",
  );

  const submitterInformation = createReviewRecordSection(
    "last_post_submitter_heading",
    [
      { labelKey: "rank", value: lastPost.submitter?.rank },
      { labelKey: "first_name", value: lastPost.submitter?.firstName },
      { labelKey: "last_name", value: lastPost.submitter?.lastName },
      { labelKey: "email", value: lastPost.submitter?.email, wide: true },
    ],
  );

  const submissionRecord = document.createElement("div");
  submissionRecord.className = "review-submission-record";
  submissionRecord.append(submitterInformation);

  const submissionDetails = createSubmissionDetails(
    submissionRecord,
    "review_submitter_details",
  );

  const imageSection = createLastPostImageSection(lastPost);
  const decision = document.createElement("section");
  decision.className = "review-decision";
  const decisionCopy = document.createElement("div");
  decisionCopy.className = "review-decision-copy";
  const decisionHeading = document.createElement("h3");
  setTranslatedText(decisionHeading, "review_decision");
  const decisionHelp = document.createElement("p");
  setTranslatedText(decisionHelp, "last_post_rejection_reason_help");
  decisionCopy.append(decisionHeading, decisionHelp);

  const rejectionField = document.createElement("div");
  rejectionField.className = "review-rejection-field";
  const rejectionLabel = document.createElement("label");
  setTranslatedText(rejectionLabel, "rejection_reason_label");
  rejectionLabel.htmlFor = `last-post-rejection-${lastPost._id}`;
  const rejectionReason = document.createElement("textarea");
  rejectionReason.id = `last-post-rejection-${lastPost._id}`;
  rejectionReason.className = "review-rejection-reason";
  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;
  setTranslatedPlaceholder(rejectionReason, "rejection_reason_placeholder");
  rejectionField.append(rejectionLabel, rejectionReason);

  const actionMessage = document.createElement("p");
  actionMessage.className = "review-action-message";
  actionMessage.setAttribute("role", "alert");
  actionMessage.hidden = true;

  const actions = document.createElement("div");
  actions.className = "review-actions";
  const rejectButton = document.createElement("button");
  rejectButton.type = "button";
  rejectButton.className = "review-reject-button";
  setTranslatedText(rejectButton, "reject_last_post");
  const publishButton = document.createElement("button");
  publishButton.type = "button";
  publishButton.className = "review-publish-button";
  setTranslatedText(publishButton, "publish_last_post");

  configureTwoStepDecision({
    decision,
    decisionCopy,
    rejectionField,
    actionMessage,
    actions,
    publishButton,
    rejectButton,
    publishLabelKey: "publish_last_post",
    rejectLabelKey: "reject_last_post",
    publishConfirmationKey: "review_publish_confirmation",
    rejectConfirmationKey: "review_reject_confirmation",
    submit(action) {
      submitLastPostReview(lastPost._id, action, article);
    },
  });

  article.append(
    cardHeader,
    deceasedInformation,
    createLastPostMessageSection(lastPost),
  );
  if (imageSection) article.append(imageSection);
  article.append(submissionDetails, decision);
  return article;
}

function createCommentReviewCard(comment) {
  const article = document.createElement("article");
  article.className = "review-event-card";
  article.dataset.commentId = comment._id;

  const cardHeader = document.createElement("header");
  cardHeader.className = "review-event-card-header";

  const headingCopy = document.createElement("div");
  headingCopy.className = "review-event-card-heading";

  const eyebrow = document.createElement("p");
  eyebrow.textContent = translate("comment_review_pending_submission");

  const title = document.createElement("h2");
  title.textContent = formatRetireeName(comment.retirementMessage);

  headingCopy.append(eyebrow, title);

  const status = document.createElement("span");
  status.className = "review-status-badge";
  status.textContent = translate("review_status_pending");

  cardHeader.append(headingCopy, status);

  const commentSection = document.createElement("section");
  commentSection.className =
    "review-record-section comment-review-comment-section";

  const commentHeading = document.createElement("h3");
  commentHeading.textContent = translate("comment_review_comment_record");

  const commentBody = document.createElement("p");
  commentBody.className = "review-event-description comment-review-body";
  commentBody.textContent = comment.body || "—";

  commentSection.append(commentHeading, commentBody);

  const relatedSection = document.createElement("section");
  relatedSection.className =
    "review-record-section comment-review-related-section";

  const relatedHeading = document.createElement("h3");
  relatedHeading.textContent = translate("comment_review_related_record");

  const relatedData = document.createElement("div");
  relatedData.className = "review-record-data";

  const relatedItem = document.createElement("div");
  relatedItem.className = "review-record-item is-wide";

  const relatedLabel = document.createElement("span");
  relatedLabel.className = "review-record-label";
  relatedLabel.textContent = translate("comment_review_retiree_label");

  const relatedLink = document.createElement("a");
  relatedLink.className = "review-record-value comment-review-related-link";

  if (comment.retirementMessage?._id) {
    relatedLink.href = `/retirement-message?id=${encodeURIComponent(
      comment.retirementMessage._id,
    )}`;
  }

  relatedLink.textContent = formatRetireeName(comment.retirementMessage);

  relatedItem.append(relatedLabel, relatedLink);

  relatedData.appendChild(relatedItem);
  relatedSection.append(relatedHeading, relatedData);

  const submitterInformation = createReviewRecordSection(
    "review_submitter_record",
    [
      {
        labelKey: "submitted_by",
        value: formatCommentAuthor(comment),
      },
      {
        labelKey: "email",
        value: comment.author?.email,
        wide: true,
      },
      {
        labelKey: "submitted_on",
        value: formatSubmittedDate(comment.createdAt),
        wide: true,
      },
    ],
  );

  const submissionRecord = document.createElement("div");
  submissionRecord.className = "review-submission-record";
  submissionRecord.append(submitterInformation);

  const submissionDetails = createSubmissionDetails(
    submissionRecord,
    "review_submitter_details",
  );

  const decision = document.createElement("section");
  decision.className = "review-decision";

  const decisionCopy = document.createElement("div");
  decisionCopy.className = "review-decision-copy";

  const decisionHeading = document.createElement("h3");
  setTranslatedText(decisionHeading, "review_decision");

  const decisionHelp = document.createElement("p");
  setTranslatedText(decisionHelp, "comment_rejection_reason_help");

  decisionCopy.append(decisionHeading, decisionHelp);

  const rejectionField = document.createElement("div");
  rejectionField.className = "review-rejection-field";

  const rejectionLabel = document.createElement("label");
  setTranslatedText(rejectionLabel, "rejection_reason_label");

  const rejectionReason = document.createElement("textarea");
  rejectionReason.className = "review-rejection-reason";
  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;
  setTranslatedPlaceholder(rejectionReason, "rejection_reason_placeholder");

  rejectionLabel.htmlFor = `comment-rejection-${comment._id}`;
  rejectionReason.id = `comment-rejection-${comment._id}`;

  rejectionField.append(rejectionLabel, rejectionReason);

  const actionMessage = document.createElement("p");
  actionMessage.className = "review-action-message";
  actionMessage.setAttribute("role", "alert");
  actionMessage.hidden = true;

  const actions = document.createElement("div");
  actions.className = "review-actions";

  const publishButton = document.createElement("button");
  publishButton.type = "button";
  publishButton.className = "review-publish-button";
  setTranslatedText(publishButton, "publish_comment");

  const rejectButton = document.createElement("button");
  rejectButton.type = "button";
  rejectButton.className = "review-reject-button";
  setTranslatedText(rejectButton, "reject_comment");

  configureTwoStepDecision({
    decision,
    decisionCopy,
    rejectionField,
    actionMessage,
    actions,
    publishButton,
    rejectButton,
    publishLabelKey: "publish_comment",
    rejectLabelKey: "reject_comment",
    publishConfirmationKey: "review_publish_confirmation",
    rejectConfirmationKey: "review_reject_confirmation",
    submit(action) {
      submitCommentReview(comment._id, action, article);
    },
  });

  article.append(
    cardHeader,
    commentSection,
    relatedSection,
    submissionDetails,
    decision,
  );

  return article;
}

function showPageMessage(
  message,
  type = "neutral",
  messageElement = reviewPageMessage,
) {
  messageElement.textContent = message;

  messageElement.className = `review-page-message is-${type}`;
  messageElement.removeAttribute("aria-label");

  messageElement.hidden = false;
}

function showQueueLoading(
  messageKey,
  messageElement = reviewPageMessage,
  queueElement = reviewQueue,
) {
  const message = translate(messageKey);
  const loading = CMCENUtils.createLoadingSpinner(message);

  messageElement.replaceChildren(...Array.from(loading.childNodes));
  messageElement.className = "review-page-message is-loading";
  messageElement.setAttribute("aria-label", message);
  messageElement.hidden = false;
  queueElement.hidden = true;
}

function showNotice(message, type = "success") {
  CMCENUtils.showToast(message, {
    color: type === "success" ? "success" : type === "error" ? "error" : "info",
    position: "bottom-right",
    animation: "slide",
  });
}

function renderReviewQueue() {
  reviewQueue.replaceChildren();

  if (!pendingEvents.length) {
    reviewQueue.hidden = true;
    showPageMessage(translate("no_pending_events"), "empty");

    return;
  }

  reviewPageMessage.hidden = true;
  reviewQueue.hidden = false;

  pendingEvents.forEach((event) => {
    reviewQueue.appendChild(createReviewCard(event));
  });
}

function renderRetirementReviewQueue() {
  retirementReviewQueue.replaceChildren();

  if (!pendingRetirementMessages.length) {
    retirementReviewQueue.hidden = true;
    showPageMessage(
      translate("no_pending_retirement_messages"),
      "empty",
      retirementReviewPageMessage,
    );

    return;
  }

  retirementReviewPageMessage.hidden = true;
  retirementReviewQueue.hidden = false;

  pendingRetirementMessages.forEach((retirementMessage) => {
    retirementReviewQueue.appendChild(
      createRetirementReviewCard(retirementMessage),
    );
  });
}

function renderLastPostReviewQueue() {
  lastPostReviewQueue.replaceChildren();

  if (!pendingLastPosts.length) {
    lastPostReviewQueue.hidden = true;
    showPageMessage(
      translate("no_pending_last_posts"),
      "empty",
      lastPostReviewPageMessage,
    );
    return;
  }

  lastPostReviewPageMessage.hidden = true;
  lastPostReviewQueue.hidden = false;

  pendingLastPosts.forEach((lastPost) => {
    lastPostReviewQueue.appendChild(createLastPostReviewCard(lastPost));
  });
}

function renderCommentReviewQueue() {
  commentReviewQueue.replaceChildren();

  if (!pendingComments.length) {
    commentReviewQueue.hidden = true;
    showPageMessage(
      translate("no_pending_retirement_comments"),
      "empty",
      commentReviewPageMessage,
    );

    return;
  }

  commentReviewPageMessage.hidden = true;
  commentReviewQueue.hidden = false;

  pendingComments.forEach((comment) => {
    commentReviewQueue.appendChild(createCommentReviewCard(comment));
  });
}

function createReviewActionContext(card) {
  const context = {
    card,
    buttons: card.querySelectorAll("button"),
    publishButton: card.querySelector(".review-publish-button"),
    rejectButton: card.querySelector(".review-reject-button"),
    reasonInput: card.querySelector(".review-rejection-reason"),
  };

  return context;
}

function showReviewValidationError(context, message, input) {
  showNotice(message, "error");
  input.focus();
}

async function performReviewAction({
  action,
  context,
  path,
  body,
  errorMessage,
  successMessageKey,
  publishLabelKey,
  rejectLabelKey,
  onSuccess,
  renderQueue,
}) {
  context.buttons.forEach((button) => {
    button.disabled = true;
  });

  const activeButton =
    action === "publish" ? context.publishButton : context.rejectButton;
  activeButton.textContent = translate(
    action === "publish" ? "review_publishing" : "review_rejecting",
  );

  try {
    await reviewApiJson(path, {
      method: "PATCH",
      body,
      errorMessage,
    });

    onSuccess();
    context.card.classList.add("is-resolved");

    window.setTimeout(() => {
      context.card.remove();
      renderQueue();
    }, 160);

    showNotice(translate(successMessageKey));
  } catch (error) {
    showNotice(error.message || errorMessage, "error");

    context.buttons.forEach((button) => {
      button.disabled = false;
    });

    context.publishButton.textContent = translate(publishLabelKey);
    context.rejectButton.textContent = translate(rejectLabelKey);
  }
}

async function submitReview(eventId, action, card) {
  const context = createReviewActionContext(card);
  const rejectionReason = context.reasonInput.value.trim();

  if (action === "reject" && !rejectionReason) {
    showReviewValidationError(
      context,
      translate("rejection_reason_required"),
      context.reasonInput,
    );
    return;
  }

  await performReviewAction({
    action,
    context,
    path: `/api/events/${eventId}/review`,
    body: {
      action,
      rejectionReason: action === "reject" ? rejectionReason : undefined,
    },
    errorMessage: translate("review_failed"),
    successMessageKey:
      action === "publish" ? "review_publish_success" : "review_reject_success",
    publishLabelKey: "publish_event",
    rejectLabelKey: "reject_event",
    onSuccess() {
      pendingEvents = pendingEvents.filter((event) => event._id !== eventId);
    },
    renderQueue: renderReviewQueue,
  });
}

async function submitRetirementReview(messageId, action, card) {
  const context = createReviewActionContext(card);
  const rejectionReason = context.reasonInput.value.trim();
  const retirementMessage = pendingRetirementMessages.find(
    (item) => item._id === messageId,
  );

  if (action === "reject" && !rejectionReason) {
    showReviewValidationError(
      context,
      translate("retirement_rejection_reason_required"),
      context.reasonInput,
    );
    return;
  }

  if (action === "publish") {
    const missingLanguage = ["en", "fr"].find(
      (language) =>
        getRetirementReviewMessage(retirementMessage || {}, language).length <
        100,
    );

    if (missingLanguage) {
      showNotice(translate("retirement_review_translation_required"), "error");
      card
        .querySelector(
          `.review-retirement-message-edit-button[data-retirement-message-language="${missingLanguage}"]`,
        )
        ?.focus();
      return;
    }
  }

  await performReviewAction({
    action,
    context,
    path: `/api/retirement-messages/${messageId}/review`,
    body: {
      action,
      rejectionReason: action === "reject" ? rejectionReason : undefined,
    },
    errorMessage: translate("retirement_review_failed"),
    successMessageKey:
      action === "publish"
        ? "retirement_review_publish_success"
        : "retirement_review_reject_success",
    publishLabelKey: "publish_retirement_message",
    rejectLabelKey: "reject_retirement_message",
    onSuccess() {
      pendingRetirementMessages = pendingRetirementMessages.filter(
        (retirementMessage) => retirementMessage._id !== messageId,
      );
    },
    renderQueue: renderRetirementReviewQueue,
  });
}

async function submitLastPostReview(messageId, action, card) {
  const context = createReviewActionContext(card);
  const rejectionReason = context.reasonInput.value.trim();
  const lastPost = pendingLastPosts.find((item) => item._id === messageId);

  if (action === "reject" && !rejectionReason) {
    showReviewValidationError(
      context,
      translate("last_post_rejection_reason_required"),
      context.reasonInput,
    );
    return;
  }

  if (action === "publish") {
    const missingLanguage = ["en", "fr"].find(
      (language) => !getContentValue(lastPost?.messages, language),
    );

    if (missingLanguage) {
      showNotice(translate("last_post_review_translation_required"), "error");
      card
        .querySelector(
          `.review-last-post-message-edit-button[data-last-post-message-language="${missingLanguage}"]`,
        )
        ?.focus();
      return;
    }
  }

  await performReviewAction({
    action,
    context,
    path: `/api/last-posts/${messageId}/review`,
    body: {
      action,
      rejectionReason: action === "reject" ? rejectionReason : undefined,
    },
    errorMessage: translate("last_post_review_failed"),
    successMessageKey:
      action === "publish"
        ? "last_post_review_publish_success"
        : "last_post_review_reject_success",
    publishLabelKey: "publish_last_post",
    rejectLabelKey: "reject_last_post",
    onSuccess() {
      pendingLastPosts = pendingLastPosts.filter(
        (lastPost) => lastPost._id !== messageId,
      );
    },
    renderQueue: renderLastPostReviewQueue,
  });
}

async function submitCommentReview(commentId, action, card) {
  const context = createReviewActionContext(card);
  const rejectionReason = context.reasonInput.value.trim();

  if (action === "reject" && !rejectionReason) {
    showReviewValidationError(
      context,
      translate("comment_rejection_reason_required"),
      context.reasonInput,
    );
    return;
  }

  await performReviewAction({
    action,
    context,
    path: `/api/retirement-messages/comments/${commentId}/review`,
    body: {
      action,
      rejectionReason: action === "reject" ? rejectionReason : undefined,
    },
    errorMessage: translate("comment_review_failed"),
    successMessageKey:
      action === "publish"
        ? "comment_review_publish_success"
        : "comment_review_reject_success",
    publishLabelKey: "publish_comment",
    rejectLabelKey: "reject_comment",
    onSuccess() {
      pendingComments = pendingComments.filter(
        (comment) => comment._id !== commentId,
      );
    },
    renderQueue: renderCommentReviewQueue,
  });
}

async function loadReviewQueue() {
  accessDenied = false;
  loadFailed = false;
  retirementLoadFailed = false;
  lastPostLoadFailed = false;
  commentLoadFailed = false;

  showQueueLoading("loading_events");
  showQueueLoading(
    "loading_retirement_messages",
    retirementReviewPageMessage,
    retirementReviewQueue,
  );
  showQueueLoading(
    "loading_retirement_comments",
    commentReviewPageMessage,
    commentReviewQueue,
  );
  showQueueLoading(
    "loading_last_posts",
    lastPostReviewPageMessage,
    lastPostReviewQueue,
  );

  try {
    const user = await reviewApiJson("/api/me", {
      errorMessage: translate("review_access_denied"),
    });

    if (!user.permissions?.canReviewAndPublish) {
      accessDenied = true;

      showPageMessage(translate("review_access_denied"), "error");
      showPageMessage(
        translate("review_access_denied"),
        "error",
        retirementReviewPageMessage,
      );
      showPageMessage(
        translate("review_access_denied"),
        "error",
        commentReviewPageMessage,
      );
      showPageMessage(
        translate("review_access_denied"),
        "error",
        lastPostReviewPageMessage,
      );

      return;
    }

    const [eventResult, retirementResult, lastPostResult, commentResult] =
      await Promise.allSettled([
        reviewApiJson("/api/events/review", {
          errorMessage: translate("review_load_error"),
        }),
        reviewApiJson("/api/retirement-messages/review", {
          errorMessage: translate("retirement_review_load_error"),
        }),
        reviewApiJson("/api/last-posts/review", {
          errorMessage: translate("last_post_review_load_error"),
        }),
        reviewApiJson("/api/retirement-messages/comments/review", {
          errorMessage: translate("comment_review_load_error"),
        }),
      ]);

    const results = [
      eventResult,
      retirementResult,
      lastPostResult,
      commentResult,
    ];
    const rejectedResults = results.filter(
      (result) => result.status === "rejected",
    );

    if (rejectedResults.some((result) => result.reason?.status === 401)) {
      return;
    }

    const forbiddenResult = rejectedResults.find(
      (result) => result.reason?.status === 403,
    );

    if (forbiddenResult) {
      accessDenied = true;
      throw forbiddenResult.reason;
    }

    if (eventResult.status === "rejected") {
      loadFailed = true;

      showPageMessage(
        eventResult.reason?.message || translate("review_load_error"),
        "error",
      );
    } else {
      const eventData = eventResult.value;
      pendingEvents = Array.isArray(eventData.events) ? eventData.events : [];

      renderReviewQueue();
    }

    if (retirementResult.status === "rejected") {
      retirementLoadFailed = true;

      showPageMessage(
        retirementResult.reason?.message ||
          translate("retirement_review_load_error"),
        "error",
        retirementReviewPageMessage,
      );
    } else {
      const retirementData = retirementResult.value;
      pendingRetirementMessages = Array.isArray(
        retirementData.retirementMessages,
      )
        ? retirementData.retirementMessages
        : [];

      renderRetirementReviewQueue();
    }

    if (commentResult.status === "rejected") {
      commentLoadFailed = true;

      showPageMessage(
        commentResult.reason?.message || translate("comment_review_load_error"),
        "error",
        commentReviewPageMessage,
      );
    } else {
      const commentData = commentResult.value;
      pendingComments = Array.isArray(commentData.comments)
        ? commentData.comments
        : [];

      renderCommentReviewQueue();
    }

    if (lastPostResult.status === "rejected") {
      lastPostLoadFailed = true;
      showPageMessage(
        lastPostResult.reason?.message ||
          translate("last_post_review_load_error"),
        "error",
        lastPostReviewPageMessage,
      );
    } else {
      const lastPostData = lastPostResult.value;
      pendingLastPosts = Array.isArray(lastPostData.lastPosts)
        ? lastPostData.lastPosts
        : [];
      renderLastPostReviewQueue();
    }
  } catch (error) {
    accessDenied = accessDenied || error.status === 403;
    loadFailed = !accessDenied;
    retirementLoadFailed = !accessDenied;
    lastPostLoadFailed = !accessDenied;
    commentLoadFailed = !accessDenied;

    showPageMessage(error.message || translate("review_load_error"), "error");
    showPageMessage(
      error.message || translate("retirement_review_load_error"),
      "error",
      retirementReviewPageMessage,
    );
    showPageMessage(
      error.message || translate("comment_review_load_error"),
      "error",
      commentReviewPageMessage,
    );
    showPageMessage(
      error.message || translate("last_post_review_load_error"),
      "error",
      lastPostReviewPageMessage,
    );
  }
}

function updateEventReviewCardsLanguage() {
  reviewQueue.querySelectorAll(".review-event-card--event").forEach((card) => {
    const event = pendingEvents.find(
      (item) => item._id === card.dataset.eventId,
    );

    if (!event) {
      return;
    }

    const title = card.querySelector(".review-event-card-heading h2");

    if (title) {
      title.textContent = getDisplayTitle(event);
    }

    const eventInformationValues = [
      event.city,
      formatTranslatedOption("region", event.provinceRegion),
      formatTranslatedOption("entity", event.organizingEntity),
      formatTranslatedOption("event_type", event.eventType),
      formatEventReviewDate(event, event.startDate),
      formatEventReviewTime(event, event.startDate),
      formatEventReviewDate(event, event.endDate),
      formatEventReviewTime(event, event.endDate),
      formatEventTimezone(event.timezone),
    ];

    card
      .querySelectorAll(".review-event-information .review-record-value")
      .forEach((value, index) => {
        value.textContent = eventInformationValues[index] || "—";
      });

    const authorizationValues = [
      translate(
        event.publicationPermission?.confirmed === true
          ? "review_permission_confirmed"
          : "review_permission_not_recorded",
      ),
      formatReviewUser(event.publicationPermission?.confirmedBy),
      event.publicationPermission?.confirmedAt
        ? formatSubmittedDate(event.publicationPermission.confirmedAt)
        : "—",
    ];

    card
      .querySelectorAll(
        ".review-submission-details .review-record-section:last-child .review-record-value",
      )
      .forEach((value, index) => {
        value.textContent = authorizationValues[index] || "—";
      });
  });
}

document.addEventListener("languagechange", updateEventReviewCardsLanguage);

const reviewTabController = CMCENUtils.bindTabs({
  active: reviewTabNames.includes(requestedReviewTab)
    ? requestedReviewTab
    : "events",
  panels: reviewPanels,
  panelKey: "reviewPanel",
  tabs: reviewTabs,
  tabKey: "reviewTab",
});

function activateReviewTab(tabName) {
  reviewTabController.activate(tabName);
}

window.addEventListener("pageshow", () => {
  if (!getReviewToken()) {
    redirectToLogin();
  }
});

loadReviewQueue();
