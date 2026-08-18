const siteConfigAuthToken = CMCENUtils.requireAuthToken();
const siteConfigStatus = document.getElementById("siteConfigStatus");
const siteConfigPage = document.getElementById("siteConfigPage");
const siteConfigContent = document.getElementById("siteConfigContent");

let siteConfigToken = "";
let siteConfigState = {
  message: "",
  canManageSiteConfig: false,
  isDeveloper: false,
  isPurgingAnalytics: false,
};

function showSiteConfigStatus(message, state = "") {
  CMCENUtils.setStatusMessage(siteConfigStatus, message, state);
  siteConfigPage.hidden = true;
}

function showSiteConfigToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide",
  });
}

function showSiteConfigLoading(message = translate("site_config_loading")) {
  CMCENUtils.setStatusLoading(siteConfigStatus, message);
  siteConfigPage.hidden = true;
}

function showSiteConfigPage() {
  siteConfigStatus.hidden = true;
  siteConfigStatus.removeAttribute("aria-label");
  siteConfigPage.hidden = false;
}

function setSiteConfigState(nextState) {
  siteConfigState = {
    ...siteConfigState,
    ...nextState,
  };
  renderSiteConfig();
}

function siteConfigApiJson(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: siteConfigAuthToken,
    redirectOnUnauthorized: true,
    headers: {
      ...(options.headers || {}),
      "X-Config-Token": siteConfigToken,
    },
    unauthorizedMessage: translate("site_config_verify_error"),
  });
}

async function verifySiteConfigAccess() {
  const user = await CMCENUtils.apiJson("/api/me", {
    token: siteConfigAuthToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("site_config_verify_error"),
    errorMessage: translate("site_config_verify_error"),
  });

  if (user.permissions?.canAccessSiteConfig !== true) {
    window.location.href = "/dashboard";
    return null;
  }

  return user;
}

async function promptForConfigToken() {
  const token = await CMCENModal.prompt(translate("site_config_token_prompt"), {
    title: translate("site_config_heading"),
    inputLabel: translate("site_config_token_prompt"),
    inputType: "password",
    autocomplete: "off",
    confirmText: translate("modal_confirm"),
  });

  if (!token) {
    throw new Error(translate("site_config_token_required"));
  }

  siteConfigToken = token;

  try {
    await siteConfigApiJson("/api/admin/site-config/verify", {
      method: "POST",
      errorMessage: translate("site_config_token_invalid"),
    });
  } catch (error) {
    siteConfigToken = "";
    throw new Error(translate("site_config_token_invalid"));
  }
}

async function logSiteConfigAccessRequest() {
  await CMCENUtils.apiJson("/api/admin/site-config/access", {
    method: "POST",
    token: siteConfigAuthToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("site_config_verify_error"),
  });
}

function createSiteConfigMessage() {
  const message = document.createElement("p");
  message.className = "admin-work-zone-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = !siteConfigState.message;
  message.textContent = siteConfigState.message;

  return message;
}

function createSiteConfigToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "site-config-toolbar";

  const copy = document.createElement("p");
  copy.textContent = translate("site_config_toolbar_copy");

  const actions = document.createElement("div");
  actions.className = "site-config-actions";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "admin-work-zone-button is-secondary";
  reload.textContent = translate("site_config_reload");
  reload.addEventListener("click", () => loadSiteConfig());

  actions.append(reload);
  toolbar.append(copy, actions);

  return toolbar;
}

function renderSiteConfig() {
  const content = document.createElement("div");
  content.className = "site-config-form";

  content.append(
    createSiteConfigMessage(),
    createSiteConfigToolbar(),
    createSiteConfigOperations(),
  );

  siteConfigContent.replaceChildren(content);
}

function createSiteConfigOperations() {
  const operations = document.createElement("div");
  operations.className = "site-config-operations";

  if (!siteConfigState.canManageSiteConfig || !siteConfigState.isDeveloper) {
    return operations;
  }

  operations.append(createMaintenanceSection());

  return operations;
}

function createMaintenanceSection() {
  const section = document.createElement("section");
  section.className = "site-config-panel";
  section.setAttribute("aria-labelledby", "siteConfigMaintenanceTitle");

  const heading = document.createElement("div");
  heading.className = "site-config-panel-heading";

  const title = document.createElement("h2");
  title.id = "siteConfigMaintenanceTitle";
  title.textContent = translate("site_config_maintenance_heading");

  const copy = document.createElement("p");
  copy.textContent = translate("site_config_maintenance_copy");

  const actions = document.createElement("div");
  actions.className = "site-config-actions";

  const purgeAnalytics = document.createElement("button");
  purgeAnalytics.type = "button";
  purgeAnalytics.className = "admin-work-zone-button is-danger";
  purgeAnalytics.textContent = siteConfigState.isPurgingAnalytics
    ? translate("site_config_analytics_purging")
    : translate("site_config_analytics_purge");
  purgeAnalytics.disabled = siteConfigState.isPurgingAnalytics;
  purgeAnalytics.addEventListener("click", purgeAnalyticsHistory);

  actions.append(purgeAnalytics);
  heading.append(title, copy);
  section.append(heading, actions);

  return section;
}

async function loadSiteConfig() {
  setSiteConfigState({
    message: "",
  });

  try {
    const data = await siteConfigApiJson("/api/admin/site-config", {
      errorMessage: translate("site_config_load_error"),
    });

    setSiteConfigState({
      message: "",
    });
    showSiteConfigPage();
  } catch (error) {
    setSiteConfigState({
      message: error.message || translate("site_config_load_error"),
    });
  }
}

async function purgeAnalyticsHistory() {
  if (
    !(await CMCENModal.confirm(
      translate("site_config_analytics_purge_confirm"),
      {
        title: translate("site_config_analytics_purge"),
        confirmText: translate("site_config_analytics_purge"),
        destructive: true,
      },
    ))
  ) {
    return;
  }

  setSiteConfigState({
    isPurgingAnalytics: true,
    message: "",
  });

  try {
    const data = await siteConfigApiJson("/api/admin/site-config/analytics", {
      method: "DELETE",
      errorMessage: translate("site_config_analytics_purge_error"),
    });

    setSiteConfigState({
      isPurgingAnalytics: false,
      message: "",
    });
    showSiteConfigToast(
      data.message || translate("site_config_analytics_purge_success"),
      "success",
    );
  } catch (error) {
    setSiteConfigState({
      isPurgingAnalytics: false,
      message: "",
    });
    showSiteConfigToast(
      error.message || translate("site_config_analytics_purge_error"),
      "error",
    );
  }
}

async function initializeSiteConfigPage() {
  showSiteConfigLoading();

  try {
    const user = await verifySiteConfigAccess();

    if (!user) return;

    window.updateAdminWorkZoneTabsForUser(user);
    setSiteConfigState({
      canManageSiteConfig: user.permissions?.canManageSiteConfig === true,
      isDeveloper: user.role === "developer",
    });

    await logSiteConfigAccessRequest();
    await promptForConfigToken();
    await loadSiteConfig();
  } catch (error) {
    showSiteConfigStatus(
      error.message || translate("site_config_load_error"),
      "error",
    );
  }
}

document.addEventListener("languagechange", () => {
  renderSiteConfig();
});

if (siteConfigAuthToken) {
  initializeSiteConfigPage();
} else {
  showSiteConfigStatus(translate("sign_in_to_continue"));
}
