const contentWorkspaceFilters = document.getElementById(
  "contentWorkspaceFilters",
);
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
  user: null,
  isLoading: false,
  editorDrafts: new Map(),
};

const contentWorkspaceRoutes = Object.freeze({
  event: "/api/admin/events",
  retirementMessage: "/api/admin/retirement-messages",
  lastPost: "/api/admin/last-posts",
  retirementComment: "/api/admin/retirement-comments",
});

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

function getLocalizedValue(value) {
  if (!value || typeof value !== "object") return "";

  const language = getContentWorkspaceLanguage();
  return String(value[language] || value.en || value.fr || "").trim();
}

function getItemTitle(item) {
  return String(item?.title || "").trim() || getText("content_workspace_untitled", "Untitled content");
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
  contentWorkspaceCount.textContent = contentWorkspaceState.isLoading
    ? ""
    : String(contentWorkspaceState.items.length);

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
    title.textContent = getItemTitle(item);

    const metadata = document.createElement("span");
    metadata.className = "content-workspace-record-meta";
    setRecordMetadata(metadata, item);

    button.append(title, metadata, createStatusBadge(item.status));
    button.addEventListener("click", () => {
      contentWorkspaceState.selectedId = String(item._id);
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

function createEditableField({
  label,
  labelKey,
  field,
  value,
  multiline = false,
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
    control.rows = 5;
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
  });
  note.classList.add("content-workspace-note");
  note.querySelector("textarea").rows = 2;
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
    group.append(
      createEditableField({
        label: getText("content_workspace_field_message", "Message"),
        labelKey: "content_workspace_field_message",
        field: "message",
        value: getEditorDraftValue(
          item,
          language,
          "message",
          getMessageForLanguage(item, language),
        ),
        multiline: true,
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

function createReadOnlyComment(item) {
  const notice = document.createElement("p");
  notice.className = "content-workspace-read-only";
  setWorkspaceTranslatedText(
    notice,
    "content_workspace_comments_read_only",
    "Comments are read only. Removal and restoration preserve the member’s original words.",
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

  if (item.status !== "hidden" && canHide) {
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
  header.append(title, createDetailInfo(item), createStatusBadge(item.status));
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

async function loadContentWorkspace({ preserveSelection = false } = {}) {
  contentWorkspaceState.isLoading = true;
  renderContentWorkspaceList();

  const query = new URLSearchParams({
    type: contentWorkspaceType.value || "all",
    status: contentWorkspaceStatusFilter.value || "all",
    limit: "100",
  });

  try {
    const data = await contentWorkspaceApiJson(`/api/admin/content?${query}`);
    const previousSelection = preserveSelection
      ? contentWorkspaceState.selectedId
      : "";
    contentWorkspaceState.items = Array.isArray(data.items) ? data.items : [];
    contentWorkspaceState.selectedId = contentWorkspaceState.items.some(
      (item) => String(item._id) === previousSelection,
    )
      ? previousSelection
      : String(contentWorkspaceState.items[0]?._id || "");
    setWorkspaceMessage(
      contentWorkspaceState.items.length
        ? ""
        : getText("content_workspace_empty", "No content matches these filters."),
    );
  } catch (error) {
    contentWorkspaceState.items = [];
    contentWorkspaceState.selectedId = "";
    setWorkspaceMessage(error.message, "error");
  } finally {
    contentWorkspaceState.isLoading = false;
    renderContentWorkspaceList();
    renderContentWorkspaceDetail();
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
    await loadContentWorkspace();
  } catch (error) {
    setWorkspaceMessage(error.message, "error");
  }
}

function updateContentWorkspaceLanguage() {
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

contentWorkspaceFilters.addEventListener("submit", (event) => {
  event.preventDefault();
  loadContentWorkspace();
});

document.addEventListener("languagechange", updateContentWorkspaceLanguage);

renderContentWorkspaceDetail();
initializeContentWorkspace();
