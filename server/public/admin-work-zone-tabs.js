(function () {
  function translateAdminTab(key) {
    return typeof window.translate === "function"
      ? window.translate(key)
      : key;
  }

  const tabItems = [
    {
      key: "users",
      href: "/admin-users.html",
      labelKey: "admin_tab_users"
    },
    {
      key: "media",
      href: "/admin-users.html?view=media",
      labelKey: "admin_tab_media"
    },
    {
      key: "translations",
      href: "/translations-admin.html",
      labelKey: "admin_tab_translations"
    },
    {
      key: "audit-log",
      href: "/audit-log.html",
      labelKey: "admin_tab_audit_log"
    },
    {
      key: "site-config",
      href: "/site-config.html",
      labelKey: "admin_tab_site_config",
      developerOnly: true
    }
  ];

  function getActiveAdminWorkZoneTab() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (path === "/admin-users.html" && params.get("view") === "media") {
      return "media";
    }

    if (path === "/admin-users.html") {
      return "users";
    }

    if (path === "/translations-admin.html") {
      return "translations";
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

    const active = options.active || getActiveAdminWorkZoneTab();
    const includeSiteConfig = options.includeSiteConfig === true ||
      tabs.dataset.includeSiteConfig === "true" ||
      active === "site-config";

    tabs.dataset.includeSiteConfig = includeSiteConfig ? "true" : "false";
    tabs.replaceChildren();

    tabItems
      .filter(item => !item.developerOnly || includeSiteConfig)
      .forEach(item => {
        const link = document.createElement("a");
        const isActive = item.key === active;

        link.className = "admin-work-zone-tab";
        link.classList.toggle("is-active", isActive);
        link.href = item.href;
        link.textContent = translateAdminTab(item.labelKey);

        if (isActive) {
          link.setAttribute("aria-current", "page");
        }

        tabs.append(link);
      });
  }

  window.renderAdminWorkZoneTabs = renderAdminWorkZoneTabs;
  window.updateAdminWorkZoneTabsForUser = function updateAdminWorkZoneTabsForUser(user) {
    renderAdminWorkZoneTabs({
      includeSiteConfig: user?.role === "developer"
    });
  };

  document.addEventListener("languagechange", () => {
    renderAdminWorkZoneTabs();
  });

  renderAdminWorkZoneTabs();
}());
