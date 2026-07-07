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
    authHeaders,
    clearAuthToken,
    createLoadingSpinner,
    formatDate,
    formatTitleCaseValue,
    getCurrentLanguage,
    getCurrentLocale,
    getLocalizedText,
    getStoredAuthToken,
    getUserDisplayName,
    normalizeToken,
    redirectToLogin,
    requireAuthToken,
    setStatusLoading,
    setStatusMessage,
    storeAuthToken
  };
})();
