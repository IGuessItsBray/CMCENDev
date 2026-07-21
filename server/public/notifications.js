const notificationsToken = CMCENUtils.requireAuthToken();
const notificationsStatus = document.getElementById("notificationsStatus");
const notificationsList = document.getElementById("notificationsList");
const notificationParams = new URLSearchParams(window.location.search);
const highlightedCommentId = notificationParams.get("comment");

let loadedNotifications = [];

function notificationsApiJson(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: notificationsToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("notifications_load_error")
  });
}

function showNotificationsLoading() {
  const message = translate("notifications_loading");

  notificationsStatus.replaceChildren(
    ...Array.from(CMCENUtils.createLoadingSpinner(message).childNodes)
  );
  notificationsStatus.className = "notifications-status is-loading";
  notificationsStatus.setAttribute("aria-label", message);
  notificationsStatus.hidden = false;
  notificationsList.hidden = true;
}

function showNotificationsStatus(message, type = "neutral") {
  notificationsStatus.textContent = message;
  notificationsStatus.className = `notifications-status is-${type}`;
  notificationsStatus.removeAttribute("aria-label");
  notificationsStatus.hidden = false;
  notificationsList.hidden = true;
}

function setCardMessage(card, message, type = "neutral") {
  const messageElement = card.querySelector(".notification-card-message");

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.className = `notification-card-message is-${type}`;
  messageElement.hidden = false;
}

function getNotificationTitle(item) {
  if (item.type === "event") {
    return CMCENUtils.getLocalizedText(item.title) ||
      translate("notifications_type_event");
  }

  return item.title || translate(`notifications_type_${item.type}`);
}

function getNotificationTypeLabel(item) {
  return translate(`notifications_type_${item.type}`);
}

function getNotificationEditLabel(item) {
  if (item.type === "event") {
    return translate("notifications_edit_event");
  }

  if (item.type === "retirementMessage") {
    return translate("notifications_edit_retirement");
  }

  return translate("notifications_edit_comment");
}

function formatNotificationDate(value) {
  return CMCENUtils.formatDate(value, {
    timeStyle: "short",
    fallback: ""
  });
}

function createNotificationCard(item) {
  const card = document.createElement("article");
  card.className = "notification-card";
  card.dataset.notificationType = item.type;

  if (
    item.type === "retirementComment" &&
    String(item.id) === String(highlightedCommentId)
  ) {
    card.classList.add("is-highlighted");
  }

  const header = document.createElement("header");
  header.className = "notification-card-header";

  const heading = document.createElement("div");
  heading.className = "notification-card-heading";

  const type = document.createElement("span");
  type.className = "notification-type";
  type.textContent = getNotificationTypeLabel(item);

  const title = document.createElement("h2");
  title.textContent = getNotificationTitle(item);

  heading.append(type, title);

  const date = document.createElement("time");
  date.className = "notification-date";
  date.textContent = formatNotificationDate(item.updatedAt);

  if (item.updatedAt) {
    date.dateTime = item.updatedAt;
  }

  header.append(heading, date);

  const reason = document.createElement("p");
  reason.className = "notification-reason";
  reason.textContent =
    `${translate("my_events_rejection_reason")}: ${item.reason || "—"}`;

  const message = document.createElement("p");
  message.className = "notification-card-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;

  card.append(header, reason, message);

  if (item.type === "retirementComment") {
    card.appendChild(createCommentEditor(item));
    return card;
  }

  const action = document.createElement("a");
  action.className = "notification-edit-link";
  action.href = item.editHref || item.href || "#";
  action.textContent = getNotificationEditLabel(item);

  card.appendChild(action);

  return card;
}

function createCommentEditor(item) {
  const form = document.createElement("form");
  form.className = "notification-comment-form";
  form.dataset.commentId = item.id;

  const label = document.createElement("label");
  label.setAttribute("for", `notification-comment-${item.id}`);
  label.textContent = translate("notifications_comment_body");

  const textarea = document.createElement("textarea");
  textarea.id = `notification-comment-${item.id}`;
  textarea.name = "body";
  textarea.rows = 5;
  textarea.minLength = 2;
  textarea.maxLength = 2000;
  textarea.required = true;
  textarea.value = item.body || "";

  const footer = document.createElement("div");
  footer.className = "notification-comment-footer";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = translate("notifications_save_comment");

  footer.appendChild(submit);
  form.append(label, textarea, footer);

  form.addEventListener("submit", event => {
    event.preventDefault();
    submitCommentEdit(form, item);
  });

  return form;
}

async function submitCommentEdit(form, item) {
  const card = form.closest(".notification-card");
  const button = form.querySelector("button[type='submit']");
  const textarea = form.querySelector("textarea");

  if (!form.reportValidity()) {
    return;
  }

  button.disabled = true;

  try {
    const data = await notificationsApiJson(
      `/api/retirement-messages/comments/${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        body: {
          body: textarea.value.trim()
        },
        errorMessage: translate("notifications_comment_update_error")
      }
    );

    setCardMessage(
      card,
      data.message || translate("notifications_comment_update_success"),
      "success"
    );

    await loadNotifications({
      keepStatusVisible: true
    });
  } catch (error) {
    setCardMessage(
      card,
      error.message || translate("notifications_comment_update_error"),
      "error"
    );
  } finally {
    button.disabled = false;
  }
}

function renderNotifications(items) {
  notificationsList.replaceChildren();

  if (!items.length) {
    showNotificationsStatus(
      translate("notifications_empty"),
      "empty"
    );
    return;
  }

  items.forEach(item => {
    notificationsList.appendChild(
      createNotificationCard(item)
    );
  });

  notificationsStatus.hidden = true;
  notificationsList.hidden = false;

  const highlighted = notificationsList.querySelector(".is-highlighted");

  if (highlighted) {
    highlighted.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

async function loadNotifications({ keepStatusVisible = false } = {}) {
  if (!keepStatusVisible) {
    showNotificationsLoading();
  }

  try {
    const data = await notificationsApiJson("/api/notifications", {
      errorMessage: translate("notifications_load_error")
    });

    loadedNotifications =
      Array.isArray(data.notifications?.items)
        ? data.notifications.items
        : [];

    renderNotifications(loadedNotifications);

    if (typeof window.refreshAuthUI === "function") {
      window.refreshAuthUI();
    }
  } catch (error) {
    showNotificationsStatus(
      error.message || translate("notifications_load_error"),
      "error"
    );
  }
}

document.addEventListener("languagechange", () => {
  renderNotifications(loadedNotifications);
});

if (!notificationsToken) {
  window.location.replace("/login");
} else {
  loadNotifications();
}
