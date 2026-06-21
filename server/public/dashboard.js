function requireDashboardAuth() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.replace("/login.html");
    return null;
  }

  return token;
}

const token = requireDashboardAuth();

const dashboardStatus =
  document.getElementById("dashboardStatus");

const dashboardContent =
  document.getElementById("dashboardContent");

const dashboardDetails =
  document.getElementById("dashboardDetails");

const dashboardActions =
  document.getElementById("dashboardActions");

const dashboardMemberName =
  document.getElementById("dashboardMemberName");

const dashboardRoleBadge =
  document.getElementById("dashboardRoleBadge");

const dashboardAccess =
  document.getElementById("dashboardAccess");

const dashboardAccessTitle =
  document.getElementById("dashboardAccessTitle");

const dashboardAccessDescription =
  document.getElementById(
    "dashboardAccessDescription"
  );

let currentDashboardUser = null;

function translate(key) {
  return (
    translations[currentLang]?.[key] ??
    translations.en?.[key] ??
    key
  );
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

function createDetailRow(labelKey, value) {
  const row = document.createElement("div");
  row.className = "dashboard-detail-row";

  const label = document.createElement("span");
  label.className = "dashboard-detail-label";
  label.textContent = translate(labelKey);

  const valueElement =
    document.createElement("span");

  valueElement.className =
    "dashboard-detail-value";

  valueElement.textContent =
    value || "—";

  row.append(label, valueElement);

  return row;
}

function createActionLink({
  href,
  titleKey,
  descriptionKey
}) {
  const link = document.createElement("a");
  link.className = "dashboard-action";
  link.href = href;

  const copy = document.createElement("span");
  copy.className = "dashboard-action-copy";

  const title = document.createElement("strong");
  title.textContent = translate(titleKey);

  const description =
    document.createElement("span");

  description.textContent =
    translate(descriptionKey);

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
  const roleTitle =
    translate(`role_${role}`);

  dashboardMemberName.textContent =
    user.accountName ||
    user.username ||
    "";

  dashboardRoleBadge.textContent =
    roleTitle;

  dashboardRoleBadge.className =
    `dashboard-role-badge role-${role}`;

  dashboardRoleBadge.hidden = false;

  dashboardDetails.replaceChildren(
    createDetailRow(
      "field_username",
      user.username
    ),

    createDetailRow(
      "field_email",
      user.email
    ),

    createDetailRow(
      "field_account_name",
      user.accountName
    ),

    createDetailRow(
      "field_content_areas",
      formatContentAreas(user.contentAreas)
    )
  );

  const actions = [
    {
      href: "/calendar.html",
      titleKey: "dashboard_action_calendar",
      descriptionKey:
        "dashboard_action_calendar_description"
    }
  ];

  if (
    user.permissions?.canCreateDrafts === true
  ) {
    actions.push({
      href: "/submit-event.html",
      titleKey:
        "dashboard_action_submit_event",
      descriptionKey:
        "dashboard_action_submit_event_description"
    });
  }

  if (
    user.permissions
      ?.canReviewAndPublish === true
  ) {
    actions.push({
      href: "/review-events.html",
      titleKey:
        "dashboard_action_review_events",
      descriptionKey:
        "dashboard_action_review_events_description"
    });
  }

  dashboardActions.replaceChildren(
    ...actions.map(createActionLink)
  );

  dashboardAccessTitle.textContent =
    roleTitle;

  dashboardAccessDescription.textContent =
    translate(
      `role_description_${role}`
    );

  dashboardStatus.hidden = true;
  dashboardContent.hidden = false;
  dashboardAccess.hidden = false;
}

function showDashboardError(message) {
  dashboardStatus.replaceChildren();
  dashboardStatus.hidden = false;

  const error = document.createElement("p");
  error.className = "dashboard-error";
  error.textContent = message;

  dashboardStatus.appendChild(error);
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem("token");

      window.location.href =
        "/login.html";

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

    showDashboardError(
      translate("dashboard_load_error")
    );
  }
}

document.addEventListener(
  "languagechange",
  () => {
    if (currentDashboardUser) {
      renderDashboard(
        currentDashboardUser
      );

      return;
    }

    const error =
      dashboardStatus.querySelector(
        ".dashboard-error"
      );

    if (error) {
      error.textContent =
        translate("dashboard_load_error");
    }
  }
);

window.addEventListener("pageshow", () => {
  if (!localStorage.getItem("token")) {
    window.location.replace("/login.html");
  }
});

loadDashboard();