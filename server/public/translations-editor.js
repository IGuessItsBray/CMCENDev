"use strict";

(() => {
  function mount({ api, permissions, onDenied }) {
    const translate = (key, values) => window.translate(key, values);
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
    const translationsRetry = document.getElementById("translationsRetry");
    translationsSearch.value = "";
    translationsStatusFilter.value = "all";
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
    let disposed = false;
    let loaded = false;
    let saveQueue = Promise.resolve();
    const saving = new Set();
    const familyOpen = new Map();
    const lifecycle = new AbortController();
    const listen = (node, event, callback) =>
      node.addEventListener(event, callback, { signal: lifecycle.signal });
    const isDirty = (row) =>
      ["en", "fr"].some(
        (language) => row.values[language] !== row.saved[language],
      );
    const updateMissing = (row) => {
      row.missing = ["en", "fr"].filter(
        (language) => !row.values[language].trim(),
      );
    };

    async function translationApiJson(path, options = {}) {
      if (disposed) throw new DOMException("Editor closed", "AbortError");
      try {
        const data = await api(path, { ...options, signal: lifecycle.signal });
        if (disposed) throw new DOMException("Editor closed", "AbortError");
        return data;
      } catch (error) {
        if (!disposed && error.status === 403) onDenied?.();
        throw error;
      }
    }

    function setTranslationsMessage(message, state = "", messageKey = "") {
      activeTranslationsMessageKey = messageKey;
      translationsMessage.textContent = message;
      translationsMessage.className = "translations-admin-message";

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

    function updateTranslationRow(article, row) {
      const save = article.querySelector(".translation-save-button");
      const pending = saving.has(row.key);
      const dirty = isDirty(row);
      save.disabled = pending || !dirty;
      save.textContent = translate(
        pending
          ? "translations_saving"
          : row.hasSaved && !dirty
            ? "translations_saved"
            : "translations_save",
      );
      article.setAttribute("aria-busy", String(pending));
      const status = article.querySelector(".translation-row-status");
      status.className = "translation-row-status";
      const messages = [];
      if (row.missing.length) {
        status.classList.add("is-warning");
        messages.push(
          `${translate("translations_missing_label")}: ${row.missing.join(", ")}`,
        );
      }
      if (dirty) messages.push(translate("admin_next_editor_unsaved"));
      status.textContent = messages.join(" · ");
    }

    function refreshVisibleRow(row) {
      const article = [
        ...translationsList.querySelectorAll(".translation-row"),
      ].find((node) => node.dataset.key === row.key);
      if (!article) return;
      article.querySelectorAll("textarea").forEach((input) => {
        const next = row.values[input.dataset.language];
        if (input.value !== next) input.value = next;
      });
      updateTranslationRow(article, row);
    }

    function getTranslationCategory(row) {
      if (row.key === "last_name") {
        return "account";
      }

      const prefix = row.key.split("_", 1)[0];
      const category = TRANSLATION_CATEGORIES.find((item) =>
        item.prefixes?.has(prefix),
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
        .sort(([first], [second]) => first.localeCompare(second));
    }

    function splitTranslationFamily(groupKey, rows, depth) {
      if (rows.length <= 36 || depth > 2) {
        return [[groupKey, rows]];
      }

      const childGroups = new Map();

      rows.forEach((row) => {
        const key = row.key
          .split("_")
          .slice(0, depth + 1)
          .join("_");
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
      family.open = familyOpen.get(groupKey) ?? shouldOpen;
      family.dataset.family = groupKey;
      family.addEventListener("toggle", () => {
        if (!disposed && family.isConnected)
          familyOpen.set(groupKey, family.open);
      });

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
          missing.textContent = translate(
            "translations_category_missing_count",
            {
              count: missingCount,
            },
          );
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

    function createTranslationTextarea(row, language, rows) {
      const field = document.createElement("div");
      field.className = "event-field cmcen-field translations-text-field";

      const label = document.createElement("label");
      label.textContent = translate(
        language === "en"
          ? "translations_english_label"
          : "translations_french_label",
      );

      const textarea = document.createElement("textarea");
      const value = row.values[language] || "";
      textarea.value = value;
      textarea.className = "cmcen-control";
      textarea.id = `translation-${encodeURIComponent(row.key)}-${language}`;
      label.htmlFor = textarea.id;
      textarea.addEventListener("input", () => {
        row.values[language] = textarea.value;
        updateMissing(row);
        refreshVisibleRow(row);
      });
      textarea.dataset.language = language;
      textarea.rows = rows;
      textarea.spellcheck = true;

      field.append(label, textarea);

      return field;
    }

    function getTranslationTextareaRows(value) {
      const estimatedRows = String(value || "")
        .split(/\r?\n/)
        .reduce(
          (total, line) => total + Math.max(1, Math.ceil(line.length / 48)),
          0,
        );

      return Math.min(6, Math.max(1, estimatedRows));
    }

    function getTranslationPairTextareaRows(row) {
      return Math.max(
        getTranslationTextareaRows(row.values.en),
        getTranslationTextareaRows(row.values.fr),
      );
    }

    function createTranslationRow(row) {
      const article = document.createElement("article");
      article.className = "translation-row";
      article.dataset.key = row.key;
      article.id = `translation-${encodeURIComponent(row.key)}-row`;
      article.tabIndex = -1;

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

      header.append(keyGroup, status);

      const fields = document.createElement("div");
      fields.className = "translation-fields";
      const rows = getTranslationPairTextareaRows(row);
      const englishField = createTranslationTextarea(row, "en", rows);
      const frenchField = createTranslationTextarea(row, "fr", rows);
      fields.append(englishField, frenchField);

      const actions = document.createElement("div");
      actions.className = "translation-actions";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "translation-save-button";
      saveButton.id = `translation-${encodeURIComponent(row.key)}-save`;
      saveButton.textContent = translate("translations_save");
      saveButton.addEventListener("click", () => {
        return saveTranslationRow(row);
      });

      actions.append(saveButton);
      article.append(header, fields, actions);
      updateTranslationRow(article, row);

      return article;
    }

    function renderTranslationRows() {
      if (disposed || !loaded) return;
      // A completed save can change the matching rows. Retain focus in another
      // edited row when refreshing the filtered list or switching language.
      const active = document.activeElement;
      const focus = active?.id?.startsWith("translation-")
        ? {
            id: active.id,
            start: active.selectionStart,
            end: active.selectionEnd,
          }
        : null;
      translationsList
        .querySelectorAll("details")
        .forEach((family) =>
          familyOpen.set(family.dataset.family, family.open),
        );

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
        if (focus) {
          translationsMessage.tabIndex = -1;
          translationsMessage.focus({ preventScroll: true });
        }
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
      if (focus) {
        const control = document.getElementById(focus.id);
        if (control?.disabled)
          control.closest(".translation-row")?.focus({ preventScroll: true });
        else control?.focus({ preventScroll: true });
        if (typeof focus.start === "number")
          control?.setSelectionRange?.(focus.start, focus.end);
      }
    }

    async function saveTranslationRow(row) {
      if (disposed || saving.has(row.key) || !isDirty(row)) return;
      const focusedSave =
        document.activeElement?.id ===
        `translation-${encodeURIComponent(row.key)}-save`;
      const values = { ...row.values };
      saving.add(row.key);
      refreshVisibleRow(row);
      // This endpoint writes a whole dictionary. Keep this editor's row saves in order.
      const work = saveQueue.then(async () => {
        if (disposed) return;
        let didSave = false;
        try {
          const data = await translationApiJson(
            `/api/translations/${encodeURIComponent(row.key)}`,
            {
              method: "PATCH",
              body: values,
              errorMessage: translate("translations_save_error"),
            },
          );
          row.saved = { ...data.values };
          row.hasSaved = true;
          for (const language of ["en", "fr"]) {
            // Preserve anything typed after this request's snapshot, even after filtering.
            if (row.values[language] === values[language])
              row.values[language] = data.values[language] || "";
            if (window.translations?.[language])
              window.translations[language][row.key] =
                data.values[language] || "";
          }
          updateMissing(row);
          didSave = true;
          showTranslationToast(translate("translations_saved"), "success");
        } catch (error) {
          if (!disposed)
            showTranslationToast(
              error.status === 403
                ? translate("translations_access_denied")
                : error.message || translate("translations_save_error"),
              "error",
            );
        } finally {
          saving.delete(row.key);
          if (!disposed) {
            if (didSave && !isDirty(row)) renderTranslationRows();
            else refreshVisibleRow(row);
            if (focusedSave && document.activeElement === document.body) {
              const target =
                document.getElementById(
                  `translation-${encodeURIComponent(row.key)}-row`,
                ) || translationsMessage;
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
            }
          }
        }
      });
      saveQueue = work.catch(() => {});
      return work;
    }

    async function loadTranslationsForEditing() {
      if (disposed) return;
      loaded = false;
      translationsRetry.hidden = true;
      translationsSearch.disabled = true;
      translationsStatusFilter.disabled = true;
      translationsClearFilters.disabled = true;

      setTranslationsMessage(
        translate("translations_loading"),
        "loading",
        "translations_loading",
      );

      try {
        const data = await translationApiJson("/api/translations", {
          errorMessage: translate("translations_load_error"),
        });

        translationRows = (Array.isArray(data.rows) ? data.rows : []).map(
          (row) => ({
            ...row,
            values: { ...row.values },
            saved: { ...row.values },
            hasSaved: false,
          }),
        );
        loaded = true;
        translationsSearch.disabled = false;
        translationsStatusFilter.disabled = false;
        translationsClearFilters.disabled = false;
        renderTranslationRows();
      } catch (error) {
        if (disposed) return;
        translationsRetry.hidden = error.status === 403;
        if (error.status === 403) {
          setTranslationsMessage(
            translate("translations_access_denied"),
            "error",
            "translations_access_denied",
          );
          return;
        }

        setTranslationsMessage(
          error.message || translate("translations_load_error"),
          "error",
          error.message ? "" : "translations_load_error",
        );
      }
    }

    listen(translationsSearch, "input", () => {
      if (translationsSearch.value.trim()) {
        selectedTranslationCategory = "";
      }

      renderTranslationRows();
    });
    listen(translationsStatusFilter, "change", renderTranslationRows);
    listen(translationsClearFilters, "click", () => {
      translationsSearch.value = "";
      translationsStatusFilter.value = "all";
      selectedTranslationCategory = "";
      renderTranslationRows();
    });

    listen(document, "languagechange", () => {
      if (translationRows.length) {
        renderTranslationRows();
        return;
      }

      if (!translationsMessage.hidden) {
        if (activeTranslationsMessageKey) {
          translationsMessage.textContent = translate(
            activeTranslationsMessageKey,
          );
        }
      }
    });

    listen(translationsRetry, "click", loadTranslationsForEditing);
    const ready =
      permissions.canManageTranslations === true
        ? loadTranslationsForEditing()
        : Promise.resolve(
            setTranslationsMessage(
              translate("translations_access_denied"),
              "error",
            ),
          );
    return {
      ready,
      canNavigate: () => saving.size === 0,
      hasUnsavedChanges: () => saving.size > 0 || translationRows.some(isDirty),
      dispose() {
        disposed = true;
        lifecycle.abort();
        saving.clear();
        familyOpen.clear();
        translationRows = [];
        translationsList.replaceChildren();
        translationsCategoryList.replaceChildren();
      },
    };
  }
  window.TranslationsEditor = { mount };
})();
