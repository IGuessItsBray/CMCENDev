function requireAuditToken() {
  const storedToken = String(
    localStorage.getItem("token") ||
    localStorage.getItem("api_token") ||
    ""
  ).trim().replace(/^Bearer\s+/i, "");

  if (!storedToken) {
    window.location.replace("/login.html");
    return null;
  }

  localStorage.setItem("token", storedToken);
  localStorage.setItem("api_token", storedToken);

  return storedToken;
}

const auditToken = requireAuditToken();
const auditLogStatus = document.getElementById("auditLogStatus");
const auditLogPage = document.getElementById("auditLogPage");
const auditLogContent = document.getElementById("auditLogContent");

let auditState = {
  logs: [],
  action: "",
  targetType: "",
  user: "",
  message: ""
};

const auditActions = [
  ["", "All actions"],
  ["user.login", "User login"],
  ["user.login_mfa_required", "MFA challenge"],
  ["content.created", "New content"],
  ["content.published", "Published"],
  ["content.deleted", "Deleted"],
  ["media.deleted", "Media deleted"],
  ["translation.updated", "Translation updated"],
  ["user.role_changed", "Role changed"],
  ["user.content_areas_changed", "Content areas changed"]
];

const auditTargetTypes = [
  ["", "All targets"],
  ["user", "Users"],
  ["event", "Events"],
  ["media", "Media"],
  ["translation", "Translations"],
  ["retirementMessage", "Retirement posts"],
  ["retirementComment", "Comments"]
];

function showAuditLoading(message = "Loading audit log") {
  const spinner = document.createElement("span");
  const label = document.createElement("span");

  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");
  label.className = "visually-hidden";
  label.textContent = message;

  auditLogStatus.replaceChildren(spinner, label);
  auditLogStatus.className = "dashboard-status is-loading";
  auditLogStatus.setAttribute("aria-label", message);
  auditLogStatus.hidden = false;
  auditLogPage.hidden = true;
}

function showAuditPage() {
  auditLogStatus.hidden = true;
  auditLogStatus.removeAttribute("aria-label");
  auditLogPage.hidden = false;
}

function setAuditStatus(message, state = "") {
  auditLogStatus.replaceChildren();
  auditLogStatus.className = "dashboard-status";
  auditLogStatus.hidden = false;
  auditLogStatus.removeAttribute("aria-label");

  if (state) {
    auditLogStatus.classList.add(`is-${state}`);
  }

  const text = document.createElement("p");
  text.textContent = message;
  auditLogStatus.append(text);
}

function formatAuditDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat(currentLang === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getAuditActor(log) {
  const actor = log.actorSnapshot || {};

  return (
    actor.accountName ||
    actor.username ||
    actor.email ||
    "System"
  );
}

function getAuditTarget(log) {
  const target = log.targetSnapshot || {};

  return (
    target.title ||
    target.key ||
    target.accountName ||
    target.username ||
    target.email ||
    log.targetType ||
    "Unknown target"
  );
}

function getTargetId(value) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    return value._id || value.id || "";
  }

  return "";
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
  return auditActions.find(item => item[0] === action)?.[1] || action;
}

function getAuditActionClass(action) {
  return `is-${String(action || "unknown")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/gi, "")}`;
}

function formatMetadataLabel(key) {
  const knownLabels = {
    previousRole: "Previous Role",
    newRole: "New Role",
    previousContentAreas: "Previous Content Areas",
    newContentAreas: "New Content Areas",
    commentContent: "Comment Content",
    deletedBy: "Deleted By",
    status: "Status",
    source: "Source",
    method: "Method",
    methods: "Methods",
    deletedComments: "Deleted Comments",
    changedLanguages: "Changed Languages",
    previousValues: "Previous Values",
    newValues: "New Values"
  };

  if (knownLabels[key]) {
    return knownLabels[key];
  }

  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "None";
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null);

    return entries.length
      ? entries.map(([key, item]) => `${key}: ${item}`).join("; ")
      : "None";
  }

  return String(value);
}

function createAuditSearchField() {
  const label = document.createElement("label");
  label.className = "admin-editor-field audit-log-user-search";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = "User";

  const input = document.createElement("input");
  input.type = "search";
  input.name = "user";
  input.value = auditState.user;
  input.placeholder = "Name, username, or email";
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
    option.textContent = optionLabel;
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
    createAuditSelect("Action", auditState.action, auditActions, value => {
      auditState.action = value;
      loadAuditLogs();
    }),
    createAuditSelect("Target", auditState.targetType, auditTargetTypes, value => {
      auditState.targetType = value;
      loadAuditLogs();
    })
  );

  const filterButton = document.createElement("button");
  filterButton.type = "submit";
  filterButton.className = "admin-work-zone-button is-primary audit-log-filter-button";
  filterButton.textContent = "Filter";
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
  refresh.setAttribute("aria-label", "Refresh audit log");
  refresh.title = "Refresh";

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
  refresh.append(icon);
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
  type.textContent = log.targetType || "target";

  badges.append(type);
  header.append(title, badges);

  const details = document.createElement("p");
  details.className = "admin-post-details";
  details.append(
    document.createTextNode(`${formatAuditDate(log.createdAt)} · By ${getAuditActor(log)} · `)
  );

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
  title.textContent = `Entries (${auditState.logs.length})`;
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
    empty.textContent = "No audit entries matched these filters.";
    panel.append(empty);
  } else {
    auditState.logs.forEach(log => {
      panel.append(createAuditRow(log));
    });
  }

  auditLogContent.append(panel);
}

async function verifyAuditAccess() {
  const response = await fetch("/api/me", {
    headers: {
      Authorization: `Bearer ${auditToken}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("api_token");
    window.location.href = "/login.html";
    return false;
  }

  if (!response.ok) {
    throw new Error("Could not verify administrator account");
  }

  const user = await response.json();

  if (user.permissions?.canManageUsers !== true) {
    window.location.href = "/dashboard.html";
    return false;
  }

  return true;
}

async function loadAuditLogs() {
  if (!auditToken) return;

  showAuditLoading();

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

    const response = await fetch(
      `/api/audit-logs${params.toString() ? `?${params}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${auditToken}`
        }
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("api_token");
      window.location.href = "/login.html";
      return;
    }

    if (response.status === 403) {
      window.location.href = "/dashboard.html";
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Could not load audit log");
    }

    auditState.logs = data.logs || [];
    auditState.message = "";
    showAuditPage();
    renderAuditLog();
  } catch (error) {
    showAuditPage();
    auditState.logs = [];
    auditState.message = error.message || "Could not load audit log";
    renderAuditLog();
  }
}

document.addEventListener("languagechange", () => {
  renderAuditLog();
});

window.addEventListener("pageshow", () => {
  if (!requireAuditToken()) {
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
    setAuditStatus(error.message || "Could not load audit log.", "error");
  }
}

if (auditToken) {
  initializeAuditLogPage();
} else {
  setAuditStatus("Sign in to continue.");
}
