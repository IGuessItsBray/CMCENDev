(function () {
  function translateAdminTab(key) {
    const fallbacks = {
      admin_tab_users: "Users",
      admin_tab_roles: "Roles",
      admin_tab_pages: "Pages",
      admin_tab_media: "Media Manager",
      admin_tab_translations: "Translations",
      admin_tab_audit_log: "Audit Log",
      admin_tab_analytics: "Analytics",
      admin_tab_timers: "Banners",
      admin_tab_site_config: "Site Config",
      admin_tab_subscriptions: "Subscriptions",
    };
    const translated =
      typeof window.translate === "function" ? window.translate(key) : key;

    return translated === key ? fallbacks[key] || key : translated;
  }

  const tabItems = [
    {
      key: "subscriptions",
      href: "/admin-users?view=subscriptions",
      labelKey: "admin_tab_subscriptions",
      permission: "canManageSubscriptions",
    },
    {
      key: "users",
      href: "/admin-users",
      labelKey: "admin_tab_users",
      permission: "canReadUsers",
    },
    {
      key: "roles",
      href: "/admin-users?view=roles",
      labelKey: "admin_tab_roles",
      permission: "canManageRoles",
    },
    {
      key: "pages",
      href: "/pages-admin",
      labelKey: "admin_tab_pages",
      permission: "canManagePages",
    },
    {
      key: "media",
      href: "/admin-users?view=media",
      labelKey: "admin_tab_media",
      permission: "canViewMediaLibrary",
    },
    {
      key: "translations",
      href: "/translations-admin",
      labelKey: "admin_tab_translations",
      permission: "canManageTranslations",
    },
    {
      key: "audit-log",
      href: "/audit-log",
      labelKey: "admin_tab_audit_log",
      permission: "canViewAuditLog",
    },
    {
      key: "analytics",
      href: "/analytics",
      labelKey: "admin_tab_analytics",
      permission: "canViewAnalytics",
    },
    {
      key: "timers",
      href: "/timers-admin",
      labelKey: "admin_tab_timers",
      permission: "canManageTimers",
    },
    {
      key: "site-config",
      href: "/site-config",
      labelKey: "admin_tab_site_config",
      permission: "canAccessSiteConfig",
    },
  ];

  let currentPermissions = null;
  let activeTooltip = null;

  function removeTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(trigger) {
    removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "admin-work-zone-tooltip";
    tooltip.textContent = trigger.dataset.tooltip || "";
    document.body.append(tooltip);

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        window.innerWidth - tooltipRect.width - 12,
      ),
    );
    const top = Math.max(12, triggerRect.bottom + 10);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    activeTooltip = tooltip;
  }

  function getActiveAdminWorkZoneTab() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === "/admin-users" && params.get("view") === "media") {
      return "media";
    }

    if (path === "/admin-users" && params.get("view") === "roles") {
      return "roles";
    }
    if (path === "/admin-users" && params.get("view") === "subscriptions")
      return "subscriptions";

    if (path === "/admin-users") {
      return "users";
    }

    if (path === "/translations-admin") {
      return "translations";
    }

    if (path === "/pages-admin") {
      return "pages";
    }

    if (path === "/audit-log") {
      return "audit-log";
    }

    if (path === "/analytics") {
      return "analytics";
    }

    if (path === "/timers-admin") {
      return "timers";
    }

    if (path === "/site-config") {
      return "site-config";
    }

    return "";
  }

  function renderAdminWorkZoneTabs(options = {}) {
    const tabs =
      document.getElementById("adminWorkZoneTabs") ||
      document.querySelector(".admin-work-zone-tabs");

    if (!tabs) return;

    if (Object.prototype.hasOwnProperty.call(options, "permissions")) {
      currentPermissions = options.permissions || null;
    }

    const active = options.active || getActiveAdminWorkZoneTab();
    const permissions = Object.prototype.hasOwnProperty.call(
      options,
      "permissions",
    )
      ? options.permissions
      : currentPermissions;
    const includeSiteConfig = permissions
      ? permissions.canAccessSiteConfig === true
      : options.includeSiteConfig === true ||
        tabs.dataset.includeSiteConfig === "true" ||
        active === "site-config";

    tabs.dataset.includeSiteConfig = includeSiteConfig ? "true" : "false";
    tabs.setAttribute("role", "tablist");
    tabs.replaceChildren();

    tabItems
      .filter(
        (item) =>
          !item.permission ||
          !permissions ||
          permissions[item.permission] === true,
      )
      .filter((item) => item.key !== "site-config" || includeSiteConfig)
      .forEach((item) => {
        const link = document.createElement("a");
        const isActive = item.key === active;

        link.className = "admin-work-zone-tab";
        link.href = item.href;
        link.dataset.adminTab = item.key;
        link.setAttribute("role", "tab");
        link.setAttribute("aria-selected", String(isActive));
        link.textContent = translateAdminTab(item.labelKey);

        if (item.key === "timers" && isActive) {
          const help = document.createElement("span");
          help.className = "admin-work-zone-tab-help";
          help.textContent = "?";
          help.dataset.tooltip = translateAdminTab("timers_tab_help");
          help.setAttribute("aria-label", help.dataset.tooltip);
          help.tabIndex = 0;
          help.addEventListener("mouseenter", () => showTooltip(help));
          help.addEventListener("mouseleave", removeTooltip);
          help.addEventListener("focus", () => showTooltip(help));
          help.addEventListener("blur", removeTooltip);
          help.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showTooltip(help);
          });
          link.append(help);
        }

        if (isActive) {
          link.setAttribute("aria-current", "page");
        }

        tabs.append(link);
      });

    CMCENUtils.activateTabs({
      active,
      tabs: tabs.querySelectorAll("[data-admin-tab]"),
      tabKey: "adminTab",
    });
  }

  window.renderAdminWorkZoneTabs = renderAdminWorkZoneTabs;
  window.updateAdminWorkZoneTabsForUser =
    function updateAdminWorkZoneTabsForUser(user) {
      renderAdminWorkZoneTabs({
        permissions: user?.permissions || null,
      });
    };

  document.addEventListener("languagechange", () => {
    renderAdminWorkZoneTabs({ permissions: currentPermissions });
  });

  renderAdminWorkZoneTabs();
})();
