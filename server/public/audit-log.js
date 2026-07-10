const auditToken = CMCENUtils.requireAuthToken();
const auditLogStatus = document.getElementById("auditLogStatus");
const auditLogPage = document.getElementById("auditLogPage");
const auditLogContent = document.getElementById("auditLogContent");

let auditState = {
  logs: [],
  action: "",
  targetType: "",
  user: "",
  message: "",
  isLoading: false
};

const auditActions = [
  ["", "audit_action_all"],
  ["user.created", "audit_action_user_created"],
  ["user.login", "audit_action_user_login"],
  ["user.login_mfa_required", "audit_action_mfa_required"],
  ["user.email_verified", "audit_action_email_verified"],
  ["user.ghost_verified", "audit_action_ghost_verified"],
  ["user.ghost_upgraded", "audit_action_ghost_upgraded"],
  ["user.password_reset_requested", "audit_action_password_reset_requested"],
  ["user.password_reset_completed", "audit_action_password_reset_completed"],
  ["content.created", "audit_action_content_created"],
  ["content.published", "audit_action_content_published"],
  ["content.rejected", "audit_action_content_rejected"],
  ["content.deleted", "audit_action_content_deleted"],
  ["config.access_requested", "audit_action_config_access_requested"],
  ["config.token_accepted", "audit_action_config_token_accepted"],
  ["config.token_rejected", "audit_action_config_token_rejected"],
  ["config.updated", "audit_action_config_updated"],
  ["media.deleted", "audit_action_media_deleted"],
  ["page.created", "audit_action_page_created"],
  ["page.updated", "audit_action_page_updated"],
  ["page.published", "audit_action_page_published"],
  ["page.status_changed", "audit_action_page_status_changed"],
  ["page.deleted", "audit_action_page_deleted"],
  ["navigation.created", "audit_action_navigation_created"],
  ["navigation.updated", "audit_action_navigation_updated"],
  ["navigation.deleted", "audit_action_navigation_deleted"],
  ["role.created", "audit_action_role_created"],
  ["role.updated", "audit_action_role_updated"],
  ["role.permissions_changed", "audit_action_role_permissions_changed"],
  ["role.deleted", "audit_action_role_deleted"],
  ["translation.updated", "audit_action_translation_updated"],
  ["user.role_changed", "audit_action_role_changed"],
  ["user.custom_roles_changed", "audit_action_custom_roles_changed"],
  ["user.custom_role_added", "audit_action_custom_role_added"],
  ["user.custom_role_removed", "audit_action_custom_role_removed"],
  ["user.content_areas_changed", "audit_action_content_areas_changed"]
];

const auditTargetTypes = [
  ["", "audit_target_all"],
  ["user", "audit_target_users"],
  ["event", "audit_target_events"],
  ["config", "audit_target_config"],
  ["media", "audit_target_media"],
  ["page", "audit_target_pages"],
  ["navigation", "audit_target_navigation"],
  ["role", "audit_target_roles"],
  ["translation", "audit_target_translations"],
  ["retirementMessage", "audit_target_retirement_posts"],
  ["retirementComment", "audit_target_comments"]
];

async function auditApiJson(path, options = {}) {
  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token: auditToken,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("admin_verify_error")
    });
  } catch (error) {
    if (error.status === 403) {
      window.location.href = "/dashboard.html";
    }

    throw error;
  }
}

function showAuditLoading(message = translate("audit_log_loading")) {
  CMCENUtils.setStatusLoading(auditLogStatus, message);
  auditLogPage.hidden = true;
}

function showAuditPage() {
  auditLogStatus.hidden = true;
  auditLogStatus.removeAttribute("aria-label");
  auditLogPage.hidden = false;
}

function setAuditStatus(message, state = "") {
  CMCENUtils.setStatusMessage(auditLogStatus, message, state);
}

function formatAuditDate(value) {
  return CMCENUtils.formatDate(value, {
    timeStyle: "short"
  });
}

function getAuditActor(log) {
  const actor = log.actorSnapshot || {};

  return (
    actor.accountName ||
    actor.username ||
    actor.email ||
    translate("audit_actor_system")
  );
}

function formatLocalizedAuditValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const language =
    document.documentElement.lang ||
    localStorage.getItem("language") ||
    "en";
  const candidates = [
    value[language],
    value.en,
    value.fr
  ];

  return String(candidates.find(item => typeof item === "string" && item.trim()) || "");
}

function formatAuditValue(value) {
  if (value === undefined || value === null || value === "") {
    return translate("admin_none");
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map(formatAuditValue).join(", ")
      : translate("admin_none");
  }

  if (value && typeof value === "object") {
    const localizedValue = formatLocalizedAuditValue(value);

    if (localizedValue) {
      return localizedValue;
    }

    const preferredValue =
      value.label ||
      value.title ||
      value.name ||
      value.slug ||
      value.key ||
      value.route ||
      value.username ||
      value.email;

    if (preferredValue) {
      return formatAuditValue(preferredValue);
    }

    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== "")
      .filter(([key]) => !["id", "_id", "__v"].includes(key));

    return entries.length
      ? entries.map(([key, item]) => `${formatMetadataLabel(key)}: ${formatAuditValue(item)}`).join("; ")
      : translate("admin_none");
  }

  return String(value);
}

function getAuditTarget(log) {
  const target = log.targetSnapshot || {};

  const preferredValue =
    target.title ||
    target.key ||
    target.name ||
    target.slug ||
    target.accountName ||
    target.username ||
    target.email;

  if (preferredValue) {
    return formatAuditValue(preferredValue);
  }

  return log.targetType ? formatAuditTargetType(log.targetType) : translate("audit_unknown_target");
}

function getActorId(value) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    return value._id || value.id || "";
  }

  return "";
}

function getTargetId(value) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    return value._id || value.id || "";
  }

  return "";
}

function normalizeAuditIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function hasSameUserIdentity(actor, target) {
  const actorId = normalizeAuditIdentity(getActorId(actor));
  const targetId = normalizeAuditIdentity(getTargetId(target));

  if (actorId && targetId) {
    return actorId === targetId;
  }

  return false;
}

function shouldRenderAuditTarget(log) {
  if (log.targetType !== "user") {
    return true;
  }

  return !hasSameUserIdentity(log.actor, log.target);
}

function getAuditTargetHref(log) {
  if (log.action === "content.deleted") {
    return "";
  }

  const targetId = getTargetId(log.target);
  const snapshot = log.targetSnapshot || {};

  if (log.targetType === "event" && targetId) {
    return log.action === "content.published"
      ? `/event.html?id=${encodeURIComponent(targetId)}`
      : `/submit-event.html?id=${encodeURIComponent(targetId)}`;
  }

  if (log.targetType === "retirementMessage" && targetId) {
    return `/retirement-message.html?id=${encodeURIComponent(targetId)}`;
  }

  if (log.targetType === "retirementComment") {
    const messageId = getTargetId(snapshot.retirementMessage);

    if (messageId) {
      return `/retirement-message.html?id=${encodeURIComponent(messageId)}`;
    }
  }

  return "";
}

function formatAuditAction(action) {
  const translationKey = auditActions.find(item => item[0] === action)?.[1];
  return translationKey ? translate(translationKey) : action;
}

function formatAuditTargetType(targetType) {
  const translationKey = auditTargetTypes.find(item => item[0] === targetType)?.[1];
  return translationKey ? translate(translationKey) : targetType || translate("audit_target_target");
}

function getAuditActionClass(action) {
  return `is-${String(action || "unknown")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/gi, "")}`;
}

function formatMetadataLabel(key) {
  const knownLabels = {
    previousRole: "audit_metadata_previous_role",
    newRole: "audit_metadata_new_role",
    previousContentAreas: "audit_metadata_previous_content_areas",
    newContentAreas: "audit_metadata_new_content_areas",
    commentContent: "audit_metadata_comment_content",
    deletedBy: "audit_metadata_deleted_by",
    rejectionReason: "audit_metadata_rejection_reason",
    status: "audit_metadata_status",
    source: "audit_metadata_source",
    method: "audit_metadata_method",
    methods: "audit_metadata_methods",
    mfaMethod: "audit_metadata_mfa_method",
    ipAddress: "audit_metadata_ip_address",
    deletedComments: "audit_metadata_deleted_comments",
    changedLanguages: "audit_metadata_changed_languages",
    previousValues: "audit_metadata_previous_values",
    newValues: "audit_metadata_new_values",
    previousPage: "audit_metadata_previous_page",
    newPage: "audit_metadata_new_page",
    previousNavigation: "audit_metadata_previous_navigation",
    newNavigation: "audit_metadata_new_navigation",
    previousPermissions: "audit_metadata_previous_permissions",
    newPermissions: "audit_metadata_new_permissions",
    addedPermissions: "audit_metadata_added_permissions",
    removedPermissions: "audit_metadata_removed_permissions",
    previousRoles: "audit_metadata_previous_roles",
    newRoles: "audit_metadata_new_roles",
    role: "audit_metadata_role",
    permissions: "audit_metadata_permissions"
  };

  if (knownLabels[key]) {
    return translate(knownLabels[key]);
  }

  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatMetadataValue(value) {
  return formatAuditValue(value);
}

function createAuditSearchField() {
  const label = document.createElement("label");
  label.className = "admin-editor-field audit-log-user-search";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = translate("audit_filter_user");

  const input = document.createElement("input");
  input.type = "search";
  input.name = "user";
  input.value = auditState.user;
  input.placeholder = translate("admin_users_search_placeholder");
  input.autocomplete = "off";
  input.addEventListener("input", event => {
    auditState.user = event.target.value;
  });

  label.append(labelSpan, input);
  return label;
}

function createAuditSelect(labelText, value, options, onChange) {
  const label = document.createElement("label");
  label.className = "admin-editor-field";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;

  const select = document.createElement("select");

  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = translate(optionLabel);
    option.selected = optionValue === value;
    select.append(option);
  });

  select.value = value;
  select.addEventListener("change", event => onChange(event.target.value));

  label.append(labelSpan, select);
  return label;
}

function createAuditFilters() {
  const form = document.createElement("form");
  form.className = "audit-log-filters";

  form.append(
    createAuditSearchField(),
    createAuditSelect(translate("audit_filter_action"), auditState.action, auditActions, value => {
      auditState.action = value;
      loadAuditLogs();
    }),
    createAuditSelect(translate("audit_filter_target"), auditState.targetType, auditTargetTypes, value => {
      auditState.targetType = value;
      loadAuditLogs();
    })
  );

  const filterButton = document.createElement("button");
  filterButton.type = "submit";
  filterButton.className = "admin-work-zone-button is-primary audit-log-filter-button";
  filterButton.textContent = translate("audit_filter_submit");
  form.append(filterButton);

  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    auditState.user = String(formData.get("user") || "").trim();
    loadAuditLogs();
  });

  return form;
}

function createAuditRefreshButton() {
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "admin-work-zone-button is-secondary audit-log-refresh-button";
  refresh.setAttribute("aria-label", translate("audit_refresh_label"));
  refresh.title = translate("admin_refresh");
  refresh.disabled = auditState.isLoading;

  if (auditState.isLoading) {
    const label = document.createElement("span");
    label.className = "visually-hidden";
    label.textContent = translate("audit_refreshing_label");

    refresh.classList.add("is-loading");
    refresh.setAttribute("aria-label", translate("audit_refreshing_label"));
    refresh.title = translate("audit_refreshing_title");
    refresh.append(label);
  }

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");

  const topPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  topPath.setAttribute("d", "M21 12a9 9 0 0 0-15.5-6.2L3 8");

  const topArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  topArrow.setAttribute("d", "M3 3v5h5");

  const bottomPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bottomPath.setAttribute("d", "M3 12a9 9 0 0 0 15.5 6.2L21 16");

  const bottomArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bottomArrow.setAttribute("d", "M21 21v-5h-5");

  icon.append(topPath, topArrow, bottomPath, bottomArrow);
  refresh.prepend(icon);
  refresh.addEventListener("click", () => loadAuditLogs());
  return refresh;
}

function createAuditRow(log) {
  const item = document.createElement("article");
  item.className = `admin-post-item audit-log-entry ${getAuditActionClass(log.action)}`;

  const header = document.createElement("div");
  header.className = "admin-post-header";

  const title = document.createElement("strong");
  title.textContent = formatAuditAction(log.action);

  const badges = document.createElement("div");
  badges.className = "admin-post-badges";

  const type = document.createElement("span");
  type.className = `admin-post-type type-${log.targetType || "content"}`;
  type.textContent = formatAuditTargetType(log.targetType);

  badges.append(type);
  header.append(title, badges);

  const details = document.createElement("p");
  details.className = "admin-post-details";
  details.append(
    document.createTextNode(`${formatAuditDate(log.createdAt)} · ${translate("audit_by_actor", {
      actor: getAuditActor(log)
    })}`)
  );

  if (shouldRenderAuditTarget(log)) {
    details.append(document.createTextNode(" · "));

    const targetHref = getAuditTargetHref(log);
    const targetLabel = getAuditTarget(log);

    if (targetHref) {
      const targetLink = document.createElement("a");
      targetLink.href = targetHref;
      targetLink.textContent = targetLabel;
      details.append(targetLink);
    } else {
      details.append(document.createTextNode(targetLabel));
    }
  }

  item.append(header, details);

  const metadata = log.metadata || {};
  const metadataEntries = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== "");

  if (metadataEntries.length) {
    const metadataList = document.createElement("div");
    metadataList.className = "audit-log-metadata";

    metadataEntries.forEach(([key, value]) => {
      const chip = document.createElement("span");
      chip.className = "audit-log-metadata-chip";
      chip.dataset.metadataKey = key;

      const label = document.createElement("strong");
      label.textContent = `${formatMetadataLabel(key)}:`;

      const valueText = document.createElement("span");
      valueText.className = "audit-log-metadata-value";
      valueText.textContent = formatMetadataValue(value);

      chip.append(label, valueText);
      metadataList.append(chip);
    });

    item.append(metadataList);
  }

  return item;
}

function renderAuditLog() {
  auditLogContent.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "audit-log-panel";

  const heading = document.createElement("div");
  heading.className = "audit-log-heading";

  const titleWrapper = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = translate("audit_entries_heading", {
    count: auditState.logs.length
  });
  titleWrapper.append(title);
  heading.append(titleWrapper, createAuditRefreshButton());

  panel.append(heading, createAuditFilters());

  if (auditState.message) {
    const message = document.createElement("p");
    message.className = "admin-work-zone-message";
    message.textContent = auditState.message;
    panel.append(message);
  }

  if (!auditState.logs.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = auditState.isLoading
      ? translate("audit_entries_loading")
      : translate("audit_entries_empty");
    panel.append(empty);
  } else {
    auditState.logs.forEach(log => {
      panel.append(createAuditRow(log));
    });
  }

  auditLogContent.append(panel);
}

async function verifyAuditAccess() {
  const user = await auditApiJson("/api/me", {
    errorMessage: translate("admin_verify_error")
  });

  if (user.permissions?.canViewAuditLog !== true) {
    window.location.href = "/dashboard.html";
    return false;
  }

  window.updateAdminWorkZoneTabsForUser(user);

  return true;
}

async function loadAuditLogs() {
  if (!auditToken) return;

  const preserveLayout = !auditLogPage.hidden;

  auditState.isLoading = true;
  auditState.message = "";

  if (preserveLayout) {
    renderAuditLog();
  } else {
    showAuditLoading();
  }

  try {
    const params = new URLSearchParams();

    if (auditState.action) {
      params.set("action", auditState.action);
    }

    if (auditState.targetType) {
      params.set("targetType", auditState.targetType);
    }

    if (auditState.user) {
      params.set("user", auditState.user);
    }

    const data = await auditApiJson(
      `/api/audit-logs${params.toString() ? `?${params}` : ""}`,
      {
        errorMessage: translate("audit_log_load_error")
      }
    );

    auditState.isLoading = false;
    auditState.logs = data.logs || [];
    auditState.message = "";
    showAuditPage();
    renderAuditLog();
  } catch (error) {
    auditState.isLoading = false;
    showAuditPage();
    auditState.logs = [];
    auditState.message = error.message || translate("audit_log_load_error");
    renderAuditLog();
  }
}

document.addEventListener("languagechange", () => {
  renderAuditLog();
});

window.addEventListener("pageshow", () => {
  if (!CMCENUtils.requireAuthToken()) {
    window.location.replace("/login.html");
  }
});

async function initializeAuditLogPage() {
  showAuditLoading();

  try {
    if (await verifyAuditAccess()) {
      await loadAuditLogs();
    }
  } catch (error) {
    setAuditStatus(error.message || translate("audit_log_load_error"), "error");
  }
}

if (auditToken) {
  initializeAuditLogPage();
} else {
  setAuditStatus(translate("sign_in_to_continue"));
}
