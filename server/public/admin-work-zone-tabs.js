(function () {
  function translateAdminTab(key) {
    const fallbacks = {
      admin_tab_main: "Account",
      admin_tab_users: "Users",
      admin_tab_roles: "Roles",
      admin_tab_pages: "Pages",
      admin_tab_media: "Media Manager",
      admin_tab_translations: "Translations",
      admin_tab_audit_log: "Audit Log",
      admin_tab_analytics: "Analytics",
      admin_tab_timers: "Banners",
      admin_tab_subscriptions: "Subscriptions",
      admin_tools_tabs_label: "Admin tools",
    };
    const translated =
      typeof window.translate === "function" ? window.translate(key) : key;

    return translated === key ? fallbacks[key] || key : translated;
  }

  const tabItems = [
    {
      key: "main",
      href: "/dashboard",
      labelKey: "admin_tab_main",
    },
    {
      key: "users",
      href: "/admin-users",
      labelKey: "admin_tab_users",
      permission: "canReadUsers",
    },
    {
      key: "subscriptions",
      href: "/admin-users?view=subscriptions",
      labelKey: "admin_tab_subscriptions",
      permission: "canManageSubscriptions",
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
      hideOnMobile: true,
    },
    {
      key: "timers",
      href: "/timers-admin",
      labelKey: "admin_tab_timers",
      permission: "canManageTimers",
    },
    {
      key: "translations",
      href: "/translations-admin",
      labelKey: "admin_tab_translations",
      permission: "canManageTranslations",
    },
    {
      key: "media",
      href: "/admin-users?view=media",
      labelKey: "admin_tab_media",
      permission: "canViewMediaLibrary",
      hideOnMobile: true,
    },
    {
      key: "analytics",
      href: "/analytics",
      labelKey: "admin_tab_analytics",
      permission: "canViewAnalytics",
    },
    {
      key: "audit-log",
      href: "/audit-log",
      labelKey: "admin_tab_audit_log",
      permission: "canViewAuditLog",
    },
  ];

  let currentPermissions = null;
  let activeTooltip = null;
  let mobileSectionMenuController = null;
  const compactAdminTabs = window.matchMedia("(max-width: 700px)");

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

    if (path === "/dashboard") {
      return params.get("adminTool") || "main";
    }

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
    const hasPermissions = permissions && typeof permissions === "object";
    if (!hasPermissions) {
      tabs.replaceChildren();
      tabs.hidden = true;
      return;
    }

    const permittedItems = tabItems.filter(
      (item) => !item.permission || permissions[item.permission] === true,
    );
    const visibleItems = compactAdminTabs.matches
      ? permittedItems.filter((item) => item.hideOnMobile !== true)
      : permittedItems;

    tabs.replaceChildren();
    tabs.hidden = visibleItems.length <= 1;
    if (tabs.hidden) return;

    if (compactAdminTabs.matches) {
      tabs.classList.add("is-mobile-select");
      tabs.removeAttribute("role");

      mobileSectionMenuController?.abort();
      mobileSectionMenuController = new AbortController();
      const { signal } = mobileSectionMenuController;

      const label = document.createElement("span");
      label.className = "admin-work-zone-tab-select-label";
      label.textContent = translateAdminTab("admin_tools_tabs_label");

      const menu = document.createElement("div");
      menu.className = "admin-work-zone-section-menu";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "admin-work-zone-section-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "adminWorkZoneSectionOptions");

      const activeItem = visibleItems.find((item) => item.key === active);
      const toggleLabel = document.createElement("span");
      toggleLabel.textContent = activeItem
        ? translateAdminTab(activeItem.labelKey)
        : translateAdminTab("admin_tools_tabs_label");
      const chevron = document.createElement("span");
      chevron.className = "admin-work-zone-section-chevron";
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(toggleLabel, chevron);

      const optionsList = document.createElement("div");
      optionsList.className = "admin-work-zone-section-options";
      optionsList.id = "adminWorkZoneSectionOptions";
      optionsList.hidden = true;

      visibleItems.forEach((item) => {
        const option = document.createElement("a");
        option.className = "admin-work-zone-section-option";
        option.href =
          item.key === "main"
            ? "/dashboard"
            : `/dashboard?adminTool=${encodeURIComponent(item.key)}`;
        option.textContent = translateAdminTab(item.labelKey);
        option.dataset.adminTab = item.key;
        if (item.key === active) {
          option.setAttribute("aria-current", "page");
        }
        optionsList.append(option);
      });

      const positionOptions = () => {
        const rect = toggle.getBoundingClientRect();
        const viewportPadding = 12;
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top - viewportPadding;
        const menuHeight = optionsList.scrollHeight;
        const openAbove =
          menuHeight > spaceBelow && spaceAbove > spaceBelow;
        const availableHeight = Math.max(
          120,
          openAbove ? spaceAbove : spaceBelow,
        );
        const top = openAbove
          ? Math.max(viewportPadding, rect.top - 6 - Math.min(menuHeight, availableHeight))
          : Math.min(
              rect.bottom + 6,
              window.innerHeight - viewportPadding - Math.min(menuHeight, availableHeight),
            );

        Object.assign(optionsList.style, {
          position: "fixed",
          top: `${Math.round(top)}px`,
          left: `${Math.round(rect.left)}px`,
          width: `${Math.round(rect.width)}px`,
          maxHeight: `${Math.floor(availableHeight)}px`,
          overflowY: "auto",
          zIndex: "2000",
        });
      };

      const setMenuOpen = (isOpen) => {
        menu.classList.toggle("is-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));

        if (isOpen) {
          document.body.append(optionsList);
          optionsList.hidden = false;
          positionOptions();
          return;
        }

        optionsList.hidden = true;
        menu.append(optionsList);
        optionsList.removeAttribute("style");
      };

      const repositionOpenMenu = () => {
        if (optionsList.hidden) return;

        const rect = toggle.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setMenuOpen(false);
          return;
        }

        positionOptions();
      };

      toggle.addEventListener("click", () => {
        setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
      });

      window.addEventListener("scroll", repositionOpenMenu, {
        capture: true,
        passive: true,
        signal,
      });
      window.addEventListener("resize", repositionOpenMenu, { signal });

      document.addEventListener(
        "pointerdown",
        (event) => {
          if (!menu.contains(event.target) && !optionsList.contains(event.target)) {
            setMenuOpen(false);
          }
        },
        { signal },
      );
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") setMenuOpen(false);
        },
        { signal },
      );

      menu.append(toggle, optionsList);
      tabs.append(label, menu);
      return;
    }

    mobileSectionMenuController?.abort();
    mobileSectionMenuController = null;
    tabs.classList.remove("is-mobile-select");
    tabs.setAttribute("role", "tablist");

    visibleItems.forEach((item) => {
        const link = document.createElement("a");
        const isActive = item.key === active;

        link.className = "admin-work-zone-tab";
        link.href =
          item.key === "main"
            ? "/dashboard"
            : `/dashboard?adminTool=${encodeURIComponent(item.key)}`;
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

  compactAdminTabs.addEventListener("change", () => {
    renderAdminWorkZoneTabs({ permissions: currentPermissions });
  });

  renderAdminWorkZoneTabs();
})();
