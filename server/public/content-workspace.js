const contentWorkspaceType = document.getElementById("contentWorkspaceType");
const contentWorkspaceStatusFilter = document.getElementById(
  "contentWorkspaceStatusFilter",
);
const contentWorkspaceSearch = document.getElementById("contentWorkspaceSearch");
const contentWorkspaceTranslationFilter = document.getElementById(
  "contentWorkspaceTranslationFilter",
);
const contentWorkspaceEyebrow = document.getElementById(
  "contentWorkspaceEyebrow",
);
const contentWorkspaceTitle = document.getElementById("contentWorkspaceTitle");
const contentWorkspaceIntro = document.getElementById("contentWorkspaceIntro");
const contentWorkspaceMessage = document.getElementById(
  "contentWorkspaceMessage",
);
const contentWorkspaceList = document.getElementById("contentWorkspaceList");
const contentWorkspaceCount = document.getElementById("contentWorkspaceCount");
const contentWorkspaceLoadMore = document.getElementById(
  "contentWorkspaceLoadMore",
);
const contentWorkspaceLoadMoreButton = document.getElementById(
  "contentWorkspaceLoadMoreButton",
);
const contentWorkspaceLoadMoreLabel = document.getElementById(
  "contentWorkspaceLoadMoreLabel",
);
const contentWorkspaceClearFilters = document.getElementById(
  "contentWorkspaceClearFilters",
);
const contentWorkspaceDetail = document.getElementById(
  "contentWorkspaceDetail",
);
const contentWorkspaceListLoadingTemplate = document.getElementById(
  "contentWorkspaceListLoadingTemplate",
);
const contentWorkspaceDetailLoadingTemplate = document.getElementById(
  "contentWorkspaceDetailLoadingTemplate",
);
const CONTENT_WORKSPACE_PAGE_SIZE = 24;

const contentWorkspaceState = {
  items: [],
  selectedId: "",
  requestedContentId: "",
  user: null,
  isLoading: false,
  isLoadingMore: false,
  isSelecting: false,
  loadRequestId: 0,
  nextCursor: "",
  hasMore: false,
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
  "newsArticle",
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
const contentWorkspaceTranslationStatuses = new Set([
  "all",
  "missing-any",
  "missing-en",
  "missing-fr",
]);
let contentWorkspaceSearchTimeout;

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

function canReviewContentWorkspace() {
  return contentWorkspaceState.user?.permissions?.canReviewAndPublish === true;
}

function canManageContentWorkspaceNews() {
  return contentWorkspaceState.user?.permissions?.canManageNews === true;
}

function canManageContentWorkspaceRsvps() {
  return contentWorkspaceState.user?.permissions?.canManageEventRsvps === true;
}

function canEditContentWorkspaceRecord(item) {
  return item?.type === "newsArticle"
    ? canManageContentWorkspaceNews()
    : canReviewContentWorkspace();
}

function canEditContentWorkspacePublicCopy(item) {
  if (item?.type === "newsArticle") {
    return (
      canManageContentWorkspaceNews() &&
      ["draft", "published", "hidden"].includes(item.status)
    );
  }

  return (
    item?.type !== "retirementComment" &&
    canReviewContentWorkspace() &&
    ["pending", "published", "hidden"].includes(item.status)
  );
}

function canViewContentWorkspaceHistory(item) {
  return item?.type === "newsArticle"
    ? canManageContentWorkspaceNews()
    : canReviewContentWorkspace();
}

function updateContentWorkspaceTypeOptions() {
  const canReview = canReviewContentWorkspace();
  const canManageNews = canManageContentWorkspaceNews();

  [...contentWorkspaceType.options].forEach((option) => {
    const isAvailable =
      option.value === "all" ||
      (option.value === "newsArticle" ? canManageNews : canReview);
    option.hidden = !isAvailable;
    option.disabled = !isAvailable;
  });

  const selected = contentWorkspaceType.selectedOptions[0];
  if (selected && !selected.disabled) return;

  contentWorkspaceType.value = canManageNews ? "newsArticle" : "all";
}

function updateContentWorkspaceModePresentation() {
  setWorkspaceTranslatedText(
    contentWorkspaceEyebrow,
    "content_workspace_eyebrow",
    "Editorial workspace",
  );
  setWorkspaceTranslatedText(
    contentWorkspaceTitle,
    "content_workspace_title",
    "Manage content",
  );
  setWorkspaceTranslatedText(
    contentWorkspaceIntro,
    "content_workspace_intro",
    "Review pending submissions, correct bilingual public copy, and publish, reject, remove, or restore content without losing its history.",
  );
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

function refreshContentWorkspaceNotifications() {
  window.dispatchEvent(new Event("cmcen:content-updated"));
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

function showWorkspaceSuccess(message) {
  setWorkspaceMessage("");
  CMCENUtils.showToast(message, {
    color: "success",
    position: "bottom-right",
    animation: "slide",
  });
}

function applyContentWorkspaceSearchParameters() {
  const searchParameters = new URLSearchParams(window.location.search);
  const type = searchParameters.get("type");
  const status = searchParameters.get("status");
  const translation = searchParameters.get("translation");
  const search = String(searchParameters.get("search") || "").slice(0, 120);
  const contentId = String(searchParameters.get("id") || "").trim();

  if (contentWorkspaceTypes.has(type)) {
    contentWorkspaceType.value = type;
  }

  if (contentWorkspaceStatuses.has(status)) {
    contentWorkspaceStatusFilter.value = status;
  }

  if (contentWorkspaceTranslationStatuses.has(translation)) {
    contentWorkspaceTranslationFilter.value = translation;
  }

  if (search) {
    contentWorkspaceSearch.value = search;
  }

  if (contentId) {
    contentWorkspaceState.selectedId = contentId;
    contentWorkspaceState.requestedContentId = contentId;
  }
}

function updateContentWorkspaceSearchParameters({ includeSelection = false } = {}) {
  const url = new URL(window.location.href);
  const searchParameters = new URLSearchParams();
  const type = contentWorkspaceType.value || "all";
  const status = contentWorkspaceStatusFilter.value || "all";
  const translation = contentWorkspaceTranslationFilter.value || "all";
  const search = contentWorkspaceSearch.value.trim();

  if (type !== "all") {
    searchParameters.set("type", type);
  }
  if (status !== "all") {
    searchParameters.set("status", status);
  }
  if (translation !== "all") {
    searchParameters.set("translation", translation);
  }
  if (search) {
    searchParameters.set("search", search);
  }
  if (includeSelection && contentWorkspaceState.selectedId) {
    searchParameters.set("id", contentWorkspaceState.selectedId);
  }
  url.search = searchParameters.toString();
  window.history.replaceState({}, "", url);
}

function hasContentWorkspaceFilters() {
  const searchParameters = new URLSearchParams(window.location.search);

  return Boolean(
    contentWorkspaceType.value !== "all" ||
      contentWorkspaceStatusFilter.value !== "all" ||
      contentWorkspaceTranslationFilter.value !== "all" ||
      contentWorkspaceSearch.value.trim() ||
      searchParameters.get("id"),
  );
}

function updateContentWorkspaceClearFiltersAction() {
  contentWorkspaceClearFilters.disabled = !hasContentWorkspaceFilters();
}

function clearContentWorkspaceFilters() {
  contentWorkspaceType.value = "all";
  contentWorkspaceStatusFilter.value = "all";
  contentWorkspaceTranslationFilter.value = "all";
  contentWorkspaceSearch.value = "";
  contentWorkspaceState.selectedId = "";
  contentWorkspaceState.requestedContentId = "";
  updateContentWorkspaceStatusFilterAppearance();
  updateContentWorkspaceSearchParameters();
  void loadContentWorkspace();
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

  if (item?.type === "lastPost") {
    const deceased = item.content?.deceased || {};
    const name = [
      deceased.fullRank,
      deceased.firstName,
      deceased.surname,
      deceased.postNominal,
    ]
      .filter(Boolean)
      .join(" ");

    if (name) return name;
  }

  return getItemTitle(item);
}

function getContentWorkspaceMissingLanguages(item) {
  const localizedFields = {
    event: [
      item.content?.title,
      item.content?.location,
      item.content?.description,
      item.content?.registration,
    ],
    retirementMessage: [item.content?.messages],
    lastPost: [item.content?.messages],
    newsArticle: [item.content?.title, item.content?.content],
  }[item?.type];

  if (!localizedFields) return [];

  return ["en", "fr"].filter((language) => {
    const sourceLanguage = language === "en" ? "fr" : "en";

    return localizedFields.some((field) => {
      const value = String(field?.[language] || "").trim();
      const sourceValue = String(field?.[sourceLanguage] || "").trim();

      return !value && Boolean(sourceValue);
    });
  });
}

function setContentWorkspaceTranslationStatus(status, item) {
  const missing = getContentWorkspaceMissingLanguages(item);
  const languages = missing.map((language) =>
    getText(
      language === "en" ? "language_en" : "language_fr",
      language === "en" ? "English" : "French",
    ),
  );

  status.textContent = languages.length
    ? `${getText("translations_missing_label", "Missing translation")}: ${languages.join(", ")}`
    : "";
}

function createContentWorkspaceTranslationStatus(item) {
  const missing = getContentWorkspaceMissingLanguages(item);

  if (!missing.length) return null;

  const status = document.createElement("p");
  status.className =
    "translation-row-status content-workspace-translation-status is-warning";
  setContentWorkspaceTranslationStatus(status, item);
  return status;
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
    newsArticle: ["content_workspace_news", "News stories"],
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

  if (item.type === "newsArticle") {
    return `/news-story?id=${encodeURIComponent(item._id)}`;
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

function updateContentWorkspaceLoadMore() {
  const showLoadMore =
    !contentWorkspaceState.isLoading &&
    contentWorkspaceState.hasMore &&
    contentWorkspaceState.items.length;

  contentWorkspaceLoadMore.hidden = !showLoadMore;
  contentWorkspaceLoadMoreButton.disabled = contentWorkspaceState.isLoadingMore;
  contentWorkspaceLoadMoreButton.setAttribute(
    "aria-busy",
    String(contentWorkspaceState.isLoadingMore),
  );
  setWorkspaceTranslatedText(
    contentWorkspaceLoadMoreLabel,
    contentWorkspaceState.isLoadingMore
      ? "content_workspace_loading_more"
      : "content_workspace_load_more",
    contentWorkspaceState.isLoadingMore ? "Loading more…" : "Load more",
  );
}

function renderContentWorkspaceList() {
  contentWorkspaceList.replaceChildren();
  updateContentWorkspaceCount();
  updateContentWorkspaceClearFiltersAction();
  updateContentWorkspaceLoadMore();
  contentWorkspaceList.setAttribute(
    "aria-busy",
    contentWorkspaceState.isLoading ? "true" : "false",
  );

  if (contentWorkspaceState.isLoading) {
    const loading = document.createElement("span");
    loading.className = "visually-hidden";
    setWorkspaceTranslatedText(
      loading,
      "content_workspace_loading",
      "Loading content…",
    );
    contentWorkspaceList.append(
      loading,
      contentWorkspaceListLoadingTemplate.content.cloneNode(true),
    );
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

    button.append(title, metadata);
    const translationStatus = createContentWorkspaceTranslationStatus(item);

    if (translationStatus) {
      button.append(translationStatus);
    }

    button.append(createStatusBadge(item.status));
    button.addEventListener("click", () => {
      void selectContentWorkspaceItem(item);
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

  if (item.type === "event" || item.type === "newsArticle") {
    const fields = [
      [
        "title",
        "content_workspace_field_title",
        getText("content_workspace_field_title", "Title"),
        false,
      ],
      ...(item.type === "event"
        ? [
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
              getText(
                "content_workspace_field_registration",
                "Registration details",
              ),
              true,
            ],
          ]
        : [
            [
              "content",
              "content_workspace_field_content",
              getText("content_workspace_field_content", "Story"),
              true,
            ],
          ]),
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
  form.append(group);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  form.dataset.initialState = getContentWorkspaceFormState(form);
  form.dataset.hasUnsavedDraft = String(
    contentWorkspaceState.editorDrafts.has(getEditorDraftKey(item, language)),
  );

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
  disabled = false,
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
  control.disabled = disabled;
  if (type === "checkbox") {
    control.type = "checkbox";
    control.checked = checked;
    control.value = "true";
    labelElement.classList.add("is-checkbox");
  }

  labelElement.append(labelText, control);
  return labelElement;
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
      field: "rsvpEnabled",
      label: "Enable RSVPs",
      labelKey: "event_rsvp_enabled",
      type: "checkbox",
      checked: item.content?.rsvpEnabled === true,
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
      field: "photoUrl",
      label: "Legacy photo URL",
      labelKey: "content_workspace_legacy_photo_url",
      value: item.content?.photoUrl,
      type: "url",
    }),
  ];
}

function getNewsArticleDetailsFields(item) {
  const fields = [
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
  ];

  if (item.status !== "hidden") {
    fields.push(
      createWorkspaceEditorField({
        field: "status",
        label: "Publication status",
        labelKey: "content_workspace_status",
        value: item.status,
        options: [
          getWorkspaceOption("draft", "content_workspace_draft", "Draft"),
          getWorkspaceOption(
            "published",
            "content_workspace_published",
            "Published",
          ),
        ],
      }),
    );
  }

  return fields;
}

function getContentWorkspaceImageConfig(item) {
  if (item.type === "event") {
    return {
      field: "imagePath",
      value: item.content?.imagePath,
      uploadSource: "event",
      uploadContext: "event",
      sourceField: "imagePath",
    };
  }

  if (item.type === "retirementMessage") {
    return {
      field: "photoUrl",
      displayField: "photoDisplayUrl",
      value: item.content?.photoUrl,
      displayValue: item.content?.photoDisplayUrl,
      uploadSource: "retirementMessage",
      uploadContext: "retirement-message",
      sourceField: "photoUrl",
      displayAspectRatio: "4:3",
    };
  }

  if (item.type === "lastPost") {
    return {
      field: "imageUrl",
      displayField: "imageDisplayUrl",
      value: item.content?.imageUrl,
      displayValue: item.content?.imageDisplayUrl,
      uploadSource: "lastPostMessage",
      uploadContext: "last-post",
      sourceField: "imageUrl",
      displayAspectRatio: "4:3",
    };
  }

  return null;
}

function setContentWorkspaceImageEditorPreview(editor, imageUrl = "") {
  const preview = editor.querySelector("[data-content-workspace-image-preview]");
  const empty = editor.querySelector("[data-content-workspace-image-empty]");
  const state = editor.querySelector("[data-content-workspace-image-state]");
  const remove = editor.querySelector("[data-content-workspace-image-remove]");
  const hasImage = Boolean(imageUrl);

  editor.classList.toggle("has-image", hasImage);
  preview.hidden = !hasImage;
  empty.hidden = hasImage;
  remove.disabled = !hasImage;

  if (state) {
    setWorkspaceTranslatedText(
      state,
      hasImage
        ? "content_workspace_current_image"
        : "content_workspace_no_image_short",
      hasImage ? "Current image" : "No image",
    );
  }

  if (hasImage) {
    preview.src = imageUrl;
  } else {
    preview.removeAttribute("src");
  }
}

function getContentWorkspaceImageSourceName(item, form) {
  const getValue = (field) => String(form.elements.namedItem(field)?.value || "").trim();

  if (item.type === "event") {
    return getValue("titleEN") || getValue("titleFR") || item.title;
  }

  if (item.type === "retirementMessage") {
    return [
      getValue("retireeRank"),
      getValue("retireeFirstName"),
      getValue("retireeLastName"),
    ].filter(Boolean).join(" ") || item.title;
  }

  if (item.type === "lastPost") {
    return [
      getValue("deceasedFullRank"),
      getValue("deceasedFirstName"),
      getValue("deceasedSurname"),
    ].filter(Boolean).join(" ") || item.title;
  }

  return item.title;
}

function createContentWorkspaceImageEditor(item) {
  const config = getContentWorkspaceImageConfig(item);
  if (!config) return null;

  const section = document.createElement("section");
  section.className = "content-workspace-image-editor";
  section.dataset.contentWorkspaceImageEditor = "true";
  section.dataset.uploadSource = config.uploadSource;
  section.dataset.uploadContext = config.uploadContext;
  section.dataset.sourceField = config.sourceField;
  if (config.displayAspectRatio) {
    section.dataset.displayAspectRatio = config.displayAspectRatio;
  }

  const header = document.createElement("div");
  header.className = "content-workspace-image-heading";
  const heading = document.createElement("h3");
  setWorkspaceTranslatedText(heading, "content_workspace_image", "Image");
  const state = document.createElement("span");
  state.className = "content-workspace-image-state";
  state.dataset.contentWorkspaceImageState = "true";
  header.append(heading, state);

  const previewFrame = document.createElement("div");
  previewFrame.className = "content-workspace-image-preview-frame";

  const preview = document.createElement("img");
  preview.className = "content-workspace-image-preview";
  preview.alt = getText("content_workspace_current_image", "Current image");
  preview.dataset.contentWorkspaceImagePreview = "true";

  const empty = document.createElement("p");
  empty.className = "content-workspace-image-empty";
  empty.dataset.contentWorkspaceImageEmpty = "true";
  setWorkspaceTranslatedText(
    empty,
    "content_workspace_no_image",
    "No image is attached to this submission.",
  );
  previewFrame.append(preview, empty);

  const primaryValue = document.createElement("input");
  primaryValue.type = "hidden";
  primaryValue.name = config.field;
  primaryValue.value = String(config.value || "");

  const displayValue = config.displayField
    ? document.createElement("input")
    : null;
  if (displayValue) {
    displayValue.type = "hidden";
    displayValue.name = config.displayField;
    displayValue.value = String(config.displayValue || "");
  }

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "admin-work-zone-button is-secondary content-workspace-image-upload";
  const uploadText = document.createElement("span");
  setWorkspaceTranslatedText(
    uploadText,
    "content_workspace_choose_image",
    "Choose an image",
  );
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/*";
  file.className = "visually-hidden";
  file.dataset.contentWorkspaceImageFile = "true";
  uploadLabel.append(uploadText, file);

  const hint = document.createElement("p");
  hint.className = "content-workspace-image-hint";
  setWorkspaceTranslatedText(
    hint,
    "content_workspace_image_save_hint",
    "Image changes are applied when you save changes.",
  );

  const actions = document.createElement("div");
  actions.className = "content-workspace-image-actions";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.dataset.contentWorkspaceImageRemove = "true";
  setWorkspaceTranslatedText(
    remove,
    "content_workspace_remove_image",
    "Remove image",
  );
  actions.append(remove, uploadLabel);

  const controls = document.createElement("div");
  controls.className = "content-workspace-image-controls";
  controls.append(hint, actions);

  const media = document.createElement("div");
  media.className = "content-workspace-image-media";
  media.append(previewFrame, controls);

  const initialImageUrl = String(config.displayValue || config.value || "");
  let previewObjectUrl = "";
  file.addEventListener("change", () => {
    const selectedFile = file.files?.[0];
    const form = section.closest(".content-workspace-record-form");
    if (form) {
      form.dataset.hasPendingImageUpload = String(Boolean(selectedFile));
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = selectedFile ? URL.createObjectURL(selectedFile) : "";
    setContentWorkspaceImageEditorPreview(
      section,
      previewObjectUrl || (primaryValue.value ? initialImageUrl : ""),
    );
  });
  remove.addEventListener("click", () => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    file.value = "";
    primaryValue.value = "";
    if (displayValue) displayValue.value = "";
    setContentWorkspaceImageEditorPreview(section, "");
    file.dispatchEvent(new Event("change", { bubbles: true }));
  });

  section.append(
    header,
    media,
    primaryValue,
    ...(displayValue ? [displayValue] : []),
  );
  setContentWorkspaceImageEditorPreview(section, initialImageUrl);
  return section;
}

function createContentWorkspaceRecordEditor(item) {
  const fields = {
    event: getEventDetailsFields,
    retirementMessage: getRetirementDetailsFields,
    lastPost: getLastPostDetailsFields,
    newsArticle: getNewsArticleDetailsFields,
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
    newsArticle: ["content_workspace_news_details", "News story details"],
    retirementComment: ["content_workspace_comment_details", "Comment details"],
  }[item.type];
  setWorkspaceTranslatedText(heading, ...headingByType);

  const form = document.createElement("form");
  form.className = "content-workspace-record-form";
  form.append(...fields);
  const imageEditor = createContentWorkspaceImageEditor(item);
  if (imageEditor) form.append(imageEditor);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  form.dataset.initialState = getContentWorkspaceFormState(form);

  section.append(heading, form);
  return section;
}

function getMemberEventEditorFields(item) {
  const content = item?.content || {};
  const localizedFields = [
    ["title", "content_workspace_field_title", "Title", false],
    ["location", "content_workspace_field_location", "Location", false],
    [
      "description",
      "content_workspace_field_description",
      "Description",
      true,
    ],
    [
      "registration",
      "content_workspace_field_registration",
      "Registration details",
      true,
    ],
  ];
  const fields = [];

  ["en", "fr"].forEach((language) => {
    localizedFields.forEach(([field, labelKey, label, multiline]) => {
      fields.push(
        createWorkspaceEditorField({
          field: `${field}${language.toUpperCase()}`,
          label,
          labelKey,
          value: content[field]?.[language] || "",
          multiline,
        }),
      );
    });
  });

  const eventOptions = {
    provinceRegion: [
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
    ].map((value) => getWorkspaceOption(value, `region_${value.toLowerCase()}`, value)),
    organizingEntity: ["branch", "association", "foundation", "museum"].map(
      (value) => getWorkspaceOption(value, `entity_${value}`, value),
    ),
    eventType: [
      "conference",
      "mess-function",
      "ceremony",
      "training",
      "social",
      "other",
    ].map((value) =>
      getWorkspaceOption(value, `event_type_${value.replace(/-/gu, "_")}`, value),
    ),
    timezone: [
      "America/St_Johns",
      "America/Halifax",
      "America/Toronto",
      "America/Winnipeg",
      "America/Edmonton",
      "America/Vancouver",
    ].map((value) => getWorkspaceOption(value, "", value)),
  };

  fields.push(
    createWorkspaceEditorField({
      field: "city",
      label: "City",
      labelKey: "event_city",
      value: content.city,
      required: true,
    }),
    createWorkspaceEditorField({
      field: "provinceRegion",
      label: "Province or region",
      labelKey: "event_province_region",
      value: content.provinceRegion,
      options: [getWorkspaceOption("", "event_select_option", "Select an option"), ...eventOptions.provinceRegion],
      required: true,
    }),
    createWorkspaceEditorField({
      field: "organizingEntity",
      label: "Organizing entity",
      labelKey: "event_organizing_entity",
      value: content.organizingEntity,
      options: [getWorkspaceOption("", "event_select_option", "Select an option"), ...eventOptions.organizingEntity],
      required: true,
    }),
    createWorkspaceEditorField({
      field: "eventType",
      label: "Event type",
      labelKey: "event_type",
      value: content.eventType,
      options: [getWorkspaceOption("", "event_select_option", "Select an option"), ...eventOptions.eventType],
      required: true,
    }),
    createWorkspaceDateTimeField({
      field: "startDate",
      label: "Start date and time",
      labelKey: "content_workspace_start_date_time",
      value: content.startDate,
      required: true,
    }),
    createWorkspaceDateTimeField({
      field: "endDate",
      label: "End date and time",
      labelKey: "content_workspace_end_date_time",
      value: content.endDate,
    }),
    createWorkspaceEditorField({
      field: "timezone",
      label: "Event timezone",
      labelKey: "event_timezone",
      value: content.timezone,
      options: [getWorkspaceOption("", "event_select_option", "Select an option"), ...eventOptions.timezone],
    }),
    createWorkspaceEditorField({
      field: "allDay",
      label: "All-day event",
      labelKey: "event_all_day",
      type: "checkbox",
      checked: content.allDay !== false,
    }),
    createWorkspaceEditorField({
      field: "rsvpEnabled",
      label: "Enable RSVPs",
      labelKey: "event_rsvp_enabled",
      type: "checkbox",
      checked: content.rsvpEnabled === true,
    }),
    createWorkspaceEditorField({
      field: "publicationPermissionConfirmed",
      label:
        "I confirm I have permission from the chain of command to publish this event.",
      labelKey: "event_permission_confirmation",
      type: "checkbox",
      checked: content.publicationPermission?.confirmed === true,
      required: true,
    }),
  );

  return fields;
}

function getMemberEventPayload(formData) {
  const allDay = formData.get("allDay") === "true";

  return {
    title: {
      en: String(formData.get("titleEn") || ""),
      fr: String(formData.get("titleFr") || ""),
    },
    location: {
      en: String(formData.get("locationEn") || ""),
      fr: String(formData.get("locationFr") || ""),
    },
    description: {
      en: String(formData.get("descriptionEn") || ""),
      fr: String(formData.get("descriptionFr") || ""),
    },
    registration: {
      en: String(formData.get("registrationEn") || ""),
      fr: String(formData.get("registrationFr") || ""),
    },
    city: String(formData.get("city") || ""),
    provinceRegion: String(formData.get("provinceRegion") || ""),
    organizingEntity: String(formData.get("organizingEntity") || ""),
    eventType: String(formData.get("eventType") || ""),
    timezone: allDay ? "" : String(formData.get("timezone") || ""),
    startDate: getWorkspaceIsoDate(formData.get("startDate"), {
      includeTime: !allDay,
    }),
    endDate: getWorkspaceIsoDate(formData.get("endDate"), {
      includeTime: !allDay,
    }),
    allDay,
    rsvpEnabled: formData.get("rsvpEnabled") === "true",
    publicationPermissionConfirmed:
      formData.get("publicationPermissionConfirmed") === "true",
    contentArea: "general",
    publishNow: false,
  };
}

async function saveMemberEvent(item, form, button) {
  const isNew = !item?._id;
  const body = getMemberEventPayload(new FormData(form));

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const result = await contentWorkspaceApiJson(
      isNew ? "/api/events" : `/api/events/${encodeURIComponent(item._id)}`,
      {
        method: isNew ? "POST" : "PATCH",
        body,
      },
    );
    contentWorkspaceState.selectedId = String(result.event?._id || "");
    contentWorkspaceState.requestedContentId = contentWorkspaceState.selectedId;
    updateContentWorkspaceSearchParameters({ includeSelection: true });
    showWorkspaceSuccess(
      result.message ||
        getText(
          isNew ? "event_submit_success_pending" : "event_update_success_pending",
          isNew
            ? "Event submitted for review."
            : "Event updated and submitted for review.",
        ),
    );
    await loadContentWorkspace({ preserveSelection: true });
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function createMemberEventFormSection({
  index,
  headingKey,
  heading,
  introKey,
  intro,
  fields,
}) {
  const section = document.createElement("section");
  section.className = "event-form-section event-section--full-bleed-heading";
  const sectionHeading = document.createElement("header");
  sectionHeading.className = "event-section-heading";
  const sectionIndex = document.createElement("span");
  sectionIndex.className = "event-section-index";
  sectionIndex.textContent = index;
  const copy = document.createElement("div");
  const title = document.createElement("h2");
  setWorkspaceTranslatedText(title, headingKey, heading);
  const description = document.createElement("p");
  setWorkspaceTranslatedText(description, introKey, intro);
  copy.append(title, description);
  sectionHeading.append(sectionIndex, copy);

  const sectionContent = document.createElement("div");
  sectionContent.className = "event-section-content";
  const grid = document.createElement("div");
  grid.className = "event-form-grid";
  fields.forEach((field) => {
    field.classList.add("event-field");
    grid.append(field);
  });
  sectionContent.append(grid);
  section.append(sectionHeading, sectionContent);
  return section;
}

function createMemberEventCopySection(fields) {
  const section = document.createElement("section");
  section.className = "event-form-section event-section--full-bleed-heading";
  const sectionHeading = document.createElement("header");
  sectionHeading.className = "event-section-heading";
  const sectionIndex = document.createElement("span");
  sectionIndex.className = "event-section-index";
  sectionIndex.textContent = "01";
  const copy = document.createElement("div");
  const title = document.createElement("h2");
  setWorkspaceTranslatedText(
    title,
    "content_workspace_public_copy",
    "Public copy",
  );
  const description = document.createElement("p");
  setWorkspaceTranslatedText(
    description,
    "content_workspace_event_copy_intro",
    "Provide the event content in English and French.",
  );
  copy.append(title, description);
  sectionHeading.append(sectionIndex, copy);

  const sectionContent = document.createElement("div");
  sectionContent.className = "event-section-content";
  const languages = document.createElement("div");
  languages.className = "event-language-grid";

  ["en", "fr"].forEach((language, index) => {
    const panel = document.createElement("section");
    panel.className = "event-language-panel";
    const panelHeading = document.createElement("header");
    panelHeading.className = "event-language-heading";
    const panelHeadingCopy = document.createElement("div");
    const languageCode = document.createElement("span");
    languageCode.className = "event-language-code";
    languageCode.textContent = language.toUpperCase();
    const languageName = document.createElement("h2");
    setWorkspaceTranslatedText(
      languageName,
      language === "en" ? "language_en" : "language_fr",
      language === "en" ? "English" : "French",
    );
    panelHeadingCopy.append(languageCode, languageName);
    panelHeading.append(panelHeadingCopy);
    panel.append(panelHeading);

    fields.slice(index * 4, index * 4 + 4).forEach((field) => {
      field.classList.add("event-field");
      panel.append(field);
    });
    languages.append(panel);
  });

  sectionContent.append(languages);
  section.append(sectionHeading, sectionContent);
  return section;
}

function createMemberEventAuthorization(item) {
  const section = document.createElement("section");
  section.className = "event-authorization-section";
  const heading = document.createElement("header");
  heading.className = "event-authorization-heading";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "event-section-eyebrow";
  setWorkspaceTranslatedText(
    eyebrow,
    "event_authorization_eyebrow",
    "Publication authorization",
  );
  const title = document.createElement("h2");
  setWorkspaceTranslatedText(
    title,
    "event_authorization_heading",
    "Chain-of-command confirmation",
  );
  copy.append(eyebrow, title);
  heading.append(copy);

  const label = document.createElement("label");
  label.className = "event-authorization-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "publicationPermissionConfirmed";
  input.value = "true";
  input.required = true;
  input.checked = item?.content?.publicationPermission?.confirmed === true;
  const text = document.createElement("span");
  const confirmation = document.createElement("strong");
  setWorkspaceTranslatedText(
    confirmation,
    "event_permission_confirmation",
    "I confirm I have permission from the chain of command to publish this event.",
  );
  text.append(confirmation);
  label.append(input, text);
  section.append(heading, label);
  return section;
}

function createMemberEventEditor(item = null) {
  const fields = getMemberEventEditorFields(item);
  const copyFields = fields.slice(0, 8);
  const detailsFields = fields.slice(8, -1);
  const section = document.createElement("section");
  section.className = "content-workspace-member-event-editor";
  const form = document.createElement("form");
  form.className = "event-submit-form content-workspace-member-event-form";
  form.append(
    createMemberEventCopySection(copyFields),
    createMemberEventFormSection({
      index: "02",
      headingKey: "content_workspace_event_details",
      heading: "Event details",
      introKey: "content_workspace_event_details_intro",
      intro: "Add the location, schedule, and event information.",
      fields: detailsFields,
    }),
    createMemberEventAuthorization(item),
  );
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "event-submit-button";
  setWorkspaceTranslatedText(
    save,
    item ? "save_event_changes" : "submit_event_button",
    item ? "Save Changes" : "Submit Event",
  );
  const submitOptions = document.createElement("footer");
  submitOptions.className = "event-submit-options";
  submitOptions.append(save);
  form.append(submitOptions);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveMemberEvent(item, form, save);
  });

  section.append(form);
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

  if (item.type === "event" || item.type === "newsArticle") {
    const fields = [
      [
        "title",
        "content_workspace_field_title",
        getText("content_workspace_field_title", "Title"),
      ],
      ...(item.type === "event"
        ? [
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
              getText(
                "content_workspace_field_registration",
                "Registration details",
              ),
            ],
          ]
        : [
            [
              "content",
              "content_workspace_field_content",
              getText("content_workspace_field_content", "Story"),
            ],
          ]),
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
  if (item.type === "newsArticle") return null;

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
  if (!canReviewContentWorkspace() || item.status !== "pending") return null;

  const route = contentWorkspaceReviewRoutes[item.type];
  if (!route) return null;

  const actions = document.createElement("div");
  actions.className = "content-workspace-review-actions";
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "admin-work-zone-button is-danger";
  const publish = document.createElement("button");
  publish.type = "button";
  publish.className = "admin-work-zone-button is-success";
  const buttons = [reject, publish];
  let isConfirming = false;
  let isSubmitting = false;

  function restoreActionLabels() {
    setWorkspaceTranslatedText(reject, "content_workspace_reject", "Reject");
    setWorkspaceTranslatedText(publish, "content_workspace_publish", "Publish");
  }

  async function submitDecision(action, rejectionReason = "") {
    isSubmitting = true;
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
          rejectionReason:
            action === "reject" ? rejectionReason.trim() : undefined,
        },
      });
      contentWorkspaceState.editorDrafts.delete(getEditorDraftKey(item, "en"));
      contentWorkspaceState.editorDrafts.delete(getEditorDraftKey(item, "fr"));
      showWorkspaceSuccess(
        getText(
          action === "publish"
            ? "content_workspace_publish_success"
            : "content_workspace_reject_success",
          action === "publish"
            ? "Content published successfully."
            : "Content rejected successfully.",
        ),
      );
      await loadContentWorkspace({ preserveSelection: true });
    } catch (error) {
      setWorkspaceMessage(error.message, "error");
      buttons.forEach((button) => {
        button.disabled = false;
      });
      restoreActionLabels();
    } finally {
      isSubmitting = false;
    }
  }

  async function confirmDecision(action) {
    if (isConfirming || isSubmitting) return;

    isConfirming = true;
    try {
      const decision =
        action === "publish"
          ? await CMCENModal.confirm(
              getText(
                "content_workspace_publish_confirmation",
                "Publishing makes this content visible on the public site. Confirm when you are ready.",
              ),
              {
                title: getText(
                  "content_workspace_confirm_publish",
                  "Confirm publish",
                ),
                confirmText: getText(
                  "content_workspace_confirm_publish",
                  "Confirm publish",
                ),
                cancelText: getText("cancel", "Cancel"),
                tone: "success",
              },
            )
          : await CMCENModal.form(
              getText(
                "content_workspace_reject_confirmation",
                "This content will be rejected and the reason will be shared with the submitter. Confirm when you are ready.",
              ),
              {
                title: getText(
                  "content_workspace_confirm_reject",
                  "Confirm rejection",
                ),
                confirmText: getText(
                  "content_workspace_confirm_reject",
                  "Confirm rejection",
                ),
                cancelText: getText("cancel", "Cancel"),
                destructive: true,
                tone: "danger",
                fields: [
                  {
                    name: "rejectionReason",
                    type: "textarea",
                    label: getText(
                      "content_workspace_rejection_reason",
                      "Rejection reason",
                    ),
                    placeholder: getText(
                      "rejection_reason_placeholder",
                      "Explain what needs to be corrected…",
                    ),
                    required: true,
                    requiresNonWhitespace: true,
                    requiredMessage: getText(
                      "content_workspace_rejection_reason_required",
                      "Enter a reason before rejecting this content.",
                    ),
                    maxLength: 2000,
                  },
                ],
              },
            );

      if (!decision) return;
      await submitDecision(
        action,
        typeof decision === "object" ? decision.rejectionReason || "" : "",
      );
    } finally {
      isConfirming = false;
    }
  }

  reject.addEventListener("click", () => void confirmDecision("reject"));
  publish.addEventListener("click", () => void confirmDecision("publish"));

  restoreActionLabels();
  actions.append(reject, publish);
  return actions;
}

function createRemovalActions(item) {
  const actions = document.createElement("div");
  actions.className = "content-workspace-removal-actions";
  const isNewsArticle = item.type === "newsArticle";
  if (!isNewsArticle && !contentWorkspaceRoutes[item.type]) return actions;
  const canHide = isNewsArticle
    ? canManageContentWorkspaceNews()
    : contentWorkspaceState.user?.permissions?.canHideContent === true;
  const canRestore = isNewsArticle
    ? canManageContentWorkspaceNews()
    : contentWorkspaceState.user?.permissions?.canRestoreContent === true;

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

  if (
    canHide &&
    (isNewsArticle
      ? item.status === "published"
      : item.status !== "hidden" && item.status !== "pending")
  ) {
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

function createContentWorkspaceBottomActions(item, { canSave = false } = {}) {
  const section = document.createElement("section");
  section.className = "content-workspace-bottom-actions";
  const actionRow = document.createElement("div");
  actionRow.className = "content-workspace-action-row";
  const removalActions = createRemovalActions(item);
  if (removalActions.childElementCount) {
    actionRow.append(removalActions);
  }

  const primaryActions = document.createElement("div");
  primaryActions.className = "content-workspace-primary-actions";

  if (canSave) {
    const saveActions = document.createElement("div");
    saveActions.className = "content-workspace-save-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "admin-work-zone-button is-primary";
    save.dataset.contentWorkspaceSave = "true";
    save.disabled = true;
    setWorkspaceTranslatedText(
      save,
      "content_workspace_save_changes",
      "Save changes",
    );
    save.addEventListener("click", () => saveContentWorkspaceChanges(item, save));
    saveActions.append(save);
    primaryActions.append(saveActions);
  }

  const reviewActions = createContentWorkspaceReviewActions(item);
  if (reviewActions) {
    primaryActions.append(reviewActions);
  }

  if (primaryActions.childElementCount) {
    actionRow.append(primaryActions);
  }

  if (actionRow.childElementCount) {
    section.append(actionRow);
  }

  return section.childElementCount ? section : null;
}

function setContentWorkspaceRsvpSummary(summary, accepted, declined) {
  summary.dataset.contentWorkspaceRsvpAccepted = String(accepted);
  summary.dataset.contentWorkspaceRsvpDeclined = String(declined);
  summary.textContent = getText(
    "content_workspace_rsvp_summary",
    "{accepted} accepted · {declined} declined",
    { accepted, declined },
  );
}

function getContentWorkspaceRsvpResponseLabel(response) {
  return response === "accepted"
    ? getText("content_workspace_rsvp_response_accepted", "Accepted")
    : getText("content_workspace_rsvp_response_declined", "Declined");
}

function createContentWorkspaceRsvpTable(rsvps) {
  const wrapper = document.createElement("div");
  wrapper.className = "content-workspace-rsvp-table-wrap";
  const table = document.createElement("table");
  table.className = "content-workspace-rsvp-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  [
    ["content_workspace_rsvp_response", "Response"],
    ["content_workspace_rsvp_attendee", "Attendee"],
    ["email", "Email"],
    ["content_workspace_rsvp_unit_or_status", "Unit or status"],
    ["phone", "Phone number"],
  ].forEach(([key, label]) => {
    const heading = document.createElement("th");
    heading.scope = "col";
    setWorkspaceTranslatedText(heading, key, label);
    headerRow.append(heading);
  });
  head.append(headerRow);

  const body = document.createElement("tbody");
  rsvps.forEach((rsvp) => {
    const row = document.createElement("tr");
    const response = document.createElement("td");
    response.className = `is-${rsvp.response === "accepted" ? "accepted" : "declined"}`;
    response.textContent = getContentWorkspaceRsvpResponseLabel(rsvp.response);
    const attendee = document.createElement("td");
    attendee.textContent = [rsvp.rank, rsvp.firstName, rsvp.lastName]
      .filter(Boolean)
      .join(" ") || "—";
    const email = document.createElement("td");
    email.textContent = rsvp.email || "—";
    const unitOrStatus = document.createElement("td");
    unitOrStatus.textContent = rsvp.unitOrStatus || "—";
    const phone = document.createElement("td");
    phone.textContent = rsvp.phone || "—";
    row.append(response, attendee, email, unitOrStatus, phone);
    body.append(row);
  });

  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function createContentWorkspaceRsvpExport(item) {
  const download = document.createElement("button");
  download.type = "button";
  download.className = "admin-work-zone-button is-secondary is-compact";
  setWorkspaceTranslatedText(download, "event_rsvp_export", "Download RSVP CSV");
  download.addEventListener("click", async () => {
    const token = getContentWorkspaceToken();
    if (!token) return;

    download.disabled = true;
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(item._id)}/rsvps.csv`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("Could not download RSVP CSV");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "event-rsvps.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // The RSVP panel is intentionally silent when its access is unavailable.
    } finally {
      download.disabled = false;
    }
  });
  return download;
}

async function loadContentWorkspaceRsvps(item, panel, content) {
  try {
    const token = getContentWorkspaceToken();
    if (!token) {
      panel.hidden = true;
      return;
    }
    const result = await CMCENUtils.apiJson(
      `/api/events/${encodeURIComponent(item._id)}/rsvps`,
      { token, redirectOnUnauthorized: false },
    );
    if (String(getSelectedContentWorkspaceItem()?._id) !== String(item._id)) {
      return;
    }

    const rsvps = Array.isArray(result.rsvps) ? result.rsvps : [];
    content.replaceChildren();
    if (!rsvps.length) {
      const empty = document.createElement("p");
      empty.className = "content-workspace-rsvp-empty";
      setWorkspaceTranslatedText(
        empty,
        "content_workspace_rsvp_empty",
        "No RSVP responses yet.",
      );
      content.append(empty);
      return;
    }

    const accepted = rsvps.filter((rsvp) => rsvp.response === "accepted").length;
    const summary = document.createElement("p");
    summary.className = "content-workspace-rsvp-summary";
    setContentWorkspaceRsvpSummary(summary, accepted, rsvps.length - accepted);
    const actions = document.createElement("div");
    actions.className = "content-workspace-rsvp-actions";
    actions.append(createContentWorkspaceRsvpExport(item));
    content.append(summary, createContentWorkspaceRsvpTable(rsvps), actions);
  } catch (error) {
    if (String(getSelectedContentWorkspaceItem()?._id) === String(item._id)) {
      if (error.status === 403) {
        panel.hidden = true;
        return;
      }
      content.replaceChildren();
      const message = document.createElement("p");
      message.className = "content-workspace-rsvp-empty";
      setWorkspaceTranslatedText(
        message,
        "content_workspace_rsvp_load_error",
        "Could not load RSVP responses.",
      );
      content.append(message);
    }
  }
}

function createContentWorkspaceRsvpPanel(item) {
  if (
    item.type !== "event" ||
    item.content?.rsvpEnabled !== true ||
    !canManageContentWorkspaceRsvps()
  ) {
    return null;
  }

  const panel = document.createElement("section");
  panel.className = "content-workspace-rsvp-panel";
  const heading = document.createElement("h2");
  setWorkspaceTranslatedText(heading, "content_workspace_rsvp_heading", "RSVPs");
  const content = document.createElement("div");
  content.className = "content-workspace-rsvp-content";
  const loading = document.createElement("p");
  setWorkspaceTranslatedText(
    loading,
    "content_workspace_rsvp_loading",
    "Loading RSVP responses…",
  );
  content.append(loading);
  panel.append(heading, content);
  void loadContentWorkspaceRsvps(item, panel, content);
  return panel;
}

function renderContentWorkspaceDetail() {
  contentWorkspaceDetail.replaceChildren();
  contentWorkspaceDetail.setAttribute(
    "aria-busy",
    contentWorkspaceState.isLoading ? "true" : "false",
  );

  if (contentWorkspaceState.isLoading) {
    const loading = document.createElement("span");
    loading.className = "visually-hidden";
    setWorkspaceTranslatedText(
      loading,
      "content_workspace_loading",
      "Loading content…",
    );
    contentWorkspaceDetail.append(
      loading,
      contentWorkspaceDetailLoadingTemplate.content.cloneNode(true),
    );
    return;
  }

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

  const canEditPublicCopy = canEditContentWorkspacePublicCopy(item);

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

  const recordEditor = canEditContentWorkspaceRecord(item)
    ? createContentWorkspaceRecordEditor(item)
    : null;
  if (recordEditor) {
    contentWorkspaceDetail.append(recordEditor);
  }

  const submissionDetails = createContentWorkspaceSubmissionDetails(item);
  if (submissionDetails) {
    contentWorkspaceDetail.append(submissionDetails);
  }

  const rejectionReason = createRejectionReason(item);
  if (rejectionReason) {
    contentWorkspaceDetail.append(rejectionReason);
  }

  const rsvpPanel = createContentWorkspaceRsvpPanel(item);
  if (rsvpPanel) {
    contentWorkspaceDetail.append(rsvpPanel);
  }

  if (canViewContentWorkspaceHistory(item)) {
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
    revisions.hidden = true;
    const loadHistory = document.createElement("button");
    loadHistory.type = "button";
    loadHistory.className = "admin-work-zone-button is-secondary is-compact";
    setWorkspaceTranslatedText(
      loadHistory,
      "content_workspace_load_history",
      "Load revision history",
    );
    loadHistory.addEventListener("click", async () => {
      loadHistory.disabled = true;
      loadHistory.setAttribute("aria-busy", "true");
      setWorkspaceTranslatedText(
        loadHistory,
        "content_workspace_history_loading",
        "Loading revision history…",
      );
      revisions.hidden = false;
      const loaded = await loadRevisionHistory(item, revisions);

      if (loaded) {
        loadHistory.remove();
        return;
      }

      loadHistory.disabled = false;
      loadHistory.removeAttribute("aria-busy");
      setWorkspaceTranslatedText(
        loadHistory,
        "content_workspace_retry_history",
        "Retry revision history",
      );
    });
    history.append(historyHeading, loadHistory, revisions);
    contentWorkspaceDetail.append(history);
  }

  const bottomActions = createContentWorkspaceBottomActions(item, {
    canSave: canEditPublicCopy || Boolean(recordEditor),
  });
  if (bottomActions) {
    contentWorkspaceDetail.append(bottomActions);
    updateContentWorkspaceSaveAction();
  }
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
    content: ["content_workspace_field_content", "Story"],
    imagePath: ["content_workspace_event_image_url", "Event image URL"],
    photoUrl: ["content_workspace_photo_url", "Full photo URL"],
    photoDisplayUrl: [
      "content_workspace_display_photo_url",
      "Display photo URL",
    ],
    imageUrl: ["content_workspace_image_url", "Full image URL"],
    imageDisplayUrl: [
      "content_workspace_display_image_url",
      "Display image URL",
    ],
    status: ["content_workspace_status", "Status"],
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
  container.setAttribute("aria-busy", "true");
  const loading = document.createElement("span");
  loading.className = "visually-hidden";
  setWorkspaceTranslatedText(
    loading,
    "content_workspace_history_loading",
    "Loading revision history…",
  );
  container.replaceChildren(loading);

  try {
    const data = await contentWorkspaceApiJson(
      `/api/admin/content/${encodeURIComponent(item.type)}/${encodeURIComponent(item._id)}/revisions`,
    );

    if (getSelectedContentWorkspaceItem()?._id !== item._id) return false;

    container.replaceChildren();
    const revisions = Array.isArray(data.revisions) ? data.revisions : [];

    if (!revisions.length) {
      setWorkspaceTranslatedText(
        container,
        "content_workspace_history_empty",
        "No staff revisions have been recorded yet.",
      );
      return true;
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
    return true;
  } catch (error) {
    if (getSelectedContentWorkspaceItem()?._id !== item._id) return false;
    container.textContent = error.message;
    return false;
  } finally {
    if (getSelectedContentWorkspaceItem()?._id === item._id) {
      container.setAttribute("aria-busy", "false");
    }
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
    const allDay = formData.get("allDay") === "true";

    return {
      city: String(formData.get("city") || ""),
      provinceRegion: String(formData.get("provinceRegion") || ""),
      organizingEntity: String(formData.get("organizingEntity") || ""),
      eventType: String(formData.get("eventType") || ""),
      startDate: getWorkspaceIsoDate(formData.get("startDate"), {
        includeTime: !allDay,
      }),
      endDate: getWorkspaceIsoDate(formData.get("endDate"), {
        includeTime: !allDay,
      }),
      timezone: String(formData.get("timezone") || ""),
      allDay,
      rsvpEnabled: formData.get("rsvpEnabled") === "true",
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

  if (item.type === "newsArticle") {
    return {
      imageUrl: String(formData.get("imageUrl") || ""),
      imageDisplayUrl: String(formData.get("imageDisplayUrl") || ""),
      status: String(formData.get("status") || "published"),
    };
  }

  return null;
}

function getSubmitterContentWorkspaceRecordPayload(item, formData) {
  const details = getContentWorkspaceRecordPayload(item, formData);
  if (!details) return null;

  if (item.type === "event") {
    return {
      ...details,
      title: { ...(item.content?.title || {}) },
      description: { ...(item.content?.description || {}) },
      location: { ...(item.content?.location || {}) },
      registration: { ...(item.content?.registration || {}) },
      publicationPermissionConfirmed: true,
      publishNow: false,
    };
  }

  if (item.type === "retirementMessage") {
    const messages = item.content?.messages || {};
    const messageLanguage = ["en", "fr"].includes(item.content?.messageLanguage)
      ? item.content.messageLanguage
      : messages.en
        ? "en"
        : "fr";

    return {
      ...details,
      messageLanguage,
      message: String(messages[messageLanguage] || ""),
      submitter: {
        relationship: String(item.content?.submitter?.relationship || "self"),
      },
      publicationConsentConfirmed: true,
      memberReviewConfirmed: true,
      publishNow: false,
    };
  }

  if (item.type === "lastPost") {
    const messages = item.content?.messages || {};
    const messageLanguage = ["en", "fr"].includes(item.content?.messageLanguage)
      ? item.content.messageLanguage
      : messages.en
        ? "en"
        : "fr";

    return {
      deceased: details.deceased,
      imageUrl: details.imageUrl,
      imageDisplayUrl: details.imageDisplayUrl,
      photoUrl: details.photoUrl,
      title: details.title,
      slug: details.slug,
      messageLanguage,
      message: String(messages[messageLanguage] || ""),
      publicationPermissionConfirmed: true,
      publishNow: false,
    };
  }

  return null;
}

function getContentWorkspaceRecordSaveRoute(item) {
  return contentWorkspaceEditRoutes[item.type];
}

async function uploadContentWorkspaceImage(item, form) {
  const imageEditor = form.querySelector("[data-content-workspace-image-editor]");
  const file = imageEditor?.querySelector("[data-content-workspace-image-file]");
  const selectedFile = file?.files?.[0];
  if (!imageEditor || !selectedFile) return;

  if (!selectedFile.type.startsWith("image/")) {
    throw new Error(
      getText("content_workspace_image_invalid", "Choose a valid image file."),
    );
  }

  if (selectedFile.size > 10 * 1024 * 1024) {
    throw new Error(
      getText(
        "content_workspace_image_too_large",
        "Images must be 10 MB or smaller.",
      ),
    );
  }

  const uploadData = new FormData();
  uploadData.append(
    "image",
    await CMCENUtils.prepareImageUploadFile(selectedFile),
  );
  uploadData.append("uploadSource", imageEditor.dataset.uploadSource);
  uploadData.append("uploadContext", imageEditor.dataset.uploadContext);
  uploadData.append("sourceField", imageEditor.dataset.sourceField);
  if (imageEditor.dataset.displayAspectRatio) {
    uploadData.append(
      "displayAspectRatio",
      imageEditor.dataset.displayAspectRatio,
    );
  }
  uploadData.append("sourceName", getContentWorkspaceImageSourceName(item, form));

  const result = await contentWorkspaceApiJson("/api/upload", {
    method: "POST",
    body: uploadData,
  });
  if (!result.url) {
    throw new Error(
      getText("content_workspace_image_upload_error", "Could not upload image."),
    );
  }

  const primaryValue = form.elements.namedItem(imageEditor.dataset.sourceField);
  if (primaryValue instanceof HTMLInputElement) {
    primaryValue.value = result.url;
  }

  const displayFieldBySource = {
    photoUrl: "photoDisplayUrl",
    imageUrl: "imageDisplayUrl",
  };
  const displayField = displayFieldBySource[imageEditor.dataset.sourceField];
  const displayValue = displayField ? form.elements.namedItem(displayField) : null;
  if (displayValue instanceof HTMLInputElement) {
    displayValue.value = result.display?.url || "";
  }
}

async function getContentWorkspaceRecordSaveRequest(item, form) {
  await uploadContentWorkspaceImage(item, form);
  const formData = new FormData(form);
  const route = getContentWorkspaceRecordSaveRoute(item);
  const body = getContentWorkspaceRecordPayload(item, formData);
  if (!route || !body) return null;

  return {
    path: route(item._id),
    body,
  };
}

function getNewsArticleSaveRequest(item) {
  const forms = getContentWorkspaceSaveForms();
  const getLanguageFormData = (language) => {
    const form = forms.find(
      (candidate) => candidate.dataset.language === language,
    );
    return form ? new FormData(form) : null;
  };
  const getLanguageValue = (language, field) => {
    const formData = getLanguageFormData(language);
    return String(
      formData?.get(field) ?? item.content?.[field]?.[language] ?? "",
    );
  };
  const recordForm = forms.find((form) =>
    form.classList.contains("content-workspace-record-form"),
  );
  const recordData = recordForm ? new FormData(recordForm) : null;
  const getRecordValue = (field, fallback) =>
    String(recordData?.get(field) ?? fallback ?? "");
  const note = ["en", "fr"]
    .map((language) => getLanguageFormData(language)?.get("revisionNote"))
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");

  return {
    path: `/api/news/${encodeURIComponent(item._id)}`,
    newsArticle: true,
    body: {
      title: {
        en: getLanguageValue("en", "title"),
        fr: getLanguageValue("fr", "title"),
      },
      content: {
        en: getLanguageValue("en", "content"),
        fr: getLanguageValue("fr", "content"),
      },
      imageUrl: getRecordValue("imageUrl", item.content?.imageUrl),
      imageDisplayUrl: getRecordValue(
        "imageDisplayUrl",
        item.content?.imageDisplayUrl,
      ),
      status: getRecordValue("status", item.status),
      revisionNote: note,
    },
  };
}

function getContentLanguageSaveRequest(item, form) {
  const formData = new FormData(form);
  const language = form.dataset.language;
  if (!language) return null;
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
    return null;
  }

  return { path, body, language };
}

function getContentWorkspaceSaveForms() {
  return [...contentWorkspaceDetail.querySelectorAll(
    ".content-workspace-language-editor, .content-workspace-record-form",
  )];
}

function getContentWorkspaceFormState(form) {
  return JSON.stringify(
    [...new FormData(form).entries()].map(([name, value]) => [
      name,
      typeof value === "string" ? value : value.name,
    ]),
  );
}

function isContentWorkspaceFormDirty(form) {
  return (
    form.dataset.hasUnsavedDraft === "true" ||
    form.dataset.hasPendingImageUpload === "true" ||
    form.dataset.initialState !== getContentWorkspaceFormState(form)
  );
}

function hasUnsavedContentWorkspaceChanges() {
  return getContentWorkspaceSaveForms().some(isContentWorkspaceFormDirty);
}

function updateContentWorkspaceSaveAction() {
  const save = contentWorkspaceDetail.querySelector(
    "[data-content-workspace-save]",
  );

  if (!save || save.getAttribute("aria-busy") === "true") return;

  save.disabled = !hasUnsavedContentWorkspaceChanges();
}

function discardContentWorkspaceDrafts(item) {
  ["en", "fr"].forEach((language) => {
    contentWorkspaceState.editorDrafts.delete(getEditorDraftKey(item, language));
  });
}

async function selectContentWorkspaceItem(item) {
  const nextId = String(item._id);

  if (
    nextId === contentWorkspaceState.selectedId ||
    contentWorkspaceState.isSelecting
  ) {
    return;
  }

  contentWorkspaceState.isSelecting = true;
  try {
    const currentItem = getSelectedContentWorkspaceItem();

    if (currentItem && hasUnsavedContentWorkspaceChanges()) {
      const choice = await CMCENModal.choose(
        getText(
          "content_workspace_unsaved_changes_message",
          "Save or discard your changes before switching to another record.",
        ),
        {
          title: getText(
            "content_workspace_unsaved_changes_title",
            "Unsaved changes",
          ),
          closeOnBackdrop: false,
          choices: [
            {
              value: "save",
              label: getText(
                "content_workspace_save_changes",
                "Save changes",
              ),
              description: getText(
                "content_workspace_save_before_switching",
                "Save your edits, then open the selected record.",
              ),
            },
            {
              value: "discard",
              label: getText(
                "content_workspace_discard_changes",
                "Discard changes",
              ),
              description: getText(
                "content_workspace_discard_before_switching",
                "Discard your edits and open the selected record.",
              ),
              destructive: true,
            },
          ],
        },
      );

      if (choice === "save") {
        const save = contentWorkspaceDetail.querySelector(
          "[data-content-workspace-save]",
        );
        const saved = save
          ? await saveContentWorkspaceChanges(currentItem, save)
          : false;

        if (!saved) return;
      } else if (choice === "discard") {
        discardContentWorkspaceDrafts(currentItem);
      } else {
        return;
      }
    }

    contentWorkspaceState.selectedId = nextId;
    contentWorkspaceState.requestedContentId = "";
    updateContentWorkspaceSearchParameters({ includeSelection: true });
    renderContentWorkspaceList();
    renderContentWorkspaceDetail();
  } finally {
    contentWorkspaceState.isSelecting = false;
  }
}

async function saveContentWorkspaceChanges(item, button) {
  const forms = getContentWorkspaceSaveForms().filter(
    isContentWorkspaceFormDirty,
  );
  const invalidForm = forms.find((form) => !form.checkValidity());

  if (invalidForm) {
    invalidForm.reportValidity();
    return false;
  }

  if (!forms.length) {
    setWorkspaceMessage(
      getText("content_workspace_no_changes", "No changes to save."),
    );
    updateContentWorkspaceSaveAction();
    return true;
  }

  captureEditorDrafts(item);
  const recordForm = forms.find((form) =>
    form.classList.contains("content-workspace-record-form"),
  );
  let savedRequests = 0;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  setWorkspaceTranslatedText(
    button,
    "content_workspace_saving_changes",
    "Saving…",
  );
  try {
    const saveRequests = item.type === "newsArticle"
      ? [getNewsArticleSaveRequest(item)]
      : [
          ...(recordForm
            ? [await getContentWorkspaceRecordSaveRequest(item, recordForm)]
            : []),
          ...forms
            .filter((form) =>
              form.classList.contains("content-workspace-language-editor"),
            )
            .map((form) => getContentLanguageSaveRequest(item, form)),
        ].filter(Boolean);

    if (!saveRequests.length) return false;

    for (const request of saveRequests) {
      await contentWorkspaceApiJson(request.path, {
        method: "PATCH",
        body: request.body,
      });
      savedRequests += 1;

      if (request.language) {
        contentWorkspaceState.editorDrafts.delete(
          getEditorDraftKey(item, request.language),
        );
      }

      if (request.newsArticle) {
        ["en", "fr"].forEach((language) => {
          contentWorkspaceState.editorDrafts.delete(
            getEditorDraftKey(item, language),
          );
        });
      }
    }

    refreshContentWorkspaceNotifications();
    await loadContentWorkspace({ preserveSelection: true });
    showWorkspaceSuccess(
      getText(
        recordForm?.dataset.hasPendingImageUpload === "true"
          ? "content_workspace_image_uploaded"
          : "content_workspace_changes_saved",
        recordForm?.dataset.hasPendingImageUpload === "true"
          ? "Image uploaded and changes saved."
          : "Changes saved.",
      ),
    );
    return true;
  } catch (error) {
    if (savedRequests) {
      await loadContentWorkspace({ preserveSelection: true });
    }

    setWorkspaceMessage(
      savedRequests
        ? getText(
            "content_workspace_partial_save",
            "Some changes were saved before the error. Review the remaining fields and save again.",
          )
        : error.message,
      "error",
    );
    return false;
  } finally {
    button.removeAttribute("aria-busy");
    setWorkspaceTranslatedText(
      button,
      "content_workspace_save_changes",
      "Save changes",
    );
    updateContentWorkspaceSaveAction();
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

  const route = item.type === "newsArticle"
    ? `/api/news/${encodeURIComponent(item._id)}/${isRestore ? "restore" : "hide"}`
    : contentWorkspaceRoutes[item.type]
      ? `${contentWorkspaceRoutes[item.type]}/${encodeURIComponent(item._id)}/${isRestore ? "restore" : "hide"}`
      : "";
  if (!route) return;

  try {
    const result = await contentWorkspaceApiJson(route, { method: "PATCH" });
    showWorkspaceSuccess(
      result.message ||
        (isRestore
          ? getText("content_workspace_restored", "Content restored.")
          : getText("content_workspace_removed", "Content removed from public view.")),
    );
    await loadContentWorkspace({ preserveSelection: true });
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  }
}

async function loadContentWorkspace({
  preserveSelection = false,
  updateSearchParameters = false,
  append = false,
} = {}) {
  if (
    append &&
    (!contentWorkspaceState.hasMore ||
      !contentWorkspaceState.nextCursor ||
      contentWorkspaceState.isLoadingMore)
  ) {
    return;
  }

  if (updateSearchParameters) {
    updateContentWorkspaceSearchParameters();
  }

  const requestId = ++contentWorkspaceState.loadRequestId;
  contentWorkspaceState.isLoading = !append;
  contentWorkspaceState.isLoadingMore = append;
  if (!append) {
    contentWorkspaceState.nextCursor = "";
    contentWorkspaceState.hasMore = false;
  }
  renderContentWorkspaceList();
  if (!append) {
    renderContentWorkspaceDetail();
  }

  const query = new URLSearchParams({
    limit: String(CONTENT_WORKSPACE_PAGE_SIZE),
  });
  const type = contentWorkspaceType.value || "all";
  const status = contentWorkspaceStatusFilter.value || "all";
  const translation = contentWorkspaceTranslationFilter.value || "all";
  const search = contentWorkspaceSearch.value.trim();

  if (type !== "all") {
    query.set("type", type);
  }
  if (status !== "all") {
    query.set("status", status);
  }
  if (translation !== "all") {
    query.set("translation", translation);
  }
  if (search) {
    query.set("search", search);
  }
  if (contentWorkspaceState.requestedContentId) {
    query.set("id", contentWorkspaceState.requestedContentId);
  }
  if (append) {
    query.set("cursor", contentWorkspaceState.nextCursor);
  }

  try {
    const data = await contentWorkspaceApiJson(`/api/admin/content?${query}`);
    if (requestId !== contentWorkspaceState.loadRequestId) return;

    const nextItems = Array.isArray(data.items) ? data.items : [];

    if (append) {
      const loadedItemIds = new Set(
        contentWorkspaceState.items.map((item) => String(item._id)),
      );
      contentWorkspaceState.items.push(
        ...nextItems.filter((item) => !loadedItemIds.has(String(item._id))),
      );
    } else {
      const previousSelection =
        contentWorkspaceState.requestedContentId ||
        (preserveSelection ? contentWorkspaceState.selectedId : "");
      contentWorkspaceState.items = nextItems;
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
    }

    const nextCursor = String(data.nextCursor || "");
    contentWorkspaceState.hasMore = data.hasMore === true && Boolean(nextCursor);
    contentWorkspaceState.nextCursor = contentWorkspaceState.hasMore
      ? nextCursor
      : "";
  } catch (error) {
    if (requestId !== contentWorkspaceState.loadRequestId) return;

    if (!append) {
      contentWorkspaceState.items = [];
      contentWorkspaceState.selectedId = "";
      contentWorkspaceState.nextCursor = "";
      contentWorkspaceState.hasMore = false;
    }
    setWorkspaceMessage(error.message, "error");
  } finally {
    if (requestId === contentWorkspaceState.loadRequestId) {
      contentWorkspaceState.isLoading = false;
      contentWorkspaceState.isLoadingMore = false;
      renderContentWorkspaceList();
      if (!append) {
        renderContentWorkspaceDetail();
      }
    }
  }
}

async function initializeContentWorkspace() {
  contentWorkspaceState.isLoading = true;
  renderContentWorkspaceList();
  renderContentWorkspaceDetail();

  try {
    const user = await contentWorkspaceApiJson("/api/me");
    const canReview = user.permissions?.canReviewAndPublish === true;
    const canManageNews = user.permissions?.canManageNews === true;

    if (!canReview && !canManageNews) {
      window.location.replace("/dashboard");
      return;
    }

    contentWorkspaceState.user = user;
    applyContentWorkspaceSearchParameters();
    updateContentWorkspaceTypeOptions();
    updateContentWorkspaceModePresentation();
    updateContentWorkspaceStatusFilterAppearance();
    await loadContentWorkspace();
  } catch (error) {
    contentWorkspaceState.isLoading = false;
    renderContentWorkspaceList();
    renderContentWorkspaceDetail();
    setWorkspaceMessage(error.message, "error");
  }
}

function updateContentWorkspaceLanguage() {
  updateContentWorkspaceModePresentation();
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

      const translationStatus = record.querySelector(
        ".content-workspace-translation-status",
      );

      if (item && translationStatus) {
        setContentWorkspaceTranslationStatus(translationStatus, item);
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

  contentWorkspaceDetail
    .querySelectorAll("[data-content-workspace-rsvp-accepted]")
    .forEach((summary) => {
      setContentWorkspaceRsvpSummary(
        summary,
        Number(summary.dataset.contentWorkspaceRsvpAccepted) || 0,
        Number(summary.dataset.contentWorkspaceRsvpDeclined) || 0,
      );
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

contentWorkspaceTranslationFilter.addEventListener("change", () => {
  contentWorkspaceState.selectedId = "";
  contentWorkspaceState.requestedContentId = "";
  loadContentWorkspace({ updateSearchParameters: true });
});

contentWorkspaceSearch.addEventListener("input", () => {
  window.clearTimeout(contentWorkspaceSearchTimeout);
  contentWorkspaceSearchTimeout = window.setTimeout(() => {
    contentWorkspaceState.selectedId = "";
    contentWorkspaceState.requestedContentId = "";
    loadContentWorkspace({ updateSearchParameters: true });
  }, 250);
});

contentWorkspaceClearFilters.addEventListener("click", clearContentWorkspaceFilters);
contentWorkspaceLoadMoreButton.addEventListener("click", () => {
  void loadContentWorkspace({ append: true });
});

document.addEventListener("languagechange", updateContentWorkspaceLanguage);

function updateContentWorkspaceSaveActionFromField(event) {
  if (!(event.target instanceof Element)) return;

  if (
    !event.target.closest(
      ".content-workspace-language-editor, .content-workspace-record-form",
    )
  ) {
    return;
  }

  updateContentWorkspaceSaveAction();
}

contentWorkspaceDetail.addEventListener(
  "input",
  updateContentWorkspaceSaveActionFromField,
);
contentWorkspaceDetail.addEventListener(
  "change",
  updateContentWorkspaceSaveActionFromField,
);

updateContentWorkspaceModePresentation();
updateContentWorkspaceStatusFilterAppearance();
renderContentWorkspaceDetail();
initializeContentWorkspace();
