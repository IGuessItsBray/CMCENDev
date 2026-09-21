"use strict";

(() => {
  const t = (key, values) => window.translate(key, values);
  function node(tag, key, className) {
    const el = document.createElement(tag);
    if (key) {
      el.dataset.i18n = key;
      el.textContent = t(key);
    }
    if (className) el.className = className;
    return el;
  }
  function safeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.origin);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function mount({ api, permissions, onDenied }) {
    const root = document.getElementById("adminMediaBody");
    const lifecycle = new AbortController();
    let disposed = false,
      loading = false,
      busy = false,
      confirming = false;
    let request,
      generation = 0,
      debounce,
      cursor = "",
      items = [],
      queue = [];
    let feedback = [],
      loadFailed = false;
    let canUpload = permissions.canUploadMedia === true;
    let canDelete = permissions.canDeleteMedia === true;
    const selected = new Set();
    const listen = (el, event, fn) =>
      el.addEventListener(event, fn, { signal: lifecycle.signal });
    function button(key, action) {
      const el = node("button", key);
      el.type = "button";
      listen(el, "click", action);
      return el;
    }
    function field(parent, name, type, values) {
      const label = node("label", null, "admin-media-field");
      label.append(node("span", `admin_next_media_${name}`));
      const control = node(values ? "select" : "input", null, "cmcen-control");
      control.id = `media-${name}`;
      control.name = name;
      if (values)
        for (const value of values) {
          const option = node("option", `admin_next_media_${value}`);
          option.value = value;
          control.append(option);
        }
      else control.type = type;
      label.append(control);
      parent.append(label);
      return control;
    }
    const toolbar = node("div", null, "admin-media-toolbar");
    const search = field(toolbar, "search", "search");
    search.maxLength = 120;
    const sort = field(toolbar, "sort", null, [
      "newest",
      "oldest",
      "name",
      "size",
      "orphaned",
    ]);
    sort.value = "newest";
    const type = field(toolbar, "type", null, [
      "all",
      "retirement",
      "last-post",
      "event",
      "page",
      "upload",
      "migration",
      "unattached",
    ]);
    type.value = "all";
    const refresh = button("admin_refresh", () => load());
    toolbar.append(refresh);
    const uploadPanel = node("section", null, "admin-media-upload");
    uploadPanel.append(
      node("h2", "admin_next_media_upload_heading"),
      node("p", "admin_next_media_upload_help"),
    );
    const slug = field(uploadPanel, "slug", "text");
    slug.maxLength = 80;
    const slugHelp = node("p", "admin_next_media_slug_help");
    slugHelp.id = "media-slug-help";
    slug.setAttribute("aria-describedby", slugHelp.id);
    uploadPanel.append(slugHelp);
    const files = field(uploadPanel, "files", "file");
    files.multiple = true;
    files.accept =
      ".jpg,.jpeg,.png,.webp,.gif,.heic,image/jpeg,image/png,image/webp,image/gif,image/heic";
    const uploads = node("ul", null, "admin-media-upload-queue");
    uploads.setAttribute("aria-live", "polite");
    uploadPanel.append(uploads);
    const status = node("p", null, "admin-media-status");
    status.setAttribute("role", "status");
    const retry = button("admin_next_retry", () => load(Boolean(cursor)));
    const selection = node("div", null, "admin-media-selection");
    const selectAll = button("admin_next_media_select_all", () => {
      if (locked() || loading) return;
      items
        .filter((item) => !inUse(item))
        .forEach((item) => selected.add(item.key));
      render();
    });
    const clear = button("admin_next_media_clear", () => {
      selected.clear();
      render();
    });
    const count = node("span");
    const removeSelected = button("admin_next_media_delete_selected", () =>
      remove(),
    );
    selection.append(selectAll, clear, count, removeSelected);
    const grid = node("div", null, "admin-media-grid");
    const more = button("admin_media_load_more", () => load(true));
    root.replaceChildren(
      toolbar,
      uploadPanel,
      status,
      retry,
      selection,
      grid,
      more,
    );
    const locked = () => disposed || busy || confirming;
    const inUse = (item) =>
      Boolean(item.attachedPostCount || item.attachedPosts?.length);
    function message(key, values) {
      feedback = [[key, values]];
      update();
    }
    function update() {
      uploadPanel.hidden = !canUpload;
      selection.hidden = !canDelete;
      [search, sort, type, slug, files].forEach((el) => {
        el.disabled = locked();
      });
      refresh.disabled = locked() || loading;
      selectAll.disabled =
        locked() || loading || !items.some((item) => !inUse(item));
      clear.disabled = locked() || !selected.size;
      removeSelected.disabled = locked() || loading || !selected.size;
      count.textContent = t("admin_next_media_selected", {
        count: selected.size,
      });
      status.textContent = loading
        ? t("admin_media_loading")
        : feedback.map(([key, values]) => t(key, values)).join(" ");
      retry.hidden = !loadFailed;
      retry.disabled = locked() || loading;
      more.hidden = !cursor;
      more.disabled = locked() || loading;
      grid.setAttribute("aria-busy", String(loading));
      for (const control of grid.querySelectorAll("input"))
        control.disabled = locked() || loading;
      for (const control of grid.querySelectorAll("button"))
        control.disabled = locked() || loading;
      uploads.replaceChildren(
        ...queue.map((entry) => {
          const li = node("li");
          li.textContent = `${entry.file.name} — ${t(`admin_next_media_upload_${entry.state}`)}${entry.error ? ` ${entry.error}` : ""}`;
          return li;
        }),
      );
    }
    function render() {
      if (disposed) return;
      grid.replaceChildren();
      for (const item of items) {
        const card = node("article", null, "admin-media-card");
        const title = item.name || item.originalName || item.key;
        const url = safeUrl(item.url);
        if (url) {
          const preview = node("a", null, "admin-media-preview");
          preview.href = url;
          preview.target = "_blank";
          preview.rel = "noopener noreferrer";
          const image = node("img");
          image.src = url;
          image.alt = title;
          image.loading = "lazy";
          preview.append(image);
          card.append(preview);
        }
        const body = node("div", null, "admin-media-card-body");
        const heading = node("h2");
        heading.textContent = title;
        const key = node("p", null, "admin-media-key");
        key.textContent = item.key;
        const metadata = node("p");
        const date = new Date(item.lastModified);
        metadata.textContent = [
          `${Math.round(Number(item.size || 0) / 1024).toLocaleString()} KB`,
          item.lastModified && !Number.isNaN(date.getTime())
            ? t("admin_media_modified", {
                date: date.toLocaleDateString(
                  document.documentElement.lang || "en",
                ),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" · ");
        body.append(heading, key, metadata);
        if (inUse(item)) {
          const details = node("details");
          const summary = node("summary");
          const uses =
            item.attachedPostCount || item.attachedPosts?.length || 0;
          summary.textContent = t(
            uses === 1
              ? "admin_media_attached_count_singular"
              : "admin_media_attached_count_plural",
            { count: uses },
          );
          const list = node("ul");
          for (const attachment of item.attachedPosts || []) {
            const li = node("li");
            const href = safeUrl(attachment.href || "");
            const link = node(href && attachment.href ? "a" : "span");
            link.textContent =
              attachment.title || t("admin_content_untitled_content");
            if (href && attachment.href) {
              link.href = href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
            }
            const meta = node("small");
            meta.textContent = [
              attachment.type,
              attachment.status,
              attachment.field,
            ]
              .filter(Boolean)
              .join(" · ");
            li.append(link, meta);
            list.append(li);
          }
          details.append(summary, list);
          body.append(details);
        } else {
          body.append(node("p", "admin_media_not_attached"));
          if (canDelete) {
            const actions = node("div", null, "admin-media-card-actions");
            const label = node("label");
            const checkbox = node("input");
            checkbox.type = "checkbox";
            checkbox.checked = selected.has(item.key);
            checkbox.setAttribute(
              "aria-label",
              t("admin_next_media_select", { name: title }),
            );
            // Card listeners leave with their nodes; avoid retaining every old grid.
            checkbox.addEventListener("change", () => {
              if (locked() || loading) return;
              if (checkbox.checked) selected.add(item.key);
              else selected.delete(item.key);
              update();
            });
            label.append(
              checkbox,
              node("span", "admin_next_media_select_label"),
            );
            const removeButton = node("button", "admin_delete");
            removeButton.type = "button";
            removeButton.addEventListener("click", () => remove(item));
            actions.append(label, removeButton);
            body.append(actions);
          }
        }
        card.append(body);
        grid.append(card);
      }
      if (!items.length && !loading && !loadFailed)
        grid.append(node("p", "admin_next_media_empty"));
      update();
    }
    async function load(append = false) {
      if (disposed) return;
      clearTimeout(debounce);
      request?.abort();
      request = new AbortController();
      const token = ++generation;
      loading = true;
      if (loadFailed) feedback = [];
      loadFailed = false;
      if (!append) {
        cursor = "";
        items = [];
        selected.clear();
      }
      render();
      const params = new URLSearchParams({
        limit: "100",
        sort: sort.value,
        type: type.value,
      });
      if (search.value.trim()) params.set("search", search.value.trim());
      if (append && cursor) params.set("cursor", cursor);
      try {
        const data = await api(`/api/admin/media?${params}`, {
          signal: request.signal,
        });
        if (disposed || token !== generation) return;
        items = [
          ...new Map(
            [...(append ? items : []), ...(data.media || [])].map((item) => [
              item.key,
              item,
            ]),
          ).values(),
        ];
        cursor = data.isTruncated ? data.nextCursor || "" : "";
        for (const key of selected)
          if (!items.some((item) => item.key === key && !inUse(item)))
            selected.delete(key);
      } catch (error) {
        if (disposed || token !== generation) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        loadFailed = true;
        feedback = [["admin_media_load_error"]];
      } finally {
        if (!disposed && token === generation) {
          loading = false;
          render();
        }
      }
    }
    function queryChanged(delayed) {
      if (locked()) return;
      request?.abort();
      generation++;
      cursor = "";
      items = [];
      selected.clear();
      feedback = [];
      loading = true;
      clearTimeout(debounce);
      render();
      if (delayed) debounce = setTimeout(() => load(), 250);
      else return load();
    }
    async function remove(item) {
      if (
        locked() ||
        loading ||
        !canDelete ||
        permissions.canDeleteMedia !== true
      )
        return;
      const keys = items
        .filter(
          (entry) =>
            !inUse(entry) &&
            (item ? entry.key === item.key : selected.has(entry.key)),
        )
        .map((entry) => entry.key);
      if (!keys.length) return;
      // The bulk endpoint accepts at most 200 keys; never silently drop extras.
      if (keys.length > 200) {
        message("admin_next_media_selection_limit");
        return;
      }
      confirming = true;
      update();
      let accepted = false;
      try {
        accepted = await window.CMCENModal.confirm(
          t("admin_next_media_delete_confirm", { count: keys.length }),
          {
            title: t("admin_delete"),
            confirmText: t("admin_delete"),
            destructive: true,
          },
        );
      } finally {
        confirming = false;
        if (!disposed) update();
      }
      if (
        !accepted ||
        disposed ||
        !canDelete ||
        permissions.canDeleteMedia !== true
      )
        return;
      busy = true;
      update();
      try {
        const result = await api(
          item
            ? `/api/admin/media/${encodeURIComponent(keys[0])}`
            : "/api/admin/media/bulk-delete",
          {
            method: item ? "DELETE" : "POST",
            ...(item ? {} : { body: { keys } }),
            timeoutMs: null,
            signal: lifecycle.signal,
          },
        );
        if (disposed) return;
        feedback = item
          ? [["admin_media_delete_success"]]
          : [
              [
                "admin_media_bulk_delete_success",
                { count: result.deleted?.length || 0 },
              ],
              ...(result.skipped?.length
                ? [
                    [
                      "admin_media_bulk_delete_skipped",
                      { count: result.skipped.length },
                    ],
                  ]
                : []),
              ...(result.missing?.length
                ? [
                    [
                      "admin_media_bulk_delete_missing",
                      { count: result.missing.length },
                    ],
                  ]
                : []),
            ];
      } catch (error) {
        if (disposed) return;
        if (error.status === 403) canDelete = false;
        feedback = [
          [
            error.status === 409
              ? "admin_media_delete_attached_error"
              : "admin_media_delete_error",
          ],
        ];
      } finally {
        if (!disposed) {
          await load();
          busy = false;
          render();
        }
      }
    }
    async function upload(fileList) {
      if (locked() || !canUpload || permissions.canUploadMedia !== true) return;
      const chosen = Array.from(fileList || []);
      if (!chosen.length) return;
      files.value = "";
      const customSlug = slug.value.trim().toLowerCase();
      if (
        customSlug &&
        (chosen.length !== 1 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(customSlug) ||
          customSlug.length > 80)
      ) {
        message("admin_next_media_slug_invalid");
        return;
      }
      if (
        chosen.some(
          (file) =>
            !file.type.startsWith("image/") &&
            !/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name),
        )
      ) {
        message("admin_next_media_images_only");
        return;
      }
      busy = true;
      feedback = [];
      queue = chosen.map((file) => ({ file, state: "waiting" }));
      update();
      let next = 0;
      async function worker() {
        while (
          !disposed &&
          canUpload &&
          permissions.canUploadMedia === true &&
          next < queue.length
        ) {
          const entry = queue[next++];
          entry.state = "sending";
          update();
          const body = new FormData();
          body.append("image", entry.file);
          body.append("uploadSource", "mediaManager");
          body.append("uploadContext", "media-manager");
          body.append("sourceField", "mediaLibrary");
          body.append("sourceName", entry.file.name);
          if (customSlug) body.append("cdnSlug", customSlug);
          try {
            await api("/api/upload", {
              method: "POST",
              body,
              timeoutMs: null,
              signal: lifecycle.signal,
            });
            if (disposed) return;
            entry.state = "done";
          } catch (error) {
            if (disposed) return;
            entry.state = "failed";
            if ([400, 409, 413, 415].includes(error.status))
              entry.error = error.data?.error || error.message || "";
            if (error.status === 403) canUpload = false;
          }
          update();
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, worker),
      );
      if (disposed) return;
      queue
        .filter((entry) => entry.state === "waiting")
        .forEach((entry) => {
          entry.state = "cancelled";
        });
      if (customSlug && queue.every((entry) => entry.state === "done"))
        slug.value = "";
      files.value = "";
      feedback = [
        [
          "admin_next_media_upload_summary",
          {
            done: queue.filter((entry) => entry.state === "done").length,
            total: queue.length,
          },
        ],
      ];
      await load();
      busy = false;
      render();
    }
    listen(search, "input", () => queryChanged(true));
    listen(sort, "change", () => queryChanged(false));
    listen(type, "change", () => queryChanged(false));
    listen(files, "change", () => upload(files.files));
    listen(uploadPanel, "dragover", (event) => {
      event.preventDefault();
    });
    listen(uploadPanel, "drop", (event) => {
      event.preventDefault();
      return upload(event.dataTransfer?.files);
    });
    listen(document, "languagechange", render);
    const ready = load();
    return {
      ready,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () =>
        busy || confirming || Boolean(canUpload && slug.value.trim()),
      dispose() {
        disposed = true;
        generation++;
        clearTimeout(debounce);
        request?.abort();
        lifecycle.abort();
        root.replaceChildren();
      },
    };
  }
  window.DashboardNextMedia = { mount };
})();
