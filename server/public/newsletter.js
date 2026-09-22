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
  const root = document.getElementById("newsletterArticle");
  if (!root) return;
  let issue;
  const labels = {
    en: {
      archive:
        "From the newsletter archive. Dates and information reflect the original issue.",
      fallback: "This issue is available in English.",
      library: "Document library",
      source: "Original publication",
      error: "This newsletter could not be loaded.",
      retry: "Try again",
    },
    fr: {
      archive:
        "Archives des bulletins. Les dates et les renseignements correspondent au numéro original.",
      fallback: "Ce numéro est disponible en anglais.",
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
    img.width = data.width;
    img.height = data.height;
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
    metadata.append(time, document.createTextNode(` · ${issue.author}`));
    copy.append(metadata);
    header.append(copy);
    const crest = image(issue.images.crest);
    if (crest) {
      crest.className = "newsletter-crest";
      crest.sizes = "104px";
      header.append(crest);
    }
    const body = element("div", "", "about-family-body newsletter-body");
    body.append(
      element(
        "p",
        `${ui.archive}${language !== issue.language ? ` ${ui.fallback}` : ""}`,
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
        const img = image(issue.images[block.image]);
        if (img) el.append(img);
        el.append(element("figcaption", block.caption));
      }
      if (el) content.append(el);
    }
    const footer = element("footer", "", "newsletter-footer");
    for (const [text, url] of [
      [ui.library, "/document-library"],
      [ui.source, issue.sourceUrl],
    ]) {
      const link = element("a", text);
      link.href = safeUrl(url);
      footer.append(link);
    }
    body.append(content, footer);
    root.append(header, body);
    root.setAttribute("aria-busy", "false");
  }
  async function load() {
    try {
      const slug =
        new URLSearchParams(location.search).get("issue") || "fall-2025";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))
        throw new Error("Invalid issue");
      const response = await fetch(`/page-content/newsletters/${slug}.json`);
      if (!response.ok) throw new Error("Unavailable issue");
      issue = await response.json();
      render();
    } catch {
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
  document.addEventListener("languagechange", render);
  load();
})();
