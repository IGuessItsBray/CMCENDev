(function () {
  function normalizeToken(value) {
    return String(value || "").trim().replace(/^Bearer\s+/i, "");
  }

  function storeAuthToken(token) {
    const cleanToken = normalizeToken(token);

    if (!cleanToken) {
      return "";
    }

    localStorage.setItem("token", cleanToken);
    localStorage.setItem("api_token", cleanToken);

    return cleanToken;
  }

  function getStoredAuthToken() {
    return normalizeToken(
      localStorage.getItem("token") ||
      localStorage.getItem("api_token") ||
      ""
    );
  }

  function clearAuthToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("api_token");
  }

  function redirectToLogin(path = "/login.html") {
    clearAuthToken();
    window.location.href = path;
  }

  function requireAuthToken(path = "/login.html") {
    const token = getStoredAuthToken();

    if (!token) {
      window.location.replace(path);
      return null;
    }

    return storeAuthToken(token);
  }

  function authHeaders(token = getStoredAuthToken(), headers = {}) {
    const cleanToken = normalizeToken(token);

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

  async function apiFetch(path, options = {}) {
    const {
      auth = false,
      body,
      errorMessage,
      headers = {},
      json = false,
      parseJson = true,
      redirectOnUnauthorized = "",
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

    const data = parseJson
      ? await readJsonResponse(response)
      : response;

    if (response.status === 401 && redirectOnUnauthorized) {
      redirectToLogin(
        redirectOnUnauthorized === true
          ? "/login.html"
          : redirectOnUnauthorized
      );
      throw new Error(unauthorizedMessage);
    }

    if (!response.ok) {
      throw new Error(
        parseJson
          ? extractErrorMessage(data, response, errorMessage)
          : (errorMessage || `HTTP ${response.status} ${response.statusText}`)
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

  window.CMCENUtils = {
    apiFetch,
    apiJson,
    arrayBufferToBase64url,
    authHeaders,
    base64urlToArrayBuffer,
    clearAuthToken,
    clearMfaSession,
    createLoadingSpinner,
    ensureWebAuthnAvailable,
    formatDate,
    formatTitleCaseValue,
    getCurrentLanguage,
    getCurrentLocale,
    getLocalizedText,
    getStoredAuthToken,
    getUserDisplayName,
    normalizeToken,
    preparePublicKeyCreationOptions,
    preparePublicKeyRequestOptions,
    redirectToLogin,
    requireAuthToken,
    serializeAssertionCredential,
    serializeAttestationCredential,
    setStatusLoading,
    setStatusMessage,
    storeAuthToken
  };
})();
