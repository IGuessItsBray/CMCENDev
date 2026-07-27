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
  migrations: {
    retirement: {
      isRunning: false,
      progress: 0,
      message: "",
      limit: "25",
      maxLimit: 1000,
      logs: [],
      summary: null,
    },
    comments: {
      isRunning: false,
      progress: 0,
      message: "",
      limit: "25",
      maxLimit: 1000,
      logs: [],
      summary: null,
    },
    lastPost: {
      isRunning: false,
      progress: 0,
      message: "",
      limit: "25",
      maxLimit: 1000,
      logs: [],
      summary: null,
    },
  },
};

const siteConfigMigrationLabels = {
  retirement: "site_config_migration_retirement",
  comments: "site_config_migration_comments",
  lastPost: "site_config_migration_last_post",
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

  operations.append(createMigrationSection(), createMaintenanceSection());

  return operations;
}

function createMigrationSection() {
  const section = document.createElement("section");
  section.className = "site-config-panel";
  section.setAttribute("aria-labelledby", "siteConfigMigrationsTitle");

  const heading = document.createElement("div");
  heading.className = "site-config-panel-heading";

  const title = document.createElement("h2");
  title.id = "siteConfigMigrationsTitle";
  title.textContent = translate("site_config_migrations_heading");

  const copy = document.createElement("p");
  copy.textContent = translate("site_config_migrations_copy");

  heading.append(title, copy);
  section.append(heading);

  Object.keys(siteConfigMigrationLabels).forEach((key) => {
    section.append(createMigrationControl(key));
  });

  return section;
}

function createMigrationControl(key) {
  const migration = siteConfigState.migrations[key] || {};
  const maxLimit = migration.maxLimit || 1000;
  const row = document.createElement("div");
  row.className = "site-config-operation";

  const body = document.createElement("div");
  body.className = "site-config-operation-body";

  const title = document.createElement("h3");
  title.textContent = translate(siteConfigMigrationLabels[key]);

  const message = document.createElement("p");
  message.textContent =
    migration.message || translate("site_config_migration_ready");

  const limitField = document.createElement("label");
  limitField.className = "site-config-limit";

  const limitLabel = document.createElement("span");
  limitLabel.textContent = translate("site_config_migration_limit");

  const limitInput = document.createElement("input");
  limitInput.type = "number";
  limitInput.inputMode = "numeric";
  limitInput.min = "1";
  limitInput.max = String(maxLimit);
  limitInput.step = "1";
  limitInput.value = migration.limit || "";
  limitInput.placeholder = translate("site_config_migration_limit_all");
  limitInput.disabled = migration.isRunning;
  limitInput.addEventListener("input", (event) => {
    updateMigrationState(key, {
      limit: event.target.value,
    });
  });

  limitField.append(limitLabel, limitInput);
  body.append(title, message, limitField);

  if (migration.summary) {
    body.append(createMigrationSummary(migration.summary));
  }

  if (migration.logs?.length) {
    body.append(createMigrationLog(migration.logs));
  }

  const progress = document.createElement("div");
  progress.className = "site-config-progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", String(migration.progress || 0));

  const bar = document.createElement("span");
  bar.style.width = `${migration.progress || 0}%`;
  progress.append(bar);

  const actions = document.createElement("div");
  actions.className = "site-config-actions";

  const dryRun = document.createElement("button");
  dryRun.type = "button";
  dryRun.className = "admin-work-zone-button is-secondary";
  dryRun.textContent = migration.isRunning
    ? translate("site_config_migration_running")
    : translate("site_config_migration_dry_run");
  dryRun.disabled = migration.isRunning;
  dryRun.addEventListener("click", () =>
    runSiteConfigMigration(key, "dry-run"),
  );

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "admin-work-zone-button is-danger";
  apply.textContent = translate("site_config_migration_apply");
  apply.disabled = migration.isRunning || !migration.summary;
  apply.addEventListener("click", () => runSiteConfigMigration(key, "apply"));

  actions.append(dryRun, apply);
  row.append(body, progress, actions);

  return row;
}

function createMigrationSummary(summary) {
  const list = document.createElement("dl");
  list.className = "site-config-summary";
  const items = [
    [
      translate("site_config_migration_summary_retirements"),
      summary.retirementMessages,
    ],
    [
      translate("site_config_migration_summary_last_posts"),
      summary.lastPostMessages,
    ],
    [translate("site_config_migration_summary_comments"), summary.comments],
    [
      translate("site_config_migration_summary_manifest"),
      summary.manifestPath || "-",
    ],
  ];

  items.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent =
      value === null || value === undefined ? "-" : String(value);
    list.append(term, detail);
  });

  return list;
}

function createMigrationLog(logs) {
  const log = document.createElement("div");
  log.className = "site-config-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-label", translate("site_config_migration_log_label"));

  logs.slice(-80).forEach((entry) => {
    const line = document.createElement("p");
    line.className = entry.type === "stderr" ? "is-error" : "";
    line.textContent = entry.message;
    log.append(line);
  });

  requestAnimationFrame(() => {
    log.scrollTop = log.scrollHeight;
  });

  return log;
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

    const migrationMeta = Array.isArray(data.migrations) ? data.migrations : [];
    const nextMigrations = { ...siteConfigState.migrations };

    migrationMeta.forEach((item) => {
      const key = typeof item === "string" ? item : item?.key;

      if (!key || !nextMigrations[key]) {
        return;
      }

      nextMigrations[key] = {
        ...nextMigrations[key],
        maxLimit: Number(item.maxLimit) || nextMigrations[key].maxLimit,
      };
    });

    setSiteConfigState({
      message: "",
      migrations: nextMigrations,
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

function updateMigrationState(key, nextState) {
  setSiteConfigState({
    migrations: {
      ...siteConfigState.migrations,
      [key]: {
        ...(siteConfigState.migrations[key] || {}),
        ...nextState,
      },
    },
  });
}

function startMigrationProgress(key) {
  let progress = 8;

  updateMigrationState(key, { progress });

  return window.setInterval(() => {
    progress = Math.min(progress + 8, 88);
    updateMigrationState(key, { progress });
  }, 900);
}

function appendMigrationLog(key, message, type = "stdout") {
  const migration = siteConfigState.migrations[key] || {};
  const logs = [
    ...(migration.logs || []),
    {
      type,
      message,
    },
  ].slice(-120);
  const progress = migration.isRunning
    ? Math.min((migration.progress || 8) + 2, 95)
    : migration.progress;

  updateMigrationState(key, {
    logs,
    progress,
  });
}

function parseMigrationStreamLine(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return {
      type: "log",
      stream: "stdout",
      message: line,
    };
  }
}

async function readMigrationStream(key, response) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error(translate("site_config_migration_stream_error"));
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() || "";

    lines.filter(Boolean).forEach((line) => {
      handleMigrationEvent(key, parseMigrationStreamLine(line));
    });
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    handleMigrationEvent(key, parseMigrationStreamLine(buffer.trim()));
  }
}

function handleMigrationEvent(key, event) {
  if (event.type === "start") {
    appendMigrationLog(key, event.message, "stdout");
    return;
  }

  if (event.type === "log") {
    appendMigrationLog(key, event.message, event.stream);
    return;
  }

  if (event.type === "summary") {
    appendMigrationLog(key, event.message, "stdout");
    updateMigrationState(key, {
      isRunning: false,
      progress: 100,
      message: event.message || translate("site_config_migration_success"),
      summary: event.summary || null,
    });
    return;
  }

  if (event.type === "error") {
    appendMigrationLog(key, event.message, "stderr");
    updateMigrationState(key, {
      isRunning: false,
      progress: 0,
      message: event.message || translate("site_config_migration_error"),
      summary: event.summary || null,
    });
  }
}

async function runSiteConfigMigration(key, mode) {
  const isApply = mode === "apply";
  const migration = siteConfigState.migrations[key] || {};
  const maxLimit = migration.maxLimit || 1000;
  const limitValue = String(migration.limit || "").trim();
  const limit = limitValue ? Number(limitValue) : null;

  if (
    limitValue &&
    (!Number.isInteger(limit) || limit < 1 || limit > maxLimit)
  ) {
    updateMigrationState(key, {
      message: translate("site_config_migration_limit_error").replace(
        "{max}",
        String(maxLimit),
      ),
    });
    return;
  }

  if (
    isApply &&
    !(await CMCENModal.confirm(
      translate("site_config_migration_apply_confirm"),
      {
        title: translate("site_config_migration_apply"),
        confirmText: translate("site_config_migration_apply"),
        destructive: true,
      },
    ))
  ) {
    return;
  }

  updateMigrationState(key, {
    isRunning: true,
    progress: 0,
    logs: [],
    summary: null,
    message: isApply
      ? translate("site_config_migration_applying")
      : translate("site_config_migration_dry_running"),
  });

  const progressTimer = startMigrationProgress(key);

  try {
    const response = await fetch(`/api/admin/site-config/migrations/${key}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${siteConfigAuthToken}`,
        "X-Config-Token": siteConfigToken,
      },
      body: JSON.stringify({
        mode,
        limit,
      }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || translate("site_config_migration_error"));
    }

    await readMigrationStream(key, response);
    window.clearInterval(progressTimer);

    if (siteConfigState.migrations[key]?.isRunning) {
      updateMigrationState(key, {
        isRunning: false,
        progress: 100,
        message: translate("site_config_migration_success"),
      });
    }
  } catch (error) {
    window.clearInterval(progressTimer);
    updateMigrationState(key, {
      isRunning: false,
      progress: 0,
      logs: [
        ...(siteConfigState.migrations[key]?.logs || []),
        {
          type: "stderr",
          message: error.message || translate("site_config_migration_error"),
        },
      ].slice(-120),
      message: error.message || translate("site_config_migration_error"),
    });
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
