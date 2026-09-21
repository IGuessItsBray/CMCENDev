"use strict";

(() => {
  const shell = document.getElementById("dashboardNext");
  const content = document.getElementById("dashboardNextContent");
  const status = document.getElementById("dashboardNextStatus");
  const account = document.getElementById("dashboardNextAccount");
  const retry = document.getElementById("dashboardNextRetry");
  const areas = {
    users: {
      permission: "canReadUsers",
      link: document.getElementById("adminUsersLink"),
      element: document.getElementById("adminUsers"),
      title: "adminUsersTitle",
      mount: (options) => window.DashboardNextUsers.mount(options),
    },
    roles: {
      permission: "canManageRoles",
      link: document.getElementById("adminRolesLink"),
      element: document.getElementById("adminRoles"),
      title: "adminRolesTitle",
      mount: (options) =>
        window.DashboardNextRoles.mount({
          ...options,
          onRolesChanged: (roles) => areas.users.instance?.updateRoles(roles),
        }),
    },
    banners: {
      permission: "canManageTimers",
      link: document.getElementById("adminBannersLink"),
      element: document.getElementById("adminBanners"),
      title: "adminBannersTitle",
      mount: (options) => window.DashboardNextBanners.mount(options),
    },
    subscriptions: {
      permission: "canManageSubscriptions",
      link: document.getElementById("adminSubscriptionsLink"),
      element: document.getElementById("adminSubscriptions"),
      title: "adminSubscriptionsTitle",
      mount: (options) => window.DashboardNextSubscriptions.mount(options),
    },
    pages: {
      permission: "canManagePages",
      link: document.getElementById("adminPagesLink"),
      element: document.getElementById("adminPages"),
      title: "adminPagesTitle",
      mount: (options) => window.PagesEditor.mount(options),
    },
    translations: {
      permission: "canManageTranslations",
      link: document.getElementById("adminTranslationsLink"),
      element: document.getElementById("adminTranslations"),
      title: "adminTranslationsTitle",
      mount: (options) => window.TranslationsEditor.mount(options),
    },
    media: {
      permission: "canViewMediaLibrary",
      link: document.getElementById("adminMediaLink"),
      element: document.getElementById("adminMedia"),
      title: "adminMediaTitle",
      mount: (options) => window.DashboardNextMedia.mount(options),
    },
    certificates: {
      permission: "canManageCertificateRequests",
      link: document.getElementById("adminCertificatesLink"),
      element: document.getElementById("adminCertificates"),
      title: "adminCertificatesTitle",
      mount: (options) => window.CertificateRequests.mount(options),
    },
    analytics: {
      permission: "canViewAnalytics",
      link: document.getElementById("adminAnalyticsLink"),
      element: document.getElementById("adminAnalytics"),
      title: "adminAnalyticsTitle",
      mount: (options) => window.AnalyticsController.mount(options),
    },
    audit: {
      permission: "canViewAuditLog",
      link: document.getElementById("adminAuditLink"),
      element: document.getElementById("adminAudit"),
      title: "adminAuditTitle",
      mount: (options) => window.AuditLogController.mount(options),
    },
    awards: {
      permission: "canReviewAndPublish",
      link: document.getElementById("adminAwardsLink"),
      element: document.getElementById("adminAwards"),
      title: "adminAwardsTitle",
      mount: (options) => window.DashboardNextAwards.mount(options),
    },
  };
  const areaMessage = document.getElementById("adminAreaMessage");
  const signOut = document.getElementById("adminSignOut");
  const sidebarToggle = document.getElementById("adminSidebarToggle");
  const sidebarContents = document.getElementById("adminSidebarContents");
  let sidebarCollapsed = false;

  // Text fields can match :focus-visible after a click. Keep the stronger ring
  // for keyboard navigation while preserving a quiet pointer-focus treatment.
  document.addEventListener("pointerdown", () => {
    shell.dataset.inputModality = "pointer";
  });
  document.addEventListener("keydown", (event) => {
    if (
      ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.key,
      )
    )
      shell.dataset.inputModality = "keyboard";
  });

  function updateSidebar() {
    content.dataset.sidebarCollapsed = String(sidebarCollapsed);
    sidebarContents.inert = sidebarCollapsed;
    sidebarContents.setAttribute("aria-hidden", String(sidebarCollapsed));
    sidebarToggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
    const label = window.translate(
      sidebarCollapsed
        ? "admin_next_expand_sidebar"
        : "admin_next_collapse_sidebar",
    );
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.setAttribute("title", label);
  }
  sidebarToggle.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    updateSidebar();
  });
  updateSidebar();
  // Follow the visible header's actual height as its copy or actions wrap.
  if (typeof ResizeObserver === "function") {
    const headerObserver = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const height = target.getBoundingClientRect().height;
        if (height > 0)
          shell.style.setProperty("--admin-header-height", `${height}px`);
      }
    });
    document
      .querySelectorAll(".admin-area > section > .admin-area-heading")
      .forEach((header) => headerObserver.observe(header));
  }
  // Match administrative entry points, not role names or contribution rights.
  const adminPermissions = [
    "canReviewAndPublish",
    "canManageNews",
    "canManageEventRsvps",
    "canManageCertificateRequests",
    "canReadUsers",
    "canManageSubscriptions",
    "canManageRoles",
    "canManagePages",
    "canManageTimers",
    "canManageTranslations",
    "canViewMediaLibrary",
    "canViewAnalytics",
    "canViewAuditLog",
  ];
  let request = null;
  let session = null;
  let areaRequests = new AbortController();
  let currentUrl = "";
  let areaMessageKey = "";

  function resetAreas() {
    areaRequests.abort();
    areaRequests = new AbortController();
    Object.values(areas).forEach((area) => {
      area.instance?.dispose();
      area.instance = null;
      area.element.hidden = true;
      area.link.removeAttribute("aria-current");
    });
  }

  async function areaApi(area, path, options = {}) {
    const { timeoutMs = 15000, ...requestOptions } = options;
    const owner = session;
    if (!owner || owner.permissions[area.permission] !== true) {
      throw Object.assign(new Error("Access denied"), { status: 403 });
    }
    try {
      const fetcher =
        options.parseJson === false ? CMCENUtils.apiFetch : CMCENUtils.apiJson;
      return await fetcher(path, {
        ...requestOptions,
        auth: true,
        cache: "no-store",
        signal: AbortSignal.any(
          [
            areaRequests.signal,
            timeoutMs === null ? null : AbortSignal.timeout(timeoutMs),
            options.signal,
          ].filter(Boolean),
        ),
      });
    } catch (error) {
      if (session === owner && error.status === 401) {
        resetAreas();
        session = null;
        CMCENUtils.clearAuthToken();
        setState("signed-out");
        window.location.replace("/login");
      }
      throw error;
    }
  }

  function showAreaMessage(key) {
    areaMessageKey = key;
    areaMessage.textContent = window.translate(key);
    areaMessage.hidden = false;
    Object.values(areas).forEach((area) => {
      area.element.hidden = true;
      area.link.removeAttribute("aria-current");
    });
  }

  function route(focus = false) {
    if (!session) return;
    const url = new URL(window.location.href);
    const available = Object.keys(areas).filter(
      (key) => session.permissions[areas[key].permission] === true,
    );
    Object.entries(areas).forEach(([key, area]) => {
      area.link.hidden = !available.includes(key);
      area.element.hidden = true;
      area.link.removeAttribute("aria-current");
    });
    if (!url.searchParams.has("area") && available.length) {
      url.searchParams.set("area", available[0]);
      window.history.replaceState(null, "", url);
    }
    currentUrl = url.href;
    const key = url.searchParams.get("area");
    const area = areas[key];
    if (area && available.includes(key)) {
      areaMessage.hidden = true;
      areaMessageKey = "";
      area.element.hidden = false;
      area.link.setAttribute("aria-current", "page");
      if (!area.instance)
        area.instance = area.mount({
          api: (path, options) => areaApi(area, path, options),
          permissions: session.permissions,
          user: session,
          navigate: navigateAway,
          onDenied: () => {
            if (!session) return;
            session = {
              ...session,
              permissions: { ...session.permissions, [area.permission]: false },
            };
            area.instance?.dispose();
            area.instance = null;
            route();
          },
        });
      if (focus) document.getElementById(area.title).focus();
    } else {
      showAreaMessage(
        area
          ? "admin_next_denied_title"
          : key
            ? "admin_next_area_missing"
            : "admin_next_no_areas",
      );
      if (focus) areaMessage.focus();
    }
  }

  function setState(state) {
    shell.dataset.state = state;
    shell.setAttribute("aria-busy", String(state === "loading"));
    status.hidden = state === "ready";
    shell.querySelectorAll("[data-shell-state]").forEach((message) => {
      message.hidden = message.dataset.shellState !== state;
    });
    content.hidden = state !== "ready";
    account.hidden = !["denied", "error"].includes(state);
    retry.hidden = state !== "error";
  }

  async function loadSession() {
    leaving = false;
    resetAreas();
    request?.abort();
    const controller = new AbortController();
    request = controller;
    session = null;
    setState("loading");
    let timeout;
    try {
      const token = CMCENUtils.getStoredAuthToken();
      if (!token) {
        setState("signed-out");
        window.location.replace("/login");
        return;
      }
      timeout = window.setTimeout(() => controller.abort(), 15000);
      const user = await CMCENUtils.apiJson("/api/me", {
        token,
        signal: controller.signal,
        cache: "no-store",
      });
      if (request !== controller) return;
      if (!user || typeof user.permissions !== "object" || !user.permissions) {
        throw new Error("Invalid session response");
      }
      if (
        !adminPermissions.some(
          (permission) => user.permissions[permission] === true,
        )
      ) {
        setState("denied");
        return;
      }
      session = user;
      setState("ready");
      route();
    } catch (error) {
      if (request !== controller) return;
      if (error.status === 401) {
        CMCENUtils.clearAuthToken();
        setState("signed-out");
        window.location.replace("/login");
      } else {
        setState(error.status === 403 ? "denied" : "error");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // Future sections consume this session instead of fetching /api/me again.
  // The server continues to authorize every protected API operation.
  window.dashboardNext = Object.freeze({ getSession: () => session });
  let navigationPending = false;
  let leaving = false;
  const hasUnsavedChanges = () =>
    Object.values(areas).some((area) => area.instance?.hasUnsavedChanges());
  const areasReady = () =>
    Object.values(areas).every(
      (area) => area.instance?.canNavigate?.() !== false,
    );
  async function canLeave() {
    if (!areasReady()) return false;
    if (!hasUnsavedChanges()) return true;
    const owner = session;
    const accepted = await window.CMCENModal.confirm(
      window.translate("admin_next_leave_unsaved"),
      {
        title: window.translate("content_workspace_unsaved_changes_title"),
        confirmText: window.translate("content_workspace_discard_changes"),
        destructive: true,
      },
    );
    return accepted && session === owner && areasReady();
  }
  function canNavigate(url) {
    const destination = areas[url.searchParams.get("area")];
    if (!destination || session?.permissions[destination.permission] !== true)
      return canLeave();
    // Mounted sections retain their forms and drafts when hidden.
    return areasReady();
  }
  async function navigateAway(href) {
    if (navigationPending) return;
    navigationPending = true;
    try {
      if (!(await canLeave())) return;
      leaving = true;
      window.location.assign(href);
    } finally {
      navigationPending = false;
    }
  }
  Object.values(areas).forEach((area) =>
    area.link.addEventListener("click", async (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      const next = new URL(area.link.href);
      if (next.href === currentUrl || navigationPending) return;
      navigationPending = true;
      try {
        if (!(await canNavigate(next))) return;
        window.history.pushState(null, "", next);
        // Keyboard/assistive activation moves focus into the new section.
        // Pointer navigation keeps focus on the chosen sidebar link.
        route(event.detail === 0);
      } finally {
        navigationPending = false;
      }
    }),
  );
  window.addEventListener("popstate", async () => {
    const next = new URL(window.location.href);
    window.history.replaceState(null, "", currentUrl);
    if (navigationPending) return;
    navigationPending = true;
    try {
      if (!(await canNavigate(next))) return;
      window.history.replaceState(null, "", next);
      route(true);
    } finally {
      navigationPending = false;
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (leaving || !hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("click", async (event) => {
    const link = event.target.closest?.("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    )
      return;
    const next = new URL(link.href, window.location.href);
    if (!["http:", "https:"].includes(next.protocol)) return;
    const current = new URL(window.location.href);
    if (
      next.origin === current.origin &&
      next.pathname === current.pathname &&
      next.search === current.search &&
      next.hash
    )
      return;
    if (!hasUnsavedChanges() && areasReady()) return;
    event.preventDefault();
    await navigateAway(next.href);
  });
  signOut.addEventListener("click", async () => {
    if (navigationPending) return;
    navigationPending = true;
    try {
      if (!(await canLeave())) return;
    } finally {
      navigationPending = false;
    }
    signOut.disabled = true;
    resetAreas();
    session = null;
    setState("signed-out");
    try {
      await CMCENUtils.signOut();
    } finally {
      window.location.replace("/login");
    }
  });
  document.addEventListener("languagechange", () => {
    updateSidebar();
    if (areaMessageKey)
      areaMessage.textContent = window.translate(areaMessageKey);
  });
  retry.addEventListener("click", loadSession);
  window.addEventListener("storage", (event) => {
    if (event.key === null || ["token", "api_token"].includes(event.key)) {
      loadSession();
    }
  });
  window.addEventListener("pagehide", () => {
    resetAreas();
    request?.abort();
    request = null;
    session = null;
    setState("loading");
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadSession();
  });
  loadSession();
})();
