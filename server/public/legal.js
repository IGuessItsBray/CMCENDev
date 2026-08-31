(function () {
  const legalDocument = document.getElementById("legalDocument");
  const documentName =
    window.location.pathname === "/terms" ? "terms" : "privacy";
  let renderVersion = 0;

  function getLanguage() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function getInterfaceText(key, fallback) {
    const translated = window.translate?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
  }

  function getHeadingId(text, usedHeadingIds) {
    const normalized = slugify(text);
    const preferredId =
      documentName === "privacy" && normalized.includes("contact")
        ? "contact"
        : normalized || "section";
    let headingId = preferredId;
    let suffix = 2;

    while (usedHeadingIds.has(headingId)) {
      headingId = `${preferredId}-${suffix}`;
      suffix += 1;
    }

    usedHeadingIds.add(headingId);
    return headingId;
  }

  function getLinkUrl(value) {
    const url = String(value || "").trim();

    if (/^\.?\/?PRIVACY_POLICY(?:_DRAFT)?\.md$/iu.test(url)) {
      return "/privacy";
    }

    if (/^(?:mailto:|https?:\/\/|\/|#)/iu.test(url)) {
      return url;
    }

    return "";
  }

  function appendInlineContent(container, source) {
    const text = String(source || "");
    const tokenPattern =
      /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|<br\s*\/?>/giu;
    let cursor = 0;

    for (const match of text.matchAll(tokenPattern)) {
      if (match.index > cursor) {
        container.append(document.createTextNode(text.slice(cursor, match.index)));
      }

      if (match[1]) {
        const href = getLinkUrl(match[2]);

        if (!href) {
          container.append(document.createTextNode(match[1]));
        } else {
          const link = document.createElement("a");
          link.href = href;
          link.textContent = match[1];

          if (/^https?:\/\//iu.test(href)) {
            link.target = "_blank";
            link.rel = "noreferrer noopener";
          }

          container.append(link);
        }
      } else if (match[3] || match[4]) {
        const strong = document.createElement("strong");
        strong.textContent = match[3] || match[4];
        container.append(strong);
      } else if (match[5] || match[6]) {
        const emphasis = document.createElement("em");
        emphasis.textContent = match[5] || match[6];
        container.append(emphasis);
      } else if (match[7]) {
        const code = document.createElement("code");
        code.textContent = match[7];
        container.append(code);
      } else {
        container.append(document.createElement("br"));
      }

      cursor = match.index + match[0].length;
    }

    if (cursor < text.length) {
      container.append(document.createTextNode(text.slice(cursor)));
    }
  }

  function appendParagraphLines(element, lines) {
    lines.forEach((line, index) => {
      const hardBreak = /(?:\\|<br\s*\/?>)\s*$/iu.test(line);
      const text = hardBreak
        ? line.replace(/(?:\\|<br\s*\/?>)\s*$/iu, "")
        : line;

      appendInlineContent(element, text);

      if (hardBreak && index < lines.length - 1) {
        element.append(document.createElement("br"));
      } else if (!hardBreak && index < lines.length - 1) {
        element.append(document.createTextNode(" "));
      }
    });
  }

  function getTableCells(line) {
    return line
      .trim()
      .replace(/^\||\|$/gu, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(
      line,
    );
  }

  function isListItem(line) {
    return /^\s*(?:[-*+] |\d+[.)] )/u.test(line);
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || "";

    return (
      !line.trim() ||
      /^#{1,3}\s+/u.test(line) ||
      /^>\s?/u.test(line) ||
      /^(?:---|\*\*\*)\s*$/u.test(line) ||
      isListItem(line) ||
      (line.includes("|") && isTableDivider(lines[index + 1] || ""))
    );
  }

  function renderMarkdown(markdown) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown || "")
      .replace(/\r\n?/gu, "\n")
      .split("\n");
    const usedHeadingIds = new Set();
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/u);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const heading = document.createElement(`h${level}`);
        const headingText = headingMatch[2].trim();
        heading.id = getHeadingId(headingText, usedHeadingIds);
        appendInlineContent(heading, headingText);
        fragment.append(heading);
        index += 1;
        continue;
      }

      if (/^(?:---|\*\*\*)\s*$/u.test(line)) {
        fragment.append(document.createElement("hr"));
        index += 1;
        continue;
      }

      if (/^>\s?/u.test(line)) {
        const quoteLines = [];
        while (index < lines.length && /^>\s?/u.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^>\s?/u, ""));
          index += 1;
        }
        const quote = document.createElement("blockquote");
        const paragraph = document.createElement("p");
        appendParagraphLines(paragraph, quoteLines);
        quote.append(paragraph);
        fragment.append(quote);
        continue;
      }

      if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
        const wrapper = document.createElement("div");
        wrapper.className = "legal-document-table-wrap";
        const table = document.createElement("table");
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");

        getTableCells(line).forEach((cell) => {
          const header = document.createElement("th");
          header.scope = "col";
          appendInlineContent(header, cell);
          headerRow.append(header);
        });

        head.append(headerRow);
        table.append(head);
        index += 2;
        const body = document.createElement("tbody");

        while (index < lines.length && lines[index].includes("|")) {
          const row = document.createElement("tr");
          getTableCells(lines[index]).forEach((cell) => {
            const tableCell = document.createElement("td");
            appendInlineContent(tableCell, cell);
            row.append(tableCell);
          });
          body.append(row);
          index += 1;
        }

        table.append(body);
        wrapper.append(table);
        fragment.append(wrapper);
        continue;
      }

      if (isListItem(line)) {
        const ordered = /^\s*\d+[.)] /u.test(line);
        const list = document.createElement(ordered ? "ol" : "ul");
        const firstItemMatch = line.match(/^\s*(\d+)[.)] /u);
        if (ordered && firstItemMatch && Number(firstItemMatch[1]) !== 1) {
          list.start = Number(firstItemMatch[1]);
        }

        while (
          index < lines.length &&
          isListItem(lines[index]) === true &&
          /^\s*\d+[.)] /u.test(lines[index]) === ordered
        ) {
          const item = document.createElement("li");
          const itemText = lines[index].replace(
            /^\s*(?:[-*+] |\d+[.)] )/u,
            "",
          );
          appendInlineContent(item, itemText);
          list.append(item);
          index += 1;
        }

        fragment.append(list);
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length && !isBlockStart(lines, index)) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }

      const paragraph = document.createElement("p");
      appendParagraphLines(paragraph, paragraphLines);
      fragment.append(paragraph);
    }

    return fragment;
  }

  function showStatus(text, isError = false) {
    const status = document.createElement("div");
    status.className = `dashboard-status${isError ? " is-error" : " is-loading"}`;
    status.setAttribute("role", "status");

    if (!isError) {
      const spinner = document.createElement("span");
      spinner.className = "loading-state-spinner";
      spinner.setAttribute("aria-hidden", "true");
      status.append(spinner);
    }

    status.append(document.createTextNode(text));
    legalDocument.replaceChildren(status);
  }

  function scrollToFragment() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;

    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
  }

  async function loadDocument(language = getLanguage()) {
    const currentRender = ++renderVersion;
    showStatus(getInterfaceText("legal_document_loading", "Loading document…"));

    try {
      const response = await fetch(`/legal/${documentName}.${language}.md`);
      if (!response.ok) {
        throw new Error(`Could not load legal document: ${response.status}`);
      }

      const markdown = await response.text();
      if (currentRender !== renderVersion) return;

      legalDocument.replaceChildren(renderMarkdown(markdown));
      const title = legalDocument.querySelector("h1")?.textContent.trim();
      if (title) {
        document.title = `${title} | CMCEN / RCMCE`;
      }
      scrollToFragment();
    } catch (error) {
      if (currentRender !== renderVersion) return;
      console.error(error);
      showStatus(
        getInterfaceText(
          "legal_document_unavailable",
          "This document is currently unavailable. Please try again later.",
        ),
        true,
      );
    }
  }

  document.addEventListener("languagechange", (event) => {
    loadDocument(event.detail?.language || getLanguage());
  });
  window.addEventListener("hashchange", scrollToFragment);

  loadDocument();
})();
