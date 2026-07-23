const translationsSearch = document.getElementById("translationsSearch");
const translationsCount = document.getElementById("translationsCount");
const translationsMessage = document.getElementById("translationsMessage");
const translationsList = document.getElementById("translationsList");

let translationRows = [];
let activeTranslationsMessageKey = "";
const translationSaveSuccessDisplayMs = 2200;

function getTranslationAdminToken() {
  return CMCENUtils.requireAuthToken();
}

function translationApiJson(path, token, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("translations_access_denied")
  });
}

async function syncDeveloperSiteConfigTab(token) {
  try {
    const user = await translationApiJson("/api/me", token, {
      errorMessage: translate("translations_access_denied")
    });

    window.updateAdminWorkZoneTabsForUser(user);
  } catch {
    // The translation editor still works without the developer-only tab.
  }
}

function setTranslationsMessage(message, state = "", messageKey = "") {
  activeTranslationsMessageKey = messageKey;
  translationsMessage.textContent = message;
  translationsMessage.className = "review-page-message";

  if (state) {
    translationsMessage.classList.add(`is-${state}`);
  }

  translationsMessage.hidden = false;
  translationsList.hidden = true;
}

function showTranslationToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide"
  });
}

function resetTranslationSaveButton(saveButton) {
  window.clearTimeout(saveButton.translationSaveResetTimeout);
  saveButton.translationSaveResetTimeout = 0;
  saveButton.disabled = false;
  saveButton.classList.remove("is-loading", "is-saved");
  saveButton.removeAttribute("aria-label");
  saveButton.textContent = translate("translations_save");
}

function setTranslationSaveButtonLoading(saveButton, isLoading) {
  if (!isLoading) {
    resetTranslationSaveButton(saveButton);
    return;
  }

  window.clearTimeout(saveButton.translationSaveResetTimeout);
  saveButton.translationSaveResetTimeout = 0;
  saveButton.disabled = true;
  saveButton.classList.remove("is-saved");
  saveButton.classList.add("is-loading");

  const spinner = document.createElement("span");
  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  saveButton.setAttribute("aria-label", translate("translations_saving"));
  saveButton.replaceChildren(spinner);
}

function setTranslationSaveButtonSaved(saveButton) {
  window.clearTimeout(saveButton.translationSaveResetTimeout);
  saveButton.translationSaveResetTimeout = 0;
  saveButton.disabled = true;
  saveButton.classList.remove("is-loading");
  saveButton.classList.add("is-saved");

  const check = document.createElement("span");
  check.className = "translation-save-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "\u2713";

  saveButton.setAttribute("aria-label", translate("translations_saved"));
  saveButton.replaceChildren(check);

  saveButton.translationSaveResetTimeout = window.setTimeout(() => {
    resetTranslationSaveButton(saveButton);
  }, translationSaveSuccessDisplayMs);
}

function setTranslationRowStatus(status, missing) {
  status.className = "translation-row-status";
  status.textContent = "";

  if (!missing.length) {
    return;
  }

  status.classList.add("is-warning");
  status.textContent = `${translate("translations_missing_label")}: ${missing.join(", ")}`;
}

function getFilteredRows() {
  const query = translationsSearch.value.trim().toLowerCase();

  if (!query) {
    return translationRows;
  }

  return translationRows.filter(row => {
    return [
      row.key,
      row.values.en,
      row.values.fr
    ].some(value => String(value).toLowerCase().includes(query));
  });
}

function syncVisibleTranslationEdits() {
  translationsList.querySelectorAll(".translation-row").forEach(article => {
    const row = translationRows.find(item => item.key === article.dataset.key);

    if (!row) {
      return;
    }

    article.querySelectorAll("textarea[data-language]").forEach(textarea => {
      row.values[textarea.dataset.language] = textarea.value;
    });

    row.missing = ["en", "fr"].filter(
      language => !String(row.values[language] || "").trim()
    );
  });
}

function createTranslationTextarea(row, language) {
  const field = document.createElement("div");
  field.className = "event-field translations-text-field";

  const label = document.createElement("label");
  label.textContent = translate(
    language === "en"
      ? "translations_english_label"
      : "translations_french_label"
  );

  const textarea = document.createElement("textarea");
  textarea.value = row.values[language] || "";
  textarea.dataset.language = language;
  textarea.rows = 1;
  textarea.spellcheck = true;

  field.append(label, textarea);

  return field;
}

function createTranslationRow(row) {
  const article = document.createElement("article");
  article.className = "translation-row";
  article.dataset.key = row.key;

  const header = document.createElement("header");
  header.className = "translation-row-header";

  const keyGroup = document.createElement("div");
  keyGroup.className = "translation-key-group";

  const keyLabel = document.createElement("span");
  keyLabel.className = "translation-key-label";
  keyLabel.textContent = translate("translations_key_label");

  const keyValue = document.createElement("code");
  keyValue.className = "translation-key-value";
  keyValue.textContent = row.key;

  keyGroup.append(keyLabel, keyValue);

  const status = document.createElement("p");
  status.className = "translation-row-status";
  status.setAttribute("aria-live", "polite");
  setTranslationRowStatus(status, row.missing);

  header.append(keyGroup, status);

  const fields = document.createElement("div");
  fields.className = "translation-fields";
  fields.append(
    createTranslationTextarea(row, "en"),
    createTranslationTextarea(row, "fr")
  );

  const actions = document.createElement("div");
  actions.className = "translation-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "review-publish-button translation-save-button";
  saveButton.textContent = translate("translations_save");
  saveButton.addEventListener("click", () => {
    saveTranslationRow(article, row.key);
  });

  actions.append(saveButton);
  article.append(header, fields, actions);

  return article;
}

function renderTranslationRows() {
  syncVisibleTranslationEdits();

  const rows = getFilteredRows();

  translationsList.replaceChildren();
  translationsCount.textContent = translate(
    "translations_total_count",
    { count: rows.length }
  );

  if (!rows.length) {
    setTranslationsMessage(
      translate("translations_empty"),
      "empty",
      "translations_empty"
    );
    return;
  }

  rows.forEach(row => {
    translationsList.appendChild(createTranslationRow(row));
  });

  translationsMessage.hidden = true;
  translationsList.hidden = false;
}

async function saveTranslationRow(article, key) {
  const token = getTranslationAdminToken();

  if (!token) {
    return;
  }

  const saveButton = article.querySelector(".translation-save-button");
  const status = article.querySelector(".translation-row-status");
  const values = {};
  let didSave = false;

  article.querySelectorAll("textarea[data-language]").forEach(textarea => {
    values[textarea.dataset.language] = textarea.value;
  });

  setTranslationSaveButtonLoading(saveButton, true);
  status.className = "translation-row-status";
  status.textContent = "";

  try {
    const data = await translationApiJson(
      `/api/translations/${encodeURIComponent(key)}`,
      token,
      {
        method: "PATCH",
        body: values,
        errorMessage: translate("translations_save_error")
      }
    );

    const row = translationRows.find(item => item.key === key);

    if (row) {
      row.values = data.values;
      row.missing = ["en", "fr"].filter(
        language => !String(data.values[language] || "").trim()
      );
    }

    if (window.translations) {
      window.translations.en[key] = data.values.en || "";
      window.translations.fr[key] = data.values.fr || "";
    }

    setTranslationRowStatus(status, row ? row.missing : []);
    setTranslationSaveButtonSaved(saveButton);
    showTranslationToast(translate("translations_saved"), "success");
    didSave = true;
  } catch (error) {
    console.error("Translation save failed:", error);
    setTranslationRowStatus(status, translationRows.find(item => item.key === key)?.missing || []);
    showTranslationToast(
      error.status === 403
        ? translate("translations_access_denied")
        : error.message || translate("translations_save_error"),
      "error"
    );
  } finally {
    if (!didSave) {
      setTranslationSaveButtonLoading(saveButton, false);
    }
  }
}

async function loadTranslationsForEditing() {
  const token = getTranslationAdminToken();

  if (!token) {
    return;
  }

  syncDeveloperSiteConfigTab(token);

  setTranslationsMessage(
    translate("translations_loading"),
    "loading",
    "translations_loading"
  );

  try {
    const data = await translationApiJson("/api/translations", token, {
      errorMessage: translate("translations_load_error")
    });

    translationRows = Array.isArray(data.rows) ? data.rows : [];
    renderTranslationRows();
  } catch (error) {
    if (error.status === 403) {
      setTranslationsMessage(
        translate("translations_access_denied"),
        "error",
        "translations_access_denied"
      );
      return;
    }

    console.error("Translation load failed:", error);
    setTranslationsMessage(
      error.message || translate("translations_load_error"),
      "error",
      error.message ? "" : "translations_load_error"
    );
  }
}

translationsSearch.addEventListener("input", renderTranslationRows);

document.addEventListener("languagechange", () => {
  if (translationRows.length) {
    renderTranslationRows();
    return;
  }

  if (!translationsMessage.hidden) {
    if (activeTranslationsMessageKey) {
      translationsMessage.textContent =
        translate(activeTranslationsMessageKey);
    }
  }
});

loadTranslationsForEditing();
