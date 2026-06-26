function requireDashboardAuth() {
  const token = String(
    localStorage.getItem("token") ||
    localStorage.getItem("api_token") ||
    ""
  ).trim().replace(/^Bearer\s+/i, "");

  if (!token) {
    window.location.replace("/login.html");
    return null;
  }

  localStorage.setItem("token", token);
  localStorage.setItem("api_token", token);

  return token;
}

const token = requireDashboardAuth();

const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardContent = document.getElementById("dashboardContent");
const dashboardDetails = document.getElementById("dashboardDetails");
const dashboardActions = document.getElementById("dashboardActions");
const dashboardTitle = document.getElementById("dashboardTitle");
const dashboardMemberName = document.getElementById("dashboardMemberName");
const dashboardRoleSummary = document.getElementById("dashboardRoleSummary");
const dashboardRoleBadge = document.getElementById("dashboardRoleBadge");
const dashboardRoleDescription = document.getElementById("dashboardRoleDescription");

let currentDashboardUser = null;

function showDashboardLoading() {
  const spinner = document.createElement("span");
  const label = document.createElement("span");
  const message = translate("loading_text");

  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  label.className = "visually-hidden";
  label.textContent = message;

  dashboardStatus.replaceChildren(spinner, label);
  dashboardStatus.className = "dashboard-status is-loading";
  dashboardStatus.setAttribute("aria-label", message);
  dashboardStatus.hidden = false;
  dashboardContent.hidden = true;
}

function getRoleKey(role) {
  const knownRoles = [
    "subscriber",
    "contributor",
    "author",
    "editor",
    "administrator"
  ];

  return knownRoles.includes(role)
    ? role
    : "subscriber";
}

function formatContentArea(contentArea) {
  return String(contentArea)
    .replace(/[_-]+/g, " ")
    .replace(
      /\b\w/g,
      character => character.toUpperCase()
    );
}

function formatContentAreas(contentAreas) {
  if (
    !Array.isArray(contentAreas) ||
    contentAreas.length === 0
  ) {
    return translate("no_content_areas");
  }

  return contentAreas
    .map(formatContentArea)
    .join(", ");
}

function formatUserAddress(address = {}) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.stateProvince,
    address.postalCode,
    address.country
  ].filter(Boolean).join(", ");
}

function formatTranslatedOption(prefix, value) {
  return value
    ? translate(`${prefix}_${value}`)
    : "—";
}

function createDetailRow(labelKey, value) {
  const row = document.createElement("div");
  row.className = "dashboard-detail-row";

  const label = document.createElement("span");
  label.className = "dashboard-detail-label";
  label.textContent = translate(labelKey);

  const valueElement = document.createElement("span");
  valueElement.className = "dashboard-detail-value";
  valueElement.textContent = value || "—";

  row.append(label, valueElement);

  return row;
}

function createActionLink({ href, titleKey, descriptionKey }) {
  const link = document.createElement("a");
  link.className = "dashboard-action";
  link.href = href;

  const copy = document.createElement("span");
  copy.className = "dashboard-action-copy";

  const title = document.createElement("strong");
  title.textContent = translate(titleKey);

  const description = document.createElement("span");
  description.textContent = translate(descriptionKey);

  const arrow = document.createElement("span");
  arrow.className = "dashboard-action-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";

  copy.append(title, description);
  link.append(copy, arrow);

  return link;
}

function renderDashboard(user) {
  currentDashboardUser = user;

  const role = getRoleKey(user.role);
  const roleTitle = translate(`role_${role}`);
  // const displayName =
  //   user.accountName ||
  //   [user.firstName, user.lastName]
  //     .filter(Boolean)
  //     .join(" ") ||
  //   user.username ||
  //   "";
  const displayName = user.firstName;

  dashboardTitle.textContent =
    translate("dashboard_welcome", {
      name: displayName
    });

  dashboardMemberName.textContent = displayName;

  dashboardRoleBadge.textContent = roleTitle;
  dashboardRoleBadge.className = `dashboard-role-badge role-${role}`;
  dashboardRoleDescription.textContent = translate(`role_description_${role}`);
  dashboardRoleSummary.hidden = false;

  dashboardDetails.replaceChildren(
    createDetailRow(
      "first_name",
      user.firstName
    ),

    createDetailRow(
      "last_name",
      user.lastName
    ),

    createDetailRow(
      "field_email",
      user.email
    ),

    createDetailRow(
      "field_address",
      formatUserAddress(user.address)
    ),

    createDetailRow(
      "rank",
      user.rank
    ),

    createDetailRow(
      "post_nominals",
      user.postNominals
    ),

    createDetailRow(
      "company",
      user.company
    ),

    createDetailRow(
      "status",
      formatTranslatedOption("status", user.status)
    ),

    createDetailRow(
      "affiliation_element",
      formatTranslatedOption("element", user.affiliationElement)
    ),

    createDetailRow(
      "trade",
      user.trade
    ),

    createDetailRow(
      "trade_other",
      user.tradeOther
    ),

    createDetailRow(
      "current_unit",
      user.currentUnit
    ),

    createDetailRow(
      "field_content_areas",
      formatContentAreas(user.contentAreas)
    )
  );

  const actions = [];

  if (user.permissions?.canSubmitRetirementMessages === true) {
    actions.push({
      href: "/submit-retirement.html",
      titleKey: "dashboard_action_submit_retirement",
      descriptionKey: "dashboard_action_submit_retirement_description"
    });
  }

  if (user.permissions?.canCreateDrafts === true) {
    actions.push({
      href: "/submit-event.html",
      titleKey: "dashboard_action_submit_event",
      descriptionKey: "dashboard_action_submit_event_description"
    });
  }

  if (user.permissions?.canReviewAndPublish === true) {
    actions.push({
      href: "/review-events.html",
      titleKey: "dashboard_action_review_events",
      descriptionKey: "dashboard_action_review_events_description"
    });
  }

  if (user.permissions?.canManageTranslations === true) {
    actions.push({
      href: "/translations-admin.html",
      titleKey: "dashboard_action_manage_translations",
      descriptionKey: "dashboard_action_manage_translations_description"
    });
  }

  dashboardActions.replaceChildren(
    ...actions.map(createActionLink)
  );

  dashboardStatus.hidden = true;
  dashboardStatus.removeAttribute("aria-label");
  dashboardContent.hidden = false;
}

function showDashboardError(message) {
  dashboardStatus.replaceChildren();
  dashboardStatus.className = "dashboard-status";
  dashboardStatus.removeAttribute("aria-label");
  dashboardStatus.hidden = false;

  const error = document.createElement("p");
  error.className = "dashboard-error";
  error.textContent = message;

  dashboardStatus.appendChild(error);
}

async function loadDashboard() {
  showDashboardLoading();

  try {
    const response = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem("token");

      window.location.href = "/login.html";

      return;
    }

    if (!response.ok) {
      throw new Error(
        "Could not load account data"
      );
    }

    const user = await response.json();

    renderDashboard(user);
  } catch (error) {
    console.error(
      "Dashboard load failed:",
      error
    );

    showDashboardError(translate("dashboard_load_error"));
  }
}

document.addEventListener(
  "languagechange",
  () => {
    if (currentDashboardUser) {
      renderDashboard(currentDashboardUser);
      return;
    }

    if (dashboardStatus.classList.contains("is-loading")) {
      showDashboardLoading();
      dashboardTitle.textContent = translate("dashboard_title");
      return;
    }

    const error = dashboardStatus.querySelector(".dashboard-error");

    if (error) {
      error.textContent = translate("dashboard_load_error");
    }
  }
);

window.addEventListener("pageshow", () => {
  if (!requireDashboardAuth()) {
    window.location.replace("/login.html");
  }
});

loadDashboard();
