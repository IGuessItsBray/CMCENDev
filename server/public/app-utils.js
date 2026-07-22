(function () {
  function normalizeToken(value) {
    return String(value || "").trim().replace(/^Bearer\s+/i, "");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getRetireeNameParts(retiree = {}) {
    let name = [
      retiree.rank,
      retiree.firstName,
      retiree.lastName
    ]
      .map(value => String(value || "").trim())
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
      .map(value => value.trim())
      .filter(Boolean)
      .reverse()
      .forEach(postNominal => {
        const trailingPostNominal = new RegExp(
          `(?:,\\s*|\\s+)${escapeRegExp(postNominal)}$`,
          "i"
        );

        if (trailingPostNominal.test(name)) {
          name = name.replace(trailingPostNominal, "").trim();
        }
      });

    return { name, postNominals };
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
      localStorage.getItem("token") ||
      localStorage.getItem("api_token") ||
      ""
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

  let tokenRefreshPromise = null;
  let tokenRefreshTimer = null;

  function getTokenExpiryMs(token) {
    const parts = normalizeToken(token).split(".");

    if (parts.length !== 3) return 0;

    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
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
      credentials: "same-origin"
    })
      .then(async response => {
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
        credentials: "same-origin"
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
      storedToken && getTokenExpiryMs(storedToken) > getTokenExpiryMs(suppliedToken)
        ? storedToken
        : suppliedToken;

    return {
      ...headers,
      ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {})
    };
  }

  function hasHeader(headers, name) {
    const normalizedName = name.toLowerCase();

    return Object.keys(headers).some(
      key => key.toLowerCase() === normalizedName
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
      token !== undefined
        ? token
        : auth
          ? getStoredAuthToken()
          : undefined;

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

    const response = await fetch(path, {
      ...fetchOptions,
      body: requestBody,
      headers: requestToken !== undefined
        ? authHeaders(requestToken, requestHeaders)
        : requestHeaders
    });

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
          _retriedAfterRefresh: true
        });
      }
    }

    const data = parseJson ? await readJsonResponse(response) : response;

    if (response.status === 401 && redirectOnUnauthorized) {
      redirectToLogin(
        redirectOnUnauthorized === true
          ? "/login"
          : redirectOnUnauthorized
      );
      throw createApiError(unauthorizedMessage, response, data);
    }

    if (!response.ok) {
      throw createApiError(
        parseJson
          ? extractErrorMessage(data, response, errorMessage)
          : (errorMessage || `HTTP ${response.status} ${response.statusText}`),
        response,
        data
      );
    }

    return data;
  }

  function apiJson(path, options = {}) {
    return apiFetch(path, {
      ...options,
      json: true,
      parseJson: true
    });
  }

  function clearMfaSession() {
    sessionStorage.removeItem("tempToken");
    sessionStorage.removeItem("twoFactorMethods");
  }

  function ensureWebAuthnAvailable(message = "Passkeys are not available in this browser context.") {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error(message);
    }
  }

  function base64urlToArrayBuffer(value) {
    const base64 = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
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

    return credentials.map(credential => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id)
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
        id: base64urlToArrayBuffer(publicKey.user.id)
      };
    }

    if (publicKey.excludeCredentials) {
      publicKey.excludeCredentials =
        convertPublicKeyCredentialDescriptors(publicKey.excludeCredentials);
    }

    return publicKey;
  }

  function preparePublicKeyRequestOptions(options = {}) {
    const publicKey = { ...options };

    if (publicKey.challenge) {
      publicKey.challenge = base64urlToArrayBuffer(publicKey.challenge);
    }

    if (publicKey.allowCredentials) {
      publicKey.allowCredentials =
        convertPublicKeyCredentialDescriptors(publicKey.allowCredentials);
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
        clientDataJSON:
          arrayBufferToBase64url(credential.response.clientDataJSON),
        attestationObject:
          arrayBufferToBase64url(credential.response.attestationObject)
      },
      transports: credential.response.getTransports
        ? credential.response.getTransports()
        : []
    };
  }

  function serializeAssertionCredential(assertion) {
    return {
      id: assertion.id,
      rawId: arrayBufferToBase64url(assertion.rawId),
      type: assertion.type,
      response: {
        authenticatorData:
          arrayBufferToBase64url(assertion.response.authenticatorData),
        clientDataJSON:
          arrayBufferToBase64url(assertion.response.clientDataJSON),
        signature:
          arrayBufferToBase64url(assertion.response.signature),
        userHandle: assertion.response.userHandle
          ? arrayBufferToBase64url(assertion.response.userHandle)
          : null
      }
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

    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
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

    const {
      fallback,
      locale,
      ...formatOptions
    } = options;
    const hasDateOption = [
      "dateStyle",
      "weekday",
      "era",
      "year",
      "month",
      "day"
    ].some(option => Object.prototype.hasOwnProperty.call(
      formatOptions,
      option
    ));
    const hasTimeStyle = Object.prototype.hasOwnProperty.call(
      formatOptions,
      "timeStyle"
    );
    const displayOptionKeys = Object.keys(formatOptions).filter(
      option => ![
        "calendar",
        "hourCycle",
        "numberingSystem",
        "timeZone"
      ].includes(option)
    );
    const hasAnyDisplayOption = displayOptionKeys.length > 0;
    const intlOptions = {
      ...formatOptions
    };

    if (!hasAnyDisplayOption) {
      intlOptions.dateStyle = "medium";
    }

    if (!hasDateOption && hasTimeStyle) {
      intlOptions.dateStyle = "medium";
    }

    return new Intl.DateTimeFormat(
      locale || getCurrentLocale(),
      intlOptions
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
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function getUserDisplayName(user, fallback = "") {
    return (
      user?.accountName ||
      user?.username ||
      user?.email ||
      fallback
    );
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
      tabKey = "tab"
    } = options;

    getElementList(tabs).forEach(tab => {
      const isActive = tab.dataset[tabKey] === active;

      tab.classList.toggle(activeClass, isActive);

      if (
        tab.getAttribute("role") === "tab" ||
        tab.hasAttribute("aria-selected")
      ) {
        tab.setAttribute("aria-selected", String(isActive));
      }
    });

    getElementList(panels).forEach(panel => {
      const isActive = panel.dataset[panelKey] === active;

      panel.classList.toggle(activeClass, isActive);
      panel.hidden = !isActive;
    });
  }

  function bindTabs(options = {}) {
    const tabs = getElementList(options.tabs);
    const tabKey = options.tabKey || "tab";

    function activate(active) {
      activateTabs({
        ...options,
        active,
        tabs
      });
    }

    tabs.forEach(tab => {
      tab.addEventListener("click", event => {
        const active = tab.dataset[tabKey];

        if (options.preventDefault) {
          event.preventDefault();
        }

        activate(active);

        if (typeof options.onActivate === "function") {
          options.onActivate(active, tab, event);
        }
      });
    });

    if (options.active) {
      activate(options.active);
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

  let modalOverlay = null;
  let modalDialog = null;
  let modalTitle = null;
  let modalMessage = null;
  let modalInputGroup = null;
  let modalInputLabel = null;
  let modalInput = null;
  let modalCancelButton = null;
  let modalConfirmButton = null;
  let modalCloseButton = null;
  let modalActiveRequest = null;
  let modalQueue = Promise.resolve();

  function getModalTranslation(key, fallback) {
    if (typeof window.translate !== "function") {
      return fallback;
    }

    const translated = window.translate(key);
    return translated && translated !== key ? translated : fallback;
  }

  function getFocusableModalElements() {
    if (!modalDialog) return [];

    return Array.from(
      modalDialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function closeModal(value) {
    const request = modalActiveRequest;

    if (!request) return;

    modalActiveRequest = null;
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

    const actions = document.createElement("div");
    actions.className = "cmcen-modal-actions";

    modalCancelButton = document.createElement("button");
    modalCancelButton.type = "button";
    modalCancelButton.className = "cmcen-modal-button cmcen-modal-button-secondary";

    modalConfirmButton = document.createElement("button");
    modalConfirmButton.type = "button";
    modalConfirmButton.className = "cmcen-modal-button cmcen-modal-button-primary";

    actions.append(modalCancelButton, modalConfirmButton);
    body.append(modalMessage, modalInputGroup, actions);
    modalDialog.append(header, body);
    modalOverlay.append(modalDialog);

    modalOverlay.addEventListener("click", event => {
      if (event.target === modalOverlay && modalActiveRequest?.closeOnBackdrop) {
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
      closeModal(
        modalActiveRequest.type === "prompt" ? modalInput.value : modalActiveRequest.confirmValue
      );
    });

    modalOverlay.addEventListener("keydown", event => {
      if (!modalActiveRequest) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeModal(modalActiveRequest.cancelValue);
        return;
      }

      if (event.key === "Enter" && modalActiveRequest.type === "prompt") {
        event.preventDefault();
        closeModal(modalInput.value);
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
    const request = () => new Promise(resolve => {
      createModal();

      const isPrompt = type === "prompt";
      const isAlert = type === "alert";
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
        restoreFocus: document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
        cancelValue: isPrompt ? null : false,
        confirmValue: isAlert ? undefined : true,
        closeOnBackdrop: options.closeOnBackdrop !== false
      };

      modalDialog.setAttribute("role", isAlert ? "alertdialog" : "dialog");
      modalTitle.textContent = options.title || getModalTranslation(titleKey, defaultTitle);
      modalMessage.textContent = String(message || "");
      modalCloseButton.setAttribute(
        "aria-label",
        options.closeLabel || getModalTranslation("modal_close", "Close")
      );
      modalInputGroup.hidden = !isPrompt;
      modalInput.type = isPrompt ? options.inputType || "text" : "text";
      modalInput.value = isPrompt ? String(options.defaultValue || "") : "";
      modalInput.placeholder = isPrompt ? options.placeholder || "" : "";
      modalInput.autocomplete = isPrompt ? options.autocomplete || "off" : "off";
      modalInputLabel.textContent = options.inputLabel || getModalTranslation("modal_input_label", "Value");
      modalCancelButton.hidden = isAlert;
      modalCancelButton.textContent = options.cancelText || getModalTranslation("modal_cancel", "Cancel");
      modalConfirmButton.textContent = options.confirmText || getModalTranslation(
        isAlert ? "modal_close" : "modal_confirm",
        isAlert ? "Close" : "Confirm"
      );
      modalConfirmButton.classList.toggle("is-danger", Boolean(options.destructive));

      modalOverlay.hidden = false;
      document.body.classList.add("cmcen-modal-lock");

      window.requestAnimationFrame(() => {
        if (modalActiveRequest?.resolve !== resolve) return;

        const focusTarget = isPrompt ? modalInput : modalConfirmButton;
        focusTarget.focus();
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
    }
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
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    });
    const token = getStoredAuthToken();
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    fetch("/api/analytics/visit", {
      method: "POST",
      headers,
      body: payload,
      keepalive: true
    }).catch(() => {});
  }

  function getCompressedImageName(file, mimeType) {
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const baseName = String(file?.name || "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";

    return `${baseName}.${extension}`;
  }

  async function prepareImageUploadFile(file, options = {}) {
    const {
      maxDimension = 2200,
      jpegQuality = 0.82,
      minSavingsRatio = 0.92
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
    const mimeType = file.type === "image/png" && scale === 1 ? "image/png" : "image/jpeg";
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

    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, mimeType, mimeType === "image/jpeg" ? jpegQuality : undefined);
    });

    if (!blob || blob.size >= file.size * minSavingsRatio) {
      return file;
    }

    return new File([blob], getCompressedImageName(file, mimeType), {
      type: mimeType,
      lastModified: Date.now()
    });
  }

  window.CMCENUtils = {
    activateTabs,
    apiFetch,
    apiJson,
    arrayBufferToBase64url,
    authHeaders,
    base64urlToArrayBuffer,
    bindTabs,
    clearAuthToken,
    clearMfaSession,
    createLoadingSpinner,
    ensureWebAuthnAvailable,
    formatDate,
    formatTitleCaseValue,
    fromLocalDateAndTime,
    getCurrentLanguage,
    getCurrentLocale,
    getLocalizedText,
    getRetireeNameParts,
    getStoredAuthToken,
    getUserDisplayName,
    normalizeToken,
    preparePublicKeyCreationOptions,
    preparePublicKeyRequestOptions,
    prepareImageUploadFile,
    redirectToLogin,
    refreshAuthToken,
    requireAuthToken,
    serializeAssertionCredential,
    serializeAttestationCredential,
    signOut,
    setStatusLoading,
    setStatusMessage,
    storeAuthToken,
    toLocalDateInput,
    toLocalDateTimeInput,
    toLocalTimeInput,
    trackPageVisit
  };

  window.addEventListener("load", trackPageVisit, { once: true });
})();
