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
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        const element = document.createElement("p");
        element.textContent = paragraph;
        return element;
      });
  }

  function getCrop(value) {
    return {
      x: 50,
      y: 50,
      zoom: 1,
      rotate: 0,
      ...(value || {}),
    };
  }

  function applyCrop(image, cropValue) {
    const crop = getCrop(cropValue);
    image.style.objectPosition = `${crop.x}% ${crop.y}%`;
    image.style.transform = `scale(${crop.zoom}) rotate(${crop.rotate}deg)`;
  }

  function getImageVariants(media = {}) {
    const variants = media.mediaVariants || {};
    return ["thumb", "medium", "large", "hero"]
      .map((name) => variants[name])
      .filter((variant) => variant?.url && variant?.width);
  }

  function getBestImageUrl(media = {}) {
    const variants = getImageVariants(media);
    return (
      variants.find((variant) => variant.width >= 900)?.url ||
      variants.at(-1)?.url ||
      media.mediaUrl ||
      ""
    );
  }

  function getImageSrcSet(media = {}) {
    return getImageVariants(media)
      .map((variant) => `${variant.url} ${variant.width}w`)
      .join(", ");
  }

  function createCroppedImage({
    media,
    alt,
    crop,
    sizes = "(max-width: 720px) 100vw, 900px",
  }) {
    const frame = document.createElement("span");
    frame.className = "cms-image-frame";
    const image = document.createElement("img");
    const srcSet = getImageSrcSet(media);
    image.src = getBestImageUrl(media);
    if (srcSet) {
      image.srcset = srcSet;
      image.sizes = sizes;
    }
    image.alt = alt || "";
    image.loading = "lazy";
    applyCrop(image, crop);
    frame.append(image);
    return frame;
  }

  function createBlock(block) {
    const section = document.createElement("section");
    section.className = `cms-block cms-block-${block.type || "text"}`;
    section.style.setProperty(
      "--cms-block-span",
      String(Math.min(Math.max(Number(block.layout?.span) || 12, 1), 12)),
    );
    if (Number.isFinite(Number(block.layout?.column)) && Number.isFinite(Number(block.layout?.row))) {
      section.style.setProperty("--cms-block-column", String(block.layout.column));
      section.style.setProperty("--cms-block-row", String(block.layout.row));
      section.style.setProperty("--cms-block-row-span", String(Math.max(Number(block.layout?.rowSpan) || 1, 1)));
    }

    if (block.type === "heading") {
      const heading = document.createElement(block.level === 3 ? "h3" : "h2");
      heading.textContent = localized(block.text);
      section.append(heading);
      return section;
    }

    if (block.type === "image") {
      section.append(
        createCroppedImage({
          media: block,
          alt: localized(block.alt),
          crop: block.crop,
          sizes: "(max-width: 920px) 100vw, 1100px",
        }),
      );

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
      createParagraphs(localized(block.body)).forEach((paragraph) => {
        section.append(paragraph);
      });
      return section;
    }

    if (block.type === "columns") {
      const grid = document.createElement("div");
      grid.className = "cms-columns";

      (block.columns || []).forEach((column) => {
        const card = document.createElement("article");
        card.className = "cms-column";

        if (column.mediaUrl) {
          card.append(
            createCroppedImage({
              media: column,
              alt: localized(column.alt),
              crop: column.crop,
              sizes: "(max-width: 620px) 100vw, 50vw",
            }),
          );
        }

        const title = localized(column.title);
        if (title) {
          const heading = document.createElement("h3");
          heading.textContent = title;
          card.append(heading);
        }

        createParagraphs(localized(column.body)).forEach((paragraph) => {
          card.append(paragraph);
        });

        grid.append(card);
      });

      section.append(grid);
      return section;
    }

    if (block.type === "carousel") {
      const title = localized(block.text);

      if (title) {
        const heading = document.createElement("h2");
        heading.textContent = title;
        section.append(heading);
      }

      const carousel = document.createElement("div");
      carousel.className = "cms-carousel";

      (block.items || []).forEach((item) => {
        const slide = document.createElement("figure");
        slide.className = "cms-carousel-slide";

        if (item.mediaUrl) {
          slide.append(
            createCroppedImage({
              media: item,
              alt: localized(item.alt),
              crop: item.crop,
              sizes: "(max-width: 620px) 88vw, 78vw",
            }),
          );
        }

        const caption = localized(item.caption);
        if (caption) {
          const captionElement = document.createElement("figcaption");
          captionElement.textContent = caption;
          slide.append(captionElement);
        }

        carousel.append(slide);
      });

      section.append(carousel);
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

    createParagraphs(localized(block.body)).forEach((paragraph) => {
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

    (page.blocks || []).forEach((block) => {
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
              headers: CMCENUtils.authHeaders(),
            },
          )
        : await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
            headers: CMCENUtils.authHeaders(),
          });
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
})();
