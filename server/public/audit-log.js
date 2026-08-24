const auditToken = CMCENUtils.requireAuthToken();
const auditLogStatus = document.getElementById("auditLogStatus");
const auditLogPage = document.getElementById("auditLogPage");
const auditLogContent = document.getElementById("auditLogContent");
const auditDuplicateWindowMs = 60 * 1000;

let auditState = {
  logs: [],
  action: "",
  targetType: "",
  user: "",
  startDate: "",
  endDate: "",
  message: "",
  isLoading: false,
};

function showAuditToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide",
  });
}

const auditActions = [
  ["", "audit_action_all"],
  ["audit.exported", "audit_action_audit_exported"],
  ["user.created", "audit_action_user_created"],
  ["user.invited", "audit_action_user_invited"],
  ["user.invitation_resent", "audit_action_user_invitation_resent"],
  ["user.invitation_delivery_failed", "audit_action_user_invitation_delivery_failed"],
  ["user.login", "audit_action_user_login"],
  ["user.login_rejected", "audit_action_user_login_rejected"],
  ["user.login_mfa_required", "audit_action_mfa_required"],
  ["user.mfa_rejected", "audit_action_mfa_rejected"],
  ["diagnostic.request_failed", "audit_action_request_failed"],
  ["user.exported", "audit_action_user_exported"],
  ["user.mfa_reset", "audit_action_user_mfa_reset"],
  ["user.email_verified", "audit_action_email_verified"],
  ["user.ghost_verified", "audit_action_ghost_verified"],
  ["user.ghost_upgraded", "audit_action_ghost_upgraded"],
  ["user.password_reset_requested", "audit_action_password_reset_requested"],
  ["user.password_reset_completed", "audit_action_password_reset_completed"],
  ["contact.submitted", "audit_action_contact_submitted"],
  ["content.created", "audit_action_content_created"],
  ["content.published", "audit_action_content_published"],
  ["content.rejected", "audit_action_content_rejected"],
  ["content.drafted", "audit_action_content_drafted"],
  ["content.deleted", "audit_action_content_deleted"],
  ["content.hidden", "audit_action_content_hidden"],
  ["content.restored", "audit_action_content_restored"],
  ["content.staff_content_updated", "audit_action_content_staff_content_updated"],
  ["analytics.purged", "audit_action_analytics_purged"],
  ["config.access_requested", "audit_action_config_access_requested"],
  ["config.token_accepted", "audit_action_config_token_accepted"],
  ["config.token_rejected", "audit_action_config_token_rejected"],
  ["config.updated", "audit_action_config_updated"],
  ["media.deleted", "audit_action_media_deleted"],
  ["media.bulk_deleted", "audit_action_media_bulk_deleted"],
  ["migration.retirement.dry-run", "audit_action_migration_retirement_dry_run"],
  ["migration.retirement.apply", "audit_action_migration_retirement_apply"],
  ["migration.comments.dry-run", "audit_action_migration_comments_dry_run"],
  ["migration.comments.apply", "audit_action_migration_comments_apply"],
  ["migration.lastPost.dry-run", "audit_action_migration_last_post_dry_run"],
  ["migration.lastPost.apply", "audit_action_migration_last_post_apply"],
  ["page.created", "audit_action_page_created"],
  ["page.updated", "audit_action_page_updated"],
  ["page.published", "audit_action_page_published"],
  ["page.status_changed", "audit_action_page_status_changed"],
  ["page.deleted", "audit_action_page_deleted"],
  ["navigation.created", "audit_action_navigation_created"],
  ["navigation.updated", "audit_action_navigation_updated"],
  ["navigation.deleted", "audit_action_navigation_deleted"],
  ["timer.created", "audit_action_timer_created"],
  ["timer.updated", "audit_action_timer_updated"],
  ["timer.deleted", "audit_action_timer_deleted"],
  ["role.created", "audit_action_role_created"],
  ["role.updated", "audit_action_role_updated"],
  ["role.permissions_changed", "audit_action_role_permissions_changed"],
  ["role.deleted", "audit_action_role_deleted"],
  ["translation.updated", "audit_action_translation_updated"],
  ["user.role_changed", "audit_action_role_changed"],
  ["user.custom_roles_changed", "audit_action_custom_roles_changed"],
  ["user.custom_role_added", "audit_action_custom_role_added"],
  ["user.custom_role_removed", "audit_action_custom_role_removed"],
  ["user.content_areas_changed", "audit_action_content_areas_changed"],
];

const auditTargetTypes = [
  ["", "audit_target_all"],
  ["audit", "audit_target_audit"],
  ["analytics", "audit_target_analytics"],
  ["user", "audit_target_users"],
  ["request", "audit_target_requests"],
  ["event", "audit_target_events"],
  ["config", "audit_target_config"],
  ["migration", "audit_target_migration"],
  ["media", "audit_target_media"],
  ["page", "audit_target_pages"],
  ["navigation", "audit_target_navigation"],
  ["timer", "audit_target_timers"],
  ["role", "audit_target_roles"],
  ["translation", "audit_target_translations"],
  ["contactMessage", "audit_target_contact_messages"],
  ["retirementMessage", "audit_target_retirement_posts"],
  ["retirementComment", "audit_target_comments"],
];

async function auditApiJson(path, options = {}) {
  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token: auditToken,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("admin_verify_error"),
    });
  } catch (error) {
    if (error.status === 403) {
      window.location.href = "/dashboard";
    }

    throw error;
  }
}

async function auditApiBlob(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${auditToken}`,
    },
  });

  if (response.status === 401) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error(translate("admin_verify_error"));
  }

  if (response.status === 403) {
    window.location.href = "/dashboard";
    throw new Error(translate("admin_verify_error"));
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error || options.errorMessage || translate("audit_log_export_error"),
    );
  }

  return {
    blob: await response.blob(),
    filename: getAuditDownloadFilename(
      response.headers.get("Content-Disposition"),
    ),
  };
}

function getAuditDownloadFilename(contentDisposition) {
  const match = String(contentDisposition || "").match(
    /filename="?([^"]+)"?/iu,
  );
  return match?.[1] || "";
}

function downloadAuditBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
    timeStyle: "short",
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
    document.documentElement.lang || localStorage.getItem("language") || "en";
  const candidates = [value[language], value.en, value.fr];

  return String(
    candidates.find((item) => typeof item === "string" && item.trim()) || "",
  );
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
      ? entries
          .map(
            ([key, item]) =>
              `${formatMetadataLabel(key)}: ${formatAuditValue(item)}`,
          )
          .join("; ")
      : translate("admin_none");
  }

  const text = String(value);

  if (text.length > 520) {
    return `${text.slice(0, 520)}... (${text.length} characters)`;
  }

  return text;
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

  return log.targetType
    ? formatAuditTargetType(log.targetType)
    : translate("audit_unknown_target");
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

function getAuditActorGroupKey(log) {
  const actorId = getActorId(log.actor);

  if (actorId) {
    return `id:${normalizeAuditIdentity(actorId)}`;
  }

  const actor = log.actorSnapshot || {};
  return `snapshot:${normalizeAuditIdentity(
    actor.accountName || actor.username || actor.email,
  )}`;
}

function getAuditTargetGroupKey(log) {
  const targetId = getTargetId(log.target);

  if (targetId) {
    return `id:${normalizeAuditIdentity(targetId)}`;
  }

  const target = log.targetSnapshot || {};
  return `snapshot:${normalizeAuditIdentity(
    target.slug || target.key || target.title || target.name,
  )}`;
}

function getAuditDuplicateGroupKey(log) {
  return [
    log.action || "",
    log.targetType || "",
    getAuditActorGroupKey(log),
    getAuditTargetGroupKey(log),
  ].join("|");
}

function getAuditTimestamp(log) {
  const timestamp = new Date(log.createdAt).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function collapseDuplicateAuditLogs(logs) {
  return logs.reduce((collapsed, log) => {
    const previous = collapsed.at(-1);
    const previousTimestamp = previous ? getAuditTimestamp(previous) : null;
    const timestamp = getAuditTimestamp(log);
    const matchesPrevious =
      previous &&
      previous._duplicateGroupKey === getAuditDuplicateGroupKey(log) &&
      previousTimestamp !== null &&
      timestamp !== null &&
      previousTimestamp - timestamp <= auditDuplicateWindowMs;

    if (matchesPrevious) {
      previous.duplicateCount = (previous.duplicateCount || 1) + 1;
      return collapsed;
    }

    collapsed.push({
      ...log,
      duplicateCount: 1,
      _duplicateGroupKey: getAuditDuplicateGroupKey(log),
    });
    return collapsed;
  }, []);
}

function normalizeAuditIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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
  if (["content.deleted", "content.hidden"].includes(log.action)) {
    return "";
  }

  const targetId = getTargetId(log.target);
  const snapshot = log.targetSnapshot || {};

  if (log.targetType === "event" && targetId) {
    return log.action === "content.published"
      ? `/event?id=${encodeURIComponent(targetId)}`
      : `/content-workspace?type=event&id=${encodeURIComponent(targetId)}`;
  }

  if (log.targetType === "retirementMessage" && targetId) {
    return `/retirement-message?id=${encodeURIComponent(targetId)}`;
  }

  if (log.targetType === "retirementComment") {
    const messageId = getTargetId(snapshot.retirementMessage);

    if (messageId) {
      return `/retirement-message?id=${encodeURIComponent(messageId)}`;
    }
  }

  return "";
}

function formatAuditAction(action) {
  const translationKey = auditActions.find((item) => item[0] === action)?.[1];
  return translationKey
    ? translate(translationKey)
    : titleCaseAuditIdentifier(action);
}

function formatAuditTargetType(targetType) {
  const translationKey = auditTargetTypes.find(
    (item) => item[0] === targetType,
  )?.[1];
  return translationKey
    ? translate(translationKey)
    : titleCaseAuditIdentifier(targetType) || translate("audit_target_target");
}

function titleCaseAuditIdentifier(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
    previousMfa: "audit_metadata_previous_mfa",
    previousMethods: "audit_metadata_previous_methods",
    previousPasskeyCount: "audit_metadata_previous_passkey_count",
    previousTotpEnabled: "audit_metadata_previous_totp_enabled",
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
    permissions: "audit_metadata_permissions",
    format: "audit_metadata_format",
    entryCount: "audit_metadata_entry_count",
    action: "audit_filter_action",
    targetType: "audit_filter_target",
    user: "audit_filter_user",
    startDate: "audit_filter_start_date",
    endDate: "audit_filter_end_date",
    userCount: "audit_metadata_user_count",
    includedRoles: "audit_metadata_included_roles",
    includedAccountTypes: "audit_metadata_included_account_types",
    excludedRoles: "audit_metadata_excluded_roles",
    excludedAccountTypes: "audit_metadata_excluded_account_types",
    deletedCount: "audit_metadata_deleted_count",
    skippedCount: "audit_metadata_skipped_count",
    missingCount: "audit_metadata_missing_count",
    deletedKeys: "audit_metadata_deleted_keys",
    skippedKeys: "audit_metadata_skipped_keys",
    missingKeys: "audit_metadata_missing_keys",
    output: "audit_metadata_output",
    mode: "audit_metadata_mode",
    limit: "audit_metadata_limit",
    exitCode: "audit_metadata_exit_code",
    route: "audit_metadata_route",
    reason: "audit_metadata_reason",
    hasSubmittedToken: "audit_metadata_has_submitted_token",
    keys: "audit_metadata_keys",
    manifestPath: "audit_metadata_manifest_path",
    retirementMessages: "audit_metadata_retirement_messages",
    lastPostMessages: "audit_metadata_last_post_messages",
    comments: "audit_metadata_comments",
  };

  if (knownLabels[key]) {
    return translate(knownLabels[key]);
  }

  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMetadataValue(value) {
  return formatAuditValue(value);
}

function normalizeDisplayIp(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  if (text.startsWith("::ffff:")) {
    return text.slice(7);
  }

  if (text === "::1") {
    return "127.0.0.1";
  }

  return text;
}

function getAuditIpDisplay(metadata = {}) {
  const values = [
    metadata.ipAddress,
    ...(Array.isArray(metadata.ipAddresses) ? metadata.ipAddresses : []),
  ];
  const normalized = [];

  values.forEach((value) => {
    const displayValue = normalizeDisplayIp(value);

    if (displayValue && !normalized.includes(displayValue)) {
      normalized.push(displayValue);
    }

    if (String(value || "").trim() === "::1" && !normalized.includes("::1")) {
      normalized.push("::1");
    }
  });

  if (normalized.includes("127.0.0.1") && normalized.includes("::1")) {
    return "127.0.0.1 (::1)";
  }

  return normalized.join(", ");
}

function getAuditMetadataEntries(metadata = {}) {
  const ipDisplay = getAuditIpDisplay(metadata);

  return Object.entries(metadata)
    .filter(
      ([key, value]) =>
        key !== "ipAddresses" &&
        value !== undefined &&
        value !== null &&
        value !== "",
    )
    .map(([key, value]) =>
      key === "ipAddress" && ipDisplay ? [key, ipDisplay] : [key, value],
    );
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
  input.addEventListener("input", (event) => {
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
  select.addEventListener("change", (event) => onChange(event.target.value));

  label.append(labelSpan, select);
  return label;
}

function createAuditDateField(labelText, value, onChange) {
  const label = document.createElement("label");
  label.className = "admin-editor-field";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;

  if (window.CMCENDateTimePicker?.create) {
    const picker = window.CMCENDateTimePicker.create({
      name: labelText.replace(/\W+/g, "").toLowerCase() || "auditDate",
      date: value,
      includeTime: false,
      label: labelText,
      placeholder: labelText,
      onInput: ({ date }) => onChange(date),
    });

    label.append(labelSpan, picker);
    return label;
  }

  const input = document.createElement("input");
  input.type = "date";
  input.value = value;
  input.addEventListener("input", (event) => onChange(event.target.value));

  label.append(labelSpan, input);
  return label;
}

function buildAuditQueryParams() {
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

  if (auditState.startDate) {
    params.set("startDate", auditState.startDate);
  }

  if (auditState.endDate) {
    params.set("endDate", auditState.endDate);
  }

  return params;
}

function createAuditFilters() {
  const form = document.createElement("form");
  form.className = "audit-log-filters";

  form.append(
    createAuditSearchField(),
    createAuditSelect(
      translate("audit_filter_action"),
      auditState.action,
      auditActions,
      (value) => {
        auditState.action = value;
        loadAuditLogs();
      },
    ),
    createAuditSelect(
      translate("audit_filter_target"),
      auditState.targetType,
      auditTargetTypes,
      (value) => {
        auditState.targetType = value;
        loadAuditLogs();
      },
    ),
    createAuditDateField(
      translate("audit_filter_start_date"),
      auditState.startDate,
      (value) => {
        auditState.startDate = value;
      },
    ),
    createAuditDateField(
      translate("audit_filter_end_date"),
      auditState.endDate,
      (value) => {
        auditState.endDate = value;
      },
    ),
  );

  const filterButton = document.createElement("button");
  filterButton.type = "submit";
  filterButton.className =
    "admin-work-zone-button is-primary audit-log-filter-button";
  filterButton.textContent = translate("audit_filter_submit");
  form.append(filterButton);

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className =
    "admin-work-zone-button is-secondary audit-log-export-button";
  exportButton.textContent = translate("audit_export_csv");
  exportButton.disabled = auditState.isLoading;
  exportButton.addEventListener("click", () => exportAuditLogsCsv());
  form.append(exportButton);

  form.addEventListener("submit", (event) => {
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
  refresh.className =
    "admin-work-zone-button is-secondary audit-log-refresh-button";
  refresh.setAttribute("aria-label", translate("audit_refresh_label"));
  refresh.title = translate("admin_refresh");
  refresh.disabled = auditState.isLoading;

  const label = document.createElement("span");
  label.className = "audit-log-refresh-label";
  label.textContent = translate(
    auditState.isLoading ? "audit_refreshing_label" : "admin_refresh",
  );

  if (auditState.isLoading) {
    refresh.classList.add("is-loading");
    refresh.setAttribute("aria-label", translate("audit_refreshing_label"));
    refresh.title = translate("audit_refreshing_title");
  }

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");

  const topPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  topPath.setAttribute("d", "M21 12a9 9 0 0 0-15.5-6.2L3 8");

  const topArrow = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  topArrow.setAttribute("d", "M3 3v5h5");

  const bottomPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  bottomPath.setAttribute("d", "M3 12a9 9 0 0 0 15.5 6.2L21 16");

  const bottomArrow = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  bottomArrow.setAttribute("d", "M21 21v-5h-5");

  icon.append(topPath, topArrow, bottomPath, bottomArrow);
  refresh.append(icon, label);
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

  if (log.duplicateCount > 1) {
    const duplicateCount = document.createElement("span");
    duplicateCount.className = "audit-log-duplicate-count";
    duplicateCount.textContent = `×${log.duplicateCount}`;
    duplicateCount.setAttribute("aria-label", `×${log.duplicateCount}`);
    badges.append(duplicateCount);
  }

  header.append(title, badges);

  const details = document.createElement("p");
  details.className = "admin-post-details";
  details.append(
    document.createTextNode(
      `${formatAuditDate(log.createdAt)} · ${translate("audit_by_actor", {
        actor: getAuditActor(log),
      })}`,
    ),
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
  const metadataEntries = getAuditMetadataEntries(metadata);

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
  const visibleLogs = collapseDuplicateAuditLogs(auditState.logs);

  const panel = document.createElement("div");
  panel.className = "audit-log-panel";

  const heading = document.createElement("div");
  heading.className = "audit-log-heading";

  const titleWrapper = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = translate("audit_entries_heading", {
    count: visibleLogs.length,
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

  if (!visibleLogs.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = auditState.isLoading
      ? translate("audit_entries_loading")
      : translate("audit_entries_empty");
    panel.append(empty);
  } else {
    visibleLogs.forEach((log) => {
      panel.append(createAuditRow(log));
    });
  }

  auditLogContent.append(panel);
}

async function verifyAuditAccess() {
  const user = await auditApiJson("/api/me", {
    errorMessage: translate("admin_verify_error"),
  });

  if (user.permissions?.canViewAuditLog !== true) {
    window.location.href = "/dashboard";
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
    const params = buildAuditQueryParams();

    const data = await auditApiJson(
      `/api/audit-logs${params.toString() ? `?${params}` : ""}`,
      {
        errorMessage: translate("audit_log_load_error"),
      },
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

async function exportAuditLogsCsv() {
  if (!auditToken || auditState.isLoading) return;

  try {
    const params = buildAuditQueryParams();
    const { blob, filename } = await auditApiBlob(
      `/api/audit-logs/export.csv${params.toString() ? `?${params}` : ""}`,
      {
        errorMessage: translate("audit_log_export_error"),
      },
    );

    downloadAuditBlob(
      blob,
      filename ||
        `cmcen-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    showAuditToast(translate("audit_action_audit_exported"), "success");
  } catch (error) {
    showAuditToast(
      error.message || translate("audit_log_export_error"),
      "error",
    );
  }
}

document.addEventListener("languagechange", () => {
  renderAuditLog();
});

window.addEventListener("pageshow", () => {
  if (!CMCENUtils.requireAuthToken()) {
    window.location.replace("/login");
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
