(function () {
  const sitemapGrid = document.getElementById("sitemapGrid");
  const sitemapStatus = document.getElementById("sitemapStatus");

  function getLocalizedText(value) {
    if (window.CMCENUtils?.getLocalizedText) {
      return CMCENUtils.getLocalizedText(value);
    }

    return String(value?.en || value?.fr || value || "").trim();
  }

  function setStatus(message, isError = false) {
    if (!sitemapStatus) return;
    sitemapStatus.textContent = message;
    sitemapStatus.classList.toggle("is-error", Boolean(isError));
    sitemapStatus.classList.remove("is-loading");
  }

  function renderSitemapSkeletons() {
    if (!sitemapGrid) return;

    sitemapGrid.replaceChildren(
      ...Array.from({ length: 4 }, () => {
        const section = document.createElement("section");
        section.className = "sitemap-section sitemap-section--skeleton";
        section.setAttribute("aria-hidden", "true");
        section.append(
          CMCENUtils.createSkeleton("skeleton--line skeleton--line-medium"),
          CMCENUtils.createSkeleton("skeleton--line skeleton--line-title"),
          CMCENUtils.createSkeleton("skeleton--line"),
          CMCENUtils.createSkeleton("skeleton--line skeleton--line-short"),
        );
        return section;
      }),
    );
  }

  function createSitemapLink(item) {
    const link = document.createElement("a");
    link.className = "sitemap-link";
    link.href = item.route || "/";

    const title = document.createElement("strong");
    title.textContent =
      getLocalizedText(item.title) || item.route || "Untitled";
    link.append(title);

    const route = document.createElement("span");
    route.textContent = item.route || "/";
    link.append(route);

    const summary = getLocalizedText(item.summary);
    if (summary) {
      const copy = document.createElement("p");
      copy.textContent = summary;
      link.append(copy);
    }

    return link;
  }

  function renderSitemap(data) {
    if (!sitemapGrid) return;

    sitemapGrid.innerHTML = "";
    const items = Array.isArray(data?.items) ? data.items : [];
    const sections = Array.isArray(data?.sections) ? data.sections : [];
    const sectionsByKey = new Map(
      sections.map((section) => [section.key, section]),
    );

    if (!items.length) {
      setStatus("No sitemap entries are available.", true);
      return;
    }

    const sectionKeys = [
      ...sections.map((section) => section.key),
      ...items.map((item) => item.section),
    ].filter((key, index, list) => key && list.indexOf(key) === index);

    sectionKeys.forEach((sectionKey) => {
      const sectionItems = items.filter((item) => item.section === sectionKey);
      if (!sectionItems.length) return;

      const section = document.createElement("section");
      section.className = "sitemap-section";

      const heading = document.createElement("h2");
      heading.textContent =
        getLocalizedText(sectionsByKey.get(sectionKey)?.title) || "Pages";
      section.append(heading);

      const list = document.createElement("div");
      list.className = "sitemap-list";
      sectionItems.forEach((item) => {
        list.append(createSitemapLink(item));
      });
      section.append(list);

      sitemapGrid.append(section);
    });

    setStatus(`Generated ${items.length} sitemap entries.`);
  }

  async function loadSitemap() {
    sitemapStatus.classList.add("is-loading");
    sitemapStatus.textContent = "Loading site map…";
    renderSitemapSkeletons();

    try {
      const data = await CMCENUtils.apiJson("/api/sitemap");
      renderSitemap(data);
    } catch (error) {
      setStatus("The site map could not be loaded right now.", true);
    }
  }

  loadSitemap();
})();
