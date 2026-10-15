(function () {
  const library = document.getElementById("documentLibrary");
  const search = document.getElementById("documentSearch");
  const organization = document.getElementById("documentOrganization");
  const type = document.getElementById("documentType");
  const resultCount = document.getElementById("documentResultCount");
  const more = document.getElementById("documentLibraryMore");

  if (!library || !search || !organization || !type || !resultCount || !more)
    return;

  let contentPromise;
  const batchSize = 24;
  let visibleCount = batchSize;

  function getLanguage() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function loadContent() {
    if (!contentPromise) {
      contentPromise = fetch("/page-content/document-library.json").then(
        (response) => {
          if (!response.ok) throw new Error("Could not load document library");
          return response.json();
        },
      );
    }
    return contentPromise;
  }

  function appendOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function renderSelect(select, options, allLabel) {
    const selectedValue = select.value;
    select.replaceChildren();
    appendOption(select, "all", allLabel);
    options.forEach((option) =>
      appendOption(select, option.value, option.label),
    );
    select.value = options.some((option) => option.value === selectedValue)
      ? selectedValue
      : "all";
  }

  function createDocumentCard(item, labels) {
    const article = document.createElement("article");
    article.id = item.id;
    for (const alias of item.aliases || []) {
      const anchor = document.createElement("span");
      anchor.id = alias;
      article.append(anchor);
    }
    article.className = "document-library-card";

    const metadata = document.createElement("p");
    metadata.className = "document-library-card-meta";
    metadata.textContent = `${item.organizationLabel} · ${item.typeLabel} · ${item.dateLabel}`;

    const heading = document.createElement("h3");
    heading.textContent = item.title;

    const description = document.createElement("p");
    description.textContent = item.description;

    const language = document.createElement("p");
    language.className = "document-library-language";
    language.textContent = `${labels.languageLabel}: ${item.languageLabel}`;

    const actions = document.createElement("div");
    actions.className = "document-library-actions";

    if (item.htmlVersionUrl) {
      const pageLink = document.createElement("a");
      pageLink.href = item.htmlVersionUrl;
      pageLink.textContent = labels.readHtml;
      actions.append(pageLink);
    }

    if (item.fileUrl) {
      const downloadLink = document.createElement("a");
      downloadLink.href = item.fileUrl;
      downloadLink.textContent = item.fileUrl.toLowerCase().endsWith(".docx")
        ? labels.downloadDocx
        : labels.downloadPdf;
      actions.append(downloadLink);
    } else {
      const unavailable = document.createElement("span");
      unavailable.className = "document-library-unavailable";
      unavailable.textContent = labels.sourceUnavailable;
      actions.append(unavailable);
    }

    const references = item.references || [];
    const usage = document.createElement(references.length ? "details" : "p");
    usage.className = "document-library-references";
    const countLabel = (
      references.length === 1 ? labels.referenceCountOne : labels.referenceCount
    ).replace("{count}", String(references.length));
    if (references.length) {
      const summary = document.createElement("summary");
      summary.textContent = countLabel;
      const list = document.createElement("ul");
      for (const reference of references) {
        const row = document.createElement("li");
        const link = document.createElement("a");
        link.href = reference.href;
        link.textContent =
          reference.title[getLanguage()] ||
          reference.title.en ||
          reference.title.fr;
        row.append(link);
        list.append(row);
      }
      usage.append(summary, list);
    } else usage.textContent = countLabel;
    article.append(metadata, heading, description, language, usage, actions);
    return article;
  }

  async function renderLibrary({ revealHash = false } = {}) {
    try {
      const content = await loadContent();
      const language = getLanguage();
      const labels = content[language].library;
      const query = search.value.trim().toLocaleLowerCase(language);

      renderSelect(organization, labels.organizations, labels.allOrganizations);
      renderSelect(type, labels.types, labels.allTypes);

      const organizationLabels = Object.fromEntries(
        labels.organizations.map((item) => [item.value, item.label]),
      );
      const typeLabels = Object.fromEntries(
        labels.types.map((item) => [item.value, item.label]),
      );

      const items = content.documents
        .map((documentItem) => ({
          ...documentItem,
          ...documentItem[language],
          organizationLabel: organizationLabels[documentItem.organization],
          typeLabel: typeLabels[documentItem.type],
        }))
        .filter((item) => {
          if (
            organization.value !== "all" &&
            item.organization !== organization.value
          ) {
            return false;
          }
          if (type.value !== "all" && item.type !== type.value) return false;
          if (!query) return true;
          return [
            item.title,
            item.description,
            item.organizationLabel,
            item.typeLabel,
          ]
            .join(" ")
            .toLocaleLowerCase(language)
            .includes(query);
        });

      let anchor = "";
      if (revealHash && location.hash) {
        try {
          anchor = decodeURIComponent(location.hash.slice(1));
        } catch {
          /* Ignore malformed fragments. */
        }
        const index = items.findIndex(
          (item) => item.id === anchor || item.aliases?.includes(anchor),
        );
        if (index >= 0)
          visibleCount = Math.max(
            visibleCount,
            Math.ceil((index + 1) / batchSize) * batchSize,
          );
      }
      const shown = items.slice(0, visibleCount);
      library.replaceChildren();
      shown.forEach((item) => library.append(createDocumentCard(item, labels)));
      more.textContent = labels.loadMore;
      more.hidden = shown.length >= items.length;
      if (anchor) document.getElementById(anchor)?.scrollIntoView();

      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "document-library-empty";
        empty.textContent = labels.empty;
        library.append(empty);
      }

      resultCount.textContent = labels.resultCount
        .replace("{count}", String(items.length))
        .replace("{shown}", String(shown.length));
    } catch (error) {
      more.hidden = true;
      console.error(error);
      library.textContent =
        getLanguage() === "fr"
          ? "La bibliothèque de documents n’est pas accessible pour le moment."
          : "The document library is currently unavailable.";
    }
  }

  [search, organization, type].forEach((control) => {
    control.addEventListener(control === search ? "input" : "change", () => {
      visibleCount = batchSize;
      renderLibrary();
    });
  });
  more.addEventListener("click", () => {
    visibleCount += batchSize;
    renderLibrary();
  });
  document.addEventListener("languagechange", () => renderLibrary());
  window.addEventListener("hashchange", () => {
    search.value = "";
    organization.value = "all";
    type.value = "all";
    visibleCount = batchSize;
    renderLibrary({ revealHash: true });
  });
  renderLibrary({ revealHash: true });
})();
