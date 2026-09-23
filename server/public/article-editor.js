"use strict";
window.ArticleEditor = (() => {
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
    node.addEventListener("click", action);
    return node;
  }
  function field(key, value, onChange, getText, type = "text") {
    const label = el("label", "admin-editor-field");
    const text = el("span");
    text.dataset.i18n = key;
    text.textContent = getText(key, key);
    const input = el("input", "cmcen-control");
    input.type = type;
    input.value = value || "";
    input.addEventListener("input", () => onChange(input.value));
    label.append(text, input);
    return label;
  }
  function readInline(root) {
    return [...root.childNodes].flatMap((node, index) => {
      if (node.nodeType === Node.TEXT_NODE) return [node.textContent];
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      if (node.tagName === "BR") return [{ type: "br" }];
      const children = readInline(node);
      const type = {
        B: "strong",
        STRONG: "strong",
        I: "em",
        EM: "em",
        A: "link",
      }[node.tagName];
      if (
        type === "link" &&
        !window.NewsletterRenderer.safeUrl(node.getAttribute("href"))
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
    window.NewsletterRenderer.inline(input, nodes);
    const changed = () => onChange(readInline(input));
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
      ["article_unlink", "unlink"],
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
    const link = button(
      "article_link",
      async () => {
        const selection = window.getSelection();
        const range =
          selection.rangeCount && input.contains(selection.anchorNode)
            ? selection.getRangeAt(0).cloneRange()
            : null;
        const href = await CMCENModal.prompt(
          getText("article_link_url", "Link URL"),
          { inputType: "url" },
        );
        if (!href || !input.isConnected) return;
        if (!window.NewsletterRenderer.safeUrl(href)) {
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
        if (!range || range.collapsed) {
          const anchor = el("a");
          anchor.href = href;
          anchor.textContent = href;
          if (range) range.insertNode(anchor);
          else input.append(anchor);
        } else document.execCommand("createLink", false, href);
        changed();
      },
      getText,
    );
    link.addEventListener("mousedown", (event) => event.preventDefault());
    tools.append(link);
    wrapper.append(tools, input);
    return wrapper;
  }

  function mediaControl({
    value,
    onChange,
    api,
    getText,
    canUpload = false,
    busy = () => {},
  }) {
    const root = el("div", "article-media-control");
    const preview = el("img", "article-image-preview");
    preview.alt = "";
    const status = el("p");
    status.setAttribute("role", "status");
    const setValue = (image) => {
      preview.hidden = !image?.url;
      if (image?.url) preview.src = image.url;
      else preview.removeAttribute("src");
    };
    setValue(value);
    const actions = el("div", "article-block-tools");
    const picker = el("div", "article-media-picker");
    picker.hidden = true;
    let nextCursor = "",
      requestId = 0;
    const search = el("input", "cmcen-control");
    search.type = "search";
    search.maxLength = 120;
    search.setAttribute(
      "aria-label",
      getText("article_media_search", "Find an image"),
    );
    const results = el("div", "article-media-grid");
    const more = button(
      "content_workspace_load_more",
      () => load(true),
      getText,
    );
    const choose = (asset) => {
      const image = {
        url: asset.url,
        alt: "",
        variants: asset.variants || {},
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      };
      setValue(image);
      onChange(image);
      picker.hidden = true;
    };
    async function load(append = false) {
      const id = ++requestId;
      picker.setAttribute("aria-busy", "true");
      status.textContent = getText("article_media_loading", "Loading images…");
      try {
        const query = new URLSearchParams({
          limit: "24",
          search: search.value,
          ...(append && nextCursor ? { cursor: nextCursor } : {}),
        });
        const data = await api(`/api/news/media?${query}`);
        if (id !== requestId || !root.isConnected) return;
        if (!append) results.replaceChildren();
        for (const asset of data.media) {
          const pick = el("button", "article-media-option");
          pick.type = "button";
          const img = el("img");
          img.src = asset.variants?.thumb?.url || asset.url;
          img.alt = "";
          img.loading = "lazy";
          const name = el("span");
          name.textContent =
            asset.displayName ||
            asset.inferredName ||
            asset.originalName ||
            asset.key;
          pick.append(img, name);
          pick.addEventListener("click", () => choose(asset));
          results.append(pick);
        }
        nextCursor = data.nextCursor;
        more.hidden = !nextCursor;
        status.textContent = results.childElementCount
          ? ""
          : getText("article_media_empty", "No images found.");
      } catch (error) {
        if (id === requestId) status.textContent = error.message;
      } finally {
        if (id === requestId) picker.setAttribute("aria-busy", "false");
      }
    }
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void load();
      }
    });
    picker.append(
      search,
      button("content_workspace_search", () => load(), getText),
      results,
      more,
    );
    actions.append(
      button(
        "article_choose_image",
        () => {
          picker.hidden = !picker.hidden;
          if (!picker.hidden) void load();
        },
        getText,
      ),
    );
    if (canUpload) {
      const upload = el("input");
      upload.type = "file";
      upload.accept = "image/*";
      upload.hidden = true;
      const uploadButton = button(
        "article_upload_image",
        () => upload.click(),
        getText,
      );
      upload.addEventListener("change", async () => {
        const file = upload.files?.[0];
        if (!file) return;
        uploadButton.disabled = true;
        busy(true);
        status.textContent = getText("article_uploading", "Uploading image…");
        try {
          const data = new FormData();
          data.append("image", file);
          data.append("uploadSource", "newsArticle");
          data.append("uploadContext", "newsletter");
          const result = await api("/api/upload", {
            method: "POST",
            body: data,
          });
          if (root.isConnected) {
            choose(result);
            status.textContent = "";
          }
        } catch (error) {
          status.textContent = error.message;
        } finally {
          busy(false);
          uploadButton.disabled = false;
          upload.value = "";
        }
      });
      actions.append(uploadButton, upload);
    }
    root.append(preview, actions, status, picker);
    return root;
  }

  function create({ value, getText, api, canUpload, busy, language }) {
    const root = el("div", "article-block-editor");
    const hidden = el("input");
    hidden.type = "hidden";
    hidden.name = "newsletterBlocks";
    let blocks = JSON.parse(value || "[]");
    hidden.value = JSON.stringify(blocks);
    const list = el("div", "article-block-list");
    const changed = () => {
      hidden.value = JSON.stringify(blocks);
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const redraw = (focusIndex) => {
      list.replaceChildren();
      blocks.forEach((block, index) => {
        const card = el("section", "article-block");
        card.dataset.blockType = block.type;
        const toolbar = el("div", "article-block-tools");
        const name = el("strong");
        name.dataset.i18n = `article_block_${block.type}`;
        name.textContent = getText(name.dataset.i18n, block.type);
        toolbar.append(name);
        for (const [key, delta] of [
          ["article_move_up", -1],
          ["article_move_down", 1],
        ]) {
          const move = button(
            key,
            () => {
              [blocks[index], blocks[index + delta]] = [
                blocks[index + delta],
                blocks[index],
              ];
              changed();
              redraw(index + delta);
            },
            getText,
          );
          move.disabled = index + delta < 0 || index + delta >= blocks.length;
          toolbar.append(move);
        }
        toolbar.append(
          button(
            "article_remove_block",
            () => {
              blocks.splice(index, 1);
              changed();
              redraw(Math.min(index, blocks.length - 1));
            },
            getText,
          ),
        );
        card.append(toolbar);
        if (block.type === "heading")
          card.append(
            field(
              "article_heading",
              block.text,
              (text) => {
                block.text = text;
                changed();
              },
              getText,
            ),
          );
        if (block.type === "paragraph")
          card.append(
            richText(
              block.children,
              (children) => {
                block.children = children;
                changed();
              },
              getText,
            ),
          );
        if (block.type === "list") {
          block.items.forEach((item, itemIndex) => {
            const row = el("div", "article-list-item");
            row.append(
              richText(
                item,
                (children) => {
                  block.items[itemIndex] = children;
                  changed();
                },
                getText,
              ),
              button(
                "article_remove_item",
                () => {
                  block.items.splice(itemIndex, 1);
                  changed();
                  redraw(index);
                },
                getText,
              ),
            );
            card.append(row);
          });
          card.append(
            button(
              "article_add_item",
              () => {
                block.items.push([""]);
                changed();
                redraw(index);
              },
              getText,
            ),
          );
        }
        if (block.type === "figure") {
          card.append(
            mediaControl({
              value: block.image,
              onChange: (image) => {
                block.image = { ...image, alt: block.image.alt || image.alt };
                changed();
              },
              api,
              getText,
              canUpload,
              busy,
            }),
            field(
              "article_alt",
              block.image.alt,
              (value) => {
                block.image.alt = value;
                changed();
              },
              getText,
            ),
            field(
              "article_caption",
              block.caption,
              (value) => {
                block.caption = value;
                changed();
              },
              getText,
            ),
          );
        }
        if (block.type === "document") {
          card.append(
            field(
              "article_document_label",
              block.label,
              (value) => {
                block.label = value;
                changed();
              },
              getText,
            ),
            field(
              "article_link_url",
              block.href,
              (value) => {
                block.href = value;
                changed();
              },
              getText,
              "url",
            ),
          );
          const select = el("select", "cmcen-control");
          select.hidden = true;
          select.setAttribute(
            "aria-label",
            getText("article_choose_document", "Choose a library document"),
          );
          const status = el("p");
          status.setAttribute("role", "status");
          card.append(
            button(
              "article_choose_document",
              async () => {
                try {
                  const response = await fetch(
                    "/page-content/document-library.json",
                  );
                  if (!response.ok)
                    throw new Error(
                      getText(
                        "article_documents_error",
                        "Could not load documents.",
                      ),
                    );
                  const data = await response.json();
                  if (!card.isConnected) return;
                  select.replaceChildren(
                    new Option(
                      getText(
                        "article_choose_document",
                        "Choose a library document",
                      ),
                      "",
                    ),
                  );
                  for (const document of data.documents)
                    if (document.fileUrl)
                      select.append(
                        new Option(
                          document[language]?.title ||
                            document.en?.title ||
                            document.id,
                          document.fileUrl,
                        ),
                      );
                  select.hidden = false;
                  select.focus();
                } catch (error) {
                  status.textContent = error.message;
                }
              },
              getText,
            ),
            select,
            status,
          );
          select.addEventListener("change", () => {
            if (!select.value) return;
            block.href = select.value;
            block.label = select.selectedOptions[0].textContent;
            changed();
            redraw(index);
          });
        }
        list.append(card);
      });
      if (Number.isInteger(focusIndex))
        list.children[focusIndex]
          ?.querySelector(
            "input:not([type=hidden]), [contenteditable=true], button",
          )
          ?.focus();
    };
    const add = el("div", "article-block-tools");
    const type = el("select", "cmcen-control");
    type.setAttribute(
      "aria-label",
      getText("article_block_type", "Block type"),
    );
    for (const key of ["paragraph", "heading", "figure", "list", "document"]) {
      const option = new Option(getText(`article_block_${key}`, key), key);
      option.dataset.i18n = `article_block_${key}`;
      type.append(option);
    }
    add.append(
      type,
      button(
        "article_add_block",
        () => {
          const empty = {
            paragraph: { children: [""] },
            heading: { text: "" },
            figure: { image: { url: "", alt: "" }, caption: "" },
            list: { items: [[""]] },
            document: { label: "", href: "" },
          };
          blocks.push({ type: type.value, ...empty[type.value] });
          changed();
          redraw(blocks.length - 1);
        },
        getText,
      ),
    );
    root.append(hidden, list, add);
    redraw();
    return root;
  }
  return { create, mediaControl, readInline };
})();
