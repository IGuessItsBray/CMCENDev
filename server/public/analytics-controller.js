"use strict";
(() => {
  function mount({
    api,
    onDenied,
    root = document.getElementById("adminAnalyticsBody"),
  }) {
    const t = (key) => window.translate(`admin_next_analytics_${key}`);
    const lifecycle = new AbortController();
    let request,
      generation = 0,
      disposed = false,
      loading = false,
      failed = false;
    let config = null,
      data = null,
      range = "30d",
      iframe = null;
    const toolbar = document.createElement("div");
    toolbar.className = "analytics-toolbar";
    const label = document.createElement("label");
    label.className = "analytics-range-field";
    const caption = document.createElement("span");
    const select = document.createElement("select");
    select.className = "cmcen-control";
    for (const value of ["7d", "30d", "90d", "all"]) {
      const option = document.createElement("option");
      option.value = value;
      select.append(option);
    }
    select.value = range;
    label.append(caption, select);
    const refresh = document.createElement("button");
    refresh.type = "button";
    toolbar.append(label, refresh);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const analyticsContent = document.createElement("div");
    analyticsContent.className = "analytics-content";
    root.replaceChildren(toolbar, status, analyticsContent);
    function update() {
      caption.textContent = t("range");
      for (const option of select.children)
        option.textContent = t(option.value);
      label.hidden = config?.enabled !== false;
      refresh.textContent = window.translate(
        failed ? "admin_next_retry" : "admin_refresh",
      );
      refresh.disabled = loading;
      status.textContent = loading ? t("loading") : failed ? t("error") : "";
      status.hidden = !loading && !failed;
      analyticsContent.setAttribute("aria-busy", String(loading));
    }
    function formatNumber(value) {
      return new Intl.NumberFormat(
        document.documentElement.lang || "en",
      ).format(Number(value || 0));
    }

    function formatDate(value) {
      if (!value || Number.isNaN(new Date(value).getTime())) return "";

      return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
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
      emptyText = t("empty"),
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
        label.textContent = item.label || t("unknown");

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
      heading.textContent = t("recent");
      panel.append(heading);

      if (!visits?.length) {
        const empty = document.createElement("p");
        empty.className = "admin-empty-state";
        empty.textContent = t("empty");
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
            ? [t("registered_visit"), visit.userRole || ""]
                .filter(Boolean)
                .join(" ")
            : t("guest_visit"),
          visit.source || t("direct"),
          visit.deviceType || t("unknown"),
          visit.osType || t("unknown"),
          visit.browser || t("unknown"),
          visit.country || t("unknown"),
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
      const current = data || {};
      const totals = current.totals || {};

      analyticsContent.replaceChildren();

      const stats = document.createElement("section");
      stats.className = "analytics-stat-grid";
      stats.append(
        createCard(t("visits"), totals.visits),
        createCard(t("unique"), totals.uniqueVisitors),
        createCard(t("registered"), totals.uniqueRegistered),
        createCard(t("guests"), totals.uniqueGuests),
      );
      const trafficSourcesTooltip = t("sources_help");

      const grid = document.createElement("div");
      grid.className = "analytics-grid";
      grid.append(
        createBreakdown(t("pages"), current.pages),
        createBreakdown(
          t("sources"),
          current.sources,
          t("empty"),
          trafficSourcesTooltip,
        ),
        createBreakdown(t("devices"), current.devices),
        createBreakdown(t("systems"), current.operatingSystems),
        createBreakdown(t("browsers"), current.browsers),
        createBreakdown(t("countries"), current.countries),
        createBreakdown(t("roles"), current.roles),
      );

      analyticsContent.append(
        stats,
        grid,
        createRecentVisits(current.recentVisits),
      );
    }

    function embedUrl() {
      const url = new URL(config.embedUrl);
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error("Invalid embed URL");
      url.searchParams.set(
        "theme",
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
      return url.toString();
    }
    function renderEmbed() {
      const url = embedUrl();
      iframe = document.createElement("iframe");
      iframe.className = "analytics-plausible-embed";
      iframe.src = url;
      iframe.title = "Plausible Analytics";
      iframe.loading = "lazy";
      iframe.scrolling = "no";
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("plausible-embed", "");
      const attribution = document.createElement("a");
      attribution.href = "https://plausible.io";
      attribution.target = "_blank";
      attribution.rel = "noopener noreferrer";
      attribution.className = "analytics-plausible-attribution";
      attribution.textContent = "Plausible Analytics";
      analyticsContent.replaceChildren(iframe, attribution);
      // The provider's resize helper is shared across mounts, like other page assets.
      if (
        config.scriptUrl &&
        !document.querySelector("script[data-plausible-embed]")
      ) {
        const source = new URL(config.scriptUrl);
        if (!["http:", "https:"].includes(source.protocol))
          throw new Error("Invalid embed script");
        const script = document.createElement("script");
        script.async = true;
        script.src = source.toString();
        script.dataset.plausibleEmbed = "true";
        document.body.append(script);
      }
    }
    async function load() {
      if (disposed) return;
      request?.abort();
      request = new AbortController();
      const token = ++generation;
      const signal = AbortSignal.any([request.signal, lifecycle.signal]);
      loading = true;
      failed = false;
      data = null;
      iframe = null;
      analyticsContent.replaceChildren();
      update();
      try {
        if (!config) {
          const result = await api("/api/analytics/embed", { signal });
          if (disposed || token !== generation) return;
          if (typeof result.enabled !== "boolean")
            throw new Error("Invalid embed configuration");
          config = result;
        }
        if (config.enabled) renderEmbed();
        else {
          const result = await api(
            `/api/analytics?${new URLSearchParams({ range })}`,
            { signal },
          );
          if (disposed || token !== generation) return;
          if (!result.totals || typeof result.totals !== "object")
            throw new Error("Invalid analytics summary");
          data = result;
          renderAnalytics();
        }
      } catch (error) {
        if (disposed || token !== generation) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        failed = true;
        analyticsContent.replaceChildren();
      } finally {
        if (!disposed && token === generation) {
          loading = false;
          update();
        }
      }
    }
    select.addEventListener(
      "change",
      () => {
        range = select.value;
        return load();
      },
      { signal: lifecycle.signal },
    );
    refresh.addEventListener("click", load, { signal: lifecycle.signal });
    document.addEventListener(
      "languagechange",
      () => {
        if (disposed) return;
        update();
        if (data) renderAnalytics();
      },
      { signal: lifecycle.signal },
    );
    document.addEventListener(
      "themechange",
      () => {
        if (!disposed && iframe) iframe.src = embedUrl();
      },
      { signal: lifecycle.signal },
    );
    const ready = load();
    return {
      ready,
      canNavigate: () => true,
      hasUnsavedChanges: () => false,
      dispose() {
        disposed = true;
        generation++;
        request?.abort();
        lifecycle.abort();
        data = null;
        config = null;
        iframe = null;
        root.replaceChildren();
      },
    };
  }
  window.AnalyticsController = { mount };
})();
