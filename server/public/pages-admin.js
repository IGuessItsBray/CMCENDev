"use strict";

(async () => {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  const api = (path, options = {}) =>
    CMCENUtils.apiJson(path, {
      ...options,
      token,
      redirectOnUnauthorized: true,
      unauthorizedMessage: "Authentication required",
    });
  try {
    const user = await api("/api/me");
    if (user.permissions?.canManagePages !== true) {
      window.location.replace("/dashboard");
      return;
    }
    window.updateAdminWorkZoneTabsForUser(user);
    const editor = window.PagesEditor.mount({
      api,
      permissions: user.permissions,
      root: document.querySelector("main"),
    });
    window.addEventListener("beforeunload", (event) => {
      if (!editor.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("pagehide", () => editor.dispose(), { once: true });
  } catch (error) {
    CMCENUtils.setStatusMessage(
      document.getElementById("pagesAdminStatus"),
      error.message,
      "error",
    );
  }
})();
