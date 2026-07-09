(function () {
  function translateAdminTab(key) {
    const fallbacks = {
      admin_tab_users: "Users",
      admin_tab_roles: "Roles",
      admin_tab_pages: "Pages",
      admin_tab_media: "Media Manager",
      admin_tab_translations: "Translations",
      admin_tab_audit_log: "Audit Log",
      admin_tab_site_config: "Site Config"
    };
    const translated = typeof window.translate === "function"
      ? window.translate(key)
      : key;

    return translated === key
      ? fallbacks[key] || key
      : translated;
  }

  const tabItems = [
    {
      key: "users",
      href: "/admin-users.html",
      labelKey: "admin_tab_users",
      permission: "canReadUsers"
    },
    {
      key: "roles",
      href: "/admin-users.html?view=roles",
      labelKey: "admin_tab_roles",
      permission: "canManageRoles"
    },
    {
      key: "pages",
      href: "/pages-admin.html",
      labelKey: "admin_tab_pages",
      permission: "canManagePages"
    },
    {
      key: "media",
      href: "/admin-users.html?view=media",
      labelKey: "admin_tab_media",
      permission: "canViewMediaLibrary"
    },
    {
      key: "translations",
      href: "/translations-admin.html",
      labelKey: "admin_tab_translations",
      permission: "canManageTranslations"
    },
    {
      key: "audit-log",
      href: "/audit-log.html",
      labelKey: "admin_tab_audit_log",
      permission: "canViewAuditLog"
    },
    {
      key: "site-config",
      href: "/site-config.html",
      labelKey: "admin_tab_site_config",
      permission: "canAccessSiteConfig"
    }
  ];

  let currentPermissions = null;

  function getActiveAdminWorkZoneTab() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === "/admin-users.html" && params.get("view") === "media") {
      return "media";
    }

    if (path === "/admin-users.html" && params.get("view") === "roles") {
      return "roles";
    }

    if (path === "/admin-users.html") {
      return "users";
    }

    if (path === "/translations-admin.html") {
      return "translations";
    }

    if (path === "/pages-admin.html") {
      return "pages";
    }

    if (path === "/audit-log.html") {
      return "audit-log";
    }

    if (path === "/site-config.html") {
      return "site-config";
    }

    return "";
  }

  function renderAdminWorkZoneTabs(options = {}) {
    const tabs = document.getElementById("adminWorkZoneTabs") ||
      document.querySelector(".admin-work-zone-tabs");

    if (!tabs) return;

    if (Object.prototype.hasOwnProperty.call(options, "permissions")) {
      currentPermissions = options.permissions || null;
    }

    const active = options.active || getActiveAdminWorkZoneTab();
    const permissions = Object.prototype.hasOwnProperty.call(options, "permissions")
      ? options.permissions
      : currentPermissions;
    const includeSiteConfig = permissions
      ? permissions.canAccessSiteConfig === true
      : options.includeSiteConfig === true ||
        tabs.dataset.includeSiteConfig === "true" ||
        active === "site-config";

    tabs.dataset.includeSiteConfig = includeSiteConfig ? "true" : "false";
    tabs.classList.add("event-management-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.replaceChildren();

    tabItems
      .filter(item => !item.permission || !permissions || permissions[item.permission] === true)
      .filter(item => item.key !== "site-config" || includeSiteConfig)
      .forEach(item => {
        const link = document.createElement("a");
        const isActive = item.key === active;

        link.className = "admin-work-zone-tab";
        link.classList.add("event-management-tab");
        link.href = item.href;
        link.dataset.adminTab = item.key;
        link.setAttribute("role", "tab");
        link.setAttribute("aria-selected", String(isActive));
        link.textContent = translateAdminTab(item.labelKey);

        if (isActive) {
          link.setAttribute("aria-current", "page");
        }

        tabs.append(link);
      });

    CMCENUtils.activateTabs({
      active,
      tabs: tabs.querySelectorAll("[data-admin-tab]"),
      tabKey: "adminTab"
    });
  }

  window.renderAdminWorkZoneTabs = renderAdminWorkZoneTabs;
  window.updateAdminWorkZoneTabsForUser = function updateAdminWorkZoneTabsForUser(user) {
    renderAdminWorkZoneTabs({
      permissions: user?.permissions || null
    });
  };

  document.addEventListener("languagechange", () => {
    renderAdminWorkZoneTabs({ permissions: currentPermissions });
  });

  renderAdminWorkZoneTabs();
}());
