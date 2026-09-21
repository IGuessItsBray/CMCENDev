"use strict";

(() => {
  const t = (key, replacements) => window.translate(key, replacements);
  const dateFields = ["startsAt", "endsAt", "countdownAt"];
  const requiredFields = ["title", "textEn", "textFr"];

  function getBannerStatus(timer, now = Date.now()) {
    if (!timer.enabled) return "disabled";
    if (timer.endsAt && new Date(timer.endsAt).getTime() < now)
      return "disabled";
    if (timer.startsAt && new Date(timer.startsAt).getTime() > now)
      return "scheduled";
    return "enabled";
  }

  function setDeliveryChoice(form, choice) {
    form.elements.namedItem("enabled").checked = choice === "enabled";
    form.elements.namedItem("scheduleEnabled").checked = choice === "scheduled";
  }

  function nextStatusChange(timers, now = Date.now()) {
    const changes = timers
      .flatMap((timer) => [
        timer.startsAt ? new Date(timer.startsAt).getTime() : NaN,
        // The public API includes banners through their exact end timestamp.
        timer.endsAt ? new Date(timer.endsAt).getTime() + 1 : NaN,
      ])
      .filter((time) => time > now);
    return changes.length ? Math.min(...changes) : null;
  }

  function scheduleText(timer, now = Date.now()) {
    const formatter = new Intl.DateTimeFormat(CMCENUtils.getCurrentLocale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    const lines = [];
    if (timer.startsAt)
      lines.push(
        t(
          new Date(timer.startsAt).getTime() <= now
            ? "admin_next_banner_started"
            : "admin_next_banner_starts",
          { date: formatter.format(new Date(timer.startsAt)) },
        ),
      );
    if (timer.endsAt)
      lines.push(
        t(
          new Date(timer.endsAt).getTime() < now
            ? "admin_next_banner_ended"
            : "admin_next_banner_ends",
          { date: formatter.format(new Date(timer.endsAt)) },
        ),
      );
    return lines.join("\n") || t("admin_next_banner_no_dates");
  }

  function validate(
    form,
    reportDateError = () => {},
    reportFields = () => form.reportValidity(),
  ) {
    let datesValid = true;
    // Reset empty picker values before validating the form and timing choices.
    for (const name of dateFields) {
      const input = form.elements.namedItem(name);
      if (input.disabled) continue;
      if (!input.value) {
        input.value = "";
        input.setCustomValidity("");
      }
    }
    for (const name of requiredFields) {
      const input = form.elements.namedItem(name);
      input.setCustomValidity(
        input.value.trim() ? "" : t("admin_next_required"),
      );
    }
    const start = form.elements.namedItem("startsAt");
    const startError =
      form.elements.namedItem("scheduleEnabled").checked &&
      (!start.value || new Date(start.value).getTime() <= Date.now())
        ? t("admin_next_future_start")
        : "";
    start.setCustomValidity(startError);
    if (startError) {
      reportDateError("startsAt", startError);
      datesValid = false;
    }
    if (
      form.elements.namedItem("countdownEnabled").checked &&
      !form.elements.namedItem("countdownAt").value
    ) {
      reportDateError("countdownAt", t("admin_next_required"));
      datesValid = false;
    }
    return reportFields() && datesValid;
  }

  function payload(form) {
    const value = (name) => form.elements.namedItem(name).value;
    const scheduled = form.elements.namedItem("scheduleEnabled").checked;
    const enabledNow = form.elements.namedItem("enabled").checked;
    const data = {
      title: value("title").trim(),
      text: { en: value("textEn").trim(), fr: value("textFr").trim() },
      color: value("color"),
      textColor: value("textColor"),
      placement: value("placement"),
      screenPosition: value("screenPosition"),
      // The legacy API flag allows delivery; dates determine when it appears.
      enabled: enabledNow || scheduled,
      scrolling: form.elements.namedItem("scrolling").checked,
      dismissible: form.elements.namedItem("dismissible").checked,
      icon: value("icon"),
      order: Number(value("order") || 0),
    };
    for (const name of dateFields) {
      const on =
        name === "countdownAt"
          ? form.elements.namedItem("countdownEnabled").checked
          : name === "endsAt"
            ? data.enabled
            : scheduled ||
              (enabledNow && new Date(value(name)).getTime() <= Date.now());
      data[name] =
        on && value(name) ? new Date(value(name)).toISOString() : null;
    }
    return data;
  }

  function mount({ api, onDenied }) {
    const el = (id) => document.getElementById(id);
    const root = el("adminBanners");
    const form = el("bannerForm");
    const fields = el("bannerFields");
    const inputs = el("bannerInputs");
    const list = el("bannerList");
    const status = el("bannerStatus");
    const feedback = el("bannerFeedback");
    const retry = el("bannerRetry");
    const add = el("bannerNew");
    const remove = el("bannerDelete");
    const save = el("bannerSave");
    const empty = el("bannerEmpty");
    const preview = el("bannerPreview");
    const restorePreview = el("bannerPreviewRestore");
    const editorTitle = el("bannerEditorTitle");
    const editorState = el("bannerEditorState");
    const events = new AbortController();
    const datePickers = new Map();
    let confirming = false;
    let disposed = false;
    let timers = [];
    let selected = null;
    let baseline = "";
    let busy = false;
    let operation = "";
    let loaded = false;
    let statusKey = "";
    let forbidden = false;
    let statusTimeout;
    let previewInterval;
    let validationAttempted = false;
    const listen = (node, type, handler) =>
      node.addEventListener(type, handler, { signal: events.signal });
    const field = (name) => form.elements.namedItem(name);
    const snapshot = () =>
      JSON.stringify({
        data: payload(form),
        enabledNow: field("enabled").checked,
        scheduled: field("scheduleEnabled").checked,
        countdown: field("countdownEnabled").checked,
      });
    const dirty = () => !form.hidden && snapshot() !== baseline;
    const canLeave = async () => {
      if (busy || disposed || confirming) return false;
      if (!dirty()) return true;
      confirming = true;
      try {
        const accepted = await window.CMCENModal.confirm(
          t("admin_next_discard"),
          {
            title: t("content_workspace_unsaved_changes_title"),
            confirmText: t("content_workspace_discard_changes"),
            destructive: true,
          },
        );
        return accepted && !disposed && !busy;
      } finally {
        confirming = false;
      }
    };

    function updateEditorState() {
      editorTitle.textContent = selected?._id
        ? selected.title
        : t("timers_new");
      const state = dirty() ? "unsaved" : selected?._id ? "saved" : "new";
      editorState.dataset.state = state;
      editorState.textContent = t(`admin_next_editor_${state}`);
    }
    function message(key, isError = false) {
      statusKey = key;
      const text = key ? t(key) : "";
      status.textContent = form.hidden ? text : "";
      feedback.textContent = form.hidden ? "" : text;
      feedback.dataset.error = String(isError);
    }
    function setBusy(value, action = "") {
      busy = value;
      operation = value ? action : "";
      root.setAttribute("aria-busy", String(value));
      fields.disabled = value || forbidden;
      add.disabled = value || !loaded || forbidden;
      retry.disabled = value;
      list.querySelectorAll("button").forEach((button) => {
        button.disabled = value || forbidden;
      });
      save.textContent = t(
        operation === "save" ? "timers_saving" : "timers_save",
      );
      remove.textContent = t(
        operation === "delete" ? "admin_next_deleting" : "admin_delete",
      );
    }
    function fail(error, key) {
      if (disposed) return;
      if (error.status === 403) {
        forbidden = true;
        onDenied();
      } else {
        message(key, true);
      }
    }
    let fieldGroup = inputs;
    function validateEditor(focus = true) {
      const errors = [];
      const data = payload(form);
      if (
        data.startsAt &&
        data.endsAt &&
        new Date(data.endsAt) < new Date(data.startsAt)
      )
        errors.push({
          control: field("endsAt").parentElement.querySelector(
            ".cmcen-date-time-trigger",
          ),
          message: t("admin_next_date_order"),
        });
      return validate(
        form,
        (name, message) => {
          errors.push({
            control: field(name).parentElement.querySelector(
              ".cmcen-date-time-trigger",
            ),
            message,
          });
        },
        () => window.CMCENForms.validate(form, { errors, focus }),
      );
    }
    function mountPicker(name, key) {
      datePickers.get(name)?.destroy();
      const input = field(name);
      const [date, time] = input.value.split("T");
      const picker = window.CMCENDateTimePicker.create({
        name: `banner-${name}`,
        date,
        time,
        includeTime: true,
        label: t(key),
        placeholder: t("timers_date_time_placeholder"),
        timeLabel: t("timers_picker_time"),
        clearLabel: t("timers_picker_clear"),
        doneLabel: t("timers_picker_done"),
        locale: CMCENUtils.getCurrentLocale(),
        hourCycle: "h23",
        onInput: ({ date: selectedDate, time: selectedTime }) => {
          input.value = selectedDate
            ? `${selectedDate}T${selectedTime || "00:00"}`
            : "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        },
      });
      const trigger = picker.querySelector(".cmcen-date-time-trigger");
      trigger.classList.add("cmcen-control");
      trigger.setAttribute("aria-labelledby", `banner-${name}-label`);
      input.parentElement.append(picker);
      datePickers.set(name, picker);
    }
    function createGroup(key) {
      const group = document.createElement("fieldset");
      group.className = "banner-field-group cmcen-field-group";
      const legend = document.createElement("legend");
      legend.dataset.i18n = key;
      legend.textContent = t(key);
      group.append(legend);
      inputs.append(group);
      return group;
    }
    function createField(name, key, type, options) {
      const isDate = type === "datetime-local";
      const label = document.createElement(isDate ? "div" : "label");
      label.className = "cmcen-field";
      if (type === "checkbox") label.classList.add("cmcen-choice");
      if (isDate) {
        label.classList.add("banner-date-field");
        label.dataset.labelKey = key;
      }
      const text = document.createElement("span");
      text.className = "cmcen-field-label";
      text.id = `banner-${name}-label`;
      text.dataset.i18n = key;
      text.textContent = t(key);
      const input = document.createElement(
        type === "textarea" ? "textarea" : options ? "select" : "input",
      );
      input.name = name;
      input.setAttribute("aria-labelledby", text.id);
      if (!isDate && type !== "checkbox") input.className = "cmcen-control";
      input.required = requiredFields.includes(name);
      if (type === "textarea") {
        input.rows = 3;
        input.maxLength = 600;
      } else if (!options) input.type = isDate ? "hidden" : type;
      if (name === "title") {
        input.maxLength = 120;
      }
      if (type === "number") input.step = "1";
      if (options)
        options.forEach(([value, optionKey]) => {
          const option = document.createElement("option");
          option.value = value;
          option.dataset.i18n = optionKey;
          option.textContent = t(optionKey);
          input.append(option);
        });
      label.append(text, input);
      if (name === "title") {
        const hint = document.createElement("span");
        hint.className = "cmcen-field-help";
        hint.id = "banner-title-help";
        hint.dataset.i18n = "admin_next_banner_name_help";
        hint.textContent = t(hint.dataset.i18n);
        input.setAttribute("aria-describedby", hint.id);
        label.append(hint);
      }
      const error = document.createElement("span");
      error.className = "cmcen-field-error";
      error.id = `banner-${name}-error`;
      label.append(error);
      fieldGroup.append(label);
      if (isDate) {
        mountPicker(name, key);
      }
    }
    inputs.replaceChildren();
    fieldGroup = createGroup("admin_next_content_group");
    createField("title", "admin_next_banner_name", "text");
    createField("textEn", "timers_field_english_text", "textarea");
    createField("textFr", "timers_field_french_text", "textarea");
    fieldGroup = createGroup("admin_next_display_group");
    createField("color", "timers_field_background_color", "color");
    createField("textColor", "timers_field_text_color", "color");
    createField("icon", "admin_next_banner_icon", "select", [
      ["none", "admin_next_icon_none"],
      ["info", "admin_next_icon_info"],
      ["warning", "admin_next_icon_warning"],
    ]);
    createField("placement", "timers_field_placement", "select", [
      ["global", "timers_placement_global"],
      ["home", "timers_placement_home_only"],
    ]);
    createField("screenPosition", "admin_next_position", "select", [
      ["header", "timers_position_top"],
      ["below-header", "timers_position_below_header"],
    ]);
    createField("scrolling", "admin_next_scrolling", "checkbox");
    createField("dismissible", "admin_next_dismissible", "checkbox");
    createField("order", "timers_field_display_order", "number");
    const timingGroup = createGroup("admin_next_timing_group");
    fieldGroup = timingGroup;
    createField("enabled", "admin_next_enabled_now", "checkbox");
    createField("scheduleEnabled", "admin_next_schedule_toggle", "checkbox");
    const scheduleFields = document.createElement("div");
    scheduleFields.className = "banner-date-fields";
    timingGroup.append(scheduleFields);
    fieldGroup = scheduleFields;
    createField("startsAt", "admin_next_start", "datetime-local");
    createField("endsAt", "admin_next_end_optional", "datetime-local");
    fieldGroup = timingGroup;
    createField("countdownEnabled", "admin_next_countdown_toggle", "checkbox");
    const countdownFields = document.createElement("div");
    countdownFields.className = "banner-date-fields";
    timingGroup.append(countdownFields);
    fieldGroup = countdownFields;
    createField(
      "countdownAt",
      "timers_field_countdown_target",
      "datetime-local",
    );

    function updateTiming() {
      const scheduled = field("scheduleEnabled").checked;
      const countdown = field("countdownEnabled").checked;
      const delivering = scheduled || field("enabled").checked;
      scheduleFields.hidden = !delivering;
      countdownFields.hidden = !countdown;
      field("startsAt").disabled = !scheduled;
      field("startsAt").required = scheduled;
      field("startsAt").closest(".banner-date-field").hidden = !scheduled;
      field("endsAt").disabled = !delivering;
      field("countdownAt").disabled = !countdown;
      field("countdownAt").required = countdown;
    }

    function renderPreview() {
      window.clearInterval(previewInterval);
      if (form.hidden) return;
      const data = payload(form);
      const banner = window.CMCENBannerView.create(data);
      // Typing in the editor must not announce the entire preview on each key.
      banner.removeAttribute("role");
      preview.replaceChildren(banner);
      restorePreview.hidden = true;
      if (data.countdownAt) {
        previewInterval = window.setInterval(() => {
          if (!document.hidden && !root.hidden)
            window.CMCENBannerView.updateCountdowns(preview);
        }, 1000);
      }
    }
    listen(restorePreview, "click", () => {
      renderPreview();
      preview.querySelector(".site-timer-dismiss")?.focus();
    });
    listen(preview, "click", (event) => {
      if (!event.target.closest(".site-timer-dismiss")) return;
      window.clearInterval(previewInterval);
      preview.replaceChildren();
      restorePreview.hidden = false;
      restorePreview.focus();
    });
    function renderList() {
      list.replaceChildren();
      if (selected && !selected._id) {
        const draft = createListRow({ ...payload(form), _id: "" }, true);
        list.append(draft);
      }
      if (!timers.length && !selected) {
        const p = document.createElement("p");
        p.textContent = t("timers_empty");
        list.append(p);
      }
      timers.forEach((timer) => list.append(createListRow(timer)));
      refreshStatuses();
    }
    function createListRow(timer, isDraft = false) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.id = timer._id;
      if (!isDraft) {
        button.setAttribute("aria-describedby", "bannerStatusHelp");
        button.title = t("admin_next_banner_status_help");
      }
      if (isDraft) button.dataset.draft = "true";
      button.disabled = busy || forbidden;
      if (isDraft || timer._id === selected?._id)
        button.setAttribute("aria-current", "true");
      const title = document.createElement("strong");
      title.textContent = timer.title || t("timers_untitled");
      const badge = document.createElement("span");
      badge.className = "banner-status-badge";
      badge.dataset.status = isDraft ? "draft" : getBannerStatus(timer);
      badge.textContent = t(`admin_next_banner_${badge.dataset.status}`);
      const placement = document.createElement("span");
      placement.className = "banner-list-placement";
      placement.dataset.placement =
        timer.placement === "home" ? "home" : "global";
      placement.textContent = t(
        timer.placement === "home"
          ? "timers_placement_home"
          : "timers_placement_global",
      );
      const schedule = document.createElement("span");
      schedule.className = "banner-list-schedule";
      if (isDraft) schedule.textContent = t("admin_next_banner_not_saved");
      else schedule.textContent = scheduleText(timer);
      const metadata = document.createElement("span");
      metadata.className = "banner-list-meta";
      metadata.append(badge, placement);
      button.append(title, metadata, schedule);
      return button;
    }
    function refreshStatuses() {
      window.clearTimeout(statusTimeout);
      if (disposed) return;
      const now = Date.now();
      if (selected?._id && !busy && !dirty()) {
        setDeliveryChoice(form, getBannerStatus(selected, now));
        updateTiming();
        baseline = snapshot();
        updateEditorState();
      }
      list.querySelectorAll("button[data-id]").forEach((button) => {
        const timer = timers.find((item) => item._id === button.dataset.id);
        if (!timer) return;
        const badge = button.querySelector(".banner-status-badge");
        badge.dataset.status = getBannerStatus(timer, now);
        badge.textContent = t(`admin_next_banner_${badge.dataset.status}`);
        button.querySelector(".banner-list-schedule").textContent =
          scheduleText(timer, now);
      });
      const next = nextStatusChange(timers, now);
      if (!document.hidden && next !== null) {
        statusTimeout = window.setTimeout(
          refreshStatuses,
          Math.min(next - now, 2147483647),
        );
      }
    }
    function updateDraftRow() {
      const draft = list.querySelector('[data-draft="true"]');
      if (!draft) return;
      draft.querySelector("strong").textContent =
        field("title").value.trim() || t("timers_untitled");
      const placement = draft.querySelector(".banner-list-placement");
      placement.dataset.placement = field("placement").value;
      placement.textContent = t(
        field("placement").value === "home"
          ? "timers_placement_home"
          : "timers_placement_global",
      );
    }
    function select(timer, focus = false) {
      window.CMCENForms.clearErrors(form);
      validationAttempted = false;
      selected = timer;
      form.hidden = !timer;
      empty.hidden = Boolean(timer);
      if (!timer) window.clearInterval(previewInterval);
      if (timer) {
        for (const name of [
          "title",
          "color",
          "textColor",
          "placement",
          "screenPosition",
          "order",
        ])
          field(name).value = timer[name] ?? "";
        field("textEn").value = timer.text?.en || "";
        field("textFr").value = timer.text?.fr || "";
        field("icon").value = timer.icon || "warning";
        setDeliveryChoice(form, getBannerStatus(timer));
        field("scrolling").checked = timer.scrolling === true;
        field("dismissible").checked = timer.dismissible !== false;
        field("countdownEnabled").checked = Boolean(timer.countdownAt);
        dateFields.forEach((name) => {
          field(name).value = CMCENUtils.toLocalDateTimeInput(timer[name]);
          const [date, time] = field(name).value.split("T");
          datePickers.get(name).setValue({ date, time });
        });
        dateFields.forEach((name) => field(name).setCustomValidity(""));
        requiredFields.forEach((name) => field(name).setCustomValidity(""));
        updateTiming();
        remove.hidden = !timer._id;
        baseline = snapshot();
        renderPreview();
        if (focus) field("title").focus();
      }
      updateEditorState();
      renderList();
    }
    async function load() {
      retry.hidden = true;
      setBusy(true);
      message("timers_loading");
      try {
        const data = await api("/api/admin/timers");
        if (disposed) return;
        if (!Array.isArray(data.timers))
          throw new Error("Invalid banners response");
        timers = data.timers;
        loaded = true;
        select(timers[0] || null);
        message("");
      } catch (error) {
        fail(error, "timers_load_error");
        retry.hidden = error.status === 403;
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    listen(retry, "click", load);
    listen(list, "click", async (event) => {
      const button = event.target.closest("button[data-id]");
      if (!button || busy || forbidden) return;
      if (
        button.dataset.draft === "true" ||
        button.dataset.id === selected?._id
      ) {
        field("title").focus();
        return;
      }
      if (!(await canLeave())) return;
      select(
        timers.find((timer) => timer._id === button.dataset.id),
        true,
      );
      message("");
    });
    listen(add, "click", async () => {
      if (!(await canLeave()) || forbidden) return;
      select(
        {
          title: t("timers_new_title"),
          text: { en: "", fr: "" },
          color: "#202642",
          textColor: "#ffffff",
          placement: "global",
          screenPosition: "header",
          enabled: false,
          dismissible: false,
          icon: "none",
          order: 0,
        },
        true,
      );
      message("");
    });
    listen(form, "input", (event) => {
      if (
        event.target.name === "enabled" ||
        event.target.name === "scheduleEnabled"
      ) {
        setDeliveryChoice(
          form,
          event.target.checked
            ? event.target.name === "enabled"
              ? "enabled"
              : "scheduled"
            : "disabled",
        );
        if (
          event.target.checked &&
          new Date(field("endsAt").value).getTime() < Date.now()
        ) {
          field("endsAt").value = "";
          datePickers.get("endsAt").setValue({ date: "", time: "" });
        }
      }
      updateTiming();
      requiredFields.forEach((name) => field(name).setCustomValidity(""));
      field("endsAt").setCustomValidity("");
      field("startsAt").setCustomValidity("");
      renderPreview();
      updateDraftRow();
      updateEditorState();
      if (validationAttempted) validateEditor(false);
    });
    listen(form, "submit", async (event) => {
      event.preventDefault();
      if (busy || forbidden || !selected) return;
      validationAttempted = true;
      if (!validateEditor()) return;
      const body = payload(form);
      const id = selected._id;
      setBusy(true, "save");
      message("timers_saving");
      try {
        const data = await api(
          id
            ? `/api/admin/timers/${encodeURIComponent(id)}`
            : "/api/admin/timers",
          { method: id ? "PATCH" : "POST", body },
        );
        if (disposed) return;
        if (!data.timer?._id) throw new Error("Invalid saved banner");
        timers = id
          ? timers.map((timer) => (timer._id === id ? data.timer : timer))
          : [...timers, data.timer];
        timers.sort(
          (a, b) =>
            a.order - b.order ||
            String(b.createdAt).localeCompare(String(a.createdAt)),
        );
        select(data.timer);
        message("");
        CMCENUtils.showToast(t(id ? "timers_saved" : "timers_created"), {
          color: "success",
        });
      } catch (error) {
        fail(error, "admin_next_banner_save_error");
      } finally {
        if (!disposed) {
          setBusy(false);
          save.focus();
        }
      }
    });
    listen(remove, "click", async () => {
      if (busy || forbidden || !selected?._id || confirming) return;
      const id = selected._id;
      confirming = true;
      let confirmed;
      try {
        confirmed = await window.CMCENModal.confirm(
          t("timers_delete_confirm", { title: selected.title }),
          { confirmText: t("admin_delete"), destructive: true },
        );
      } finally {
        confirming = false;
      }
      if (!confirmed || disposed || busy || forbidden || selected?._id !== id)
        return;
      setBusy(true, "delete");
      message("admin_next_deleting");
      try {
        await api(`/api/admin/timers/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (disposed) return;
        timers = timers.filter((timer) => timer._id !== id);
        select(timers[0] || null);
        message("");
        CMCENUtils.showToast(t("timers_deleted"), { color: "success" });
      } catch (error) {
        fail(error, "timers_delete_error");
      } finally {
        if (!disposed) {
          setBusy(false);
          add.focus();
        }
      }
    });
    listen(document, "languagechange", () => {
      dateFields.forEach((name) =>
        mountPicker(name, field(name).parentElement.dataset.labelKey),
      );
      renderList();
      renderPreview();
      message(statusKey, feedback.dataset.error === "true");
      updateEditorState();
      setBusy(busy, operation);
      if (validationAttempted && !busy) validateEditor(false);
    });
    listen(document, "visibilitychange", refreshStatuses);
    listen(window, "focus", refreshStatuses);
    form.hidden = true;
    empty.hidden = true;
    list.replaceChildren();
    load();
    return {
      canLeave,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || dirty(),
      dispose() {
        disposed = true;
        window.clearTimeout(statusTimeout);
        window.clearInterval(previewInterval);
        events.abort();
        datePickers.forEach((picker) => picker.destroy());
        inputs.replaceChildren();
        form.hidden = true;
        list.replaceChildren();
      },
    };
  }
  window.DashboardNextBanners = Object.freeze({
    mount,
    payload,
    validate,
    getBannerStatus,
    nextStatusChange,
    scheduleText,
    setDeliveryChoice,
  });
})();
