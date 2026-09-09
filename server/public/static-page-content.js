(function () {
  const contentRoot = document.querySelector("[data-static-page]");

  if (!contentRoot) return;

  const page = contentRoot.dataset.staticPage;
  let contentPromise;

  function getLanguage() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function loadContent() {
    if (!contentPromise) {
      contentPromise = fetch(
        `/page-content/${encodeURIComponent(page)}.json`,
      ).then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load page content for ${page}`);
        }

        return response.json();
      });
    }

    return contentPromise;
  }

  async function applyPageLanguage() {
    try {
      const content = await loadContent();
      const language = getLanguage();
      const fallback = content.en || {};
      const localized = content[language] || fallback;

      contentRoot.querySelectorAll("[data-page-i18n]").forEach((element) => {
        const key = element.dataset.pageI18n;
        const value = localized[key] || fallback[key];

        if (typeof value === "string") {
          element.textContent = value;
        }
      });

      contentRoot
        .querySelectorAll("[data-page-i18n-alt]")
        .forEach((element) => {
          const key = element.dataset.pageI18nAlt;
          const value = localized[key] || fallback[key];

          if (typeof value === "string") {
            element.alt = value;
          }
        });

      const title = localized.pageTitle || fallback.pageTitle;
      if (title) {
        document.title = title;
      }
    } catch (error) {
      console.error(error);
    }
  }

  document.addEventListener("languagechange", applyPageLanguage);
  applyPageLanguage();
})();
