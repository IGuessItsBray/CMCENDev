(function () {
  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .replace(/^Bearer\s+/i, "");
  }

  function translateText(key, fallback = key, replacements = {}) {
    if (typeof window.translate !== "function") {
      return fallback;
    }

    const translated = window.translate(key, replacements);
    return translated && translated !== key ? translated : fallback;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function setLinkifiedText(element, value) {
    const text = String(value || "");
    const fragment = document.createDocumentFragment();
    const urlPattern = /https?:\/\/[^\s<>"']+/gi;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text))) {
      const urlText = match[0].replace(/[.,;:!?]+$/, "");
      const linkEnd = match.index + urlText.length;

      if (!urlText) continue;

      fragment.append(
        document.createTextNode(text.slice(lastIndex, match.index)),
      );

      try {
        const url = new URL(urlText);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Unsupported URL protocol");
        }

        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = urlText;
        fragment.append(link);
      } catch {
        fragment.append(document.createTextNode(urlText));
      }

      lastIndex = linkEnd;
    }

    fragment.append(document.createTextNode(text.slice(lastIndex)));
    element.replaceChildren(fragment);
  }

  function getRetireeNameParts(retiree = {}) {
    let name = [retiree.rank, retiree.firstName, retiree.lastName]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    const postNominals = String(retiree.postNominals || "").trim();

    /*
     * Some legacy records were imported with the final post-nominal still in
     * the name fields. Remove only matching trailing nominal tokens here so
     * those records display correctly until their data is re-imported.
     */
    postNominals
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .reverse()
      .forEach((postNominal) => {
        const trailingPostNominal = new RegExp(
          `(?:,\\s*|\\s+)${escapeRegExp(postNominal)}$`,
          "i",
        );

        if (trailingPostNominal.test(name)) {
          name = name.replace(trailingPostNominal, "").trim();
        }
      });

    return { name, postNominals };
  }

  function isSitePlaceholderImage(imageUrl) {
    if (!imageUrl) return false;

    try {
      const url = new URL(imageUrl, window.location.origin);
      const pathname = url.pathname.toLowerCase();
      const fileName = pathname.split("/").pop();

      return (
        fileName === "logo.png" ||
        fileName.includes("cmcen-crest") ||
        pathname.includes("/branch-crest/") ||
        pathname.includes("/legacy/wordpress/348036/")
      );
    } catch {
      const pathname = String(imageUrl).toLowerCase().split(/[?#]/)[0];
      const fileName = pathname.split("/").pop();

      return (
        fileName === "logo.png" ||
        fileName.includes("cmcen-crest") ||
        pathname.includes("/branch-crest/") ||
        pathname.includes("/legacy/wordpress/348036/")
      );
    }
  }

  function storeAuthToken(token) {
    const cleanToken = normalizeToken(token);

    if (!cleanToken) {
      return "";
    }

    localStorage.setItem("token", cleanToken);
    localStorage.setItem("api_token", cleanToken);
    scheduleTokenRefresh(cleanToken);

    return cleanToken;
  }

  function getStoredAuthToken() {
    const token = normalizeToken(
      localStorage.getItem("token") || localStorage.getItem("api_token") || "",
    );

    if (token) {
      scheduleTokenRefresh(token);
    }

    return token;
  }

  function clearAuthToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("api_token");
    if (tokenRefreshTimer) {
      window.clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
  }

  const sessionCookieConsentKey = "cmcen_session_cookie_consent";
  const sessionCookieConsentValue = "accepted";

  function getSessionCookieConsentTranslation(key, fallback) {
    return translateText(key, fallback);
  }

  function hasSessionCookieConsent() {
    try {
      return (
        localStorage.getItem(sessionCookieConsentKey) ===
        sessionCookieConsentValue
      );
    } catch {
      return false;
    }
  }

  function rememberSessionCookieConsent() {
    try {
      localStorage.setItem(sessionCookieConsentKey, sessionCookieConsentValue);
    } catch {
      // A visitor can still sign in; their browser will ask again next time.
    }
  }

  async function requestSessionCookieConsent() {
    const consented = await window.CMCENModal.confirm(
      getSessionCookieConsentTranslation(
        "session_cookie_consent_message",
        "To sign in, CMCEN needs one secure cookie to protect your account and keep your session active. We do not use advertising or third-party cookies. Without it, you can still browse the public site but cannot sign in.",
      ),
      {
        title: getSessionCookieConsentTranslation(
          "session_cookie_consent_title",
          "Sign in securely",
        ),
        cancelText: getSessionCookieConsentTranslation(
          "session_cookie_consent_decline",
          "Stay on the public site",
        ),
        confirmText: getSessionCookieConsentTranslation(
          "session_cookie_consent_accept",
          "Sign in securely",
        ),
      },
    );

    if (consented) {
      rememberSessionCookieConsent();
    }

    return consented;
  }

  let tokenRefreshPromise = null;
  let tokenRefreshTimer = null;

  function getTokenExpiryMs(token) {
    const parts = normalizeToken(token).split(".");

    if (parts.length !== 3) return 0;

    try {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      return Number(payload.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  function scheduleTokenRefresh(token) {
    if (tokenRefreshTimer) {
      window.clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }

    const expiresAt = getTokenExpiryMs(token);

    if (!expiresAt) return;

    // Refresh five minutes before expiry, while keeping a short-lived access token.
    const delay = Math.max(0, expiresAt - Date.now() - 5 * 60 * 1000);
    tokenRefreshTimer = window.setTimeout(() => {
      refreshAuthToken();
    }, delay);
  }

  async function refreshAuthToken() {
    if (tokenRefreshPromise) return tokenRefreshPromise;

    tokenRefreshPromise = fetch("/api/session/refresh", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const data = await readJsonResponse(response);

        if (!response.ok || !data.token) {
          clearAuthToken();
          return "";
        }

        return storeAuthToken(data.token);
      })
      .catch(() => "")
      .finally(() => {
        tokenRefreshPromise = null;
      });

    return tokenRefreshPromise;
  }

  async function signOut() {
    try {
      await fetch("/api/session/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      clearAuthToken();
    }
  }

  function redirectToLogin(path = "/login") {
    clearAuthToken();
    window.location.href = path;
  }

  function requireAuthToken(path = "/login") {
    const token = getStoredAuthToken();

    if (!token) {
      window.location.replace(path);
      return null;
    }

    return storeAuthToken(token);
  }

  function authHeaders(token = getStoredAuthToken(), headers = {}) {
    const suppliedToken = normalizeToken(token);
    const storedToken = getStoredAuthToken();
    const cleanToken =
      storedToken &&
      getTokenExpiryMs(storedToken) > getTokenExpiryMs(suppliedToken)
        ? storedToken
        : suppliedToken;

    return {
      ...headers,
      ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
    };
  }

  function hasHeader(headers, name) {
    const normalizedName = name.toLowerCase();

    return Object.keys(headers).some(
      (key) => key.toLowerCase() === normalizedName,
    );
  }

  function extractErrorMessage(data, response, fallback) {
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }

    if (data && typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }

    return fallback || `HTTP ${response.status} ${response.statusText}`;
  }

  async function readJsonResponse(response) {
    return response.json().catch(() => ({}));
  }

  function createApiError(message, response, data = {}) {
    const error = new Error(message);
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;

    return error;
  }

  function getSafeRequestPath(path) {
    try {
      return new URL(String(path), window.location.origin).pathname;
    } catch (error) {
      return "[unavailable]";
    }
  }

  function createNetworkError(errorMessage, error) {
    const message = errorMessage
      ? `${errorMessage}. Check your connection and try again.`
      : "Could not reach CMCEN. Check your connection and try again.";
    const networkError = new Error(message);

    networkError.name = "NetworkError";
    networkError.cause = error;
    networkError.isNetworkError = true;

    return networkError;
  }

  async function apiFetch(path, options = {}) {
    const {
      auth = false,
      body,
      errorMessage,
      headers = {},
      json = false,
      parseJson = true,
      redirectOnUnauthorized = "",
      _retriedAfterRefresh = false,
      tempToken = "",
      token,
      unauthorizedMessage = "Authentication required",
      ...fetchOptions
    } = options;
    const requestHeaders = { ...headers };
    const requestBody =
      json &&
      body !== undefined &&
      !(body instanceof FormData) &&
      typeof body !== "string"
        ? JSON.stringify(body)
        : body;
    const requestToken =
      token !== undefined ? token : auth ? getStoredAuthToken() : undefined;

    if (
      json &&
      !(body instanceof FormData) &&
      !hasHeader(requestHeaders, "Content-Type")
    ) {
      requestHeaders["Content-Type"] = "application/json";
    }

    if (tempToken) {
      requestHeaders["x-temp-token"] = tempToken;
    }

    let response;

    try {
      response = await fetch(path, {
        ...fetchOptions,
        body: requestBody,
        headers:
          requestToken !== undefined
            ? authHeaders(requestToken, requestHeaders)
            : requestHeaders,
      });
    } catch (error) {
      // Keep this diagnostic free of query parameters, request bodies, and tokens.
      console.warn("Network request failed before a response was received", {
        method: fetchOptions.method || "GET",
        path: getSafeRequestPath(path),
        errorName: error?.name || "Error",
        errorMessage: error?.message || "Request failed",
      });
      throw createNetworkError(errorMessage, error);
    }

    if (
      response.status === 401 &&
      requestToken &&
      !_retriedAfterRefresh &&
      path !== "/api/session/refresh"
    ) {
      const refreshedToken = await refreshAuthToken();

      if (refreshedToken) {
        return apiFetch(path, {
          ...options,
          token: refreshedToken,
          _retriedAfterRefresh: true,
        });
      }
    }

    const data = parseJson ? await readJsonResponse(response) : response;

    if (response.status === 401 && redirectOnUnauthorized) {
      redirectToLogin(
        redirectOnUnauthorized === true ? "/login" : redirectOnUnauthorized,
      );
      throw createApiError(unauthorizedMessage, response, data);
    }

    if (!response.ok) {
      throw createApiError(
        parseJson
          ? extractErrorMessage(data, response, errorMessage)
          : errorMessage || `HTTP ${response.status} ${response.statusText}`,
        response,
        data,
      );
    }

    return data;
  }

  function apiJson(path, options = {}) {
    return apiFetch(path, {
      ...options,
      json: true,
      parseJson: true,
    });
  }

  function clearMfaSession() {
    sessionStorage.removeItem("tempToken");
    sessionStorage.removeItem("twoFactorMethods");
  }

  function ensureWebAuthnAvailable(
    message = "Passkeys are not available in this browser context.",
  ) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error(message);
    }
  }

  function base64urlToArrayBuffer(value) {
    const base64 = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }

  function arrayBufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (let index = 0; index < bytes.byteLength; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function convertPublicKeyCredentialDescriptors(credentials) {
    if (!Array.isArray(credentials)) {
      return credentials;
    }

    return credentials.map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id),
    }));
  }

  function preparePublicKeyCreationOptions(options = {}) {
    const publicKey = { ...options };

    if (publicKey.challenge) {
      publicKey.challenge = base64urlToArrayBuffer(publicKey.challenge);
    }

    if (publicKey.user?.id) {
      publicKey.user = {
        ...publicKey.user,
        id: base64urlToArrayBuffer(publicKey.user.id),
      };
    }

    if (publicKey.excludeCredentials) {
      publicKey.excludeCredentials = convertPublicKeyCredentialDescriptors(
        publicKey.excludeCredentials,
      );
    }

    return publicKey;
  }

  function preparePublicKeyRequestOptions(options = {}) {
    const publicKey = { ...options };

    if (publicKey.challenge) {
      publicKey.challenge = base64urlToArrayBuffer(publicKey.challenge);
    }

    if (publicKey.allowCredentials) {
      publicKey.allowCredentials = convertPublicKeyCredentialDescriptors(
        publicKey.allowCredentials,
      );
    }

    return publicKey;
  }

  function serializeAttestationCredential(credential) {
    return {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || "",
      response: {
        clientDataJSON: arrayBufferToBase64url(
          credential.response.clientDataJSON,
        ),
        attestationObject: arrayBufferToBase64url(
          credential.response.attestationObject,
        ),
      },
      transports: credential.response.getTransports
        ? credential.response.getTransports()
        : [],
    };
  }

  function serializeAssertionCredential(assertion) {
    return {
      id: assertion.id,
      rawId: arrayBufferToBase64url(assertion.rawId),
      type: assertion.type,
      response: {
        authenticatorData: arrayBufferToBase64url(
          assertion.response.authenticatorData,
        ),
        clientDataJSON: arrayBufferToBase64url(
          assertion.response.clientDataJSON,
        ),
        signature: arrayBufferToBase64url(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? arrayBufferToBase64url(assertion.response.userHandle)
          : null,
      },
    };
  }

  function getCurrentLanguage() {
    if (typeof window.currentLang === "string") {
      return window.currentLang;
    }

    return localStorage.getItem("lang") || "en";
  }

  function getCurrentLocale() {
    return getCurrentLanguage() === "fr" ? "fr-CA" : "en-CA";
  }

  function toLocalDateTimeInput(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const localDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000,
    );
    return localDate.toISOString().slice(0, 16);
  }

  function toLocalDateInput(value) {
    return toLocalDateTimeInput(value).slice(0, 10);
  }

  function toLocalTimeInput(value) {
    return toLocalDateTimeInput(value).slice(11, 16);
  }

  function fromLocalDateAndTime(dateValue, timeValue = "00:00") {
    if (!dateValue) {
      return "";
    }

    const date = new Date(`${dateValue}T${timeValue || "00:00"}`);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function formatDate(value, options = {}) {
    if (!value) {
      return options.fallback || "-";
    }

    const { fallback, locale, ...formatOptions } = options;
    const hasDateOption = [
      "dateStyle",
      "weekday",
      "era",
      "year",
      "month",
      "day",
    ].some((option) =>
      Object.prototype.hasOwnProperty.call(formatOptions, option),
    );
    const hasTimeStyle = Object.prototype.hasOwnProperty.call(
      formatOptions,
      "timeStyle",
    );
    const displayOptionKeys = Object.keys(formatOptions).filter(
      (option) =>
        !["calendar", "hourCycle", "numberingSystem", "timeZone"].includes(
          option,
        ),
    );
    const hasAnyDisplayOption = displayOptionKeys.length > 0;
    const intlOptions = {
      ...formatOptions,
    };

    if (!hasAnyDisplayOption) {
      intlOptions.dateStyle = "medium";
    }

    if (!hasDateOption && hasTimeStyle) {
      intlOptions.dateStyle = "medium";
    }

    return new Intl.DateTimeFormat(
      locale || getCurrentLocale(),
      intlOptions,
    ).format(new Date(value));
  }

  function getLocalizedText(value, language = getCurrentLanguage()) {
    if (!value || typeof value !== "object") {
      return "";
    }

    const fallbackLanguage = language === "fr" ? "en" : "fr";

    return String(value[language] || value[fallbackLanguage] || "").trim();
  }

  function formatTitleCaseValue(value, fallback = "-") {
    const text = String(value || "").trim();

    if (!text) {
      return fallback;
    }

    return text
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function getUserDisplayName(user, fallback = "") {
    return user?.accountName || user?.username || user?.email || fallback;
  }

  function createLoadingSpinner(label) {
    const loading = document.createElement("div");
    loading.className = "loading-state";
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-label", label);

    const spinner = document.createElement("span");
    spinner.className = "loading-state-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "visually-hidden";
    text.textContent = label;

    loading.append(spinner, text);

    return loading;
  }

  function createSkeleton(className = "") {
    const skeleton = document.createElement("span");
    skeleton.className = ["skeleton", className].filter(Boolean).join(" ");
    skeleton.setAttribute("aria-hidden", "true");
    return skeleton;
  }

  function trackMediaLoading(image) {
    if (!(image instanceof HTMLImageElement)) return;

    const clearLoadingState = () => image.classList.remove("is-media-loading");

    image.classList.add("is-media-loading");
    image.addEventListener("load", clearLoadingState, { once: true });
    image.addEventListener("error", clearLoadingState, { once: true });

    if (image.complete) {
      clearLoadingState();
    }
  }

  function bindMediaSkeletons(root = document) {
    if (root instanceof HTMLImageElement) {
      trackMediaLoading(root);
      return;
    }

    root.querySelectorAll?.("img").forEach(trackMediaLoading);
  }

  function getElementList(value) {
    if (!value) {
      return [];
    }

    if (typeof value === "string") {
      return Array.from(document.querySelectorAll(value));
    }

    return Array.from(value);
  }

  function activateTabs(options = {}) {
    const {
      active,
      activeClass = "is-active",
      panels,
      panelKey = "panel",
      tabs,
      tabKey = "tab",
    } = options;
    const managesPanels = getElementList(panels).length > 0;

    getElementList(tabs).forEach((tab) => {
      const isActive = tab.dataset[tabKey] === active;

      tab.classList.toggle(activeClass, isActive);

      if (
        tab.getAttribute("role") === "tab" ||
        tab.hasAttribute("aria-selected")
      ) {
        tab.setAttribute("aria-selected", String(isActive));
        if (managesPanels) {
          tab.tabIndex = isActive ? 0 : -1;
        }
      }
    });

    getElementList(panels).forEach((panel) => {
      const isActive = panel.dataset[panelKey] === active;

      panel.classList.toggle(activeClass, isActive);
      panel.hidden = !isActive;
    });
  }

  function bindTabs(options = {}) {
    const tabs = getElementList(options.tabs);
    const tabKey = options.tabKey || "tab";

    function activate(active, tab, event, notify = false) {
      activateTabs({
        ...options,
        active,
        tabs,
      });

      if (notify && typeof options.onActivate === "function") {
        options.onActivate(active, tab, event);
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", (event) => {
        const active = tab.dataset[tabKey];

        if (options.preventDefault) {
          event.preventDefault();
        }

        activate(active, tab, event, true);
      });

      tab.addEventListener("keydown", (event) => {
        const currentIndex = tabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        const nextTab = tabs[nextIndex];
        nextTab.focus();
        activate(nextTab.dataset[tabKey], nextTab, event, true);
      });
    });

    const initiallyActive =
      options.active ||
      tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset[
        tabKey
      ];

    if (initiallyActive) {
      activate(initiallyActive);
    }

    return { activate };
  }

  function setStatusMessage(element, message, state = "") {
    element.replaceChildren();
    element.className = "dashboard-status";
    element.hidden = false;
    element.removeAttribute("aria-label");

    if (state) {
      element.classList.add(`is-${state}`);
    }

    const text = document.createElement("p");
    text.textContent = message;
    element.append(text);
  }

  function setStatusLoading(element, message) {
    const spinner = document.createElement("span");
    const label = document.createElement("span");

    spinner.className = "loading-state-spinner";
    spinner.setAttribute("aria-hidden", "true");

    label.className = "visually-hidden";
    label.textContent = message;

    element.replaceChildren(spinner, label);
    element.className = "dashboard-status is-loading";
    element.setAttribute("aria-label", message);
    element.hidden = false;
  }

  const toastPositions = new Set([
    "top-right",
    "top-left",
    "top-center",
    "bottom-right",
    "bottom-left",
  ]);
  const toastColors = new Set([
    "success",
    "error",
    "warning",
    "info",
    "neutral",
  ]);

  function getToastRegion(position) {
    const regionClass = `cmcen-toast-region--${position}`;
    let region = document.querySelector(`.${regionClass}`);

    if (region) return region;

    region = document.createElement("div");
    region.className = `cmcen-toast-region ${regionClass}`;
    region.setAttribute("aria-label", "Notifications");
    document.body.appendChild(region);

    return region;
  }

  function getToastDismissLabel(fallback) {
    return translateText("toast_dismiss", fallback);
  }

  /**
   * Show a transient notification anywhere in the application.
   *
   * @param {string} message
   * @param {{
   *   color?: "success"|"error"|"warning"|"info"|"neutral",
   *   position?: "top-right"|"top-left"|"top-center"|"bottom-right"|"bottom-left",
   *   animation?: "slide"|"fade",
   *   duration?: number,
   *   dismissible?: boolean,
   *   dismissLabel?: string
   * }} options
   * @returns {{ element: HTMLElement|null, dismiss: () => void }}
   */
  function showToast(message, options = {}) {
    const text = String(message || "").trim();

    if (!text) {
      return {
        element: null,
        dismiss() {},
      };
    }

    const color = toastColors.has(options.color) ? options.color : "info";
    const position = toastPositions.has(options.position)
      ? options.position
      : "bottom-right";
    const animation = options.animation === "fade" ? "fade" : "slide";
    const durationValue = Number(options.duration);
    const duration = Number.isFinite(durationValue)
      ? Math.max(0, durationValue)
      : 2750;
    const region = getToastRegion(position);
    const toast = document.createElement("article");
    const toastMessage = document.createElement("p");
    const dismissButton = document.createElement("button");
    let dismissTimer = null;
    let dismissed = false;

    toast.className = `cmcen-toast cmcen-toast--${color} cmcen-toast--${animation}`;
    toast.setAttribute("role", color === "error" ? "alert" : "status");
    toast.setAttribute("aria-atomic", "true");

    toastMessage.className = "cmcen-toast-message";
    toastMessage.textContent = text;

    dismissButton.type = "button";
    dismissButton.className = "cmcen-toast-dismiss";
    dismissButton.setAttribute(
      "aria-label",
      options.dismissLabel || getToastDismissLabel("Dismiss notification"),
    );
    dismissButton.textContent = "×";

    function removeToast() {
      toast.remove();

      if (!region.childElementCount) {
        region.remove();
      }
    }

    function dismiss() {
      if (dismissed) return;

      dismissed = true;
      window.clearTimeout(dismissTimer);
      toast.classList.add("is-dismissing");
      window.setTimeout(removeToast, 180);
    }

    dismissButton.addEventListener("click", dismiss);
    toast.append(toastMessage, dismissButton);
    region.prepend(toast);

    if (duration > 0) {
      dismissTimer = window.setTimeout(dismiss, duration);
    }

    if (options.dismissible === false) {
      dismissButton.hidden = true;
    }

    return { element: toast, dismiss };
  }

  let modalOverlay = null;
  let modalDialog = null;
  let modalTitle = null;
  let modalMessage = null;
  let modalInputGroup = null;
  let modalInputLabel = null;
  let modalInput = null;
  let modalFormFields = null;
  let modalChecklist = null;
  let modalChoiceActions = null;
  let modalActions = null;
  let modalCancelButton = null;
  let modalConfirmButton = null;
  let modalCloseButton = null;
  let modalActiveRequest = null;
  let modalQueue = Promise.resolve();
  let modalEmbeddedPositionCleanup = null;

  function getModalTranslation(key, fallback) {
    return translateText(key, fallback);
  }

  function getFocusableModalElements() {
    if (!modalDialog) return [];

    return Array.from(
      modalDialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) => !element.hidden && element.getClientRects().length > 0,
    );
  }

  function positionModalInEmbeddedViewport() {
    modalEmbeddedPositionCleanup?.();
    modalEmbeddedPositionCleanup = null;

    try {
      if (window.parent === window || !window.frameElement) return;

      modalOverlay.classList.add("is-embedded");
      const position = () => {
        const frameRect = window.frameElement.getBoundingClientRect();
        const modalHeight = modalDialog.getBoundingClientRect().height;
        const top = Math.max(
          16,
          window.parent.innerHeight / 2 - frameRect.top - modalHeight / 2,
        );
        modalDialog.style.setProperty("--cmcen-modal-top", `${top}px`);
      };
      const schedulePosition = () => window.requestAnimationFrame(position);
      schedulePosition();
      window.parent.addEventListener("scroll", schedulePosition, {
        passive: true,
      });
      window.parent.addEventListener("resize", schedulePosition);
      modalEmbeddedPositionCleanup = () => {
        window.parent.removeEventListener("scroll", schedulePosition);
        window.parent.removeEventListener("resize", schedulePosition);
        modalOverlay.classList.remove("is-embedded");
        modalDialog.style.removeProperty("--cmcen-modal-top");
      };
    } catch {
      modalOverlay.classList.remove("is-embedded");
    }
  }

  function closeModal(value) {
    const request = modalActiveRequest;

    if (!request) return;

    modalActiveRequest = null;
    modalEmbeddedPositionCleanup?.();
    modalEmbeddedPositionCleanup = null;
    modalOverlay.hidden = true;
    document.body.classList.remove("cmcen-modal-lock");
    request.restoreFocus?.focus();
    request.resolve(value);
  }

  function createModal() {
    if (modalOverlay) return modalOverlay;

    modalOverlay = document.createElement("div");
    modalOverlay.className = "cmcen-modal-overlay";
    modalOverlay.hidden = true;

    modalDialog = document.createElement("section");
    modalDialog.className = "cmcen-modal";
    modalDialog.setAttribute("role", "dialog");
    modalDialog.setAttribute("aria-modal", "true");
    modalDialog.setAttribute("aria-labelledby", "cmcenModalTitle");
    modalDialog.setAttribute("aria-describedby", "cmcenModalMessage");

    const header = document.createElement("header");
    header.className = "cmcen-modal-header";

    const heading = document.createElement("div");
    heading.className = "cmcen-modal-heading";

    const brand = document.createElement("span");
    brand.className = "cmcen-modal-brand";
    brand.textContent = "CMCEN / RCMCE";

    modalTitle = document.createElement("h2");
    modalTitle.id = "cmcenModalTitle";
    heading.append(brand, modalTitle);

    modalCloseButton = document.createElement("button");
    modalCloseButton.type = "button";
    modalCloseButton.className = "cmcen-modal-close";
    modalCloseButton.setAttribute("aria-label", "Close");
    modalCloseButton.innerHTML = '<span aria-hidden="true">×</span>';

    header.append(heading, modalCloseButton);

    const body = document.createElement("div");
    body.className = "cmcen-modal-body";

    modalMessage = document.createElement("p");
    modalMessage.id = "cmcenModalMessage";

    modalInputGroup = document.createElement("label");
    modalInputGroup.className = "cmcen-modal-field";
    modalInputGroup.hidden = true;

    modalInputLabel = document.createElement("span");
    modalInputLabel.className = "visually-hidden";

    modalInput = document.createElement("input");
    modalInput.id = "cmcenModalInput";
    modalInput.className = "cmcen-modal-input";

    modalInputGroup.append(modalInputLabel, modalInput);

    modalFormFields = document.createElement("div");
    modalFormFields.className = "cmcen-modal-form";
    modalFormFields.hidden = true;

    modalChecklist = document.createElement("fieldset");
    modalChecklist.className = "cmcen-modal-checklist";
    modalChecklist.hidden = true;

    modalChoiceActions = document.createElement("div");
    modalChoiceActions.className = "cmcen-modal-choices";
    modalChoiceActions.hidden = true;

    modalActions = document.createElement("div");
    modalActions.className = "cmcen-modal-actions";

    modalCancelButton = document.createElement("button");
    modalCancelButton.type = "button";
    modalCancelButton.className =
      "cmcen-modal-button cmcen-modal-button-secondary";

    modalConfirmButton = document.createElement("button");
    modalConfirmButton.type = "button";
    modalConfirmButton.className =
      "cmcen-modal-button cmcen-modal-button-primary";

    modalActions.append(modalCancelButton, modalConfirmButton);
    body.append(
      modalMessage,
      modalFormFields,
      modalInputGroup,
      modalChecklist,
      modalChoiceActions,
      modalActions,
    );
    modalDialog.append(header, body);
    modalOverlay.append(modalDialog);

    modalOverlay.addEventListener("click", (event) => {
      if (
        event.target === modalOverlay &&
        modalActiveRequest?.closeOnBackdrop
      ) {
        closeModal(modalActiveRequest.cancelValue);
      }
    });

    modalCloseButton.addEventListener("click", () => {
      if (modalActiveRequest) {
        closeModal(modalActiveRequest.cancelValue);
      }
    });

    modalCancelButton.addEventListener("click", () => {
      if (modalActiveRequest) {
        closeModal(modalActiveRequest.cancelValue);
      }
    });

    modalConfirmButton.addEventListener("click", () => {
      if (!modalActiveRequest) return;
      if (modalActiveRequest.type === "form") {
        const fields = Array.from(
          modalFormFields.querySelectorAll("input, select, textarea"),
        );

        if (!fields.every((field) => field.reportValidity())) return;
        closeModal(modalActiveRequest.getFormValues());
        return;
      }
      closeModal(
        modalActiveRequest.type === "prompt"
          ? modalInput.value
          : modalActiveRequest.type === "checklist"
            ? modalActiveRequest.getCheckedValues()
            : modalActiveRequest.confirmValue,
      );
    });

    modalOverlay.addEventListener("keydown", (event) => {
      if (!modalActiveRequest) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal(modalActiveRequest.cancelValue);
        return;
      }

      if (
        event.key === "Enter" &&
        ["prompt", "form"].includes(modalActiveRequest.type)
      ) {
        if (
          modalActiveRequest.type === "form" &&
          document.activeElement?.tagName === "TEXTAREA"
        ) {
          return;
        }
        event.preventDefault();
        if (modalActiveRequest.type === "form") {
          const fields = Array.from(
            modalFormFields.querySelectorAll("input, select, textarea"),
          );
          if (!fields.every((field) => field.reportValidity())) return;
          closeModal(modalActiveRequest.getFormValues());
        } else {
          closeModal(modalInput.value);
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableModalElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    });

    document.body.append(modalOverlay);
    return modalOverlay;
  }

  function showModal(type, message, options = {}) {
    const request = () =>
      new Promise((resolve) => {
        createModal();

        const isPrompt = type === "prompt";
        const isForm = type === "form";
        const isChoice = type === "choice";
        const isChecklist = type === "checklist";
        const isAlert = type === "alert";
        const checklist = isChecklist ? options.checklist || [] : [];
        const titleKey = isPrompt
          ? "modal_input_title"
          : isAlert
            ? "modal_notice_title"
            : "modal_confirm_title";
        const defaultTitle = isPrompt
          ? "Enter a value"
          : isAlert
            ? "Notice"
            : "Confirm action";

        modalActiveRequest = {
          type,
          resolve,
          restoreFocus:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
          cancelValue: isPrompt ? null : false,
          confirmValue: isAlert ? undefined : true,
          getCheckedValues: () =>
            Array.from(
              modalChecklist.querySelectorAll('input[type="checkbox"]:checked'),
            ).map((input) => input.value),
          getFormValues: () =>
            Object.fromEntries(
              Array.from(
                modalFormFields.querySelectorAll("input, select, textarea"),
              ).map((field) => [field.name, field.value]),
            ),
          closeOnBackdrop: options.closeOnBackdrop !== false,
        };

        modalDialog.setAttribute("role", isAlert ? "alertdialog" : "dialog");
        modalDialog.classList.toggle(
          "cmcen-modal--success",
          options.tone === "success",
        );
        modalDialog.classList.toggle(
          "cmcen-modal--danger",
          options.tone === "danger",
        );
        modalTitle.textContent =
          options.title || getModalTranslation(titleKey, defaultTitle);
        modalMessage.textContent = String(message || "");
        modalCloseButton.setAttribute(
          "aria-label",
          options.closeLabel || getModalTranslation("modal_close", "Close"),
        );
        modalInputGroup.hidden = !isPrompt;
        modalFormFields.hidden = !isForm;
        modalFormFields.replaceChildren();
        modalChecklist.hidden = !isChecklist;
        modalChecklist.replaceChildren();
        modalChoiceActions.hidden = !isChoice;
        modalChoiceActions.replaceChildren();

        if (isChecklist) {
          const legend = document.createElement("legend");
          legend.className = "cmcen-modal-checklist-title";
          legend.textContent =
            options.checklistLabel ||
            getModalTranslation("modal_checklist_label", "Confirm each item");
          modalChecklist.append(legend);

          const updateChecklistConfirmation = () => {
            modalConfirmButton.disabled =
              !checklist.length ||
              !Array.from(
                modalChecklist.querySelectorAll('input[type="checkbox"]'),
              ).every((input) => input.checked);
          };

          checklist.forEach((item, index) => {
            const label = document.createElement("label");
            label.className = "cmcen-modal-checklist-item";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.value = String(item.value || index);
            input.addEventListener("change", updateChecklistConfirmation);

            const copy = document.createElement("span");
            const itemLabel = document.createElement("strong");
            itemLabel.textContent = String(item.label || item.value || "");
            copy.append(itemLabel);

            if (item.description) {
              const description = document.createElement("small");
              description.textContent = String(item.description);
              copy.append(description);
            }

            label.append(input, copy);
            modalChecklist.append(label);
          });

          updateChecklistConfirmation();
        } else {
          modalConfirmButton.disabled = false;
        }

        if (isForm) {
          (options.fields || []).forEach((field) => {
            const isCustomDateTime = field.type === "cmcen-date-time";
            const usesDateTimePicker =
              isCustomDateTime &&
              window.CMCENDateTimePicker?.create;
            const group = document.createElement(
              usesDateTimePicker ? "div" : "label",
            );
            group.className = "cmcen-modal-field";

            const label = document.createElement("span");
            label.textContent = field.label || field.name || "Field";

            if (usesDateTimePicker) {
              const valueInput = document.createElement("input");
              valueInput.type = "hidden";
              valueInput.name = field.name || "";
              valueInput.value = String(field.defaultValue || "");

              const [date = "", time = ""] = valueInput.value.split("T");
              const picker = window.CMCENDateTimePicker.create({
                name: field.name,
                dateName: `${field.name}PickerDate`,
                timeName: `${field.name}PickerTime`,
                date,
                time,
                includeTime: true,
                label: field.label || field.name || "Date and time",
                placeholder: field.placeholder || "Select date and time",
                timeLabel: field.timeLabel || "Time",
                clearLabel: field.clearLabel || "Clear",
                doneLabel: field.doneLabel || "Done",
                locale: field.locale,
                onInput: ({ date: selectedDate, time: selectedTime }) => {
                  valueInput.value = selectedDate
                    ? `${selectedDate}T${selectedTime || "00:00"}`
                    : "";
                },
              });

              group.append(label, valueInput, picker);
            } else {
              const control = document.createElement(
                field.type === "select"
                  ? "select"
                  : field.type === "textarea"
                    ? "textarea"
                    : "input",
              );
              control.className = "cmcen-modal-input";
              control.name = field.name || "";
              control.id = `cmcenModalField-${field.name || "input"}`;
              control.required = field.required === true;
              control.autocomplete = field.autocomplete || "off";

              if (field.type === "select") {
                (field.options || []).forEach((option) => {
                  const optionElement = document.createElement("option");
                  optionElement.value = String(option.value || "");
                  optionElement.textContent = String(
                    option.label || option.value || "",
                  );
                  optionElement.selected = option.value === field.defaultValue;
                  control.append(optionElement);
                });
              } else {
                if (field.type !== "textarea") {
                  control.type = isCustomDateTime
                    ? "datetime-local"
                    : field.type || "text";
                }
                control.value = String(field.defaultValue || "");
                control.placeholder = field.placeholder || "";
                if (field.maxLength) control.maxLength = field.maxLength;
              }

              if (
                field.requiresNonWhitespace === true &&
                field.required === true
              ) {
                const validateNonWhitespaceValue = () => {
                  control.setCustomValidity(
                    control.value && !control.value.trim()
                      ? field.requiredMessage || "Enter a value."
                      : "",
                  );
                };
                control.addEventListener("input", validateNonWhitespaceValue);
                validateNonWhitespaceValue();
              }

              group.append(label, control);
            }

            if (field.hint) {
              const hint = document.createElement("small");
              hint.className = "cmcen-modal-field-hint";
              hint.textContent = field.hint;
              group.append(hint);
            }

            modalFormFields.append(group);
          });
        }

        if (isChoice) {
          (options.choices || []).forEach((choice) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "cmcen-modal-choice";
            button.classList.toggle("is-danger", choice.destructive === true);

            const label = document.createElement("strong");
            label.textContent = choice.label || choice.value;
            const description = document.createElement("span");
            description.textContent = choice.description || "";
            button.append(label, description);
            button.addEventListener("click", () => closeModal(choice.value));
            modalChoiceActions.append(button);
          });
        }
        modalInput.type = isPrompt ? options.inputType || "text" : "text";
        modalInput.value = isPrompt ? String(options.defaultValue || "") : "";
        modalInput.placeholder = isPrompt ? options.placeholder || "" : "";
        modalInput.autocomplete = isPrompt
          ? options.autocomplete || "off"
          : "off";
        modalInputLabel.textContent =
          options.inputLabel ||
          getModalTranslation("modal_input_label", "Value");
        modalCancelButton.hidden = isAlert;
        modalActions.hidden = isChoice;
        modalCancelButton.textContent =
          options.cancelText || getModalTranslation("modal_cancel", "Cancel");
        modalConfirmButton.textContent =
          options.confirmText ||
          getModalTranslation(
            isAlert ? "modal_close" : "modal_confirm",
            isAlert ? "Close" : "Confirm",
          );
        modalConfirmButton.classList.toggle(
          "is-danger",
          Boolean(options.destructive) || options.tone === "danger",
        );
        modalConfirmButton.classList.toggle(
          "is-success",
          options.tone === "success",
        );

        modalOverlay.hidden = false;
        document.body.classList.add("cmcen-modal-lock");
        positionModalInEmbeddedViewport();

        window.requestAnimationFrame(() => {
          if (modalActiveRequest?.resolve !== resolve) return;

          const focusTarget = isForm
            ? modalFormFields.querySelector(
                ".cmcen-date-time-trigger, input:not([type=hidden]), select, textarea",
              )
            : isPrompt
              ? modalInput
              : isChoice
                ? modalChoiceActions.querySelector("button")
                : isChecklist
                  ? modalChecklist.querySelector('input[type="checkbox"]')
                  : modalConfirmButton;
          focusTarget?.focus();
          if (isPrompt) modalInput.select();
        });
      });

    const queuedRequest = modalQueue.then(request, request);
    modalQueue = queuedRequest.catch(() => {});
    return queuedRequest;
  }

  window.CMCENModal = {
    alert(message, options) {
      return showModal("alert", message, options);
    },
    confirm(message, options) {
      return showModal("confirm", message, options);
    },
    prompt(message, options) {
      return showModal("prompt", message, options);
    },
    form(message, options) {
      return showModal("form", message, options);
    },
    choose(message, options) {
      return showModal("choice", message, options);
    },
    confirmChecklist(message, options) {
      return showModal("checklist", message, options);
    },
  };

  function trackPageVisit() {
    if (window.location.pathname === "/analytics") {
      return;
    }

    const payload = JSON.stringify({
      path: window.location.pathname || "/",
      fullPath: `${window.location.pathname || "/"}${window.location.search || ""}`,
      title: document.title || "",
      referrer: document.referrer || "",
      locale: navigator.language || "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    });
    const token = getStoredAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    fetch("/api/analytics/visit", {
      method: "POST",
      headers,
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  function initializePlausibleAnalytics() {
    fetch("/api/client-config/plausible")
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (!config?.enabled || !config.domain || !config.endpoint) return;

        return import("/vendor/plausible-tracker.js").then(({ init }) => {
          init({ domain: config.domain, endpoint: config.endpoint });
        });
      })
      .catch(() => {});
  }

  function getCompressedImageName(file, mimeType) {
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const baseName =
      String(file?.name || "image")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "image";

    return `${baseName}.${extension}`;
  }

  async function prepareImageUploadFile(file, options = {}) {
    const {
      maxDimension = 2200,
      jpegQuality = 0.82,
      minSavingsRatio = 0.92,
    } = options;
    const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

    if (!file || !imageTypes.has(file.type)) {
      return file;
    }

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not prepare image"));
      };
      img.src = objectUrl;
    });

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const mimeType =
      file.type === "image/png" && scale === 1 ? "image/png" : "image/jpeg";
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    if (mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        resolve,
        mimeType,
        mimeType === "image/jpeg" ? jpegQuality : undefined,
      );
    });

    if (!blob || blob.size >= file.size * minSavingsRatio) {
      return file;
    }

    return new File([blob], getCompressedImageName(file, mimeType), {
      type: mimeType,
      lastModified: Date.now(),
    });
  }

  function createImageCropController({ input, container, labels = {} } = {}) {
    if (!input || !container) {
      return {
        getCrop: () => ({ x: 0.5, y: 0.5 }),
        reset: () => {},
      };
    }

    let previewUrl = "";
    let cropX = 0.5;
    let cropY = 0.5;
    const preview = document.createElement("img");
    const horizontal = document.createElement("input");
    const vertical = document.createElement("input");

    function updatePreview() {
      preview.style.objectPosition = `${cropX * 100}% ${cropY * 100}%`;
    }

    function makeControl(labelText, control, onChange) {
      const label = document.createElement("label");
      label.className = "image-crop-control-label";
      label.textContent = labelText;
      control.type = "range";
      control.min = "0";
      control.max = "100";
      control.value = "50";
      control.addEventListener("input", () => {
        onChange(Number(control.value) / 100);
        updatePreview();
      });
      label.appendChild(control);
      return label;
    }

    const heading = document.createElement("p");
    heading.className = "image-crop-heading";
    heading.textContent = labels.heading || "Position the photo in the card";
    const hint = document.createElement("p");
    hint.className = "image-crop-hint";
    hint.textContent =
      labels.hint || "The original photo is kept in full for the message page.";
    const controls = document.createElement("div");
    controls.className = "image-crop-controls";
    controls.append(
      makeControl(
        labels.horizontal || "Horizontal position",
        horizontal,
        (value) => {
          cropX = value;
        },
      ),
      makeControl(labels.vertical || "Vertical position", vertical, (value) => {
        cropY = value;
      }),
    );
    const previewFrame = document.createElement("div");
    previewFrame.className = "image-crop-preview";
    preview.alt = labels.previewAlt || "Photo crop preview";
    previewFrame.appendChild(preview);
    container.replaceChildren(heading, hint, previewFrame, controls);
    container.hidden = true;

    function reset() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      cropX = 0.5;
      cropY = 0.5;
      horizontal.value = "50";
      vertical.value = "50";
      preview.removeAttribute("src");
      container.hidden = true;
    }

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      reset();
      if (!file?.type?.startsWith("image/")) return;

      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      updatePreview();
      container.hidden = false;
    });

    return {
      getCrop: () => ({ x: cropX, y: cropY }),
      reset,
    };
  }

  function bindCharacterCounters(root = document) {
    root
      .querySelectorAll("textarea[data-character-counter]")
      .forEach((textarea) => {
        if (textarea.dataset.characterCounterBound === "true") {
          textarea.characterCounterUpdate?.();
          return;
        }

        const maximum = Number.parseInt(textarea.maxLength, 10);
        if (!Number.isInteger(maximum) || maximum < 1) return;

        const counter = document.createElement("small");
        counter.className = "character-counter";
        counter.setAttribute("aria-live", "polite");

        const updateCounter = () => {
          counter.textContent = `${textarea.value.length.toLocaleString()} / ${maximum.toLocaleString()} characters`;
        };

        textarea.insertAdjacentElement("afterend", counter);
        textarea.addEventListener("input", updateCounter);
        textarea.dataset.characterCounterBound = "true";
        textarea.characterCounterUpdate = updateCounter;
        updateCounter();
      });
  }

  function createContentWorkspaceShortcut({
    contentType,
    contentId,
    label = "Open in Content Workspace",
  } = {}) {
    if (!contentType || !contentId) return null;

    const shortcut = document.createElement("a");
    shortcut.className = "content-workspace-shortcut";
    shortcut.href =
      "/content-workspace?" + new URLSearchParams({ id: String(contentId) });
    shortcut.dataset.contentWorkspaceShortcut = contentType;
    shortcut.setAttribute("aria-label", label);
    shortcut.title = label;
    shortcut.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M5 4.75h14v14.5H5z"></path>' +
      '<path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"></path>' +
      "</svg>";

    return shortcut;
  }

  window.CMCENUtils = {
    activateTabs,
    apiFetch,
    apiJson,
    arrayBufferToBase64url,
    authHeaders,
    base64urlToArrayBuffer,
    bindCharacterCounters,
    bindMediaSkeletons,
    bindTabs,
    clearAuthToken,
    clearMfaSession,
    createContentWorkspaceShortcut,
    createImageCropController,
    createLoadingSpinner,
    createSkeleton,
    ensureWebAuthnAvailable,
    formatDate,
    formatTitleCaseValue,
    fromLocalDateAndTime,
    getCurrentLanguage,
    getCurrentLocale,
    getLocalizedText,
    getRetireeNameParts,
    isSitePlaceholderImage,
    hasSessionCookieConsent,
    getStoredAuthToken,
    getUserDisplayName,
    normalizeToken,
    preparePublicKeyCreationOptions,
    preparePublicKeyRequestOptions,
    prepareImageUploadFile,
    redirectToLogin,
    requestSessionCookieConsent,
    refreshAuthToken,
    requireAuthToken,
    serializeAssertionCredential,
    serializeAttestationCredential,
    setLinkifiedText,
    showToast,
    signOut,
    setStatusLoading,
    setStatusMessage,
    storeAuthToken,
    toLocalDateInput,
    toLocalDateTimeInput,
    toLocalTimeInput,
    trackPageVisit,
    translateText,
  };

  window.addEventListener("load", trackPageVisit, { once: true });
  initializePlausibleAnalytics();
  bindCharacterCounters();
  bindMediaSkeletons();

  new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => bindMediaSkeletons(node));
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
