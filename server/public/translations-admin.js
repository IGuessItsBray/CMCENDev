"use strict";

(async () => {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  const api = (path, options = {}) =>
    CMCENUtils.apiJson(path, {
      ...options,
      token,
      redirectOnUnauthorized: true,
      unauthorizedMessage: window.translate("translations_access_denied"),
    });
  try {
    const user = await api("/api/me");
    window.updateAdminWorkZoneTabsForUser?.(user);
    const editor = window.TranslationsEditor.mount({
      api,
      permissions: user.permissions || {},
    });
    window.addEventListener("beforeunload", (event) => {
      if (!editor.hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("pagehide", () => editor.dispose(), { once: true });
  } catch (error) {
    CMCENUtils.setStatusMessage(
      document.getElementById("translationsMessage"),
      error.message,
      "error",
    );
  }
})();
