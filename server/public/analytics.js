const analyticsToken = CMCENUtils.requireAuthToken();
const analyticsStatus = document.getElementById("analyticsStatus");
const analyticsPage = document.getElementById("analyticsPage");
const analyticsContent = document.getElementById("analyticsContent");

const analyticsState = {
  range: "30d",
  data: null,
  isLoading: false,
};

function analyticsText(key, fallback) {
  const translated = typeof translate === "function" ? translate(key) : key;
  return translated === key ? fallback : translated;
}

function showAnalyticsLoading() {
  CMCENUtils.setStatusLoading(
    analyticsStatus,
    analyticsText("analytics_loading", "Loading analytics..."),
  );
  analyticsPage.hidden = true;
}

function showAnalyticsPage() {
  analyticsStatus.hidden = true;
  analyticsStatus.removeAttribute("aria-label");
  analyticsPage.hidden = false;
}

function setAnalyticsStatus(message, state = "error") {
  CMCENUtils.setStatusMessage(analyticsStatus, message, state);
  analyticsPage.hidden = true;
}

async function analyticsApi(path, options = {}) {
  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      auth: true,
      token: analyticsToken,
      redirectOnUnauthorized: true,
      unauthorizedMessage: analyticsText(
        "admin_verify_error",
        "Please sign in again.",
      ),
    });
  } catch (error) {
    if (error.status === 403) {
      window.location.href = "/dashboard";
    }

    throw error;
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createCard(label, value) {
  const card = document.createElement("article");
  card.className = "analytics-stat-card";

  const valueElement = document.createElement("strong");
  valueElement.textContent = formatNumber(value);

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  card.append(valueElement, labelElement);
  return card;
}

function createRangeToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "analytics-toolbar";

  const label = document.createElement("label");
  label.className = "admin-editor-field analytics-range-field";

  const labelText = document.createElement("span");
  labelText.textContent = analyticsText("analytics_range", "Range");

  const select = document.createElement("select");

  [
    ["7d", "Last 7 days"],
    ["30d", "Last 30 days"],
    ["90d", "Last 90 days"],
    ["all", "All time"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  });
  select.value = analyticsState.range;

  select.addEventListener("change", () => {
    analyticsState.range = select.value;
    loadAnalytics(true);
  });

  label.append(labelText, select);

  toolbar.append(label);
  return toolbar;
}

function createPanelHeading(title, tooltip = "") {
  const heading = document.createElement("h2");
  heading.className = "analytics-panel-heading";

  const text = document.createElement("span");
  text.textContent = title;
  heading.append(text);

  if (tooltip) {
    const help = document.createElement("span");
    help.className = "analytics-help";
    help.tabIndex = 0;
    help.setAttribute("role", "img");
    help.setAttribute("aria-label", tooltip);
    help.dataset.tooltip = tooltip;
    help.textContent = "?";
    heading.append(help);
  }

  return heading;
}

function getBreakdownCount(item) {
  return item.visits ?? item.visitors ?? 0;
}

function createBreakdown(
  title,
  items,
  emptyText = "No visits yet",
  tooltip = "",
) {
  const panel = document.createElement("section");
  panel.className = "analytics-panel";

  panel.append(createPanelHeading(title, tooltip));

  if (!items?.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = emptyText;
    panel.append(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "analytics-breakdown-list";
  const max = Math.max(...items.map(getBreakdownCount), 1);

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "analytics-breakdown-row";

    const meta = document.createElement("div");
    meta.className = "analytics-breakdown-meta";

    const label = document.createElement("span");
    label.textContent = item.label || "Unknown";

    const count = document.createElement("strong");
    count.textContent = formatNumber(getBreakdownCount(item));

    const meter = document.createElement("span");
    meter.className = "analytics-meter";
    meter.style.setProperty(
      "--analytics-meter-width",
      `${Math.max((getBreakdownCount(item) / max) * 100, 4)}%`,
    );

    meta.append(label, count);
    row.append(meta, meter);
    list.append(row);
  });

  panel.append(list);
  return panel;
}

function createRecentVisits(visits) {
  const panel = document.createElement("section");
  panel.className = "analytics-panel analytics-recent-panel";

  const heading = document.createElement("h2");
  heading.textContent = "Recent visits";
  panel.append(heading);

  if (!visits?.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "No visits yet";
    panel.append(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "analytics-recent-list";

  visits.forEach((visit) => {
    const item = document.createElement("article");
    item.className = "analytics-recent-item";

    const title = document.createElement("strong");
    title.textContent = visit.path || "/";

    const details = document.createElement("span");
    details.textContent = [
      visit.isRegistered
        ? `registered ${visit.userRole || ""}`.trim()
        : "guest",
      visit.source || "direct",
      visit.deviceType || "unknown",
      visit.osType || "Unknown",
      visit.browser || "Unknown",
      visit.country || "Unknown",
    ]
      .filter(Boolean)
      .join(" · ");

    const time = document.createElement("time");
    time.dateTime = visit.createdAt || "";
    time.textContent = formatDate(visit.createdAt);

    item.append(title, details, time);
    list.append(item);
  });

  panel.append(list);
  return panel;
}

function renderAnalytics() {
  const data = analyticsState.data || {};
  const totals = data.totals || {};

  analyticsContent.replaceChildren();
  analyticsContent.append(createRangeToolbar());

  const stats = document.createElement("section");
  stats.className = "analytics-stat-grid";
  stats.append(
    createCard("Visits", totals.visits),
    createCard("Unique visitors", totals.uniqueVisitors),
    createCard("Registered visitors", totals.uniqueRegistered),
    createCard("Guest visitors", totals.uniqueGuests),
  );
  const trafficSourcesTooltip =
    "Direct means no outside referrer was sent, including typed URLs, bookmarks, and same-site navigation. Internal is historical same-site traffic recorded before this dashboard treated it as direct.";

  const grid = document.createElement("div");
  grid.className = "analytics-grid";
  grid.append(
    createBreakdown("Visits by page", data.pages),
    createBreakdown(
      "Traffic sources",
      data.sources,
      "No visits yet",
      trafficSourcesTooltip,
    ),
    createBreakdown("Device types", data.devices),
    createBreakdown("Operating systems", data.operatingSystems),
    createBreakdown("Browsers", data.browsers),
    createBreakdown("Countries", data.countries),
    createBreakdown("Unique visitors by role", data.roles),
  );

  analyticsContent.append(stats, grid, createRecentVisits(data.recentVisits));
}

function getPlausibleEmbedUrl(embedUrl) {
  const url = new URL(embedUrl);
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  url.searchParams.set("theme", theme);
  return url.toString();
}

function renderPlausibleEmbed(config) {
  analyticsContent.replaceChildren();

  const iframe = document.createElement("iframe");
  iframe.className = "analytics-plausible-embed";
  iframe.src = getPlausibleEmbedUrl(config.embedUrl);
  iframe.scrolling = "no";
  iframe.loading = "lazy";
  iframe.title = "Plausible Analytics";
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("plausible-embed", "");

  document.addEventListener("themechange", () => {
    iframe.src = getPlausibleEmbedUrl(config.embedUrl);
  });

  const attribution = document.createElement("div");
  attribution.className = "analytics-plausible-attribution";
  attribution.append("Stats powered by ");

  const link = document.createElement("a");
  link.href = "https://plausible.io";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Plausible Analytics";
  attribution.append(link);

  analyticsContent.append(iframe, attribution);

  if (
    config.scriptUrl &&
    !document.querySelector("script[data-plausible-embed]")
  ) {
    const script = document.createElement("script");
    script.async = true;
    script.src = config.scriptUrl;
    script.dataset.plausibleEmbed = "true";
    document.body.append(script);
  }
}

async function verifyAnalyticsAccess() {
  const user = await analyticsApi("/api/me", {
    errorMessage: analyticsText(
      "admin_verify_error",
      "Could not verify your account.",
    ),
  });

  if (typeof updateAdminWorkZoneTabsForUser === "function") {
    updateAdminWorkZoneTabsForUser(user);
  }

  if (!user.permissions?.canViewAnalytics) {
    window.location.href = "/dashboard";
    return false;
  }

  return true;
}

async function loadAnalytics(preserveLayout = false) {
  if (!analyticsToken) return;

  analyticsState.isLoading = true;

  if (!preserveLayout) {
    showAnalyticsLoading();
  }

  try {
    const params = new URLSearchParams({ range: analyticsState.range });
    analyticsState.data = await analyticsApi(`/api/analytics?${params}`);
    analyticsState.range = analyticsState.data.range || analyticsState.range;
    analyticsState.isLoading = false;
    renderAnalytics();
    showAnalyticsPage();
  } catch (error) {
    analyticsState.isLoading = false;
    setAnalyticsStatus(error.message || "Failed to load analytics");
  }
}

async function initAnalytics() {
  try {
    showAnalyticsLoading();
    const hasAccess = await verifyAnalyticsAccess();

    if (hasAccess) {
      const plausibleEmbed = await analyticsApi("/api/analytics/embed");
      if (plausibleEmbed.enabled) {
        renderPlausibleEmbed(plausibleEmbed);
        showAnalyticsPage();
        return;
      }

      await loadAnalytics(true);
    }
  } catch (error) {
    setAnalyticsStatus(error.message || "Failed to load analytics");
  }
}

if (analyticsToken) {
  initAnalytics();
}
