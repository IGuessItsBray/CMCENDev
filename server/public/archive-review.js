(() => {
  "use strict";
  const t = (key) => window.translate(`archive_review_${key}`);
  const local = (value) =>
    typeof value === "string"
      ? value
      : value?.[document.documentElement.lang === "fr" ? "fr" : "en"] ||
        value?.en ||
        "";
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const link = (url, label) => {
    const a = node("a", label);
    // The catalogue is reviewed data, but URL safety remains a rendering boundary.
    if (/^https:\/\//i.test(url)) a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  };
  function mount({ api, onUrlChange }) {
    const root = document.getElementById("archiveReviewRoot");
    const section = document.getElementById("adminArchives");
    const meeting = document.getElementById("archiveMeetingToggle");
    const events = new AbortController();
    let disposed = false,
      saving = false,
      confirming = false,
      detailRequest = 0,
      listRequest = 0;
    let batches = [],
      batchId = "",
      items = [],
      selected = "",
      detail = null,
      nextOffset = null;
    let choice = "",
      note = "",
      baseline = "",
      loaded = false,
      latestUrl,
      booting = false;
    const filters = { state: "all", type: "all", category: "all", search: "" };
    const listen = (el, event, callback) =>
      el.addEventListener(event, callback, { signal: events.signal });
    const button = (label, callback) => {
      const b = node("button", label);
      b.type = "button";
      listen(b, "click", callback);
      return b;
    };
    const snapshot = () => JSON.stringify({ choice, note });
    const dirty = () => Boolean(detail) && snapshot() !== baseline;
    async function canLeave() {
      if (saving || confirming || disposed) return false;
      if (!dirty()) return true;
      confirming = true;
      try {
        return await window.CMCENModal.confirm(
          window.translate("admin_next_discard"),
          {
            title: window.translate("content_workspace_unsaved_changes_title"),
            confirmText: window.translate("content_workspace_discard_changes"),
            destructive: true,
          },
        );
      } finally {
        confirming = false;
      }
    }
    const path = () =>
      `/api/admin/archive-review/${encodeURIComponent(batchId)}/items`;
    const status = node("p", "", "archive-status");
    status.role = "status";
    status.setAttribute("aria-live", "polite");
    const retry = button(t("retry"), () => (loaded ? loadList() : boot()));
    retry.hidden = true;
    const summary = node("p", "", "archive-progress");
    const scope = node("p", "", "archive-muted");
    const grid = node("div", undefined, "archive-grid");
    const queue = node("aside", undefined, "archive-queue");
    queue.setAttribute("aria-label", t("queue"));
    const filterBar = node("form", undefined, "archive-filters");
    const batchSelect = node("select", undefined, "cmcen-control");
    batchSelect.setAttribute("aria-label", t("batch"));
    const controls = {};
    function selectFilter(name, values) {
      const select = node("select", undefined, "cmcen-control");
      select.setAttribute("aria-label", t(name));
      for (const value of values) {
        const o = node("option", t(`${name}_${value}`));
        o.value = value;
        select.append(o);
      }
      controls[name] = select;
      listen(select, "change", () => {
        filters[name] = select.value;
        loadList();
      });
      return select;
    }
    const search = node("input", undefined, "cmcen-control");
    search.type = "search";
    search.maxLength = 200;
    search.placeholder = t("search");
    search.setAttribute("aria-label", t("search"));
    filterBar.append(
      batchSelect,
      search,
      selectFilter("state", [
        "all",
        "pending",
        "approved",
        "reviewed",
        "deferred",
      ]),
      selectFilter("type", [
        "all",
        "disposition",
        "pairing",
        "discovery",
        "translation",
        "attachment",
        "provenance",
        "layout",
      ]),
      selectFilter("category", [
        "all",
        "unassigned",
        "news",
        "newsletter",
        "unit-updates",
      ]),
    );
    const searchButton = node("button", t("search_action"));
    searchButton.type = "submit";
    filterBar.append(searchButton);
    listen(filterBar, "submit", (event) => {
      event.preventDefault();
      filters.search = search.value.trim();
      loadList();
    });
    const list = node("div", undefined, "archive-list");
    const more = button(t("more"), () => loadList(true));
    more.hidden = true;
    const pane = node("article", undefined, "archive-detail");
    pane.setAttribute("aria-label", t("detail"));
    queue.append(filterBar, list, more);
    grid.append(queue, pane);
    root.replaceChildren(status, retry, summary, scope, grid);
    function message(key, error = false) {
      status.textContent = key ? t(key) : "";
      status.dataset.error = String(error);
    }
    function updateUrl(id) {
      const url = new URL(window.location.href);
      url.searchParams.set("area", "archives");
      url.searchParams.set("batch", batchId);
      if (id) url.searchParams.set("review", id);
      else url.searchParams.delete("review");
      history.replaceState(null, "", url);
      onUrlChange?.();
    }
    function renderSummary(batch) {
      if (!batch) return;
      scope.textContent = local(batch.description);
      summary.textContent =
        `${batch.articleCount} ${t("articles")} · ${batch.itemCount} ${t("decisions")} · ` +
        Object.entries(batch.counts)
          .map(([state, count]) => `${count} ${t(`state_${state}`)}`)
          .join(" · ");
    }
    function renderList() {
      list.replaceChildren();
      if (!items.length) list.append(node("p", t("empty")));
      for (const item of items) {
        const b = button("", () => choose(item.id));
        b.className = "archive-item";
        b.setAttribute("aria-current", item.id === selected ? "true" : "false");
        b.append(
          node("strong", local(item.title)),
          node("span", t(`type_${item.type}`)),
          node(
            "small",
            t(`state_${item.state}`),
            `archive-state archive-state-${item.state}`,
          ),
        );
        list.append(b);
      }
      more.hidden = nextOffset === null;
    }
    async function loadList(append = false) {
      if (!batchId || disposed) return;
      const request = ++listRequest;
      more.disabled = true;
      retry.hidden = true;
      queue.setAttribute("aria-busy", "true");
      try {
        const query = new URLSearchParams({
          ...filters,
          offset: String(append ? nextOffset || 0 : 0),
        });
        const data = await api(`${path()}?${query}`);
        if (disposed || request !== listRequest) return;
        items = append ? [...items, ...data.items] : data.items;
        nextOffset = data.nextOffset;
        renderSummary(data.batch);
        renderList();
      } catch (error) {
        if (
          !disposed &&
          request === listRequest &&
          error.name !== "AbortError"
        ) {
          message("load_error", true);
          retry.hidden = false;
        }
      } finally {
        if (!disposed && request === listRequest) {
          more.disabled = false;
          queue.setAttribute("aria-busy", "false");
        }
      }
    }
    async function choose(id, force = false) {
      if (saving || disposed || (!force && id === selected && detail)) return;
      if (!force && !(await canLeave())) return;
      const request = ++detailRequest;
      selected = id;
      detail = null;
      baseline = "";
      choice = "";
      note = "";
      updateUrl(id);
      renderList();
      pane.replaceChildren(node("p", t("loading")));
      pane.setAttribute("aria-busy", "true");
      message("");
      try {
        const data = await api(`${path()}/${encodeURIComponent(id)}`);
        if (disposed || request !== detailRequest) return;
        detail = data;
        choice = data.decision?.choice || "";
        note = data.decision?.note || "";
        baseline = snapshot();
        renderDetail();
      } catch (error) {
        if (
          disposed ||
          request !== detailRequest ||
          error.name === "AbortError"
        )
          return;
        pane.replaceChildren(
          node("p", t("load_error")),
          button(t("retry"), () => choose(id, true)),
        );
      } finally {
        if (!disposed && request === detailRequest)
          pane.setAttribute("aria-busy", "false");
      }
    }
    function renderSource(
      language,
      source = detail.article.sources[language],
      label = language.toUpperCase(),
    ) {
      const column = node("section", undefined, "archive-source");
      column.lang = language;
      column.append(node("h3", label, "archive-language"));
      if (!source) {
        column.append(node("p", t("unresolved")));
        return column;
      }
      column.append(
        node("h4", source.title),
        link(source.url, t("open_source")),
        node(
          "small",
          `${t("source_updated")}: ${source.modifiedAt.replace("T", " ")}`,
        ),
      );
      const relevant = (detail.item.highlights || []).map((value) =>
        value.toLowerCase(),
      );
      const excerpts = relevant.length
        ? source.paragraphs.filter((p) =>
            relevant.some((value) => p.toLowerCase().includes(value)),
          )
        : [];
      if (excerpts.length) {
        const box = node("div", undefined, "archive-excerpt");
        box.append(node("strong", t("passages")));
        excerpts.forEach((p) => box.append(node("p", p)));
        column.append(box);
      }
      const full = node("details");
      full.open = !relevant.length && source.paragraphs.length <= 12;
      full.append(node("summary", t("full_text")));
      source.paragraphs.forEach((p) => full.append(node("p", p)));
      column.append(full);
      if (source.documents.length) {
        const docs = node("details");
        docs.open = detail.item.type === "attachment";
        docs.append(
          node("summary", `${t("documents")} (${source.documents.length})`),
        );
        const ul = node("ul");
        source.documents.forEach((url) => {
          const li = node("li");
          li.append(
            link(
              url,
              decodeURIComponent(new URL(url).pathname.split("/").pop()),
            ),
          );
          ul.append(li);
        });
        docs.append(ul);
        column.append(docs);
      }
      if (source.images.length) {
        const images = node("details");
        images.open = detail.item.type === "layout";
        images.append(
          node(
            "summary",
            `${t("image_occurrences")} (${source.images.length})`,
          ),
        );
        const ol = node("ol");
        source.images.forEach((url) => {
          const li = node("li");
          li.append(
            link(
              url,
              decodeURIComponent(new URL(url).pathname.split("/").pop()),
            ),
          );
          ol.append(li);
        });
        images.append(ol);
        column.append(images);
      }
      return column;
    }
    function renderDetail() {
      if (!detail) return;
      pane.replaceChildren();
      const index = items.findIndex((item) => item.id === selected);
      const nav = node("div", undefined, "archive-detail-nav");
      const prev = button(t("previous"), () => choose(items[index - 1].id));
      prev.disabled = index <= 0 || saving;
      const next = button(t("next"), () => choose(items[index + 1].id));
      next.disabled = index < 0 || index >= items.length - 1 || saving;
      nav.append(
        prev,
        node(
          "span",
          index < 0 ? t("outside_filters") : `${index + 1} / ${items.length}`,
        ),
        next,
      );
      pane.append(
        nav,
        node("p", t(`type_${detail.item.type}`), "archive-kicker"),
        node("h2", local(detail.article.title)),
        node("h3", local(detail.item.question)),
      );
      const finding = node("div", undefined, "archive-finding");
      finding.append(node("p", local(detail.item.rationale)));
      pane.append(finding);
      if (detail.stale) pane.append(node("p", t("stale"), "archive-warning"));
      if (detail.destination) {
        const p = node(
          "p",
          detail.destination.hasFrench
            ? t("destination_french")
            : t("destination_found"),
        );
        const a = node("a", t("open_draft"));
        a.href = `/dashboard-next?area=articles&id=${encodeURIComponent(detail.destination.id)}`;
        a.target = "_blank";
        a.rel = "noopener";
        p.append(" ", a);
        pane.append(p);
      } else pane.append(node("p", t("destination_absent"), "archive-muted"));
      const sources = node("div", undefined, "archive-sources");
      sources.append(renderSource("en"), renderSource("fr"));
      pane.append(sources);
      for (const source of detail.article.relatedSources || []) {
        const related = node("details");
        related.append(
          node("summary", `${t("related_source")}: ${source.title}`),
        );
        related.append(
          renderSource(source.language || "en", source, t("related_source")),
        );
        pane.append(related);
      }
      const form = node("form", undefined, "archive-decision");
      const fieldset = node("fieldset");
      fieldset.disabled = saving;
      fieldset.append(node("legend", t("decision")));
      const options = node("div", undefined, "archive-choices");
      for (const value of detail.choices) {
        const label = node("label");
        const input = node("input");
        input.type = "radio";
        input.name = "decision";
        input.value = value;
        input.required = true;
        input.checked = choice === value;
        listen(input, "change", () => {
          choice = value;
          noteInput.required = value === "custom";
          message("unsaved");
        });
        label.append(input, node("span", t(`choice_${value}`)));
        if (value === detail.item.recommendedChoice && value !== "defer")
          label.append(node("small", t("suggested")));
        options.append(label);
      }
      const noteLabel = node("label", t("note"));
      noteLabel.htmlFor = "archiveDecisionNote";
      const noteInput = node("textarea", undefined, "cmcen-control");
      noteInput.id = "archiveDecisionNote";
      noteInput.maxLength = 4000;
      noteInput.rows = 3;
      noteInput.value = note;
      noteInput.required = choice === "custom";
      listen(noteInput, "input", () => {
        note = noteInput.value;
        message("unsaved");
      });
      const save = node("button", saving ? t("saving") : t("save"));
      save.className = "admin-work-zone-button is-primary";
      save.type = "submit";
      const reload = button(t("reload"), async () => {
        if (await canLeave()) choose(selected, true);
      });
      reload.className = "admin-work-zone-button is-secondary";
      fieldset.append(
        options,
        noteLabel,
        noteInput,
        node("small", t("note_help")),
        save,
        reload,
      );
      form.append(fieldset);
      pane.append(form);
      listen(form, "submit", async (event) => {
        event.preventDefault();
        if (saving || !choice || (choice === "custom" && !note.trim())) {
          noteInput.reportValidity();
          return;
        }
        saving = true;
        renderDetail();
        message("saving");
        try {
          const data = await api(
            `${path()}/${encodeURIComponent(selected)}/decision`,
            {
              method: "PUT",
              body: {
                choice,
                note,
                revision: detail.decision?.revision || 0,
                catalogueHash: detail.catalogueHash,
              },
            },
          );
          if (disposed) return;
          detail.decision = data.decision;
          detail.state = data.state;
          detail.stale = false;
          note = data.decision.note;
          baseline = snapshot();
          message("saved");
          window.CMCENUtils.showToast(t("saved"), { color: "success" });
          await loadList();
        } catch (error) {
          if (!disposed)
            message(error.status === 409 ? "conflict" : "save_error", true);
        } finally {
          saving = false;
          if (!disposed) renderDetail();
        }
      });
      const history = node("details", undefined, "archive-history");
      history.append(node("summary", t("history")));
      for (const entry of [...(detail.decision?.history || [])].reverse()) {
        const row = node("div");
        row.append(
          node("strong", t(`choice_${entry.choice}`)),
          node(
            "small",
            `${entry.actorName} · ${new Date(entry.at).toLocaleString(document.documentElement.lang)}`,
          ),
          node("p", entry.note),
        );
        history.append(row);
      }
      pane.append(history);
    }
    async function boot() {
      if (booting || disposed) return;
      booting = true;
      message("loading");
      retry.hidden = true;
      try {
        const data = await api("/api/admin/archive-review");
        if (disposed) return;
        batches = data.batches;
        if (!batches.length) {
          message("empty");
          return;
        }
        loaded = true;
        batchSelect.replaceChildren(
          ...batches.map((batch) => {
            const o = node("option", local(batch.title));
            o.value = batch.id;
            return o;
          }),
        );
        await activate(latestUrl || new URL(window.location.href));
        message("");
      } catch (error) {
        if (!disposed && error.name !== "AbortError") {
          message("load_error", true);
          retry.hidden = false;
        }
      } finally {
        booting = false;
      }
    }
    async function activate(url) {
      latestUrl = url;
      if (!loaded) {
        boot();
        return;
      }
      const requestedBatch = url.searchParams.get("batch") || batches[0]?.id;
      if (!batches.some((batch) => batch.id === requestedBatch)) {
        pane.replaceChildren(node("p", t("load_error")));
        return;
      }
      const change = requestedBatch !== batchId;
      if (change) {
        batchId = requestedBatch;
        batchSelect.value = batchId;
        items = [];
        await loadList();
      }
      const id =
        url.searchParams.get("review") ||
        (change ? items[0]?.id : selected || items[0]?.id);
      if (id && (change || id !== selected || !detail)) await choose(id, true);
      if (!id) pane.replaceChildren(node("p", t("empty")));
    }
    listen(batchSelect, "change", async () => {
      const id = batchSelect.value;
      if (!(await canLeave())) {
        batchSelect.value = batchId;
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("batch", id);
      url.searchParams.delete("review");
      activate(url);
    });
    listen(meeting, "click", () => {
      const enabled = !section.classList.contains("archive-meeting");
      section.classList.toggle("archive-meeting", enabled);
      meeting.setAttribute("aria-pressed", String(enabled));
    });
    listen(document, "languagechange", () => {
      // Rebuild translated labels while retaining the current unsaved decision.
      renderList();
      renderDetail();
      for (const [name, select] of Object.entries(controls))
        for (const option of select.options)
          option.textContent = t(`${name}_${option.value}`);
      for (const option of batchSelect.options)
        option.textContent = local(
          batches.find((batch) => batch.id === option.value)?.title,
        );
      search.placeholder = t("search");
      search.setAttribute("aria-label", t("search"));
      searchButton.textContent = t("search_action");
      more.textContent = t("more");
      retry.textContent = t("retry");
      loadList();
    });
    return {
      activate,
      hasUnsavedChanges: () => saving || dirty(),
      canNavigate: () => !saving && !confirming,
      canRoute: (url) =>
        (url.searchParams.get("review") || selected) === selected &&
        (url.searchParams.get("batch") || batchId) === batchId
          ? true
          : canLeave(),
      dispose() {
        disposed = true;
        events.abort();
        root.replaceChildren();
        section.classList.remove("archive-meeting");
        meeting.setAttribute("aria-pressed", "false");
      },
    };
  }
  window.ArchiveReview = Object.freeze({ mount });
})();
