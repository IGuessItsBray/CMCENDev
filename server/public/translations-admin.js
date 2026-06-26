const translationsSearch = document.getElementById("translationsSearch");
const translationsCount = document.getElementById("translationsCount");
const translationsMessage = document.getElementById("translationsMessage");
const translationsNotice = document.getElementById("translationsNotice");
const translationsList = document.getElementById("translationsList");

let translationRows = [];
let activeTranslationsMessageKey = "";

function getTranslationAdminToken() {
  const token = String(
    localStorage.getItem("token") ||
    localStorage.getItem("api_token") ||
    ""
  ).trim().replace(/^Bearer\s+/i, "");

  if (!token) {
    window.location.replace("/login.html");
    return null;
  }

  localStorage.setItem("token", token);
  localStorage.setItem("api_token", token);

  return token;
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

function showTranslationsNotice(message, state = "success") {
  translationsNotice.textContent = message;
  translationsNotice.className = `review-notice is-${state}`;
  translationsNotice.hidden = false;

  window.clearTimeout(showTranslationsNotice.timeoutId);
  showTranslationsNotice.timeoutId = window.setTimeout(() => {
    translationsNotice.hidden = true;
  }, 3000);
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

  if (row.missing.length) {
    status.classList.add("is-warning");
    status.textContent = `${translate("translations_missing_label")}: ${row.missing.join(", ")}`;
  }

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

  article.querySelectorAll("textarea[data-language]").forEach(textarea => {
    values[textarea.dataset.language] = textarea.value;
  });

  saveButton.disabled = true;
  saveButton.textContent = translate("translations_saving");
  status.className = "translation-row-status";
  status.textContent = "";

  try {
    const response = await fetch(
      `/api/translations/${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (response.status === 403) {
      throw new Error(translate("translations_access_denied"));
    }

    if (!response.ok) {
      throw new Error(data.error || translate("translations_save_error"));
    }

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

    status.classList.add("is-success");
    status.textContent = translate("translations_saved");
    showTranslationsNotice(translate("translations_saved"));
  } catch (error) {
    console.error("Translation save failed:", error);
    status.classList.add("is-error");
    status.textContent =
      error.message || translate("translations_save_error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = translate("translations_save");
  }
}

async function loadTranslationsForEditing() {
  const token = getTranslationAdminToken();

  if (!token) {
    return;
  }

  setTranslationsMessage(
    translate("translations_loading"),
    "loading",
    "translations_loading"
  );

  try {
    const response = await fetch("/api/translations", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (response.status === 403) {
      setTranslationsMessage(
        translate("translations_access_denied"),
        "error",
        "translations_access_denied"
      );
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || translate("translations_load_error"));
    }

    translationRows = Array.isArray(data.rows) ? data.rows : [];
    renderTranslationRows();
  } catch (error) {
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
