function requireSiteConfigToken() {
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

const siteConfigAuthToken = requireSiteConfigToken();
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
  siteConfigStatus.replaceChildren();
  siteConfigStatus.className = "dashboard-status";
  siteConfigStatus.hidden = false;
  siteConfigStatus.removeAttribute("aria-label");
  siteConfigPage.hidden = true;

  if (state) {
    siteConfigStatus.classList.add(`is-${state}`);
  }

  const text = document.createElement("p");
  text.textContent = message;
  siteConfigStatus.append(text);
}

function showSiteConfigLoading(message = "Loading site config") {
  const spinner = document.createElement("span");
  const label = document.createElement("span");

  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  label.className = "visually-hidden";
  label.textContent = message;

  siteConfigStatus.replaceChildren(spinner, label);
  siteConfigStatus.className = "dashboard-status is-loading";
  siteConfigStatus.setAttribute("aria-label", message);
  siteConfigStatus.hidden = false;
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
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${siteConfigAuthToken}`,
      "X-Config-Token": siteConfigToken
    }
  });
}

async function verifyDeveloperAccount() {
  const response = await fetch("/api/me", {
    headers: {
      Authorization: `Bearer ${siteConfigAuthToken}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("api_token");
    window.location.href = "/login.html";
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not verify developer account");
  }

  const user = await response.json();

  if (user.role !== "developer") {
    window.location.href = "/dashboard.html";
    return null;
  }

  return user;
}

async function promptForConfigToken() {
  const token = window.prompt("Enter the site config access token.");

  if (!token) {
    throw new Error("Site config token is required.");
  }

  siteConfigToken = token;

  const response = await siteConfigFetch("/api/admin/site-config/verify", {
    method: "POST"
  });

  if (!response.ok) {
    siteConfigToken = "";
    throw new Error("Invalid site config token.");
  }
}

async function logSiteConfigAccessRequest() {
  await fetch("/api/admin/site-config/access", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${siteConfigAuthToken}`
    }
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
  copy.textContent =
    "Values are read from the server .env file. The config token is never displayed; enter a new value only when rotating it.";

  const actions = document.createElement("div");
  actions.className = "site-config-actions";

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "admin-work-zone-button is-secondary";
  reload.textContent = "Reload .env";
  reload.disabled = siteConfigState.isSaving;
  reload.addEventListener("click", () => loadSiteConfig());

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = siteConfigState.isSaving ? "Saving..." : "Save changes";
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
    badge.textContent = variable.isConfigToken ? "Access token" : "Sensitive";
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
    input.placeholder = "Enter a new token to rotate";
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
    empty.textContent = "No environment variables were found.";
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
      throw new Error(data.error || "Could not load site configuration");
    }

    setSiteConfigState({
      variables: data.variables || [],
      message: ""
    });
    showSiteConfigPage();
  } catch (error) {
    setSiteConfigState({
      message: error.message || "Could not load site configuration"
    });
  }
}

async function saveSiteConfig(form) {
  const updates = getSiteConfigUpdates(form);

  if (!Object.keys(updates).length) {
    setSiteConfigState({
      message: "No configuration changes to save."
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
      throw new Error(data.error || "Could not save site configuration");
    }

    setSiteConfigState({
      variables: data.variables || [],
      isSaving: false,
      message: data.message || "Site configuration updated."
    });
  } catch (error) {
    setSiteConfigState({
      isSaving: false,
      message: error.message || "Could not save site configuration"
    });
  }
}

async function initializeSiteConfigPage() {
  showSiteConfigLoading();

  try {
    const user = await verifyDeveloperAccount();

    if (!user) return;

    await logSiteConfigAccessRequest();
    await promptForConfigToken();
    await loadSiteConfig();
  } catch (error) {
    showSiteConfigStatus(error.message || "Could not load site config.", "error");
  }
}

if (siteConfigAuthToken) {
  initializeSiteConfigPage();
} else {
  showSiteConfigStatus("Sign in to continue.");
}
