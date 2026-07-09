(function () {
  const pageRoot = document.getElementById("cmsPage");

  function getSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);

    return parts[1] || "";
  }

  function localized(value) {
    return CMCENUtils.getLocalizedText(value);
  }

  function createParagraphs(text) {
    return String(text || "")
      .split(/\n{2,}/u)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
      .map(paragraph => {
        const element = document.createElement("p");
        element.textContent = paragraph;
        return element;
      });
  }

  function createBlock(block) {
    const section = document.createElement("section");
    section.className = `cms-block cms-block-${block.type || "text"}`;

    if (block.type === "heading") {
      const heading = document.createElement(block.level === 3 ? "h3" : "h2");
      heading.textContent = localized(block.text);
      section.append(heading);
      return section;
    }

    if (block.type === "image") {
      const image = document.createElement("img");
      image.src = block.mediaUrl || "";
      image.alt = localized(block.alt);
      image.loading = "lazy";
      section.append(image);

      const caption = localized(block.caption);
      if (caption) {
        const captionElement = document.createElement("p");
        captionElement.className = "cms-image-caption";
        captionElement.textContent = caption;
        section.append(captionElement);
      }

      return section;
    }

    if (block.type === "callout") {
      section.classList.toggle("is-important", block.variant === "important");
      createParagraphs(localized(block.body)).forEach(paragraph => {
        section.append(paragraph);
      });
      return section;
    }

    if (block.type === "button") {
      const link = document.createElement("a");
      link.className = "cms-page-button";
      link.href = block.url || "#";
      link.textContent = localized(block.text) || block.url || "Open";
      section.append(link);
      return section;
    }

    if (block.type === "divider") {
      section.append(document.createElement("hr"));
      return section;
    }

    createParagraphs(localized(block.body)).forEach(paragraph => {
      section.append(paragraph);
    });

    return section;
  }

  function renderPage(page) {
    const title = localized(page.title) || page.slug;
    document.title = `${title} | CMCEN / RCMCE`;

    const header = document.createElement("header");
    header.className = "cms-page-heading";

    const eyebrow = document.createElement("p");
    eyebrow.className = "dashboard-eyebrow";
    eyebrow.textContent = "CMCEN / RCMCE";

    const heading = document.createElement("h1");
    heading.textContent = title;

    const summary = localized(page.summary);
    header.append(eyebrow, heading);

    if (summary) {
      const intro = document.createElement("p");
      intro.className = "cms-page-summary";
      intro.textContent = summary;
      header.append(intro);
    }

    const body = document.createElement("div");
    body.className = "cms-page-body";

    (page.blocks || []).forEach(block => {
      body.append(createBlock(block));
    });

    pageRoot.replaceChildren(header, body);
  }

  async function loadPage() {
    try {
      const slug = getSlug();
      const params = new URLSearchParams(window.location.search);
      const previewPageId = params.get("preview");
      const response = previewPageId
        ? await fetch(
          `/api/admin/pages/${encodeURIComponent(previewPageId)}/preview`,
          {
            headers: CMCENUtils.authHeaders()
          }
        )
        : await fetch(
          `/api/pages/${encodeURIComponent(slug)}`,
          {
            headers: CMCENUtils.authHeaders()
          }
        );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Page not found");
      }

      renderPage(data.page);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "admin-empty-state";
      message.textContent = error.message || "Could not load page.";
      pageRoot.replaceChildren(message);
    }
  }

  document.addEventListener("languagechange", loadPage);
  loadPage();
}());
