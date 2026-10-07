"use strict";
window.MessageEditor = (() => {
  const el = (tag, className = "") => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };
  function button(key, action, getText) {
    const node = el("button", "admin-work-zone-button is-secondary is-compact");
    node.type = "button";
    node.dataset.i18n = key;
    node.textContent = getText(key, key);
    const symbols = {
      article_bold: "B",
      article_italic: "I",
      article_link: "🔗",
      body_underline: "U",
    };
    if (symbols[key]) {
      delete node.dataset.i18n;
      node.dataset.i18nAriaLabel = key;
      node.setAttribute("aria-label", getText(key, key));
      node.title = getText(key, key);
      const icon = el(
        key === "article_bold"
          ? "strong"
          : key === "article_italic"
            ? "em"
            : key === "body_underline" ? "u" : "span",
      );
      icon.textContent = symbols[key];
      icon.setAttribute("aria-hidden", "true");
      node.replaceChildren(icon);
    }
    node.addEventListener("click", action);
    return node;
  }
  function readInline(root) {
    return [...root.childNodes].flatMap((node, index) => {
      if (node.nodeType === Node.TEXT_NODE) return [node.textContent];
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      if (node.tagName === "BR") return [{ type: "br" }];
      let children = readInline(node);
      let type = {
        B: "strong",
        STRONG: "strong",
        I: "em",
        EM: "em",
        A: "link",
      }[node.tagName];
      const underlined = (node.tagName === "U" || node.style.textDecoration?.includes("underline"));
      if (underlined) children = [{ type: "underline", children }];
      if (
        type === "link" &&
        !window.BodyContent.safeUrl(node.getAttribute("href"))
      )
        return children;
      if (type)
        return [
          {
            type,
            ...(type === "link" ? { href: node.getAttribute("href") } : {}),
            children,
          },
        ];
      return [
        ...(index && ["DIV", "P"].includes(node.tagName)
          ? [{ type: "br" }]
          : []),
        ...children,
      ];
    });
  }
  function richText(nodes, onChange, getText) {
    const wrapper = el("div", "article-rich-text");
    const tools = el("div", "article-block-tools");
    const input = el("div", "cmcen-control article-rich-input");
    const toggles = [];
    const updatePressed = () => {
      for (const { control, command } of toggles) {
        if (typeof document.queryCommandState === 'function') control.setAttribute('aria-pressed', String(Boolean(document.queryCommandState(command))));
      }
    };
    input.contentEditable = "true";
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-multiline", "true");
    input.setAttribute("aria-label", getText("article_text", "Text"));
    window.BodyContent.inline(input, nodes);
    input.addEventListener("click", (event) => {
      if (event.target.closest?.("a")) event.preventDefault();
    });
    const changed = () => {
      canonicalizeBodyInline(input);
      onChange(readInline(input));
      updatePressed();
    };
    input.addEventListener("input", changed);
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      document.execCommand(
        "insertText",
        false,
        event.clipboardData.getData("text/plain"),
      );
      changed();
    });
    input.addEventListener("drop", (event) => event.preventDefault());
    for (const event of ['keyup', 'mouseup', 'focus']) input.addEventListener(event, updatePressed);
    input.addEventListener('blur', () => {
      for (const { control } of toggles) control.setAttribute('aria-pressed', 'false');
    });
    for (const [key, command] of [
      ["article_bold", "bold"],
      ["article_italic", "italic"],
      ["body_underline", "underline"],
    ]) {
      const control = button(
        key,
        () => {
          input.focus();
          document.execCommand(command);
          changed();
          if (typeof document.queryCommandState !== 'function') control.setAttribute('aria-pressed', String(control.getAttribute('aria-pressed') !== 'true'));
        },
        getText,
      );
      control.addEventListener("mousedown", (event) => event.preventDefault());
      control.setAttribute('aria-pressed', 'false');
      toggles.push({ control, command });
      tools.append(control);
    }
    const link = button(
      "article_link",
      async () => {
        const selection = window.getSelection();
        const range =
          selection.rangeCount && input.contains(selection.anchorNode)
            ? selection.getRangeAt(0).cloneRange()
            : null;
        const values = await CMCENModal.form(
          getText("article_link_url", "Link URL"),
          {
            fields: [
              {
                name: "href",
                type: "text",
                label: getText("article_link_url", "Link URL"),
                required: true,
              },
              {
                name: "text",
                type: "text",
                label: getText("article_link_text", "Display text (optional)"),
                defaultValue: range?.toString() || "",
              },
            ],
          },
        );
        if (!input.isConnected) return;
        input.focus();
        if (range) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (!values) return;
        const href = values.href.trim();
        if (!href) return;
        if (!window.BodyContent.safeUrl(href)) {
          CMCENUtils.showToast(
            getText("article_invalid_url", "Enter a valid web or email link."),
            { color: "error" },
          );
          return;
        }
        const anchor = el("a");
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = values.text.trim() || href;
        const insertion = range || document.createRange();
        if (!range) {
          insertion.selectNodeContents(input);
          insertion.collapse(false);
        }
        insertion.deleteContents();
        insertion.insertNode(anchor);
        insertion.setStartAfter(anchor);
        insertion.collapse(true);
        selection.removeAllRanges();
        selection.addRange(insertion);
        changed();
      },
      getText,
    );
    link.addEventListener("mousedown", (event) => event.preventDefault());
    tools.append(link);
    wrapper.append(tools, input);
    return wrapper;
  }

  function canonicalizeBodyInline(root) {
    const hasLabel = (node) => [...node.childNodes].some((child) =>
      child.nodeType === Node.TEXT_NODE ? child.textContent.length > 0 : child.tagName === 'BR' || hasLabel(child));
    for (const node of [...root.childNodes]) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.tagName === 'A' && !hasLabel(node)) {
        node.remove();
        continue;
      }
      node.removeAttribute("color");
      node.style.color = "";
      for (const name of window.BodyContent.colors) node.classList.remove(`body-color-${name}`);
      if (node.tagName === "A" && window.BodyContent.safeUrl(node.getAttribute("href"))) {
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      }
      canonicalizeBodyInline(node);
    }
  }
  function readMessage(input, noticeType) {
    const fixedAlign = window.BodyContent.noticeStyle(noticeType)?.align;
    const paragraphs = []; let loose = [];
    const flush = () => { if (loose.length) paragraphs.push({ type: 'paragraph', children: loose, ...(fixedAlign ? { align: fixedAlign } : {}) }); loose = []; };
    for (const node of input.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(node.tagName)) {
        flush(); const align = fixedAlign || node.style.textAlign || ['left', 'center', 'right'].find((v) => node.classList.contains(`body-align-${v}`));
        paragraphs.push({ type: 'paragraph', children: readInline(node), ...(align ? { align } : {}) });
      } else loose.push(...readInline({ childNodes: [node] }));
    }
    flush(); return window.BodyContent.normalizeBlocks(paragraphs);
  }
  function create({ blocks, onChange, getText, noticeType }) {
    let input;
    const wrapper = richText([], () => onChange(readMessage(input, noticeType)), getText);
    input = wrapper.children[1];
    const text = window.BodyContent.plainText(blocks);
    window.BodyContent.render(input, { formattedBody: { en: { version: 1, text, blocks } } }, 'en', text, () => {}, noticeType);
    input.style.textAlign = 'left';
    for (const paragraph of input.children) paragraph.style.textAlign = 'left';
    return wrapper;
  }
  return { create, readMessage, readInline, canonicalizeBodyInline };
})();
