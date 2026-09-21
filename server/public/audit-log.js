"use strict";
(() => {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  const controller = window.AuditLogController.mount({
    root: document.getElementById("auditLogContent"),
    api: (path, options = {}) =>
      (options.parseJson === false ? CMCENUtils.apiFetch : CMCENUtils.apiJson)(
        path,
        { ...options, token, cache: "no-store", redirectOnUnauthorized: true },
      ),
    onDenied() {
      controller.dispose();
      window.location.href = "/dashboard";
    },
  });
  document.getElementById("auditLogStatus").hidden = true;
  document.getElementById("auditLogPage").hidden = false;
  window.addEventListener("pagehide", () => controller.dispose(), {
    once: true,
  });
  window.addEventListener("beforeunload", (event) => {
    if (controller.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
})();
