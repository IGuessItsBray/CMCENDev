"use strict";
(() => {
  const root = document.getElementById("certificateRequestsBody");
  const publicPage = root.dataset.publicRequests === "true";
  const lifecycle = new AbortController();
  let controllers = [],
    disposed = false,
    loading = false,
    mounted = false;
  const t = (key) => window.translate(key);
  let token = CMCENUtils.getStoredAuthToken();
  const api = (path, options = {}) =>
    (options.parseJson === false ? CMCENUtils.apiFetch : CMCENUtils.apiJson)(
      path,
      {
        ...options,
        token: CMCENUtils.getStoredAuthToken() || token,
        cache: "no-store",
        redirectOnUnauthorized: false,
        signal: options.signal || lifecycle.signal,
      },
    );
  function notice(key, retry = false) {
    root.replaceChildren();
    root.className = "trusted-award-panel";
    const text = document.createElement("p");
    text.setAttribute("role", "status");
    text.textContent = t(key);
    root.append(text);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-work-zone-button";
      button.textContent = t("trusted_request_retry");
      button.addEventListener("click", load);
      root.append(button);
    }
  }
  async function load() {
    if (disposed || loading || mounted) return;
    if (!token) {
      notice("trusted_request_sign_in");
      const link = document.createElement("a");
      link.className = "admin-work-zone-button";
      link.href =
        "/login?returnTo=" +
        encodeURIComponent(
          publicPage ? "/certificates" : "/certificate-requests",
        );
      link.textContent = t("trusted_request_sign_in_link");
      root.append(link);
      return;
    }
    loading = true;
    notice("trusted_request_loading");
    try {
      const user = await api("/api/me");
      if (disposed) return;
      if (!user?.permissions) throw new Error("Missing profile permissions");
      root.replaceChildren();
      root.className = "";
      if (
        user.permissions.canSubmitCertificateRequests === true &&
        (publicPage || user.permissions.canManageCertificateRequests !== true)
      ) {
        for (const [kind, factory] of [
          ["retirement", window.RetirementCertificateRequest],
          ["trusted", window.TrustedToServeRequest],
        ]) {
          const host = document.createElement("div");
          root.append(host);
          const controller = factory.mount({
            root: host,
            api,
            initiallyExpanded: false,
            onDenied() {
              controller.dispose();
              host.textContent = t("trusted_request_access_denied");
            },
          });
          controllers.push(controller);
          if (kind === "retirement") {
            const optionsStatus = document.createElement("div");
            root.append(optionsStatus);
            const loadOptions = async () => {
              optionsStatus.replaceChildren();
              try {
                const options = await api("/api/certificate-requests/options");
                if (!disposed) controller.setFamilyOptions(options);
              } catch (error) {
                if (disposed) return;
                if (error.status === 401) {
                  const message = document.createElement("p");
                  message.textContent = t("trusted_request_session_expired");
                  const link = document.createElement("a");
                  link.href = "/login?returnTo=%2Fcertificates";
                  link.target = "_blank";
                  link.rel = "noopener";
                  link.textContent = t("trusted_request_sign_in_link");
                  optionsStatus.append(message, link);
                }
                const retry = document.createElement("button");
                retry.type = "button";
                retry.textContent = t("trusted_request_family_retry");
                retry.addEventListener("click", loadOptions);
                optionsStatus.append(retry);
              }
            };
            void loadOptions();
          }
        }
      }
      if (
        !publicPage &&
        user.permissions.canManageCertificateRequests === true
      ) {
        const host = document.createElement("div");
        root.append(host);
        const controller = window.CertificateRequests.mount({
          root: host,
          api,
          showRequestForm: false,
          showSubmittedRequests: false,
          onDenied() {
            controller.dispose();
            host.textContent = t("certificate_requests_access_denied");
          },
        });
        controllers.push(controller);
      }
      if (!controllers.length) notice("trusted_request_access_denied");
      mounted = true;
    } catch (error) {
      if (!disposed && error.status === 401) {
        CMCENUtils.clearAuthToken();
        token = null;
        loading = false;
        return load();
      }
      if (!disposed) notice("trusted_request_load_error", true);
    } finally {
      loading = false;
    }
  }
  document.addEventListener(
    "languagechange",
    () => {
      if (!mounted && !loading) void load();
    },
    { signal: lifecycle.signal },
  );
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      lifecycle.abort();
      controllers.forEach((controller) => controller.dispose());
      controllers = [];
    },
    { once: true },
  );
  window.addEventListener("pageshow", (event) => {
    // A history restore brings back the page whose controllers were disposed.
    // Reload to recheck the current session and mount fresh request forms.
    if (event.persisted) window.location.reload();
  });
  window.addEventListener("beforeunload", (event) => {
    if (controllers.some((controller) => controller.hasUnsavedChanges())) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  void load();
})();
