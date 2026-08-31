const retirementDetailContent = document.getElementById(
  "retirementDetailContent",
);

const retirementDetailMessage = document.getElementById(
  "retirementDetailMessage",
);

const retirementDetailTitle = document.getElementById("retirementDetailTitle");

const retirementDetailMosid = document.getElementById("retirementDetailMosid");

const retirementDetailDate = document.getElementById("retirementDetailDate");

const retirementDetailPhoto = document.getElementById("retirementDetailPhoto");

const retirementDetailText = document.getElementById("retirementDetailText");

const retirementCommentMessage = document.getElementById(
  "retirementCommentMessage",
);

const retirementCommentList = document.getElementById("retirementCommentList");

const retirementCommentForm = document.getElementById("retirementCommentForm");

const retirementCommentText = document.getElementById("retirementCommentText");

const retirementCommentSubmit = document.getElementById(
  "retirementCommentSubmit",
);

const retirementCommentLabel = document.getElementById(
  "retirementCommentLabel",
);

const retirementCommentEditContext = document.getElementById(
  "retirementCommentEditContext",
);

const retirementCommentCancel = document.getElementById(
  "retirementCommentCancel",
);

const retirementCommentLogin = document.getElementById(
  "retirementCommentLogin",
);

const RETIREMENT_PLACEHOLDER_PHOTO_URL = "/images/logo.png";

let currentRetirementMessageId = "";
let currentRetirementMessage = null;
let loadedComments = [];
let canManageRetirementComments = false;
let canOpenRetirementWorkspace = false;
let canDeleteOwnRetirementComments = false;
let currentRetirementViewerId = "";
let visibleDetailMessageKey = "";
let visibleDetailMessageType = "neutral";
let visibleCommentMessageKey = "";
let visibleCommentMessageType = "neutral";
let requestedRetirementCommentEditId = new URLSearchParams(
  window.location.search,
).get("editComment");
let editingRetirementComment = null;

function createRetirementLoadingContent(message) {
  const skeleton = document.createElement("div");
  skeleton.className =
    "content-detail-skeleton content-detail-skeleton--retirement";
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.append(
    CMCENUtils.createSkeleton("skeleton--detail-title"),
    CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
    CMCENUtils.createSkeleton("skeleton--detail-photo"),
    CMCENUtils.createSkeleton("skeleton--detail-block"),
    CMCENUtils.createSkeleton(
      "skeleton--detail-block skeleton--detail-block-short",
    ),
  );

  const accessibleLabel = document.createElement("span");
  accessibleLabel.className = "visually-hidden";
  accessibleLabel.textContent = message;

  return [skeleton, accessibleLabel];
}

function showRetirementDetailMessage(message, type = "neutral") {
  retirementDetailMessage.textContent = message;
  retirementDetailMessage.className = `retirements-message is-${type}`;
  retirementDetailMessage.removeAttribute("aria-label");
  retirementDetailMessage.hidden = false;
  retirementDetailContent.hidden = true;
}

function showRetirementDetailMessageKey(key, type = "neutral") {
  visibleDetailMessageKey = key;
  visibleDetailMessageType = type;

  if (key === "retirement_detail_loading") {
    const message = translate(key);

    retirementDetailMessage.replaceChildren(
      ...createRetirementLoadingContent(message),
    );
    retirementDetailMessage.className = "retirements-message is-loading";
    retirementDetailMessage.setAttribute("aria-label", message);
    retirementDetailMessage.hidden = false;
    retirementDetailContent.hidden = true;
    return;
  }

  showRetirementDetailMessage(translate(key), type);
}

function formatRetireeName(retirementMessage) {
  const { name, postNominals } = CMCENUtils.getRetireeNameParts(
    retirementMessage.retiree,
  );

  return (
    [name, postNominals].filter(Boolean).join(", ") ||
    translate("retirement_card_default_name")
  );
}

function getMosid(retirementMessage) {
  return (
    retirementMessage.retiree?.tradeRole ||
    translate("retirement_mosid_pending")
  );
}

function getRetirementMessageText(retirementMessage) {
  return (
    CMCENUtils.getLocalizedText(retirementMessage.messages) ||
    retirementMessage.message ||
    ""
  );
}

function formatRetirementMessageText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+([1-9]\d?\.\s+)/g, (match, marker, offset) =>
      offset === 0 ? marker : `\n\n${marker}`,
    );
}

function setRetirementMessageText(retirementMessage) {
  CMCENUtils.setLinkifiedText(
    retirementDetailText,
    formatRetirementMessageText(getRetirementMessageText(retirementMessage)),
  );
}

function updateRetirementMessageLanguage() {
  if (!currentRetirementMessage) {
    return;
  }

  setRetirementMessageText(currentRetirementMessage);
  retirementDetailDate.textContent = formatRetirementDate(
    currentRetirementMessage.retiree?.retirementDate,
  );
}

function formatCommentAuthor(author) {
  if (!author || typeof author !== "object") {
    return translate("unknown_user");
  }

  return (
    [author.firstName, author.lastName].filter(Boolean).join(" ") ||
    author.accountName ||
    author.username ||
    translate("unknown_user")
  );
}

function formatCommentDate(value) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "";
  }

  return CMCENUtils.formatDate(value, {
    timeStyle: "short",
    fallback: "",
  });
}

function formatRetirementDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const dateLabel = CMCENUtils.formatDate(value, {
    dateStyle: "long",
    timeZone: "UTC",
    fallback: "",
  });

  if (!dateLabel) {
    return "";
  }

  return translate("retirement_date_label", { date: dateLabel });
}

function renderPhoto(retirementMessage, name) {
  retirementDetailPhoto.replaceChildren();

  if (retirementMessage.photoUrl) {
    const image = document.createElement("img");
    const displayPhotoUrl =
      retirementMessage.photoDisplayUrl || retirementMessage.photoUrl;
    const isPlaceholderPhoto = CMCENUtils.isSitePlaceholderImage(
      retirementMessage.photoUrl,
    );

    image.src = isPlaceholderPhoto
      ? RETIREMENT_PLACEHOLDER_PHOTO_URL
      : displayPhotoUrl;
    image.alt = isPlaceholderPhoto
      ? ""
      : translate("retirement_photo_alt", { name });

    if (isPlaceholderPhoto) {
      image.className =
        "retirement-detail-photo-placeholder retirement-detail-photo-logo";
      image.setAttribute("aria-hidden", "true");
    }

    retirementDetailPhoto.appendChild(image);
    return;
  }

  const logo = document.createElement("img");

  logo.className =
    "retirement-detail-photo-placeholder retirement-detail-photo-logo";
  logo.src = RETIREMENT_PLACEHOLDER_PHOTO_URL;
  logo.alt = "";
  logo.setAttribute("aria-hidden", "true");

  retirementDetailPhoto.appendChild(logo);
}

function renderRetirementMessage(retirementMessage) {
  const name = formatRetireeName(retirementMessage);

  currentRetirementMessage = retirementMessage;
  document.title = `${translate("retirement_detail_title", {
    name,
  })} | CMCEN / RCMCE`;
  retirementDetailTitle.textContent = translate("retirement_detail_title", {
    name,
  });
  retirementDetailMosid.textContent = getMosid(retirementMessage);
  retirementDetailDate.textContent = formatRetirementDate(
    retirementMessage.retiree?.retirementDate,
  );
  setRetirementMessageText(retirementMessage);

  renderPhoto(retirementMessage, name);

  retirementDetailMessage.hidden = true;
  visibleDetailMessageKey = "";
  retirementDetailContent.hidden = false;
}

function showRetirementCommentMessage(message, type = "neutral") {
  retirementCommentMessage.textContent = message;
  retirementCommentMessage.className = `retirement-comment-message is-${type}`;
  retirementCommentMessage.hidden = false;
}

function showRetirementCommentMessageKey(key, type = "neutral") {
  visibleCommentMessageKey = key;
  visibleCommentMessageType = type;
  showRetirementCommentMessage(translate(key), type);
}

function getStoredToken() {
  return CMCENUtils.getStoredAuthToken();
}

function getRetirementCommentEditHref() {
  return `/retirement-message?id=${encodeURIComponent(currentRetirementMessageId)}`;
}

function updateRetirementCommentFormCopy() {
  const isEditing = Boolean(editingRetirementComment);
  const labelKey = isEditing
    ? "retirement_comment_edit"
    : "retirement_comment_add";
  const noteKey = isEditing
    ? "retirement_comment_resubmit_note"
    : "retirement_comment_review_note";
  const submitKey = isEditing
    ? "retirement_comment_resubmit"
    : "retirement_comment_post";
  const note = retirementCommentForm?.querySelector("small");

  if (retirementCommentLabel) {
    retirementCommentLabel.dataset.i18n = labelKey;
    retirementCommentLabel.textContent = translate(labelKey);
  }

  if (note) {
    note.dataset.i18n = noteKey;
    note.textContent = translate(noteKey);
  }

  if (retirementCommentSubmit && !retirementCommentSubmit.disabled) {
    retirementCommentSubmit.dataset.i18n = submitKey;
    retirementCommentSubmit.textContent = translate(submitKey);
  }

  if (retirementCommentCancel) {
    retirementCommentCancel.href = getRetirementCommentEditHref();
    retirementCommentCancel.hidden = !isEditing;
  }

  if (retirementCommentEditContext) {
    const reason = String(
      editingRetirementComment?.rejectionReason || "",
    ).trim();
    retirementCommentEditContext.textContent = reason
      ? `${translate("my_events_rejection_reason")}: ${reason}`
      : "";
    retirementCommentEditContext.hidden = !isEditing || !reason;
  }
}

function setRetirementCommentEditor(comment = null) {
  editingRetirementComment = comment;

  if (comment) {
    retirementCommentText.value = comment.body || "";
  }

  updateRetirementCommentFormCopy();
  CMCENUtils.bindCharacterCounters();
}

async function loadRetirementCommentEditor(token) {
  if (!requestedRetirementCommentEditId || !currentRetirementMessageId) {
    setRetirementCommentEditor();
    return;
  }

  try {
    const data = await CMCENUtils.apiJson(
      `/api/retirement-messages/comments/${encodeURIComponent(requestedRetirementCommentEditId)}/edit`,
      {
        token,
        errorMessage: translate("retirement_comment_edit_load_error"),
      },
    );
    const comment = data.comment;
    const messageId =
      comment?.retirementMessage?._id || comment?.retirementMessage;

    if (String(messageId || "") !== String(currentRetirementMessageId)) {
      throw new Error(translate("retirement_comment_edit_load_error"));
    }

    if (comment.status !== "rejected") {
      throw new Error(translate("retirement_comment_no_longer_rejected"));
    }

    setRetirementCommentEditor(comment);
    retirementCommentForm?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } catch (error) {
    setRetirementCommentEditor();
    showRetirementCommentMessage(
      error.message || translate("retirement_comment_edit_load_error"),
      "error",
    );
  }
}

function removeRetirementAdminActions() {
  document
    .querySelector("[data-content-workspace-shortcut='retirementMessage']")
    ?.remove();
}

function renderRetirementAdminActions() {
  removeRetirementAdminActions();

  if (!canOpenRetirementWorkspace || !currentRetirementMessageId) {
    return;
  }

  const shortcut = CMCENUtils.createContentWorkspaceShortcut({
    contentType: "retirementMessage",
    contentId: currentRetirementMessageId,
    label: translate(
      "content_workspace_open_record",
      "Open in Content Workspace",
    ),
  });
  if (shortcut) document.body.append(shortcut);
}

async function deleteRetirementComment(comment) {
  const token = getStoredToken();

  if (!token) {
    setupCommentAccess();
    return;
  }

  if (
    !(await CMCENModal.confirm(
      "Remove this comment from public view? It can be restored later and this will be recorded in the audit log.",
      {
        title: "Remove comment",
        confirmText: "Remove",
        destructive: true,
      },
    ))
  ) {
    return;
  }

  try {
    const response = await fetch(
      `/api/admin/retirement-comments/${encodeURIComponent(comment._id)}`,
      {
        method: "DELETE",
        headers: CMCENUtils.authHeaders(token),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      CMCENUtils.clearAuthToken();
      await setupCommentAccess();
      throw new Error("Sign in again to remove comments.");
    }

    if (response.status === 403) {
      canManageRetirementComments = false;
      canDeleteOwnRetirementComments = false;
      renderComments(loadedComments);
      throw new Error("You do not have permission to remove comments.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Could not remove comment");
    }

    loadedComments = loadedComments.filter(
      (item) => String(item._id) !== String(comment._id),
    );

    renderComments(loadedComments);
    CMCENUtils.showToast(
      "Comment removed from public view and recorded in the audit log.",
      {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      },
    );
  } catch (error) {
    CMCENUtils.showToast(error.message || "Could not remove comment", {
      color: "error",
      position: "bottom-right",
      animation: "slide",
    });
  }
}

function createCommentElement(comment) {
  const article = document.createElement("article");
  article.className = "retirement-comment";

  const header = document.createElement("header");

  const author = document.createElement("strong");
  author.textContent = formatCommentAuthor(comment.author);

  const date = document.createElement("time");
  const dateLabel = formatCommentDate(comment.publishedAt || comment.createdAt);

  date.textContent = dateLabel;

  if (comment.publishedAt || comment.createdAt) {
    date.dateTime = comment.publishedAt || comment.createdAt;
  }

  header.append(author, date);

  const commentAuthorId = comment.author?._id || comment.author || "";
  const canDeleteComment =
    canManageRetirementComments ||
    (canDeleteOwnRetirementComments &&
      String(commentAuthorId) === String(currentRetirementViewerId));

  if (canDeleteComment) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "retirement-comment-delete";
    deleteButton.textContent = "Remove";
    deleteButton.setAttribute(
      "aria-label",
      `Remove comment by ${formatCommentAuthor(comment.author)}`,
    );
    deleteButton.addEventListener("click", () => {
      deleteRetirementComment(comment);
    });
    header.append(deleteButton);
  }

  const body = document.createElement("p");
  body.textContent = comment.body || "";

  article.append(header, body);

  return article;
}

function renderComments(comments) {
  retirementCommentList.replaceChildren();

  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "retirement-comment-empty";
    empty.textContent = translate("retirement_comment_empty");
    retirementCommentList.appendChild(empty);
    return;
  }

  comments.forEach((comment) => {
    retirementCommentList.appendChild(createCommentElement(comment));
  });
}

async function loadComments(messageId) {
  try {
    const response = await fetch(
      `/api/retirement-messages/${encodeURIComponent(messageId)}/comments`,
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || translate("retirement_comments_load_error"),
      );
    }

    loadedComments = Array.isArray(data.comments) ? data.comments : [];

    renderComments(loadedComments);
  } catch (error) {
    showRetirementCommentMessage(
      error.message || translate("retirement_comments_load_error"),
      "error",
    );
  }
}

async function setupCommentAccess() {
  const token = getStoredToken();

  if (token) {
    CMCENUtils.storeAuthToken(token);
    retirementCommentForm.hidden = false;
    retirementCommentLogin.hidden = true;

    try {
      const user = await CMCENUtils.apiJson("/api/me", {
        token,
        errorMessage: "Could not verify retirement permissions",
      });

      const canDeleteOwnContent =
        user.permissions?.canDeleteOwnContent === true;
      currentRetirementViewerId = user._id || "";

      canOpenRetirementWorkspace =
        user.permissions?.canReviewAndPublish === true;
      canManageRetirementComments = user.permissions?.canHideContent === true;
      canDeleteOwnRetirementComments = canDeleteOwnContent;
      renderRetirementAdminActions();
      await loadRetirementCommentEditor(token);
    } catch (error) {
      canManageRetirementComments = false;
      canOpenRetirementWorkspace = false;
      canDeleteOwnRetirementComments = false;
      currentRetirementViewerId = "";
      removeRetirementAdminActions();
    }

    return;
  }

  canManageRetirementComments = false;
  canOpenRetirementWorkspace = false;
  canDeleteOwnRetirementComments = false;
  currentRetirementViewerId = "";
  removeRetirementAdminActions();
  retirementCommentForm.hidden = true;
  retirementCommentLogin.hidden = false;
}

async function loadRetirementMessage() {
  const messageId = new URLSearchParams(window.location.search).get("id");

  if (!messageId) {
    showRetirementDetailMessageKey("retirement_detail_no_selection", "error");
    return;
  }

  currentRetirementMessageId = messageId;

  showRetirementDetailMessageKey("retirement_detail_loading");

  try {
    const response = await fetch(
      `/api/retirement-messages/${encodeURIComponent(messageId)}`,
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || translate("retirement_detail_load_error"));
    }

    renderRetirementMessage(data.retirementMessage);
    await setupCommentAccess();
    await loadComments(messageId);
  } catch (error) {
    showRetirementDetailMessage(
      error.message || translate("retirement_detail_load_error"),
      "error",
    );
  }
}

retirementCommentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const token = getStoredToken();

  if (!token) {
    setupCommentAccess();
    return;
  }

  if (!retirementCommentForm.checkValidity()) {
    retirementCommentForm.reportValidity();
    return;
  }

  const body = retirementCommentText.value.trim();
  const submittingEdit = Boolean(editingRetirementComment);
  const commentId = editingRetirementComment?._id;

  retirementCommentSubmit.disabled = true;
  retirementCommentSubmit.textContent = translate(
    submittingEdit
      ? "retirement_comment_resubmitting"
      : "retirement_comment_posting",
  );
  retirementCommentMessage.hidden = true;
  visibleCommentMessageKey = "";

  try {
    const endpoint = submittingEdit
      ? `/api/retirement-messages/comments/${encodeURIComponent(commentId)}`
      : `/api/retirement-messages/${encodeURIComponent(
          currentRetirementMessageId,
        )}/comments`;
    const response = await fetch(endpoint, {
      method: submittingEdit ? "PATCH" : "POST",

      headers: CMCENUtils.authHeaders(token, {
        "Content-Type": "application/json",
      }),

      body: JSON.stringify({ body }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      CMCENUtils.clearAuthToken();
      setupCommentAccess();
      throw new Error(translate("retirement_comment_sign_in_again"));
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          translate(
            submittingEdit
              ? "retirement_comment_update_error"
              : "retirement_comment_submit_error",
          ),
      );
    }

    if (submittingEdit) {
      requestedRetirementCommentEditId = null;
      setRetirementCommentEditor();
      window.history.replaceState({}, "", getRetirementCommentEditHref());
      await loadComments(currentRetirementMessageId);
      window.refreshAuthUI?.();

      CMCENUtils.showToast(translate("retirement_comment_updated"), {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      });
      return;
    }

    retirementCommentForm.reset();
    CMCENUtils.bindCharacterCounters();

    if (data.status === "published" && data.comment) {
      const empty = retirementCommentList.querySelector(
        ".retirement-comment-empty",
      );

      empty?.remove();

      retirementCommentList.appendChild(createCommentElement(data.comment));

      loadedComments.push(data.comment);

      CMCENUtils.showToast(translate("retirement_comment_published"), {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      });
    } else {
      CMCENUtils.showToast(translate("retirement_comment_submitted"), {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      });
    }
  } catch (error) {
    CMCENUtils.showToast(
      error.message ||
        translate(
          submittingEdit
            ? "retirement_comment_update_error"
            : "retirement_comment_submit_error",
        ),
      { color: "error", position: "bottom-right", animation: "slide" },
    );
  } finally {
    retirementCommentSubmit.disabled = false;
    updateRetirementCommentFormCopy();
  }
});

document.addEventListener("languagechange", () => {
  if (currentRetirementMessage) {
    const name = formatRetireeName(currentRetirementMessage);

    updateRetirementMessageLanguage();
    document.title = `${translate("retirement_detail_title", {
      name,
    })} | CMCEN / RCMCE`;
    retirementDetailTitle.textContent = translate("retirement_detail_title", {
      name,
    });
    renderRetirementAdminActions();
  } else if (visibleDetailMessageKey) {
    showRetirementDetailMessageKey(
      visibleDetailMessageKey,
      visibleDetailMessageType,
    );
  }

  renderComments(loadedComments);

  if (visibleCommentMessageKey) {
    showRetirementCommentMessageKey(
      visibleCommentMessageKey,
      visibleCommentMessageType,
    );
  }

  updateRetirementCommentFormCopy();
});

loadRetirementMessage();
