(function () {
  function safeUrl(value) {
    if (typeof value !== "string" || /[\\\u0000-\u0020]/u.test(value))
      return "";
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try {
      const url = new URL(value);
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? value : "";
    } catch {
      return "";
    }
  }

  function inline(parent, nodes, doc = document) {
    for (const node of nodes || []) {
      if (typeof node === "string") {
        parent.append(doc.createTextNode(node));
        continue;
      }
      if (node.type === "br") {
        parent.append(doc.createElement("br"));
        continue;
      }
      const tag = { strong: "strong", em: "em", link: "a" }[node.type];
      if (!tag) continue;
      const element = doc.createElement(tag);
      if (tag === "a") {
        const href = safeUrl(node.href);
        if (!href) {
          inline(parent, node.children, doc);
          continue;
        }
        element.href = href;
      }
      inline(element, node.children, doc);
      parent.append(element);
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { safeUrl, inline };
    return;
  }
  window.NewsletterRenderer = { safeUrl, inline };
  const root = document.getElementById("newsletterArticle");
  if (!root) return;
  let issue;
  const labels = {
    en: {
      archive:
        "From the newsletter archive. Dates and information reflect the original issue.",
      fallback: {
        en: "This issue is available in English.",
        fr: "This issue is available in French.",
      },
      library: "Document library",
      source: "Original publication",
      error: "This newsletter could not be loaded.",
      retry: "Try again",
    },
    fr: {
      archive:
        "Archives des bulletins. Les dates et les renseignements correspondent au numéro original.",
      fallback: {
        en: "Ce numéro est disponible en anglais.",
        fr: "Ce numéro est disponible en français.",
      },
      library: "Bibliothèque de documents",
      source: "Publication originale",
      error: "Ce bulletin n’a pas pu être chargé.",
      retry: "Réessayer",
    },
  };
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function image(data) {
    if (!data || !safeUrl(data.url) || !data.url.startsWith("https://"))
      return null;
    const img = element("img");
    img.src = data.url;
    img.alt = data.alt || "";
    if (data.width) img.width = data.width;
    if (data.height) img.height = data.height;
    img.loading = "lazy";
    img.decoding = "async";
    const variants = Object.values(data.variants || {}).filter(
      (v) => safeUrl(v.url) && v.url.startsWith("https://") && v.width > 0,
    );
    const unique = [...new Map(variants.map((v) => [v.width, v])).values()];
    img.srcset = unique.map((v) => `${v.url} ${v.width}w`).join(", ");
    img.sizes = "(max-width: 780px) 90vw, 700px";
    return img;
  }
  function render() {
    if (!issue) return;
    const language = document.documentElement.lang === "fr" ? "fr" : "en";
    const ui = labels[language];
    root.replaceChildren();
    document.title = `${issue.title} | CMCEN / RCMCE`;
    const header = element("header", "", "about-family-hero leadership-hero");
    const copy = element("div", "", "about-family-hero-copy");
    copy.lang = issue.language;
    copy.append(
      element("p", issue.kicker, "about-family-kicker"),
      element("h1", issue.title),
      element("p", issue.issue, "about-family-intro"),
    );
    const metadata = element("p", "", "newsletter-meta");
    const time = element(
      "time",
      new Intl.DateTimeFormat(issue.language, {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${issue.publishedAt}T12:00:00Z`)),
    );
    time.dateTime = issue.publishedAt;
    metadata.append(time);
    if (issue.author)
      metadata.append(document.createTextNode(` · ${issue.author}`));
    copy.append(metadata);
    header.append(copy);
    const crest = image(issue.crest);
    if (crest) {
      crest.className = "newsletter-crest";
      crest.sizes = "(max-width: 600px) 120px, 160px";
      header.append(crest);
    }
    const body = element("div", "", "about-family-body newsletter-body");
    if (issue.archived || language !== issue.language)
      body.append(
        element(
          "p",
          [
            issue.archived ? ui.archive : "",
            language !== issue.language ? ui.fallback[issue.language] : "",
          ]
            .filter(Boolean)
            .join(" "),
          "newsletter-context",
        ),
      );
    const content = element("div");
    content.lang = issue.language;
    for (const block of issue.blocks) {
      let el;
      if (block.type === "heading") el = element("h2", block.text);
      else if (block.type === "paragraph") {
        el = element("p");
        inline(el, block.children);
      } else if (block.type === "list") {
        el = element("ul");
        for (const item of block.items) {
          const li = element("li");
          inline(li, item);
          el.append(li);
        }
      } else if (block.type === "figure") {
        el = element("figure");
        const img = image(block.image);
        if (img) el.append(img);
        if (block.caption) el.append(element("figcaption", block.caption));
      } else if (block.type === "document") {
        el = element("p");
        inline(el, [
          { type: "link", href: block.href, children: [block.label] },
        ]);
      }
      if (el) content.append(el);
    }
    const footer = element("footer", "", "newsletter-footer");
    if (issue.preview) {
      const notice = element(
        "p",
        language === "fr"
          ? "Aperçu réservé au personnel."
          : "Staff preview — this is not the public article.",
      );
      body.prepend(notice);
      const edit = element(
        "a",
        language === "fr" ? "Modifier l’article" : "Edit article",
      );
      edit.href = `/dashboard-next?area=articles&id=${encodeURIComponent(issue._id)}`;
      footer.append(edit);
    }
    for (const [text, url] of [
      [ui.library, "/document-library"],
      ...(issue.sourceUrl ? [[ui.source, issue.sourceUrl]] : []),
    ]) {
      const link = element("a", text);
      link.href = safeUrl(url);
      footer.append(link);
    }
    body.append(content, footer);
    root.append(header, body);
    root.setAttribute("aria-busy", "false");
  }
  let requestId = 0;
  async function load() {
    const currentRequest = ++requestId;
    try {
      const id = new URLSearchParams(location.search).get("id");
      if (!/^[a-f0-9]{24}$/i.test(id || "")) throw new Error("Invalid article");
      const preview =
        new URLSearchParams(location.search).get("preview") === "1";
      const { article } = await CMCENUtils.apiJson(
        `/api/news/${id}${preview ? "/preview" : ""}`,
        preview ? { token: CMCENUtils.getStoredAuthToken() } : {},
      );
      if (currentRequest !== requestId) return;
      if (article.layout !== "newsletter") throw new Error("Not a newsletter");
      const metadata = article.newsletter || {};
      const requested = document.documentElement.lang === "fr" ? "fr" : "en";
      const language = article.newsletterBlocks?.[requested]?.length
        ? requested
        : metadata.language;
      issue = {
        ...metadata,
        blocks: article.newsletterBlocks?.[language] || [],
        title: article.title[language] || article.title[metadata.language],
        language,
        publishedAt:
          metadata.date ||
          (article.publishedAt || article.createdAt).slice(0, 10),
      };
      if (metadata.headerCrest)
        issue.crest = { url: article.imageUrl, alt: issue.title };
      issue._id = article._id;
      issue.preview = preview;
      render();
    } catch {
      if (currentRequest !== requestId) return;
      const ui = labels[document.documentElement.lang === "fr" ? "fr" : "en"];
      const message = element("p", ui.error, "newsletter-status");
      message.setAttribute("role", "alert");
      const retry = element("button", ui.retry);
      retry.type = "button";
      retry.addEventListener("click", load);
      message.append(document.createTextNode(" "), retry);
      root.replaceChildren(message);
      root.setAttribute("aria-busy", "false");
    }
  }
  document.addEventListener("languagechange", load);
  load();
})();
