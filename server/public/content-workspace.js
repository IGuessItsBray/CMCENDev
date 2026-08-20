const contentWorkspaceType = document.getElementById("contentWorkspaceType");
const contentWorkspaceStatusFilter = document.getElementById(
  "contentWorkspaceStatusFilter",
);
const contentWorkspaceMessage = document.getElementById(
  "contentWorkspaceMessage",
);
const contentWorkspaceList = document.getElementById("contentWorkspaceList");
const contentWorkspaceCount = document.getElementById("contentWorkspaceCount");
const contentWorkspaceDetail = document.getElementById(
  "contentWorkspaceDetail",
);

const contentWorkspaceState = {
  items: [],
  selectedId: "",
  requestedContentId: "",
  user: null,
  isLoading: false,
  loadRequestId: 0,
  editorDrafts: new Map(),
};

const contentWorkspaceRoutes = Object.freeze({
  event: "/api/admin/events",
  retirementMessage: "/api/admin/retirement-messages",
  lastPost: "/api/admin/last-posts",
  retirementComment: "/api/admin/retirement-comments",
});

const contentWorkspaceReviewRoutes = Object.freeze({
  event: (id) => `/api/events/${encodeURIComponent(id)}/review`,
  retirementMessage: (id) =>
    `/api/retirement-messages/${encodeURIComponent(id)}/review`,
  lastPost: (id) => `/api/last-posts/${encodeURIComponent(id)}/review`,
  retirementComment: (id) =>
    `/api/retirement-messages/comments/${encodeURIComponent(id)}/review`,
});

const contentWorkspaceEditRoutes = Object.freeze({
  event: (id) => `/api/admin/events/${encodeURIComponent(id)}`,
  retirementMessage: (id) =>
    `/api/admin/retirement-messages/${encodeURIComponent(id)}`,
  lastPost: (id) => `/api/admin/last-posts/${encodeURIComponent(id)}`,
  retirementComment: (id) =>
    `/api/admin/retirement-comments/${encodeURIComponent(id)}`,
});

const contentWorkspaceTypes = new Set([
  "all",
  "event",
  "retirementMessage",
  "lastPost",
  "retirementComment",
]);
const contentWorkspaceStatuses = new Set([
  "all",
  "draft",
  "pending",
  "published",
  "rejected",
  "hidden",
]);

function getText(key, fallback, replacements = {}) {
  const translated =
    typeof window.translate === "function"
      ? window.translate(key, replacements)
      : key;

  return translated === key ? fallback : translated;
}

function setWorkspaceTranslatedText(element, key, fallback) {
  element.dataset.i18n = key;
  element.textContent = getText(key, fallback);
}

function getContentWorkspaceLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function getContentWorkspaceLocale() {
  return CMCENUtils.getCurrentLocale();
}

function getContentWorkspaceToken() {
  return CMCENUtils.requireAuthToken();
}

async function contentWorkspaceApiJson(path, options = {}) {
  const token = getContentWorkspaceToken();

  if (!token) {
    CMCENUtils.redirectToLogin();
    throw new Error(getText("sign_in_to_continue", "Sign in to continue."));
  }

  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token,
      redirectOnUnauthorized: true,
      unauthorizedMessage: getText("sign_in_to_continue", "Sign in to continue."),
    });
  } catch (error) {
    if (error.status === 403) {
      window.location.replace("/dashboard");
    }

    throw error;
  }
}

function setWorkspaceMessage(message = "", kind = "") {
  contentWorkspaceMessage.textContent = message;
  contentWorkspaceMessage.className = "content-workspace-status";

  if (kind) {
    contentWorkspaceMessage.classList.add(`is-${kind}`);
  }
}

function applyContentWorkspaceSearchParameters() {
  const searchParameters = new URLSearchParams(window.location.search);
  const type = searchParameters.get("type");
  const status = searchParameters.get("status");
  const contentId = String(searchParameters.get("id") || "").trim();

  if (contentWorkspaceTypes.has(type)) {
    contentWorkspaceType.value = type;
  }

  if (contentWorkspaceStatuses.has(status)) {
    contentWorkspaceStatusFilter.value = status;
  }

  if (contentId) {
    contentWorkspaceState.selectedId = contentId;
    contentWorkspaceState.requestedContentId = contentId;
  }
}

function updateContentWorkspaceSearchParameters({ includeSelection = false } = {}) {
  const url = new URL(window.location.href);
  const searchParameters = new URLSearchParams({
    type: contentWorkspaceType.value || "all",
    status: contentWorkspaceStatusFilter.value || "all",
  });
  if (includeSelection && contentWorkspaceState.selectedId) {
    searchParameters.set("id", contentWorkspaceState.selectedId);
  }
  url.search = searchParameters.toString();
  window.history.replaceState({}, "", url);
}

function getLocalizedValue(value) {
  if (!value || typeof value !== "object") return "";

  const language = getContentWorkspaceLanguage();
  return String(value[language] || value.en || value.fr || "").trim();
}

function getItemTitle(item) {
  return String(item?.title || "").trim() || getText("content_workspace_untitled", "Untitled content");
}

function getListItemTitle(item) {
  if (item?.type === "retirementMessage") {
    const retiree = item.content?.retiree || {};
    const name = [retiree.rank, retiree.firstName, retiree.lastName]
      .filter(Boolean)
      .join(" ");

    if (name) return name;
  }

  return getItemTitle(item);
}

function formatWorkspaceDate(value) {
  if (!value) return "";

  return CMCENUtils.formatDate(value, {
    locale: getContentWorkspaceLocale(),
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getTypeTranslation(type) {
  return {
    event: ["content_workspace_event", "Events"],
    retirementMessage: [
      "content_workspace_retirement",
      "Retirement messages",
    ],
    lastPost: ["content_workspace_last_post", "Last Post notices"],
    retirementComment: ["content_workspace_comment", "Comments"],
  }[type];
}

function getTypeLabel(type) {
  const translation = getTypeTranslation(type);
  return translation ? getText(...translation) : type;
}

function setTypeLabel(element, type) {
  const translation = getTypeTranslation(type);

  if (translation) {
    setWorkspaceTranslatedText(element, ...translation);
    return;
  }

  element.textContent = type;
}

function getStatusTranslation(status) {
  return {
    draft: ["content_workspace_draft", "Draft"],
    pending: ["content_workspace_pending", "Pending"],
    published: ["content_workspace_published", "Published"],
    rejected: ["content_workspace_rejected", "Rejected"],
    hidden: ["content_workspace_hidden", "Removed"],
  }[status];
}

function getStatusLabel(status) {
  const translation = getStatusTranslation(status);
  return translation ? getText(...translation) : status;
}

function updateContentWorkspaceStatusFilterAppearance() {
  const status = contentWorkspaceStatusFilter?.value || "all";
  contentWorkspaceStatusFilter.className =
    "content-workspace-status-filter is-" + status;
}

function createStatusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `content-workspace-status-badge is-${status || "unknown"}`;
  const translation = getStatusTranslation(status);

  if (translation) {
    setWorkspaceTranslatedText(badge, ...translation);
  } else {
    badge.textContent = status;
  }

  return badge;
}

function getPublicContentHref(item) {
  if (!item?._id || item.status !== "published") return "";

  if (item.type === "event") {
    return `/event?id=${encodeURIComponent(item._id)}`;
  }

  if (item.type === "retirementMessage") {
    return `/retirement-message?id=${encodeURIComponent(item._id)}`;
  }

  if (item.type === "lastPost") {
    return `/last-post-message?id=${encodeURIComponent(item._id)}`;
  }

  if (item.type === "retirementComment") {
    const retirementMessageId = item.content?.retirementMessage?._id;
    return retirementMessageId
      ? `/retirement-message?id=${encodeURIComponent(retirementMessageId)}`
      : "";
  }

  return "";
}

function createPublicContentLink(item) {
  const href = getPublicContentHref(item);
  if (!href) return null;

  const link = document.createElement("a");
  link.className = "content-workspace-public-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  setWorkspaceTranslatedText(
    link,
    "content_workspace_view_public_link",
    "View public link",
  );
  return link;
}

function updateContentWorkspaceCount() {
  if (contentWorkspaceState.isLoading) {
    contentWorkspaceCount.textContent = "";
    return;
  }

  const count = contentWorkspaceState.items.length;
  const singular = count === 1;
  contentWorkspaceCount.textContent = getText(
    singular
      ? "content_workspace_results_singular"
      : "content_workspace_results_plural",
    singular ? `${count} result` : `${count} results`,
    { count },
  );
}

function setRecordMetadata(metadata, item) {
  metadata.replaceChildren();

  const type = document.createElement("span");
  setTypeLabel(type, item.type);
  metadata.append(type);

  const updatedAt = formatWorkspaceDate(item.updatedAt || item.createdAt);
  if (updatedAt) {
    metadata.append(document.createTextNode(` · ${updatedAt}`));
  }
}

function renderContentWorkspaceList() {
  contentWorkspaceList.replaceChildren();
  updateContentWorkspaceCount();

  if (contentWorkspaceState.isLoading) {
    const loading = document.createElement("p");
    loading.className = "content-workspace-empty";
    setWorkspaceTranslatedText(
      loading,
      "content_workspace_loading",
      "Loading content…",
    );
    contentWorkspaceList.append(loading);
    return;
  }

  if (!contentWorkspaceState.items.length) {
    const empty = document.createElement("p");
    empty.className = "content-workspace-empty";
    setWorkspaceTranslatedText(
      empty,
      "content_workspace_empty",
      "No content matches these filters.",
    );
    contentWorkspaceList.append(empty);
    return;
  }

  contentWorkspaceState.items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "content-workspace-record";
    button.dataset.contentWorkspaceRecordId = String(item._id);
    button.classList.toggle(
      "is-selected",
      String(item._id) === contentWorkspaceState.selectedId,
    );
    button.setAttribute(
      "aria-current",
      String(item._id) === contentWorkspaceState.selectedId ? "true" : "false",
    );

    const title = document.createElement("strong");
    title.textContent = getListItemTitle(item);

    const metadata = document.createElement("span");
    metadata.className = "content-workspace-record-meta";
    setRecordMetadata(metadata, item);

    button.append(title, metadata, createStatusBadge(item.status));
    button.addEventListener("click", () => {
      contentWorkspaceState.selectedId = String(item._id);
      contentWorkspaceState.requestedContentId = "";
      updateContentWorkspaceSearchParameters({ includeSelection: true });
      renderContentWorkspaceList();
      renderContentWorkspaceDetail();
    });
    contentWorkspaceList.append(button);
  });
}

function getSelectedContentWorkspaceItem() {
  return contentWorkspaceState.items.find(
    (item) => String(item._id) === contentWorkspaceState.selectedId,
  );
}

function setDetailInfo(info, item) {
  const values = [getTypeLabel(item.type), formatWorkspaceDate(item.updatedAt)];

  if (item.type === "event") {
    values.push(item.content?.city, formatWorkspaceDate(item.content?.startDate));
  }

  if (item.status === "hidden" && item.hiddenFromStatus) {
    values.push(
      getText("content_workspace_removed_from", "Removed from {status}", {
        status: getStatusLabel(item.hiddenFromStatus),
      }),
    );
  }

  info.textContent = values.filter(Boolean).join(" · ");
}

function createDetailInfo(item) {
  const info = document.createElement("p");
  info.className = "content-workspace-detail-info";
  setDetailInfo(info, item);
  return info;
}

function getInitialTextareaRows(
  value,
  { minimumRows = 5, maximumRows = 12, charactersPerRow = 60 } = {},
) {
  const estimatedRows = String(value || "")
    .split(/\r?\n/)
    .reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil(line.length / charactersPerRow)),
      0,
    );

  return Math.min(maximumRows, Math.max(minimumRows, estimatedRows));
}

function createEditableField({
  label,
  labelKey,
  field,
  value,
  multiline = false,
  minimumRows,
  maximumRows,
}) {
  const labelElement = document.createElement("label");
  labelElement.className = "content-workspace-field";

  const labelText = document.createElement("span");
  if (labelKey) {
    setWorkspaceTranslatedText(labelText, labelKey, label);
  } else {
    labelText.textContent = label;
  }

  const control = document.createElement(multiline ? "textarea" : "input");
  control.name = field;
  control.value = value || "";

  if (multiline) {
    control.rows = getInitialTextareaRows(value, {
      ...(minimumRows ? { minimumRows } : {}),
      ...(maximumRows ? { maximumRows } : {}),
    });
  } else {
    control.type = "text";
  }

  labelElement.append(labelText, control);
  return labelElement;
}

function createEditNoteField() {
  const note = createEditableField({
    label: getText("content_workspace_note", "Editorial note (optional)"),
    labelKey: "content_workspace_note",
    field: "revisionNote",
    value: "",
    multiline: true,
    minimumRows: 2,
    maximumRows: 4,
  });
  note.classList.add("content-workspace-note");
  return note;
}

function getMessageForLanguage(item, language) {
  const messages = item.content?.messages || {};
  return String(messages[language] || "").trim();
}

function createLanguageEditor(item, language) {
  const languageName = getText(
    language === "en" ? "language_en" : "language_fr",
    language === "en" ? "English" : "French",
  );
  const form = document.createElement("form");
  form.className = "content-workspace-language-editor";
  form.dataset.language = language;

  const group = document.createElement("fieldset");
  group.className = "content-workspace-language-group";
  const heading = document.createElement("legend");
  setWorkspaceTranslatedText(
    heading,
    language === "en" ? "language_en" : "language_fr",
    languageName,
  );
  group.append(heading);

  if (item.type === "event") {
    const fields = [
      [
        "title",
        "content_workspace_field_title",
        getText("content_workspace_field_title", "Title"),
        false,
      ],
      [
        "location",
        "content_workspace_field_location",
        getText("content_workspace_field_location", "Location"),
        false,
      ],
      [
        "description",
        "content_workspace_field_description",
        getText("content_workspace_field_description", "Description"),
        true,
      ],
      [
        "registration",
        "content_workspace_field_registration",
        getText("content_workspace_field_registration", "Registration details"),
        true,
      ],
    ];

    fields.forEach(([field, labelKey, label, multiline]) => {
      group.append(
        createEditableField({
          label,
          labelKey,
          field,
          value: getEditorDraftValue(
            item,
            language,
            field,
            item.content?.[field]?.[language] || "",
          ),
          multiline,
        }),
      );
    });
  } else {
    const message = getEditorDraftValue(
      item,
      language,
      "message",
      getMessageForLanguage(item, language),
    );
    group.append(
      createEditableField({
        label: getText("content_workspace_field_message", "Message"),
        labelKey: "content_workspace_field_message",
        field: "message",
        value: message,
        multiline: true,
        minimumRows: 10,
        maximumRows: 18,
      }),
    );
  }

  const noteField = createEditNoteField();
  noteField.querySelector("textarea").value = getEditorDraftValue(
    item,
    language,
    "revisionNote",
    "",
  );
  group.append(noteField);

  const actions = document.createElement("div");
  actions.className = "content-workspace-form-actions";
  const save = document.createElement("button");
  save.className = "admin-work-zone-button is-primary";
  save.type = "submit";
  setWorkspaceTranslatedText(
    save,
    language === "en"
      ? "content_workspace_save_english"
      : "content_workspace_save_french",
    language === "en" ? "Save English" : "Save French",
  );
  actions.append(save);
  group.append(actions);
  form.append(group);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveContentLanguage(item, language, form, save);
  });

  return form;
}

function getEditorDraftKey(item, language) {
  return `${item._id}:${language}`;
}

function getEditorDraftValue(item, language, field, fallback) {
  const draft = contentWorkspaceState.editorDrafts.get(
    getEditorDraftKey(item, language),
  );

  return Object.prototype.hasOwnProperty.call(draft || {}, field)
    ? draft[field]
    : fallback;
}

function captureEditorDrafts(item) {
  contentWorkspaceDetail
    .querySelectorAll(".content-workspace-language-editor")
    .forEach((form) => {
      const language = form.dataset.language;
      if (!language) return;

      contentWorkspaceState.editorDrafts.set(
        getEditorDraftKey(item, language),
        Object.fromEntries(new FormData(form).entries()),
      );
    });
}

function formatWorkspaceDateInput(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function formatWorkspaceDateTimeInput(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function getWorkspaceDateTimeParts(value) {
  const formattedValue = formatWorkspaceDateTimeInput(value);
  const [date = "", time = ""] = formattedValue.split("T");
  return { date, time };
}

function createWorkspaceDateTimeField({
  field,
  label,
  labelKey,
  value,
  required = false,
  includeTime = true,
}) {
  const labelElement = document.createElement("label");
  labelElement.className = "content-workspace-field content-workspace-date-time-field";

  const labelText = document.createElement("span");
  setWorkspaceTranslatedText(labelText, labelKey, label);
  labelElement.append(labelText);

  const dateTime = includeTime
    ? getWorkspaceDateTimeParts(value)
    : { date: formatWorkspaceDateInput(value), time: "" };
  if (!window.CMCENDateTimePicker?.create) {
    const nativeInput = document.createElement("input");
    nativeInput.type = includeTime ? "datetime-local" : "date";
    nativeInput.name = field;
    nativeInput.value = includeTime
      ? formatWorkspaceDateTimeInput(value)
      : dateTime.date;
    nativeInput.required = required;
    labelElement.append(nativeInput);
    return labelElement;
  }

  const valueInput = document.createElement("input");
  valueInput.type = "hidden";
  valueInput.name = field;
  valueInput.value = dateTime.date
    ? includeTime
      ? dateTime.date + "T" + (dateTime.time || "00:00")
      : dateTime.date
    : "";

  const picker = window.CMCENDateTimePicker.create({
    name: field,
    dateName: field + "PickerDate",
    timeName: field + "PickerTime",
    date: dateTime.date,
    time: dateTime.time,
    includeTime,
    label: getText(labelKey, label),
    placeholder: includeTime
      ? getText("timers_date_time_placeholder", "Select date and time")
      : getText(labelKey, label),
    timeLabel: getText("timers_picker_time", "Time"),
    clearLabel: getText("timers_picker_clear", "Clear"),
    doneLabel: getText("timers_picker_done", "Done"),
    locale: getContentWorkspaceLocale(),
    onInput: ({ date, time }) => {
      valueInput.value = date
        ? includeTime
          ? date + "T" + (time || "00:00")
          : date
        : "";
    },
  });

  labelElement.append(valueInput, picker);
  return labelElement;
}

function createWorkspaceEditorField({
  field,
  label,
  labelKey,
  value = "",
  type = "text",
  multiline = false,
  options = [],
  checked = false,
  required = false,
}) {
  const labelElement = document.createElement("label");
  labelElement.className = "content-workspace-field";
  const labelText = document.createElement("span");
  setWorkspaceTranslatedText(labelText, labelKey, label);

  let control;
  if (options.length) {
    control = document.createElement("select");
    const optionValues = new Set(options.map((option) => option.value));
    if (value && !optionValues.has(value)) {
      options = [
        { value, label: value },
        ...options,
      ];
    }

    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      if (option.labelKey) {
        setWorkspaceTranslatedText(
          optionElement,
          option.labelKey,
          option.label,
        );
      } else {
        optionElement.textContent = option.label;
      }
      optionElement.selected = option.value === value;
      control.append(optionElement);
    });
  } else {
    control = document.createElement(multiline ? "textarea" : "input");
    if (multiline) {
      control.rows = 4;
    } else {
      control.type = type;
    }
    control.value = String(value || "");
  }

  control.name = field;
  control.required = required;
  if (type === "checkbox") {
    control.type = "checkbox";
    control.checked = checked;
    control.value = "true";
    labelElement.classList.add("is-checkbox");
  }

  labelElement.append(labelText, control);
  return labelElement;
}

function createWorkspaceFormActions(button) {
  const actions = document.createElement("div");
  actions.className = "content-workspace-form-actions";
  actions.append(button);
  return actions;
}

function getWorkspaceOption(value, labelKey, label) {
  return { value, labelKey, label };
}

function getEventDetailsFields(item) {
  return [
    createWorkspaceEditorField({
      field: "city",
      label: "City",
      labelKey: "event_city",
      value: item.content?.city,
    }),
    createWorkspaceEditorField({
      field: "provinceRegion",
      label: "Province or region",
      labelKey: "event_province_region",
      value: item.content?.provinceRegion,
      options: [
        getWorkspaceOption("", "event_select_option", "Select an option"),
        ...[
          "AB",
          "BC",
          "MB",
          "NB",
          "NL",
          "NS",
          "NT",
          "NU",
          "ON",
          "PE",
          "QC",
          "SK",
          "YT",
          "International",
        ].map((value) =>
          getWorkspaceOption(
            value,
            `region_${value.toLowerCase()}`,
            value,
          ),
        ),
      ],
    }),
    createWorkspaceEditorField({
      field: "organizingEntity",
      label: "Organizing entity",
      labelKey: "event_organizing_entity",
      value: item.content?.organizingEntity,
      options: [
        getWorkspaceOption("", "event_select_option", "Select an option"),
        ...["branch", "association", "foundation", "museum"].map((value) =>
          getWorkspaceOption(value, `entity_${value}`, value),
        ),
      ],
    }),
    createWorkspaceEditorField({
      field: "eventType",
      label: "Event type",
      labelKey: "event_type",
      value: item.content?.eventType,
      options: [
        getWorkspaceOption("", "event_select_option", "Select an option"),
        ...[
          "conference",
          "mess-function",
          "ceremony",
          "training",
          "social",
          "other",
        ].map((value) =>
          getWorkspaceOption(
            value,
            `event_type_${value.replace(/-/gu, "_")}`,
            value,
          ),
        ),
      ],
    }),
    createWorkspaceDateTimeField({
      field: "startDate",
      label: "Start date and time",
      labelKey: "content_workspace_start_date_time",
      value: item.content?.startDate,
      required: true,
    }),
    createWorkspaceDateTimeField({
      field: "endDate",
      label: "End date and time",
      labelKey: "content_workspace_end_date_time",
      value: item.content?.endDate,
    }),
    createWorkspaceEditorField({
      field: "timezone",
      label: "Event timezone",
      labelKey: "event_timezone",
      value: item.content?.timezone,
      options: [
        getWorkspaceOption("", "event_select_option", "Select an option"),
        ...[
          "America/St_Johns",
          "America/Halifax",
          "America/Toronto",
          "America/Winnipeg",
          "America/Edmonton",
          "America/Vancouver",
        ].map((value) => getWorkspaceOption(value, "", value)),
      ],
    }),
    createWorkspaceEditorField({
      field: "allDay",
      label: "All-day event",
      labelKey: "event_all_day",
      type: "checkbox",
      checked: item.content?.allDay === true,
    }),
    createWorkspaceEditorField({
      field: "contentArea",
      label: "Content area",
      labelKey: "content_workspace_content_area",
      value: item.content?.contentArea || "general",
      options: ["general", "branch", "association", "foundation", "museum"].map(
        (value) => getWorkspaceOption(value, "", value),
      ),
    }),
    createWorkspaceEditorField({
      field: "imagePath",
      label: "Event image URL",
      labelKey: "content_workspace_event_image_url",
      value: item.content?.imagePath,
      type: "url",
    }),
  ];
}

function getRetirementDetailsFields(item) {
  const retiree = item.content?.retiree || {};
  return [
    createWorkspaceEditorField({
      field: "retireeRank",
      label: "Rank at retirement",
      labelKey: "retirement_rank",
      value: retiree.rank,
    }),
    createWorkspaceEditorField({
      field: "retireeFirstName",
      label: "First name",
      labelKey: "retirement_first_name",
      value: retiree.firstName,
    }),
    createWorkspaceEditorField({
      field: "retireeLastName",
      label: "Last name",
      labelKey: "retirement_last_name",
      value: retiree.lastName,
    }),
    createWorkspaceEditorField({
      field: "retireePostNominals",
      label: "Post nominals",
      labelKey: "retirement_post_nominals",
      value: retiree.postNominals,
    }),
    createWorkspaceDateTimeField({
      field: "retirementDate",
      label: "Retirement date",
      labelKey: "retirement_date",
      value: retiree.retirementDate,
      includeTime: false,
    }),
    createWorkspaceEditorField({
      field: "retireeTradeRole",
      label: "MOSID / role",
      labelKey: "retirement_trade_role",
      value: retiree.tradeRole,
    }),
    createWorkspaceEditorField({
      field: "photoUrl",
      label: "Full photo URL",
      labelKey: "content_workspace_photo_url",
      value: item.content?.photoUrl,
      type: "url",
    }),
    createWorkspaceEditorField({
      field: "photoDisplayUrl",
      label: "Display photo URL",
      labelKey: "content_workspace_display_photo_url",
      value: item.content?.photoDisplayUrl,
      type: "url",
    }),
  ];
}

function getLastPostDetailsFields(item) {
  const deceased = item.content?.deceased || {};
  return [
    createWorkspaceEditorField({
      field: "title",
      label: "Internal title",
      labelKey: "content_workspace_internal_title",
      value: item.content?.title,
    }),
    createWorkspaceEditorField({
      field: "slug",
      label: "Slug",
      labelKey: "content_workspace_slug",
      value: item.content?.slug,
    }),
    createWorkspaceEditorField({
      field: "deceasedFullRank",
      label: "Full rank",
      labelKey: "last_post_full_rank",
      value: deceased.fullRank,
    }),
    createWorkspaceEditorField({
      field: "deceasedFirstName",
      label: "First name",
      labelKey: "last_post_first_name",
      value: deceased.firstName,
    }),
    createWorkspaceEditorField({
      field: "deceasedSurname",
      label: "Surname",
      labelKey: "last_post_surname",
      value: deceased.surname,
    }),
    createWorkspaceEditorField({
      field: "deceasedPostNominal",
      label: "Post-nominal",
      labelKey: "last_post_post_nominal",
      value: deceased.postNominal,
    }),
    createWorkspaceEditorField({
      field: "imageUrl",
      label: "Full image URL",
      labelKey: "content_workspace_image_url",
      value: item.content?.imageUrl,
      type: "url",
    }),
    createWorkspaceEditorField({
      field: "imageDisplayUrl",
      label: "Display image URL",
      labelKey: "content_workspace_display_image_url",
      value: item.content?.imageDisplayUrl,
      type: "url",
    }),
    createWorkspaceEditorField({
      field: "photoUrl",
      label: "Legacy photo URL",
      labelKey: "content_workspace_legacy_photo_url",
      value: item.content?.photoUrl,
      type: "url",
    }),
  ];
}

function createContentWorkspaceRecordEditor(item) {
  const fields = {
    event: getEventDetailsFields,
    retirementMessage: getRetirementDetailsFields,
    lastPost: getLastPostDetailsFields,
    retirementComment: () => [
      createWorkspaceEditorField({
        field: "body",
        label: "Comment",
        labelKey: "content_workspace_comment_body",
        value: item.content?.body,
        multiline: true,
      }),
    ],
  }[item.type]?.(item);

  if (!fields?.length) return null;

  const section = document.createElement("section");
  section.className = "content-workspace-record-editor";
  const heading = document.createElement("h2");
  const headingByType = {
    event: ["content_workspace_event_details", "Event details"],
    retirementMessage: [
      "content_workspace_retirement_details",
      "Retirement details",
    ],
    lastPost: ["content_workspace_last_post_details", "Last Post details"],
    retirementComment: ["content_workspace_comment_details", "Comment details"],
  }[item.type];
  setWorkspaceTranslatedText(heading, ...headingByType);

  const form = document.createElement("form");
  form.className = "content-workspace-record-form";
  form.append(...fields);
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  setWorkspaceTranslatedText(
    save,
    "content_workspace_save_details",
    "Save details",
  );
  form.append(createWorkspaceFormActions(save));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveContentWorkspaceRecord(item, form, save);
  });

  section.append(heading, form);
  return section;
}

function createReadOnlyComment(item) {
  const notice = document.createElement("p");
  notice.className = "content-workspace-read-only";
  setWorkspaceTranslatedText(
    notice,
    "content_workspace_comment_original",
    "Original member comment",
  );

  const body = document.createElement("blockquote");
  body.className = "content-workspace-comment-body";
  body.textContent = String(item.content?.body || "").trim();

  return [notice, body];
}

function createReadOnlyLanguage(item, language) {
  const languageName = getText(
    language === "en" ? "language_en" : "language_fr",
    language === "en" ? "English" : "French",
  );
  const section = document.createElement("section");
  section.className = "content-workspace-read-only-language";
  const heading = document.createElement("h3");
  setWorkspaceTranslatedText(
    heading,
    language === "en" ? "language_en" : "language_fr",
    languageName,
  );
  section.append(heading);

  if (item.type === "event") {
    const fields = [
      [
        "title",
        "content_workspace_field_title",
        getText("content_workspace_field_title", "Title"),
      ],
      [
        "location",
        "content_workspace_field_location",
        getText("content_workspace_field_location", "Location"),
      ],
      [
        "description",
        "content_workspace_field_description",
        getText("content_workspace_field_description", "Description"),
      ],
      [
        "registration",
        "content_workspace_field_registration",
        getText("content_workspace_field_registration", "Registration details"),
      ],
    ];
    const values = document.createElement("dl");

    fields.forEach(([field, labelKey, label]) => {
      const term = document.createElement("dt");
      setWorkspaceTranslatedText(term, labelKey, label);
      const description = document.createElement("dd");
      description.textContent = String(item.content?.[field]?.[language] || "");
      values.append(term, description);
    });

    section.append(values);
    return section;
  }

  const message = document.createElement("p");
  message.textContent = getMessageForLanguage(item, language);
  section.append(message);
  return section;
}

function createReadOnlyCopy(item) {
  const copy = document.createElement("section");
  copy.className = "content-workspace-copy";
  const heading = document.createElement("h2");
  setWorkspaceTranslatedText(
    heading,
    "content_workspace_public_copy",
    "Public copy",
  );
  const languages = document.createElement("div");
  languages.className = "content-workspace-language-grid";
  languages.append(
    createReadOnlyLanguage(item, "en"),
    createReadOnlyLanguage(item, "fr"),
  );
  copy.append(heading, languages);
  return copy;
}

function getWorkspaceUserName(user) {
  if (!user || typeof user !== "object") {
    return getText("unknown_user", "Unknown user");
  }

  return (
    user.accountName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.email ||
    getText("unknown_user", "Unknown user")
  );
}

function getWorkspaceRelationship(value) {
  const relationship = String(value || "").trim();
  if (!relationship) return "—";

  return getText(`relationship_${relationship}`, relationship);
}

function createWorkspaceSubmissionSection(headingKey, heading, fields) {
  const section = document.createElement("section");
  section.className = "content-workspace-submission-section";
  const title = document.createElement("h3");
  setWorkspaceTranslatedText(title, headingKey, heading);
  const list = document.createElement("dl");
  list.className = "content-workspace-submission-grid";

  fields.forEach(({ labelKey, label, value, wide = false }) => {
    const row = document.createElement("div");
    row.className = "content-workspace-submission-item";
    row.classList.toggle("is-wide", wide);
    const term = document.createElement("dt");
    setWorkspaceTranslatedText(term, labelKey, label);
    const description = document.createElement("dd");

    if (value instanceof Element) {
      description.append(value);
    } else {
      description.textContent = value || "—";
    }

    row.append(term, description);
    list.append(row);
  });

  section.append(title, list);
  return section;
}

function createWorkspaceDateValue(value) {
  const date = document.createElement("span");
  date.dataset.contentWorkspaceDate = String(value || "");
  date.textContent = value ? formatWorkspaceDate(value) : "—";
  return date;
}

function createWorkspacePermissionValue(confirmed) {
  const status = document.createElement("span");
  status.className = confirmed ? "is-confirmed" : "is-unconfirmed";
  setWorkspaceTranslatedText(
    status,
    confirmed ? "review_permission_confirmed" : "review_permission_not_recorded",
    confirmed ? "Confirmed" : "Not recorded",
  );
  return status;
}

function createContentWorkspaceSubmissionDetails(item) {
  const content = item.content || {};
  const details = document.createElement("details");
  details.className = "content-workspace-submission-details";
  const summary = document.createElement("summary");
  setWorkspaceTranslatedText(
    summary,
    "review_submission_details",
    "Submission and authorization details",
  );
  const body = document.createElement("div");
  body.className = "content-workspace-submission-body";

  if (item.type === "event") {
    const permission = content.publicationPermission || {};
    body.append(
      createWorkspaceSubmissionSection("review_submitter_record", "Submitter record", [
        { labelKey: "event_submitter_rank", label: "Rank", value: content.submitter?.rank },
        {
          labelKey: "event_submitter_first_name",
          label: "First name",
          value: content.submitter?.firstName,
        },
        {
          labelKey: "event_submitter_last_name",
          label: "Last name",
          value: content.submitter?.lastName,
        },
        {
          labelKey: "event_submitter_unit_role",
          label: "Unit or role",
          value: content.submitter?.unitRole,
          wide: true,
        },
        {
          labelKey: "event_submitter_email",
          label: "Email",
          value: content.submitter?.email,
          wide: true,
        },
        {
          labelKey: "event_submitter_phone",
          label: "Phone",
          value: content.submitter?.phone,
          wide: true,
        },
        {
          labelKey: "submitted_by",
          label: "Submitted by",
          value: getWorkspaceUserName(content.createdBy),
          wide: true,
        },
      ]),
      createWorkspaceSubmissionSection(
        "review_authorization_record",
        "Publication authorization",
        [
          {
            labelKey: "review_permission_status",
            label: "Permission status",
            value: createWorkspacePermissionValue(permission.confirmed === true),
          },
          {
            labelKey: "review_confirmed_by",
            label: "Confirmed by",
            value: getWorkspaceUserName(permission.confirmedBy),
            wide: true,
          },
          {
            labelKey: "review_confirmed_on",
            label: "Confirmed on",
            value: createWorkspaceDateValue(permission.confirmedAt),
            wide: true,
          },
        ],
      ),
    );
  }

  if (item.type === "retirementMessage") {
    const consent = content.publicationConsent || {};
    const memberReview = content.memberReviewConfirmation || {};
    body.append(
      createWorkspaceSubmissionSection("review_submitter_record", "Submitter record", [
        {
          labelKey: "retirement_submitter_first_name",
          label: "First name",
          value: content.submitter?.firstName,
        },
        {
          labelKey: "retirement_submitter_last_name",
          label: "Last name",
          value: content.submitter?.lastName,
        },
        {
          labelKey: "retirement_submitter_relationship",
          label: "Relationship",
          value: getWorkspaceRelationship(content.submitter?.relationship),
        },
        {
          labelKey: "retirement_submitter_email",
          label: "Email",
          value: content.submitter?.email,
          wide: true,
        },
        {
          labelKey: "retirement_submitter_unit",
          label: "Unit",
          value: content.submitter?.unit,
          wide: true,
        },
        {
          labelKey: "submitted_by",
          label: "Submitted by",
          value: getWorkspaceUserName(content.createdBy),
          wide: true,
        },
      ]),
      createWorkspaceSubmissionSection(
        "review_authorization_record",
        "Publication authorization",
        [
          {
            labelKey: "retirement_member_review_status",
            label: "Member review confirmation",
            value: createWorkspacePermissionValue(memberReview.confirmed === true),
          },
          {
            labelKey: "review_confirmed_on",
            label: "Confirmed on",
            value: createWorkspaceDateValue(memberReview.confirmedAt),
          },
          {
            labelKey: "retirement_publication_ack_status",
            label: "Publication acknowledgement",
            value: createWorkspacePermissionValue(consent.confirmed === true),
          },
          {
            labelKey: "review_confirmed_on",
            label: "Confirmed on",
            value: createWorkspaceDateValue(consent.confirmedAt),
          },
        ],
      ),
    );
  }

  if (item.type === "lastPost") {
    const permission = content.publicationPermission || {};
    body.append(
      createWorkspaceSubmissionSection("last_post_submitter_heading", "Submitter", [
        { labelKey: "rank", label: "Rank", value: content.submitter?.rank },
        { labelKey: "first_name", label: "First name", value: content.submitter?.firstName },
        { labelKey: "last_name", label: "Last name", value: content.submitter?.lastName },
        { labelKey: "email", label: "Email", value: content.submitter?.email, wide: true },
        {
          labelKey: "submitted_by",
          label: "Submitted by",
          value: getWorkspaceUserName(content.createdBy),
          wide: true,
        },
      ]),
      createWorkspaceSubmissionSection(
        "review_authorization_record",
        "Publication authorization",
        [
          {
            labelKey: "review_permission_status",
            label: "Permission status",
            value: createWorkspacePermissionValue(permission.confirmed === true),
          },
          {
            labelKey: "review_confirmed_by",
            label: "Confirmed by",
            value: getWorkspaceUserName(permission.confirmedBy),
            wide: true,
          },
          {
            labelKey: "review_confirmed_on",
            label: "Confirmed on",
            value: createWorkspaceDateValue(permission.confirmedAt),
            wide: true,
          },
        ],
      ),
    );
  }

  if (item.type === "retirementComment") {
    body.append(
      createWorkspaceSubmissionSection("review_submitter_record", "Submitter record", [
        {
          labelKey: "submitted_by",
          label: "Submitted by",
          value: getWorkspaceUserName(content.author),
        },
        {
          labelKey: "email",
          label: "Email",
          value: content.author?.email,
          wide: true,
        },
        {
          labelKey: "submitted_on",
          label: "Submitted on",
          value: createWorkspaceDateValue(content.createdAt),
          wide: true,
        },
      ]),
    );
  }

  details.append(summary, body);
  return details;
}

function createRejectionReason(item) {
  const reason = String(item.rejectionReason || "").trim();
  if (item.status !== "rejected" || !reason) return null;

  const section = document.createElement("section");
  section.className = "content-workspace-rejection-reason";
  const heading = document.createElement("h2");
  setWorkspaceTranslatedText(
    heading,
    "content_workspace_rejection_reason",
    "Rejection reason",
  );
  const body = document.createElement("p");
  body.textContent = reason;
  section.append(heading, body);
  return section;
}

function createContentWorkspaceReviewActions(item) {
  if (item.status !== "pending") return null;

  const route = contentWorkspaceReviewRoutes[item.type];
  if (!route) return null;

  const decision = document.createElement("section");
  decision.className = "content-workspace-review-decision";
  const copy = document.createElement("div");
  copy.className = "content-workspace-review-copy";
  const heading = document.createElement("h2");
  setWorkspaceTranslatedText(
    heading,
    "content_workspace_review",
    "Review decision",
  );
  const help = document.createElement("p");
  setWorkspaceTranslatedText(
    help,
    "content_workspace_review_help",
    "Review the public copy before making a final decision.",
  );
  copy.append(heading, help);

  const prompt = document.createElement("p");
  prompt.className = "content-workspace-review-prompt";
  prompt.setAttribute("role", "status");
  prompt.hidden = true;

  const rejectionField = document.createElement("div");
  rejectionField.className = "content-workspace-rejection-field";
  const rejectionLabel = document.createElement("label");
  const rejectionId = `content-workspace-rejection-${item._id}`;
  rejectionLabel.htmlFor = rejectionId;
  const rejectionLabelText = document.createElement("span");
  setWorkspaceTranslatedText(
    rejectionLabelText,
    "content_workspace_rejection_reason",
    "Rejection reason",
  );
  const rejectionReason = document.createElement("textarea");
  rejectionReason.id = rejectionId;
  rejectionReason.rows = 3;
  rejectionReason.maxLength = 2000;
  rejectionReason.dataset.i18nPlaceholder = "rejection_reason_placeholder";
  rejectionReason.placeholder = getText(
    "rejection_reason_placeholder",
    "Explain what needs to be corrected…",
  );
  rejectionLabel.append(rejectionLabelText, rejectionReason);
  rejectionField.append(rejectionLabel);

  const actionMessage = document.createElement("p");
  actionMessage.className = "content-workspace-review-message";
  actionMessage.setAttribute("role", "alert");
  actionMessage.hidden = true;

  const actions = document.createElement("div");
  actions.className = "content-workspace-review-actions";
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "admin-work-zone-button is-danger";
  const publish = document.createElement("button");
  publish.type = "button";
  publish.className = "admin-work-zone-button is-primary";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "admin-work-zone-button is-secondary";
  setWorkspaceTranslatedText(cancel, "content_workspace_cancel_review", "Cancel");

  let pendingAction = "";

  function resetDecision() {
    pendingAction = "";
    prompt.hidden = true;
    rejectionField.hidden = true;
    actionMessage.hidden = true;
    actionMessage.textContent = "";
    reject.hidden = false;
    publish.hidden = false;
    cancel.hidden = true;
    setWorkspaceTranslatedText(reject, "content_workspace_reject", "Reject");
    setWorkspaceTranslatedText(publish, "content_workspace_publish", "Publish");
  }

  function prepareDecision(action) {
    if (pendingAction === action) {
      submitDecision(action);
      return;
    }

    pendingAction = action;
    setWorkspaceTranslatedText(
      prompt,
      action === "publish"
        ? "content_workspace_publish_confirmation"
        : "content_workspace_reject_confirmation",
      action === "publish"
        ? "Publishing makes this content visible on the public site. Confirm when you are ready."
        : "This content will be rejected and the reason will be shared with the submitter. Confirm when you are ready.",
    );
    prompt.hidden = false;
    rejectionField.hidden = action !== "reject";
    reject.hidden = action !== "reject";
    publish.hidden = action !== "publish";
    cancel.hidden = false;

    if (action === "publish") {
      setWorkspaceTranslatedText(
        publish,
        "content_workspace_confirm_publish",
        "Confirm publish",
      );
      publish.focus();
      return;
    }

    setWorkspaceTranslatedText(
      reject,
      "content_workspace_confirm_reject",
      "Confirm rejection",
    );
    rejectionReason.focus();
  }

  async function submitDecision(action) {
    const reason = rejectionReason.value.trim();

    if (action === "reject" && !reason) {
      setWorkspaceTranslatedText(
        actionMessage,
        "content_workspace_rejection_reason_required",
        "Enter a reason before rejecting this content.",
      );
      actionMessage.hidden = false;
      rejectionReason.focus();
      return;
    }

    const buttons = [reject, publish, cancel];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    setWorkspaceTranslatedText(
      action === "publish" ? publish : reject,
      action === "publish"
        ? "content_workspace_publishing"
        : "content_workspace_rejecting",
      action === "publish" ? "Publishing…" : "Rejecting…",
    );

    try {
      await contentWorkspaceApiJson(route(item._id), {
        method: "PATCH",
        body: {
          action,
          rejectionReason: action === "reject" ? reason : undefined,
        },
      });
      contentWorkspaceState.editorDrafts.delete(getEditorDraftKey(item, "en"));
      contentWorkspaceState.editorDrafts.delete(getEditorDraftKey(item, "fr"));
      setWorkspaceMessage(
        getText(
          action === "publish"
            ? "content_workspace_publish_success"
            : "content_workspace_reject_success",
          action === "publish"
            ? "Content published successfully."
            : "Content rejected successfully.",
        ),
        "success",
      );
      await loadContentWorkspace({ preserveSelection: true });
    } catch (error) {
      actionMessage.textContent = error.message;
      actionMessage.hidden = false;
      buttons.forEach((button) => {
        button.disabled = false;
      });
      pendingAction = "";
      prepareDecision(action);
    }
  }

  reject.addEventListener("click", () => prepareDecision("reject"));
  publish.addEventListener("click", () => prepareDecision("publish"));
  cancel.addEventListener("click", resetDecision);

  resetDecision();
  actions.append(reject, publish, cancel);
  decision.append(copy, prompt, rejectionField, actionMessage, actions);
  return decision;
}

function createRemovalActions(item) {
  const actions = document.createElement("div");
  actions.className = "content-workspace-removal-actions";
  const canHide = contentWorkspaceState.user?.permissions?.canHideContent === true;
  const canRestore =
    contentWorkspaceState.user?.permissions?.canRestoreContent === true;

  if (item.status === "hidden" && canRestore) {
    const restore = document.createElement("button");
    restore.className = "admin-work-zone-button is-secondary";
    restore.type = "button";
    setWorkspaceTranslatedText(
      restore,
      "content_workspace_restore",
      "Restore content",
    );
    restore.addEventListener("click", () => changeContentVisibility(item, "restore"));
    actions.append(restore);
  }

  if (item.status !== "hidden" && item.status !== "pending" && canHide) {
    const remove = document.createElement("button");
    remove.className = "admin-work-zone-button is-danger";
    remove.type = "button";
    setWorkspaceTranslatedText(
      remove,
      "content_workspace_remove",
      "Remove from public view",
    );
    remove.addEventListener("click", () => changeContentVisibility(item, "remove"));
    actions.append(remove);
  }

  return actions;
}

function renderContentWorkspaceDetail() {
  contentWorkspaceDetail.replaceChildren();
  const item = getSelectedContentWorkspaceItem();

  if (!item) {
    const empty = document.createElement("p");
    empty.className = "content-workspace-detail-empty";
    setWorkspaceTranslatedText(
      empty,
      "content_workspace_select",
      "Choose a record to view its content and history.",
    );
    contentWorkspaceDetail.append(empty);
    return;
  }

  const header = document.createElement("header");
  header.className = "content-workspace-detail-heading";
  const title = document.createElement("h2");
  title.textContent = getItemTitle(item);
  const actions = document.createElement("div");
  actions.className = "content-workspace-detail-actions";
  actions.append(createStatusBadge(item.status));
  const publicContentLink = createPublicContentLink(item);

  header.append(title, createDetailInfo(item), actions);
  if (publicContentLink) header.append(publicContentLink);
  contentWorkspaceDetail.append(header);

  const canEditPublicCopy =
    item.type !== "retirementComment" &&
    ["pending", "published"].includes(item.status);

  if (canEditPublicCopy) {
    const copy = document.createElement("section");
    copy.className = "content-workspace-copy";
    const copyHeading = document.createElement("h2");
    setWorkspaceTranslatedText(
      copyHeading,
      "content_workspace_public_copy",
      "Public copy",
    );
    copy.append(copyHeading);

    const editors = document.createElement("div");
    editors.className = "content-workspace-language-editors";
    editors.append(
      createLanguageEditor(item, "en"),
      createLanguageEditor(item, "fr"),
    );
    copy.append(editors);

    contentWorkspaceDetail.append(copy);
  } else if (item.type === "retirementComment") {
    const comment = document.createElement("section");
    comment.className = "content-workspace-copy";
    const heading = document.createElement("h2");
    setWorkspaceTranslatedText(
      heading,
      "content_workspace_public_copy",
      "Public copy",
    );
    comment.append(heading, ...createReadOnlyComment(item));
    contentWorkspaceDetail.append(comment);
  } else {
    contentWorkspaceDetail.append(createReadOnlyCopy(item));
  }

  const recordEditor = createContentWorkspaceRecordEditor(item);
  if (recordEditor) {
    contentWorkspaceDetail.append(recordEditor);
  }

  contentWorkspaceDetail.append(createContentWorkspaceSubmissionDetails(item));

  const reviewActions = createContentWorkspaceReviewActions(item);
  if (reviewActions) {
    contentWorkspaceDetail.append(reviewActions);
  }

  const rejectionReason = createRejectionReason(item);
  if (rejectionReason) {
    contentWorkspaceDetail.append(rejectionReason);
  }

  const history = document.createElement("section");
  history.className = "content-workspace-history";
  const historyHeading = document.createElement("h2");
  setWorkspaceTranslatedText(
    historyHeading,
    "content_workspace_history",
    "Revision history",
  );
  const revisions = document.createElement("div");
  revisions.className = "content-workspace-revisions";
  setWorkspaceTranslatedText(
    revisions,
    "content_workspace_history_loading",
    "Loading revision history…",
  );
  history.append(historyHeading, revisions);
  contentWorkspaceDetail.append(history);

  const removalActions = createRemovalActions(item);
  if (removalActions.childElementCount) {
    contentWorkspaceDetail.append(removalActions);
  }

  loadRevisionHistory(item, revisions);
}

function getRevisionActor(revision) {
  const actor = revision?.actorSnapshot || {};
  return actor.accountName || actor.username || getText("unknown_user", "Unknown user");
}

function getRevisionFieldTranslation(field) {
  return {
    title: ["content_workspace_field_title", "Title"],
    location: ["content_workspace_field_location", "Location"],
    description: ["content_workspace_field_description", "Description"],
    registration: [
      "content_workspace_field_registration",
      "Registration details",
    ],
    message: ["content_workspace_field_message", "Message"],
  }[field];
}

function setRevisionFieldLabel(element, field) {
  const translation = getRevisionFieldTranslation(field);

  if (translation) {
    setWorkspaceTranslatedText(element, ...translation);
    return;
  }

  element.textContent = field;
}

function getRevisionChanges(revision) {
  const before = revision.before || {};
  const after = revision.after || {};
  const fields = new Set([
    ...(Array.isArray(revision.fields) ? revision.fields : []),
    ...Object.keys(before),
    ...Object.keys(after),
  ]);

  return [...fields]
    .map((field) => ({
      field,
      before: String(before[field] || ""),
      after: String(after[field] || ""),
    }))
    .filter((change) => change.before !== change.after);
}

function createRevisionValue(value) {
  const element = document.createElement("p");
  element.className = "content-workspace-revision-value";

  if (value) {
    element.textContent = value;
  } else {
    setWorkspaceTranslatedText(
      element,
      "content_workspace_empty_value",
      "No value",
    );
    element.classList.add("is-empty");
  }

  return element;
}

function createRevisionChanges(revision) {
  const changes = document.createElement("div");
  changes.className = "content-workspace-revision-changes";
  const changedFields = getRevisionChanges(revision);

  if (!changedFields.length) {
    const empty = document.createElement("p");
    empty.className = "content-workspace-revision-empty";
    setWorkspaceTranslatedText(
      empty,
      "content_workspace_no_text_changes",
      "No public copy changed in this revision.",
    );
    changes.append(empty);
    return changes;
  }

  changedFields.forEach((change) => {
    const section = document.createElement("section");
    section.className = "content-workspace-revision-change";
    const heading = document.createElement("h3");
    setRevisionFieldLabel(heading, change.field);

    const values = document.createElement("div");
    values.className = "content-workspace-revision-change-values";

    const before = document.createElement("div");
    before.className = "content-workspace-revision-change-value is-before";
    const beforeLabel = document.createElement("span");
    beforeLabel.className = "content-workspace-revision-change-label";
    setWorkspaceTranslatedText(
      beforeLabel,
      "content_workspace_before",
      "Before",
    );
    before.append(beforeLabel, createRevisionValue(change.before));

    const arrow = document.createElement("span");
    arrow.className = "content-workspace-revision-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const after = document.createElement("div");
    after.className = "content-workspace-revision-change-value is-after";
    const afterLabel = document.createElement("span");
    afterLabel.className = "content-workspace-revision-change-label";
    setWorkspaceTranslatedText(afterLabel, "content_workspace_after", "After");
    after.append(afterLabel, createRevisionValue(change.after));

    values.append(before, arrow, after);
    section.append(heading, values);
    changes.append(section);
  });

  return changes;
}

async function loadRevisionHistory(item, container) {
  try {
    const data = await contentWorkspaceApiJson(
      `/api/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item._id)}/revisions`,
    );

    if (getSelectedContentWorkspaceItem()?._id !== item._id) return;

    container.replaceChildren();
    const revisions = Array.isArray(data.revisions) ? data.revisions : [];

    if (!revisions.length) {
      setWorkspaceTranslatedText(
        container,
        "content_workspace_history_empty",
        "No staff revisions have been recorded yet.",
      );
      return;
    }

    revisions.forEach((revision) => {
      const details = document.createElement("details");
      details.className = "content-workspace-revision";
      const summary = document.createElement("summary");
      summary.className = "content-workspace-revision-summary";
      const language = document.createElement("span");
      language.className = "content-workspace-revision-language";
      if (revision.language === "en" || revision.language === "fr") {
        setWorkspaceTranslatedText(
          language,
          revision.language === "en" ? "language_en" : "language_fr",
          revision.language === "en" ? "English" : "French",
        );
      } else {
        language.textContent = getText("content_workspace_history", "Revision history");
      }

      const actor = document.createElement("span");
      actor.className = "content-workspace-revision-actor";
      const actorLabel = document.createElement("span");
      actorLabel.className = "content-workspace-revision-actor-label";
      setWorkspaceTranslatedText(
        actorLabel,
        "content_workspace_edited_by",
        "Edited by",
      );
      actor.append(actorLabel, document.createTextNode(` ${getRevisionActor(revision)}`));

      const date = document.createElement("span");
      date.className = "content-workspace-revision-date";
      date.dataset.revisionCreatedAt = String(revision.createdAt || "");
      date.textContent = formatWorkspaceDate(revision.createdAt);

      summary.append(language, actor, date);

      const body = document.createElement("div");
      body.className = "content-workspace-revision-body";
      const changesHeading = document.createElement("h3");
      setWorkspaceTranslatedText(
        changesHeading,
        "content_workspace_changes",
        "Changes",
      );
      body.append(changesHeading, createRevisionChanges(revision));

      if (revision.note) {
        const note = document.createElement("section");
        note.className = "content-workspace-revision-note";
        const noteHeading = document.createElement("h3");
        setWorkspaceTranslatedText(
          noteHeading,
          "content_workspace_revision_note",
          "Editorial note",
        );
        const noteText = document.createElement("p");
        noteText.textContent = revision.note;
        note.append(noteHeading, noteText);
        body.append(note);
      }

      details.append(summary, body);
      container.append(details);
    });
  } catch (error) {
    if (getSelectedContentWorkspaceItem()?._id !== item._id) return;
    container.textContent = error.message;
  }
}

function getWorkspaceIsoDate(value, { includeTime = false } = {}) {
  const dateValue = String(value || "").trim();
  if (!dateValue) return null;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  return includeTime ? date.toISOString() : date.toISOString().slice(0, 10);
}

function getContentWorkspaceRecordPayload(item, formData) {
  if (item.type === "event") {
    return {
      city: String(formData.get("city") || ""),
      provinceRegion: String(formData.get("provinceRegion") || ""),
      organizingEntity: String(formData.get("organizingEntity") || ""),
      eventType: String(formData.get("eventType") || ""),
      startDate: getWorkspaceIsoDate(formData.get("startDate"), {
        includeTime: true,
      }),
      endDate: getWorkspaceIsoDate(formData.get("endDate"), {
        includeTime: true,
      }),
      timezone: String(formData.get("timezone") || ""),
      allDay: formData.get("allDay") === "true",
      contentArea: String(formData.get("contentArea") || "general"),
      imagePath: String(formData.get("imagePath") || ""),
    };
  }

  if (item.type === "retirementMessage") {
    return {
      retiree: {
        rank: String(formData.get("retireeRank") || ""),
        firstName: String(formData.get("retireeFirstName") || ""),
        lastName: String(formData.get("retireeLastName") || ""),
        postNominals: String(formData.get("retireePostNominals") || ""),
        retirementDate: getWorkspaceIsoDate(formData.get("retirementDate")),
        tradeRole: String(formData.get("retireeTradeRole") || ""),
      },
      photoUrl: String(formData.get("photoUrl") || ""),
      photoDisplayUrl: String(formData.get("photoDisplayUrl") || ""),
    };
  }

  if (item.type === "lastPost") {
    return {
      title: String(formData.get("title") || ""),
      slug: String(formData.get("slug") || ""),
      deceased: {
        fullRank: String(formData.get("deceasedFullRank") || ""),
        firstName: String(formData.get("deceasedFirstName") || ""),
        surname: String(formData.get("deceasedSurname") || ""),
        postNominal: String(formData.get("deceasedPostNominal") || ""),
      },
      imageUrl: String(formData.get("imageUrl") || ""),
      imageDisplayUrl: String(formData.get("imageDisplayUrl") || ""),
      photoUrl: String(formData.get("photoUrl") || ""),
    };
  }

  if (item.type === "retirementComment") {
    return { body: String(formData.get("body") || "") };
  }

  return null;
}

async function saveContentWorkspaceRecord(item, form, button) {
  const route = contentWorkspaceEditRoutes[item.type];
  const body = getContentWorkspaceRecordPayload(item, new FormData(form));
  if (!route || !body) return;

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const result = await contentWorkspaceApiJson(route(item._id), {
      method: "PATCH",
      body,
    });
    setWorkspaceMessage(
      result.message || getText("content_workspace_details_saved", "Details saved."),
      "success",
    );
    await loadContentWorkspace({ preserveSelection: true });
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

async function saveContentLanguage(item, language, form, button) {
  captureEditorDrafts(item);
  const formData = new FormData(form);
  const note = String(formData.get("revisionNote") || "");
  let path = "";
  let body = { language, note };

  if (item.type === "event") {
    path = `/api/events/${encodeURIComponent(item._id)}/review-content`;
    body.content = {
      title: String(formData.get("title") || ""),
      location: String(formData.get("location") || ""),
      description: String(formData.get("description") || ""),
      registration: String(formData.get("registration") || ""),
    };
  } else if (item.type === "retirementMessage") {
    path = `/api/retirement-messages/${encodeURIComponent(item._id)}/review-content`;
    body.message = String(formData.get("message") || "");
  } else if (item.type === "lastPost") {
    path = `/api/last-posts/${encodeURIComponent(item._id)}/review-content`;
    body.message = String(formData.get("message") || "");
  } else {
    return;
  }

  button.disabled = true;
  try {
    const result = await contentWorkspaceApiJson(path, {
      method: "PATCH",
      body,
    });
    setWorkspaceMessage(
      result.message || getText("content_workspace_saved", "Content saved."),
      "success",
    );
    contentWorkspaceState.editorDrafts.delete(
      getEditorDraftKey(item, language),
    );
    await loadContentWorkspace({ preserveSelection: true });
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function changeContentVisibility(item, action) {
  const isRestore = action === "restore";
  const confirmed = await CMCENModal.confirm(
    isRestore
      ? getText(
          "content_workspace_restore_confirm",
          "Restore this content to its previous status?",
        )
      : getText(
          "content_workspace_remove_confirm",
          "Remove this content from public view? Its history will be preserved.",
        ),
    {
      title: isRestore
        ? getText("content_workspace_restore", "Restore content")
        : getText("content_workspace_remove", "Remove from public view"),
      confirmText: isRestore
        ? getText("content_workspace_restore", "Restore content")
        : getText("content_workspace_remove", "Remove from public view"),
      cancelText: getText("cancel", "Cancel"),
    },
  );

  if (!confirmed) return;

  const route = contentWorkspaceRoutes[item.type];
  if (!route) return;

  try {
    const result = await contentWorkspaceApiJson(
      `${route}/${encodeURIComponent(item._id)}/${isRestore ? "restore" : "hide"}`,
      { method: "PATCH" },
    );
    setWorkspaceMessage(
      result.message ||
        (isRestore
          ? getText("content_workspace_restored", "Content restored.")
          : getText("content_workspace_removed", "Content removed from public view.")),
      "success",
    );
    await loadContentWorkspace({ preserveSelection: true });
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  }
}

async function loadContentWorkspace({
  preserveSelection = false,
  updateSearchParameters = false,
} = {}) {
  if (updateSearchParameters) {
    updateContentWorkspaceSearchParameters();
  }

  const requestId = ++contentWorkspaceState.loadRequestId;
  contentWorkspaceState.isLoading = true;
  renderContentWorkspaceList();

  const query = new URLSearchParams({
    type: contentWorkspaceType.value || "all",
    status: contentWorkspaceStatusFilter.value || "all",
    limit: "100",
  });
  if (contentWorkspaceState.requestedContentId) {
    query.set("id", contentWorkspaceState.requestedContentId);
  }

  try {
    const data = await contentWorkspaceApiJson(`/api/admin/content?${query}`);
    if (requestId !== contentWorkspaceState.loadRequestId) return;

    const previousSelection =
      contentWorkspaceState.requestedContentId ||
      (preserveSelection ? contentWorkspaceState.selectedId : "");
    contentWorkspaceState.items = Array.isArray(data.items) ? data.items : [];
    contentWorkspaceState.selectedId = contentWorkspaceState.items.some(
      (item) => String(item._id) === previousSelection,
    )
      ? previousSelection
      : String(contentWorkspaceState.items[0]?._id || "");
    contentWorkspaceState.requestedContentId = "";
    setWorkspaceMessage(
      contentWorkspaceState.items.length
        ? ""
        : getText("content_workspace_empty", "No content matches these filters."),
    );
  } catch (error) {
    if (requestId !== contentWorkspaceState.loadRequestId) return;

    contentWorkspaceState.items = [];
    contentWorkspaceState.selectedId = "";
    setWorkspaceMessage(error.message, "error");
  } finally {
    if (requestId === contentWorkspaceState.loadRequestId) {
      contentWorkspaceState.isLoading = false;
      renderContentWorkspaceList();
      renderContentWorkspaceDetail();
    }
  }
}

async function initializeContentWorkspace() {
  try {
    const user = await contentWorkspaceApiJson("/api/me");

    if (user.permissions?.canReviewAndPublish !== true) {
      window.location.replace("/dashboard");
      return;
    }

    contentWorkspaceState.user = user;
    applyContentWorkspaceSearchParameters();
    updateContentWorkspaceStatusFilterAppearance();
    await loadContentWorkspace();
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  }
}

function updateContentWorkspaceLanguage() {
  updateContentWorkspaceStatusFilterAppearance();
  updateContentWorkspaceCount();

  contentWorkspaceList
    .querySelectorAll("[data-content-workspace-record-id]")
    .forEach((record) => {
      const item = contentWorkspaceState.items.find(
        (candidate) =>
          String(candidate._id) === record.dataset.contentWorkspaceRecordId,
      );
      const metadata = record.querySelector(".content-workspace-record-meta");

      if (item && metadata) {
        setRecordMetadata(metadata, item);
      }
    });

  const item = getSelectedContentWorkspaceItem();
  const detailInfo = contentWorkspaceDetail.querySelector(
    ".content-workspace-detail-info",
  );

  if (item && detailInfo) {
    setDetailInfo(detailInfo, item);
  }

  contentWorkspaceDetail
    .querySelectorAll("[data-revision-created-at]")
    .forEach((date) => {
      date.textContent = formatWorkspaceDate(date.dataset.revisionCreatedAt);
    });
}

contentWorkspaceType.addEventListener("change", () => {
  contentWorkspaceState.selectedId = "";
  contentWorkspaceState.requestedContentId = "";
  loadContentWorkspace({ updateSearchParameters: true });
});

contentWorkspaceStatusFilter.addEventListener("change", () => {
  contentWorkspaceState.selectedId = "";
  contentWorkspaceState.requestedContentId = "";
  updateContentWorkspaceStatusFilterAppearance();
  loadContentWorkspace({ updateSearchParameters: true });
});

document.addEventListener("languagechange", updateContentWorkspaceLanguage);

updateContentWorkspaceStatusFilterAppearance();
renderContentWorkspaceDetail();
initializeContentWorkspace();
