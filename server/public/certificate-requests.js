"use strict";
(() => {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  const root = document.getElementById("certificateRequestsBody");
  const controller = window.CertificateRequests.mount({
    root,
    api: (path, options) =>
      CMCENUtils.apiJson(path, {
        ...options,
        token,
        cache: "no-store",
        redirectOnUnauthorized: true,
      }),
    onDenied() {
      controller.dispose();
      root.textContent = window.translate("certificate_requests_access_denied");
    },
  });
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
