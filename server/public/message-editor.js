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
      article_move_up: "↑",
      article_move_down: "↓",
      article_remove_block: "−",
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
            : "span",
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
      const colorMap = { "#a52323": "red", "rgb(165, 35, 35)": "red", "#174b9b": "blue", "rgb(23, 75, 155)": "blue", "#21663b": "green", "rgb(33, 102, 59)": "green" };
      const color = (colorMap[node.getAttribute("color")] || colorMap[node.style.color] || window.BodyContent.colors.find((value) => value !== "default" && node.classList.contains(`body-color-${value}`)));
      if (color) children = [{ type: "color", color, children }];
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
    input.contentEditable = "true";
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-multiline", "true");
    input.setAttribute("aria-label", getText("article_text", "Text"));
    window.BodyContent.inline(input, nodes);
    input.querySelectorAll("a").forEach((anchor) => {
      anchor.contentEditable = "false";
    });
    const changed = () => {
      canonicalizeBodyInline(input);
      onChange(readInline(input));
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
    for (const [key, command] of [
      ["article_bold", "bold"],
      ["article_italic", "italic"],
      ["body_underline", "underline"],
      ["body_align_left", "justifyLeft"],
      ["body_align_center", "justifyCenter"],
      ["body_align_right", "justifyRight"],
    ]) {
      const control = button(
        key,
        () => {
          input.focus();
          document.execCommand(command);
          changed();
        },
        getText,
      );
      control.addEventListener("mousedown", (event) => event.preventDefault());
      tools.append(control);
    }
    {
      for (const [color, value] of [["red", "#a52323"], ["blue", "#174b9b"], ["green", "#21663b"]]) {
        const control = button(`body_color_${color}`, () => {
          input.focus(); document.execCommand("foreColor", false, value); changed();
        }, getText);
        control.addEventListener("mousedown", (event) => event.preventDefault());
        tools.append(control);
      }
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
        if (!values || !input.isConnected) return;
        const href = values.href.trim();
        if (!href) return;
        if (!window.BodyContent.safeUrl(href)) {
          CMCENUtils.showToast(
            getText("article_invalid_url", "Enter a valid web or email link."),
            { color: "error" },
          );
          return;
        }
        input.focus();
        if (range) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        const anchor = el("a");
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = values.text.trim() || href;
        anchor.contentEditable = "false";
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
    const colors = { "#a52323": "red", "rgb(165, 35, 35)": "red", "#174b9b": "blue", "rgb(23, 75, 155)": "blue", "#21663b": "green", "rgb(33, 102, 59)": "green" };
    for (const node of root.childNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const color = colors[node.getAttribute("color")] || colors[node.style.color];
      if (color) {
        node.removeAttribute("color");
        node.style.color = "";
        for (const name of window.BodyContent.colors) node.classList.remove(`body-color-${name}`);
        node.classList.add(`body-color-${color}`);
      }
      if (node.tagName === "A" && window.BodyContent.safeUrl(node.getAttribute("href"))) {
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      }
      canonicalizeBodyInline(node);
    }
  }
  function readMessage(input) {
    const paragraphs = []; let loose = [];
    const flush = () => { if (loose.length) paragraphs.push({ type: 'paragraph', children: loose }); loose = []; };
    for (const node of input.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(node.tagName)) {
        flush(); const align = node.style.textAlign || ['left', 'center', 'right'].find((v) => node.classList.contains(`body-align-${v}`));
        paragraphs.push({ type: 'paragraph', children: readInline(node), ...(align ? { align } : {}) });
      } else loose.push(...readInline({ childNodes: [node] }));
    }
    flush(); return window.BodyContent.normalizeBlocks(paragraphs);
  }
  function create({ blocks, onChange, getText }) {
    let input;
    const wrapper = richText([], () => onChange(readMessage(input)), getText);
    input = wrapper.children[1];
    const text = window.BodyContent.plainText(blocks);
    window.BodyContent.render(input, { formattedBody: { en: { version: 1, text, blocks } } }, 'en', text, () => {});
    input.querySelectorAll('a').forEach((anchor) => { anchor.contentEditable = 'false'; });
    return wrapper;
  }
  return { create, readMessage, readInline, canonicalizeBodyInline };
})();
