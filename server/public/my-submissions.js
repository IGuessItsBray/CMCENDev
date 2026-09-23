"use strict";

window.MySubmissions = (() => {
  const types = {
    event: "content_workspace_event",
    retirementMessage: "content_workspace_retirement",
    lastPost: "content_workspace_last_post",
    retirementComment: "content_workspace_comment",
  };
  const statuses = ["draft", "pending", "scheduled", "published", "rejected"];
  const t = (key, replacements) => window.translate(key, replacements);
  const localText = (value) =>
    typeof value === "string"
      ? value
      : value?.[CMCENUtils.getCurrentLanguage()] ||
        value?.en ||
        value?.fr ||
        "";
  const title = (item) => localText(item.title) || t(types[item.type]);

  function mount({ root }) {
    const lifecycle = new AbortController();
    const typeFilter = root.querySelector("[data-submissions-type]");
    const statusFilter = root.querySelector("[data-submissions-status]");
    const list = root.querySelector("[data-submissions-list]");
    const message = root.querySelector("[data-submissions-message]");
    const more = root.querySelector("[data-submissions-more]");
    const retry = root.querySelector("[data-submissions-retry]");
    const dialog = root.querySelector("dialog");
    const dialogTitle = dialog.querySelector("h2");
    const dialogMeta = dialog.querySelector("[data-submission-meta]");
    const dialogBody = dialog.querySelector("[data-submission-body]");
    const dialogActions = dialog.querySelector("[data-submission-actions]");
    let items = [];
    let cursor = null;
    let hasMore = false;
    let loading = false;
    let failed = false;
    let disposed = false;
    let generation = 0;
    let request;
    let detailRequest;
    let selected = null;
    let detail = null;
    let detailFailed = false;
    let opener;
    let editor = null;
    let editorSource = null;
    let saving = false;
    let saveRequest;
    const token = CMCENUtils.getStoredAuthToken();
    root.hidden = true;
    typeFilter.value = "all";
    statusFilter.value = "all";
    const api = (url, signal, options = {}) =>
      CMCENUtils.apiJson(url, {
        ...options,
        token,
        cache: "no-store",
        redirectOnUnauthorized: true,
        signal: AbortSignal.any(
          [lifecycle.signal, signal, AbortSignal.timeout(15000)].filter(
            Boolean,
          ),
        ),
      });
    const date = (value) => {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? ""
        : parsed.toLocaleDateString(CMCENUtils.getCurrentLocale(), {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
    };
    function element(tag, className, text) {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function statusBadge(status) {
      return element(
        "span",
        `my-submissions-badge is-${status}`,
        t(`my_submissions_status_${status}`),
      );
    }
    function renderList() {
      list.setAttribute("aria-busy", String(loading));
      more.disabled = loading;
      more.hidden = !hasMore;
      retry.hidden = !failed;
      message.textContent = loading
        ? t("my_submissions_loading")
        : failed
          ? t("my_submissions_load_error")
          : !items.length
            ? t("my_submissions_empty")
            : "";
      list.replaceChildren();
      if (loading && !items.length) {
        for (let i = 0; i < 3; i++) {
          const skeleton = element("li", "my-submissions-skeleton");
          skeleton.setAttribute("aria-hidden", "true");
          skeleton.append(
            CMCENUtils.createSkeleton("skeleton--line"),
            CMCENUtils.createSkeleton("skeleton--line skeleton--line-short"),
          );
          list.append(skeleton);
        }
      }
      for (const item of items) {
        const row = document.createElement("li");
        const button = element("button", "my-submissions-row");
        button.type = "button";
        if (selected?.id === item.id && selected?.type === item.type)
          opener = button;
        const copy = element("span", "my-submissions-copy");
        copy.append(
          element("strong", "", title(item)),
          element(
            "span",
            "my-submissions-meta",
            `${t(types[item.type])} · ${t("my_submissions_submitted", { date: date(item.submittedAt) })}`,
          ),
        );
        if (item.rejectedAt)
          copy.append(
            element(
              "span",
              "my-submissions-meta",
              t("submission_rejected_at", { date: date(item.rejectedAt) }),
            ),
          );
        button.append(copy, statusBadge(item.status));
        button.addEventListener("click", () => open(item, button));
        row.append(button);
        list.append(row);
      }
    }
    async function load({ append = false } = {}) {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const owner = ++generation;
      loading = true;
      failed = false;
      if (!append) {
        items = [];
        cursor = null;
        hasMore = false;
      }
      renderList();
      const query = new URLSearchParams({ limit: "12" });
      if (typeFilter.value !== "all") query.set("type", typeFilter.value);
      if (statusFilter.value !== "all") query.set("status", statusFilter.value);
      if (append && cursor) query.set("cursor", cursor);
      try {
        const data = await api(
          `/api/my-submissions?${query}`,
          controller.signal,
        );
        if (disposed || owner !== generation) return;
        const known = new Set(items.map((item) => `${item.type}:${item.id}`));
        const next = Array.isArray(data.items) ? data.items : [];
        items.push(
          ...next.filter((item) => !known.has(`${item.type}:${item.id}`)),
        );
        cursor = data.nextCursor || null;
        hasMore = data.hasMore === true && Boolean(cursor);
        // Only an unfiltered result establishes that the user has no submissions.
        if (typeFilter.value === "all" && statusFilter.value === "all")
          root.hidden = items.length === 0;
      } catch {
        if (disposed || owner !== generation) return;
        failed = true;
        root.hidden = false;
      } finally {
        if (!disposed && owner === generation) {
          loading = false;
          renderList();
        }
      }
    }
    function addField(container, key, value) {
      if (!value) return;
      const field = element("div", "my-submission-field");
      field.append(element("h4", "", t(key)), element("p", "", value));
      container.append(field);
    }
    function renderDetail() {
      if (!selected) return;
      if (editor) {
        editor.translate();
        dialogMeta.replaceChildren(
          element("span", "", t(types[selected.type])),
          statusBadge(detail.status),
        );
        if (detail.rejectedAt)
          dialogMeta.append(
            element(
              "span",
              "",
              t("submission_rejected_at", {
                date: date(detail.rejectedAt),
              }),
            ),
          );
        dialogBody.querySelector(".my-submission-status-help").textContent = t(
          `my_submissions_help_${detail.status}`,
        );
        const feedbackTitle = dialogBody.querySelector(
          ".my-submission-feedback h3",
        );
        if (feedbackTitle)
          feedbackTitle.textContent = t("my_submissions_feedback");
        return;
      }
      dialogTitle.textContent = title(detail || selected);
      dialogMeta.replaceChildren(
        element("span", "", t(types[selected.type])),
        statusBadge((detail || selected).status),
      );
      if ((detail || selected).rejectedAt)
        dialogMeta.append(
          element(
            "span",
            "",
            t("submission_rejected_at", {
              date: date((detail || selected).rejectedAt),
            }),
          ),
        );
      dialogBody.replaceChildren();
      dialogActions.replaceChildren();
      dialogBody.setAttribute("aria-busy", String(!detail && !detailFailed));
      if (!detail) {
        dialogBody.append(
          element(
            "p",
            "",
            t(
              detailFailed
                ? "my_submissions_detail_error"
                : "my_submissions_loading",
            ),
          ),
        );
        if (detailFailed) {
          const retryDetail = element(
            "button",
            "admin-work-zone-button is-secondary",
            t("my_submissions_retry"),
          );
          retryDetail.type = "button";
          retryDetail.addEventListener("click", () => void loadDetail());
          dialogBody.append(retryDetail);
        }
        return;
      }
      dialogBody.append(
        element(
          "p",
          "my-submission-status-help",
          t(`my_submissions_help_${detail.status}`),
        ),
      );
      if (detail.status === "rejected" && detail.feedback) {
        const feedback = element("section", "my-submission-feedback");
        feedback.append(
          element("h3", "", t("my_submissions_feedback")),
          element("p", "", detail.feedback),
        );
        dialogBody.append(feedback);
      }
      if (editorSource) {
        editor = window.MySubmissionEditor.create({
          item: detail,
          source: editorSource,
          onSubmit: () => void resubmit(),
        });
        dialogBody.append(editor.form);
        const submit = element(
          "button",
          "admin-work-zone-button is-primary",
          t("my_submissions_resubmit"),
        );
        submit.type = "submit";
        submit.setAttribute("form", editor.form.id);
        submit.dataset.i18n = "my_submissions_resubmit";
        dialogActions.append(submit);
        return;
      }
      const facts = element("div", "my-submission-facts");
      addField(
        facts,
        "my_submissions_submitted_date",
        date(detail.submittedAt),
      );
      dialogBody.append(facts);
      const content = detail.content || {};
      if (content.imageUrl) {
        try {
          const url = new URL(content.imageUrl, window.location.origin);
          if (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          ) {
            const image = element("img", "my-submission-image");
            image.src = url.href;
            image.alt = title(detail);
            image.loading = "lazy";
            dialogBody.append(image);
          }
        } catch {
          /* Invalid legacy image references do not prevent reading the submission. */
        }
      }
      if (detail.type === "retirementMessage") {
        addField(
          facts,
          "retirement_date",
          content.retirementDate ? date(content.retirementDate) : "",
        );
        addField(facts, "retirement_trade_role", content.tradeRole);
      }
      if (detail.type === "event") {
        const facts = element("div", "my-submission-facts");
        addField(
          facts,
          "content_workspace_field_location",
          [content.city, content.provinceRegion].filter(Boolean).join(", "),
        );
        const eventDate = (value) =>
          content.allDay
            ? String(value).slice(0, 10)
            : new Date(value).toLocaleString(
                CMCENUtils.getCurrentLocale(),
                content.timezone ? { timeZone: content.timezone } : {},
              );
        addField(
          facts,
          "my_submissions_event_start",
          content.startDate ? eventDate(content.startDate) : "",
        );
        addField(
          facts,
          "my_submissions_event_end",
          content.endDate ? eventDate(content.endDate) : "",
        );
        addField(facts, "event_timezone", content.timezone);
        dialogBody.append(facts);
      }
      if (detail.type === "retirementComment") {
        addField(dialogBody, "content_workspace_comment_body", content.body);
      } else {
        for (const language of ["en", "fr"]) {
          const section = element("section", "my-submission-language");
          section.lang = language;
          section.append(element("h3", "", t(`language_${language}`)));
          if (detail.type === "event") {
            addField(
              section,
              "content_workspace_field_title",
              detail.title?.[language],
            );
            addField(
              section,
              "content_workspace_field_location",
              content.location?.[language],
            );
            addField(
              section,
              "content_workspace_field_description",
              content.description?.[language],
            );
            addField(
              section,
              "content_workspace_field_registration",
              content.registration?.[language],
            );
          } else
            addField(
              section,
              "content_workspace_field_message",
              content.messages?.[language],
            );
          if (section.children.length === 1)
            section.append(
              element(
                "p",
                "my-submissions-meta",
                t("my_submissions_no_translation"),
              ),
            );
          dialogBody.append(section);
        }
      }
      for (const [href, label, primary] of [
        [detail.publicUrl, "my_submissions_view_public", false],
      ]) {
        if (!href) continue;
        const link = element(
          "a",
          `admin-work-zone-button ${primary ? "is-primary" : "is-secondary"}`,
          t(label),
        );
        link.href = href;
        dialogActions.append(link);
      }
    }
    async function loadDetail() {
      detailRequest?.abort();
      const controller = new AbortController();
      detailRequest = controller;
      detail = null;
      editor?.dispose();
      editor = null;
      editorSource = null;
      detailFailed = false;
      renderDetail();
      try {
        const data = await api(
          `/api/my-submissions/${encodeURIComponent(selected.type)}/${encodeURIComponent(selected.id)}`,
          controller.signal,
        );
        if (disposed || detailRequest !== controller || !dialog.open) return;
        let source = null;
        if (data.item.status === "rejected" && data.item.editUrl)
          source = await window.MySubmissionEditor.load(
            data.item,
            api,
            controller.signal,
          );
        if (disposed || detailRequest !== controller || !dialog.open) return;
        detail = data.item;
        editorSource = source;
      } catch {
        if (disposed || detailRequest !== controller || !dialog.open) return;
        detailFailed = true;
      }
      renderDetail();
    }
    async function resubmit() {
      if (saving || !editor || !editor.form.reportValidity()) return;
      saving = true;
      const activeEditor = editor;
      const controller = new AbortController();
      saveRequest = controller;
      const controls = dialog.querySelectorAll(
        "[data-submission-close], [data-submission-actions] button",
      );
      controls.forEach((button) => {
        button.disabled = true;
      });
      activeEditor.busy(true);
      try {
        const body = await activeEditor.payload({
          token,
          signal: AbortSignal.any([
            controller.signal,
            lifecycle.signal,
            AbortSignal.timeout(60000),
          ]),
        });
        const result = await api(activeEditor.endpoint, controller.signal, {
          method: "PATCH",
          body,
        });
        if (disposed || editor !== activeEditor) return;
        // The server response is authoritative even if a later detail refresh fails.
        const saved =
          result.event ||
          result.retirementMessage ||
          result.lastPost ||
          result.comment;
        const updated = {
          ...detail,
          status: "pending",
          rejectedAt: null,
          feedback: "",
          editUrl: null,
          updatedAt: saved?.updatedAt || new Date().toISOString(),
          content: { ...detail.content },
        };
        if (detail.type === "event") {
          updated.title = saved?.title || body.title;
          Object.assign(updated.content, body, {
            startDate: saved?.startDate || body.startDate,
            endDate: saved?.endDate || body.endDate,
            imageUrl: body.imagePath,
          });
        } else if (detail.type === "retirementComment")
          updated.content.body = body.body;
        else {
          updated.content.messages = {
            ...updated.content.messages,
            [body.messageLanguage]: body.message,
          };
          updated.content.imageUrl = body.photoUrl ?? body.imageUrl;
          if (detail.type === "retirementMessage") {
            updated.content.retirementDate = body.retiree.retirementDate;
            updated.content.tradeRole = body.retiree.tradeRole;
          }
          const person = body.retiree || body.deceased;
          const name = [
            person.rank || person.fullRank,
            person.firstName,
            person.lastName || person.surname,
          ]
            .filter(Boolean)
            .join(" ");
          if (detail.type === "retirementMessage" || !editorSource.record.title)
            updated.title = { en: name, fr: name };
        }
        items = items.flatMap((item) => {
          if (item.id !== updated.id || item.type !== updated.type)
            return [item];
          return statusFilter.value === "all" ||
            statusFilter.value === "pending"
            ? [updated]
            : [];
        });
        activeEditor.dispose();
        editor = null;
        editorSource = null;
        detail = updated;
        selected = updated;
        renderList();
        renderDetail();
        dialogBody.scrollTop = 0;
        controls.forEach((button) => {
          button.disabled = false;
        });
        dialog.querySelector("[data-submission-close]").focus();
        CMCENUtils.showToast(t("my_submissions_resubmitted"));
      } catch (error) {
        if (!disposed && editor === activeEditor) {
          activeEditor.busy(false);
          activeEditor.error(error.message);
        }
      } finally {
        saving = false;
        if (!disposed) {
          activeEditor.busy(false);
          controls.forEach((button) => {
            button.disabled = false;
          });
        }
      }
    }
    function requestClose() {
      if (saving) return;
      if (editor?.dirty() && !window.confirm(t("my_submissions_discard")))
        return;
      dialog.close();
    }
    function open(item, button) {
      selected = item;
      opener = button;
      dialog.showModal();
      document.body.classList.add("my-submission-dialog-open");
      void loadDetail();
    }
    dialog.querySelectorAll("[data-submission-close]").forEach((button) =>
      button.addEventListener("click", requestClose, {
        signal: lifecycle.signal,
      }),
    );
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        requestClose();
      },
      { signal: lifecycle.signal },
    );
    window.addEventListener(
      "beforeunload",
      (event) => {
        if (saving || editor?.dirty()) {
          event.preventDefault();
          event.returnValue = "";
        }
      },
      { signal: lifecycle.signal },
    );
    dialog.addEventListener(
      "close",
      () => {
        detailRequest?.abort();
        detailRequest = null;
        selected = null;
        detail = null;
        editor?.dispose();
        editor = null;
        editorSource = null;
        dialogBody.replaceChildren();
        document.body.classList.remove("my-submission-dialog-open");
        (opener?.isConnected ? opener : statusFilter)?.focus({
          preventScroll: true,
        });
      },
      { signal: lifecycle.signal },
    );
    typeFilter.addEventListener("change", () => void load(), {
      signal: lifecycle.signal,
    });
    statusFilter.addEventListener("change", () => void load(), {
      signal: lifecycle.signal,
    });
    more.addEventListener("click", () => void load({ append: true }), {
      signal: lifecycle.signal,
    });
    retry.addEventListener(
      "click",
      () => void load({ append: items.length > 0 }),
      { signal: lifecycle.signal },
    );
    document.addEventListener(
      "languagechange",
      () => {
        renderList();
        renderDetail();
      },
      { signal: lifecycle.signal },
    );
    const ready = load();
    return {
      ready,
      dispose() {
        disposed = true;
        root.hidden = true;
        generation++;
        dialog.close();
        document.body.classList.remove("my-submission-dialog-open");
        lifecycle.abort();
        request?.abort();
        detailRequest?.abort();
        saveRequest?.abort();
        editor?.dispose();
        editor = null;
        editorSource = null;
        items = [];
        detail = null;
        selected = null;
        list.replaceChildren();
        dialogBody.replaceChildren();
        dialogActions.replaceChildren();
        dialogTitle.textContent = "";
        dialogMeta.replaceChildren();
      },
    };
  }
  return { mount, types, statuses };
})();
