"use strict";
(() => {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;
  const controller = window.AnalyticsController.mount({
    root: document.getElementById("analyticsContent"),
    api: (path, options) =>
      CMCENUtils.apiJson(path, {
        ...options,
        token,
        cache: "no-store",
        redirectOnUnauthorized: true,
      }),
    onDenied() {
      controller.dispose();
      window.location.href = "/dashboard";
    },
  });
  document.getElementById("analyticsStatus").hidden = true;
  document.getElementById("analyticsPage").hidden = false;
  window.addEventListener("pagehide", () => controller.dispose(), {
    once: true,
  });
})();
