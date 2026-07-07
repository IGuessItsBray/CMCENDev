const siteConfigAuthToken = CMCENUtils.requireAuthToken();
const siteConfigStatus = document.getElementById("siteConfigStatus");
const siteConfigPage = document.getElementById("siteConfigPage");
const siteConfigContent = document.getElementById("siteConfigContent");

let siteConfigToken = "";
let siteConfigState = {
  variables: [],
  message: "",
  isSaving: false
};

function showSiteConfigStatus(message, state = "") {
  CMCENUtils.setStatusMessage(siteConfigStatus, message, state);
  siteConfigPage.hidden = true;
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
    ...nextState
  };
  renderSiteConfig();
}

async function siteConfigFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: CMCENUtils.authHeaders(siteConfigAuthToken, {
      ...(options.headers || {}),
      "X-Config-Token": siteConfigToken
    })
  });
}

async function verifyDeveloperAccount() {
  const response = await fetch("/api/me", {
    headers: CMCENUtils.authHeaders(siteConfigAuthToken)
  });

  if (response.status === 401) {
    CMCENUtils.redirectToLogin();
    return null;
  }

  if (!response.ok) {
    throw new Error(translate("site_config_verify_error"));
  }

  const user = await response.json();

  if (user.role !== "developer") {
    window.location.href = "/dashboard.html";
    return null;
  }

  return user;
}

async function promptForConfigToken() {
  const token = window.prompt(translate("site_config_token_prompt"));

  if (!token) {
    throw new Error(translate("site_config_token_required"));
  }

  siteConfigToken = token;

  const response = await siteConfigFetch("/api/admin/site-config/verify", {
    method: "POST"
  });

  if (!response.ok) {
    siteConfigToken = "";
    throw new Error(translate("site_config_token_invalid"));
  }
}

async function logSiteConfigAccessRequest() {
  await fetch("/api/admin/site-config/access", {
    method: "POST",
    headers: CMCENUtils.authHeaders(siteConfigAuthToken)
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
  reload.disabled = siteConfigState.isSaving;
  reload.addEventListener("click", () => loadSiteConfig());

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = siteConfigState.isSaving
    ? translate("translations_saving")
    : translate("site_config_save");
  save.disabled = siteConfigState.isSaving;

  actions.append(reload, save);
  toolbar.append(copy, actions);

  return toolbar;
}

function createSiteConfigRow(variable) {
  const row = document.createElement("label");
  row.className = "site-config-row";

  const meta = document.createElement("span");
  meta.className = "site-config-key";
  meta.textContent = variable.key;

  if (variable.isSecret) {
    const badge = document.createElement("span");
    badge.className = "site-config-badge";
    badge.textContent = variable.isConfigToken
      ? translate("site_config_access_token_badge")
      : translate("site_config_sensitive_badge");
    meta.append(badge);
  }

  const input = document.createElement("input");
  input.name = variable.key;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.type = variable.isSecret ? "password" : "text";
  input.value = variable.value || "";
  input.dataset.originalValue = variable.value || "";

  if (variable.isConfigToken) {
    input.placeholder = translate("site_config_token_placeholder");
    input.dataset.originalValue = "";
  }

  row.append(meta, input);

  return row;
}

function getSiteConfigUpdates(form) {
  const updates = {};

  form.querySelectorAll("[name]").forEach(input => {
    const key = input.name;
    const value = input.value;
    const originalValue = input.dataset.originalValue || "";
    const isConfigTokenInput = key === "config_token" || key === "CONFIG_TOKEN";

    if (isConfigTokenInput && !value) {
      return;
    }

    if (value !== originalValue) {
      updates[key] = value;
    }
  });

  return updates;
}

function renderSiteConfig() {
  const form = document.createElement("form");
  form.className = "site-config-form";

  form.append(createSiteConfigMessage(), createSiteConfigToolbar());

  const fields = document.createElement("div");
  fields.className = "site-config-list";

  if (!siteConfigState.variables.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = translate("site_config_empty");
    fields.append(empty);
  } else {
    siteConfigState.variables.forEach(variable => {
      fields.append(createSiteConfigRow(variable));
    });
  }

  form.append(fields);
  form.addEventListener("submit", event => {
    event.preventDefault();
    saveSiteConfig(form);
  });

  siteConfigContent.replaceChildren(form);
}

async function loadSiteConfig() {
  setSiteConfigState({
    message: ""
  });

  try {
    const response = await siteConfigFetch("/api/admin/site-config");
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || translate("site_config_load_error"));
    }

    setSiteConfigState({
      variables: data.variables || [],
      message: ""
    });
    showSiteConfigPage();
  } catch (error) {
    setSiteConfigState({
      message: error.message || translate("site_config_load_error")
    });
  }
}

async function saveSiteConfig(form) {
  const updates = getSiteConfigUpdates(form);

  if (!Object.keys(updates).length) {
    setSiteConfigState({
      message: translate("site_config_no_changes")
    });
    return;
  }

  setSiteConfigState({
    isSaving: true,
    message: ""
  });

  try {
    const response = await siteConfigFetch("/api/admin/site-config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ updates })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || translate("site_config_save_error"));
    }

    setSiteConfigState({
      variables: data.variables || [],
      isSaving: false,
      message: data.message || translate("site_config_save_success")
    });
  } catch (error) {
    setSiteConfigState({
      isSaving: false,
      message: error.message || translate("site_config_save_error")
    });
  }
}

async function initializeSiteConfigPage() {
  showSiteConfigLoading();

  try {
    const user = await verifyDeveloperAccount();

    if (!user) return;

    window.updateAdminWorkZoneTabsForUser(user);

    await logSiteConfigAccessRequest();
    await promptForConfigToken();
    await loadSiteConfig();
  } catch (error) {
    showSiteConfigStatus(error.message || translate("site_config_load_error"), "error");
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
