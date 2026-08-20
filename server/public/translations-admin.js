const translationsSearch = document.getElementById("translationsSearch");
const translationsStatusFilter = document.getElementById(
  "translationsStatusFilter",
);
const translationsClearFilters = document.getElementById(
  "translationsClearFilters",
);
const translationsCount = document.getElementById("translationsCount");
const translationsMessage = document.getElementById("translationsMessage");
const translationsList = document.getElementById("translationsList");
const translationsCategoryList = document.getElementById(
  "translationsCategoryList",
);

const TRANSLATION_CATEGORIES = [
  {
    id: "public",
    labelKey: "translations_category_public",
    descriptionKey: "translations_category_public_description",
    prefixes: new Set([
      "about",
      "accessibility",
      "contact",
      "company",
      "donate",
      "footer",
      "home",
      "language",
      "legal",
      "menu",
      "news",
      "privacy",
      "search",
      "site",
      "skip",
      "theme",
      "weekly",
    ]),
  },
  {
    id: "events",
    labelKey: "translations_category_events",
    descriptionKey: "translations_category_events_description",
    prefixes: new Set([
      "calendar",
      "edit",
      "event",
      "events",
      "my",
      "save",
      "submit",
    ]),
  },
  {
    id: "retirement",
    labelKey: "translations_category_retirement",
    descriptionKey: "translations_category_retirement_description",
    prefixes: new Set([
      "certificate",
      "current",
      "post",
      "rank",
      "retirement",
      "retirements",
      "trade",
    ]),
  },
  {
    id: "last-post",
    labelKey: "translations_category_last_post",
    descriptionKey: "translations_category_last_post_description",
    prefixes: new Set(["last"]),
  },
  {
    id: "review",
    labelKey: "translations_category_review",
    descriptionKey: "translations_category_review_description",
    prefixes: new Set([
      "comment",
      "confirm",
      "publish",
      "reject",
      "rejection",
      "review",
      "submitted",
    ]),
  },
  {
    id: "account",
    labelKey: "translations_category_account",
    descriptionKey: "translations_category_account_description",
    prefixes: new Set([
      "access",
      "account",
      "affiliation",
      "back",
      "create",
      "email",
      "first",
      "forgot",
      "have",
      "login",
      "member",
      "mfa",
      "password",
      "passwords",
      "phone",
      "preferred",
      "register",
      "reset",
      "security",
      "session",
      "sign",
      "signout",
      "username",
    ]),
  },
  {
    id: "dashboard",
    labelKey: "translations_category_dashboard",
    descriptionKey: "translations_category_dashboard_description",
    prefixes: new Set(["dashboard", "notifications"]),
  },
  {
    id: "admin",
    labelKey: "translations_category_admin",
    descriptionKey: "translations_category_admin_description",
    prefixes: new Set(["admin", "audit", "role", "timers", "translations"]),
  },
  {
    id: "shared",
    labelKey: "translations_category_shared",
    descriptionKey: "translations_category_shared_description",
    prefixes: null,
  },
];

let translationRows = [];
let activeTranslationsMessageKey = "";
let selectedTranslationCategory = "";
const translationSaveSuccessDisplayMs = 2200;

function getTranslationAdminToken() {
  return CMCENUtils.requireAuthToken();
}

function translationApiJson(path, token, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("translations_access_denied"),
  });
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
    animation: "slide",
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

function getTranslationCategory(row) {
  if (row.key === "last_name") {
    return "account";
  }

  const prefix = row.key.split("_", 1)[0];
  const category = TRANSLATION_CATEGORIES.find(
    (item) => item.prefixes?.has(prefix),
  );

  return category?.id || "shared";
}

function rowMatchesTranslationStatus(row) {
  const filter = translationsStatusFilter.value;

  if (filter === "missing-any") {
    return row.missing.length > 0;
  }

  if (filter === "missing-en") {
    return row.missing.includes("en");
  }

  if (filter === "missing-fr") {
    return row.missing.includes("fr");
  }

  return true;
}

function rowMatchesTranslationSearch(row) {
  const query = normalizeTranslationSearchText(translationsSearch.value);

  if (!query) {
    return true;
  }

  return [row.key, row.values.en, row.values.fr].some((value) =>
    normalizeTranslationSearchText(value).includes(query),
  );
}

function normalizeTranslationSearchText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFilteredRows() {
  return translationRows.filter((row) => {
    if (
      selectedTranslationCategory &&
      getTranslationCategory(row) !== selectedTranslationCategory
    ) {
      return false;
    }

    return (
      rowMatchesTranslationStatus(row) && rowMatchesTranslationSearch(row)
    );
  });
}

function getCategoryRows(categoryId) {
  return translationRows.filter((row) => {
    return (
      getTranslationCategory(row) === categoryId &&
      rowMatchesTranslationStatus(row) &&
      rowMatchesTranslationSearch(row)
    );
  });
}

function hasActiveTranslationFilters() {
  return Boolean(
    selectedTranslationCategory ||
      translationsSearch.value.trim() ||
      translationsStatusFilter.value !== "all",
  );
}

function formatTranslationFamily(family) {
  return `${family.replaceAll("_", " ")} *`;
}

function getTranslationFamilies(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const prefix = row.key.split("_", 1)[0];
    const existing = groups.get(prefix) || [];
    existing.push(row);
    groups.set(prefix, existing);
  });

  return Array.from(groups.entries())
    .flatMap(([groupKey, groupRows]) =>
      splitTranslationFamily(groupKey, groupRows, 1),
    )
    .sort(([first], [second]) =>
    first.localeCompare(second),
  );
}

function splitTranslationFamily(groupKey, rows, depth) {
  if (rows.length <= 36 || depth > 2) {
    return [[groupKey, rows]];
  }

  const childGroups = new Map();

  rows.forEach((row) => {
    const key = row.key.split("_").slice(0, depth + 1).join("_");
    const existing = childGroups.get(key) || [];
    existing.push(row);
    childGroups.set(key, existing);
  });

  const meaningfulGroups = Array.from(childGroups.entries()).filter(
    ([, groupRows]) => groupRows.length >= 6,
  );

  if (meaningfulGroups.length < 2 || meaningfulGroups.length > 11) {
    return [[groupKey, rows]];
  }

  const smallRows = Array.from(childGroups.values())
    .filter((groupRows) => groupRows.length < 6)
    .flat();
  const families = meaningfulGroups.flatMap(([key, groupRows]) =>
    splitTranslationFamily(key, groupRows, depth + 1),
  );

  if (smallRows.length) {
    families.push([`${groupKey}_other`, smallRows]);
  }

  return families;
}

function createTranslationFamily(groupKey, rows, shouldOpen) {
  const family = document.createElement("details");
  family.className = "translation-family";
  family.open = shouldOpen;

  const summary = document.createElement("summary");
  summary.className = "translation-family-summary";

  const title = document.createElement("code");
  title.className = "translation-family-title";
  title.textContent = formatTranslationFamily(groupKey);

  const count = document.createElement("span");
  count.className = "translation-family-count";
  count.textContent = translate("translations_group_count", {
    count: rows.length,
  });

  const missingCount = rows.filter((row) => row.missing.length).length;
  const status = document.createElement("span");
  status.className = "translation-family-status";

  if (missingCount) {
    status.classList.add("has-missing");
    status.textContent = translate("translations_group_missing_count", {
      count: missingCount,
    });
  } else {
    status.hidden = true;
  }

  summary.append(title, status, count);

  const familyRows = document.createElement("div");
  familyRows.className = "translation-family-rows";
  rows.forEach((row) => {
    familyRows.appendChild(createTranslationRow(row));
  });

  family.append(summary, familyRows);
  return family;
}

function renderTranslationCategories() {
  translationsCategoryList.replaceChildren();

  TRANSLATION_CATEGORIES.forEach((category) => {
    const rows = getCategoryRows(category.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "translation-category-card";
    card.dataset.category = category.id;
    card.setAttribute(
      "aria-pressed",
      String(selectedTranslationCategory === category.id),
    );

    if (selectedTranslationCategory === category.id) {
      card.classList.add("is-selected");
    }

    const title = document.createElement("strong");
    title.textContent = translate(category.labelKey);

    const description = document.createElement("span");
    description.className = "translation-category-description";
    description.textContent = translate(category.descriptionKey);

    const meta = document.createElement("span");
    meta.className = "translation-category-meta";
    meta.textContent = translate("translations_category_count", {
      count: rows.length,
    });

    const missingCount = rows.filter((row) => row.missing.length).length;

    if (missingCount) {
      const missing = document.createElement("span");
      missing.className = "translation-category-warning";
      missing.textContent = translate("translations_category_missing_count", {
        count: missingCount,
      });
      meta.append(" · ", missing);
    }

    card.append(title, description, meta);
    card.addEventListener("click", () => {
      selectedTranslationCategory =
        selectedTranslationCategory === category.id ? "" : category.id;
      renderTranslationRows();
    });
    translationsCategoryList.appendChild(card);
  });
}

function syncVisibleTranslationEdits() {
  translationsList.querySelectorAll(".translation-row").forEach((article) => {
    const row = translationRows.find(
      (item) => item.key === article.dataset.key,
    );

    if (!row) {
      return;
    }

    article.querySelectorAll("textarea[data-language]").forEach((textarea) => {
      row.values[textarea.dataset.language] = textarea.value;
    });

    row.missing = ["en", "fr"].filter(
      (language) => !String(row.values[language] || "").trim(),
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
      : "translations_french_label",
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
    createTranslationTextarea(row, "fr"),
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
  const hasActiveFilters = hasActiveTranslationFilters();

  translationsList.replaceChildren();
  translationsCount.textContent = hasActiveFilters
    ? translate("translations_filtered_count", {
        visible: rows.length,
        total: translationRows.length,
      })
    : translate("translations_total_count", {
        count: translationRows.length,
      });
  translationsClearFilters.hidden = !hasActiveFilters;
  renderTranslationCategories();

  if (!hasActiveFilters) {
    setTranslationsMessage(
      translate("translations_browse_prompt"),
      "empty",
      "translations_browse_prompt",
    );
    return;
  }

  if (!rows.length) {
    setTranslationsMessage(
      translate("translations_empty"),
      "empty",
      "translations_empty",
    );
    return;
  }

  const families = getTranslationFamilies(rows);
  const shouldOpenFamilies = rows.length <= 12 || families.length === 1;

  families.forEach(([family, familyRows]) => {
    translationsList.appendChild(
      createTranslationFamily(family, familyRows, shouldOpenFamilies),
    );
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

  article.querySelectorAll("textarea[data-language]").forEach((textarea) => {
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
        errorMessage: translate("translations_save_error"),
      },
    );

    const row = translationRows.find((item) => item.key === key);

    if (row) {
      row.values = data.values;
      row.missing = ["en", "fr"].filter(
        (language) => !String(data.values[language] || "").trim(),
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
    setTranslationRowStatus(
      status,
      translationRows.find((item) => item.key === key)?.missing || [],
    );
    showTranslationToast(
      error.status === 403
        ? translate("translations_access_denied")
        : error.message || translate("translations_save_error"),
      "error",
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

  setTranslationsMessage(
    translate("translations_loading"),
    "loading",
    "translations_loading",
  );

  try {
    const data = await translationApiJson("/api/translations", token, {
      errorMessage: translate("translations_load_error"),
    });

    translationRows = Array.isArray(data.rows) ? data.rows : [];
    renderTranslationRows();
  } catch (error) {
    if (error.status === 403) {
      setTranslationsMessage(
        translate("translations_access_denied"),
        "error",
        "translations_access_denied",
      );
      return;
    }

    console.error("Translation load failed:", error);
    setTranslationsMessage(
      error.message || translate("translations_load_error"),
      "error",
      error.message ? "" : "translations_load_error",
    );
  }
}

translationsSearch.addEventListener("input", () => {
  if (translationsSearch.value.trim()) {
    selectedTranslationCategory = "";
  }

  renderTranslationRows();
});
translationsStatusFilter.addEventListener("change", renderTranslationRows);
translationsClearFilters.addEventListener("click", () => {
  translationsSearch.value = "";
  translationsStatusFilter.value = "all";
  selectedTranslationCategory = "";
  renderTranslationRows();
});

document.addEventListener("languagechange", () => {
  if (translationRows.length) {
    renderTranslationRows();
    return;
  }

  if (!translationsMessage.hidden) {
    if (activeTranslationsMessageKey) {
      translationsMessage.textContent = translate(activeTranslationsMessageKey);
    }
  }
});

loadTranslationsForEditing();
