const timersAdminToken = CMCENUtils.requireAuthToken();
const timersAdminStatus = document.getElementById("timersAdminStatus");
const timersAdminPage = document.getElementById("timersAdminPage");
const timersAdminContent = document.getElementById("timersAdminContent");
const t = translate;

let timersState = {
  timers: [],
  selectedTimerId: "",
  message: "",
  isSaving: false
};

function setTimersStatus(message, state = "") {
  CMCENUtils.setStatusMessage(timersAdminStatus, message, state);
  timersAdminPage.hidden = true;
}

function showTimersLoading(message = t("timers_loading")) {
  CMCENUtils.setStatusLoading(timersAdminStatus, message);
  timersAdminPage.hidden = true;
}

function showTimersPage() {
  timersAdminStatus.hidden = true;
  timersAdminStatus.removeAttribute("aria-label");
  timersAdminPage.hidden = false;
}

function setTimersState(nextState) {
  timersState = {
    ...timersState,
    ...nextState
  };
  renderTimersAdmin();
}

function showTimerToast(message, color = "info") {
  CMCENUtils.showToast(message, {
    color,
    position: "bottom-right",
    animation: "slide"
  });
}

function timersApi(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: timersAdminToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: t("timers_sign_in_again")
  });
}

function getSelectedTimer() {
  return timersState.timers.find(timer => String(timer._id) === String(timersState.selectedTimerId)) ||
    timersState.timers[0] ||
    null;
}

function createMessage() {
  const message = document.createElement("p");
  message.className = "admin-work-zone-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = !timersState.message;
  message.textContent = timersState.message;

  return message;
}

function createTimerList() {
  const panel = document.createElement("aside");
  panel.className = "timers-admin-list-panel";

  const actions = document.createElement("div");
  actions.className = "timers-admin-list-actions";

  const add = document.createElement("button");
  add.type = "button";
  add.className = "admin-work-zone-button is-primary";
  add.textContent = t("timers_new");
  add.disabled = timersState.isSaving;
  add.addEventListener("click", createTimer);
  actions.append(add);

  const list = document.createElement("div");
  list.className = "timers-admin-list";

  if (!timersState.timers.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = t("timers_empty");
    list.append(empty);
  } else {
    timersState.timers.forEach(timer => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "timers-admin-row";
      button.classList.toggle("is-selected", String(timer._id) === String(getSelectedTimer()?._id));
      button.addEventListener("click", () => {
        setTimersState({ selectedTimerId: timer._id, message: "" });
      });

      const title = document.createElement("strong");
      title.textContent = timer.title || t("timers_untitled");

      const meta = document.createElement("span");
      meta.textContent = [
        timer.enabled ? t("timers_status_enabled") : t("timers_status_disabled"),
        timer.placement === "home" ? t("timers_placement_home") : t("timers_placement_global"),
        timer.screenPosition === "below-header"
          ? t("timers_position_below_header")
          : t("timers_position_top")
      ].join(" · ");

      button.append(title, meta);
      list.append(button);
    });
  }

  panel.append(actions, list);
  return panel;
}

function createField(labelText, input) {
  const label = document.createElement("label");
  label.className = "timers-editor-field";

  const span = document.createElement("span");
  span.textContent = labelText;

  label.append(span, input);
  return label;
}

function createTextInput(name, value = "") {
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  return input;
}

function createTextarea(name, value = "") {
  const input = document.createElement("textarea");
  input.name = name;
  input.rows = 3;
  input.value = value || "";
  return input;
}

function createDateInput(name, value = "") {
  if (window.CMCENDateTimePicker?.create) {
    return window.CMCENDateTimePicker.create({
      name,
      date: CMCENUtils.toLocalDateInput(value),
      time: CMCENUtils.toLocalTimeInput(value),
      label: name === "countdownAt"
        ? t("timers_field_countdown_target")
        : t("timers_date_time_label"),
      placeholder: t("timers_date_time_placeholder"),
      timeLabel: t("timers_picker_time"),
      clearLabel: t("timers_picker_clear"),
      doneLabel: t("timers_picker_done"),
      locale: CMCENUtils.getCurrentLocale()
    });
  }

  const input = document.createElement("input");
  input.name = `${name}Date`;
  input.type = "date";
  input.value = CMCENUtils.toLocalDateInput(value);
  return input;
}

function createColorInput(name, value, fallback) {
  return window.CMCENColorPicker.create({
    name,
    value,
    fallback,
    label: name === "textColor"
      ? t("timers_field_text_color")
      : t("timers_field_background_color"),
    sectionLabels: {
      light: t("timers_picker_light_theme"),
      dark: t("timers_picker_dark_theme"),
      rgb: t("timers_picker_rgb")
    }
  });
}

function createToggle(name, checked) {
  const input = document.createElement("input");
  input.name = name;
  input.type = "checkbox";
  input.checked = checked;
  return input;
}

function formatPreviewCountdown(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const totalSeconds = Math.max(Math.floor((date.getTime() - Date.now()) / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function createTimerPreview(timer) {
  const preview = document.createElement("div");
  preview.className = "timers-editor-preview";
  preview.style.setProperty("--timer-background", timer.color || "#1d4ed8");
  preview.style.setProperty("--timer-text", timer.textColor || "#ffffff");

  const text = document.createElement("span");
  text.textContent = CMCENUtils.getLocalizedText(timer.text) || timer.title || t("timers_preview_fallback");
  preview.append(text);

  const countdown = formatPreviewCountdown(timer.countdownAt);
  if (countdown) {
    const chip = document.createElement("strong");
    chip.textContent = countdown;
    preview.append(chip);
  }

  return preview;
}

function createTimerEditor() {
  const timer = getSelectedTimer();
  const form = document.createElement("form");
  form.className = "timers-admin-editor";

  if (!timer) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = t("timers_editor_empty");
    form.append(empty);
    return form;
  }

  const previewSlot = document.createElement("div");
  previewSlot.className = "timers-preview-slot";
  previewSlot.append(createTimerPreview(timer));

  form.append(
    previewSlot,
    createField(t("timers_field_admin_title"), createTextInput("title", timer.title)),
    createField(t("timers_field_english_text"), createTextarea("textEn", timer.text?.en || "")),
    createField(t("timers_field_french_text"), createTextarea("textFr", timer.text?.fr || "")),
    createField(t("timers_field_background_color"), createColorInput("color", timer.color, "#1d4ed8")),
    createField(t("timers_field_text_color"), createColorInput("textColor", timer.textColor, "#ffffff")),
    createField(t("timers_field_start_date"), createDateInput("startsAt", timer.startsAt)),
    createField(t("timers_field_end_date"), createDateInput("endsAt", timer.endsAt)),
    createField(t("timers_field_countdown_target"), createDateInput("countdownAt", timer.countdownAt))
  );

  const placement = document.createElement("select");
  placement.name = "placement";
  [
    ["global", t("timers_placement_global")],
    ["home", t("timers_placement_home_only")]
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    placement.append(option);
  });
  placement.value = timer.placement || "global";
  form.append(createField(t("timers_field_placement"), placement));

  form.append(createField(
    t("timers_field_below_sticky_header"),
    createToggle("belowHeader", timer.screenPosition === "below-header")
  ));

  form.append(createField(t("timers_field_enabled"), createToggle("enabled", timer.enabled !== false)));

  const order = document.createElement("input");
  order.name = "order";
  order.type = "number";
  order.step = "1";
  order.value = String(timer.order || 0);
  form.append(createField(t("timers_field_display_order"), order));

  form.addEventListener("input", () => {
    const previewTimer = {
      ...timer,
      text: {
        en: form.elements.textEn?.value || "",
        fr: form.elements.textFr?.value || ""
      },
      title: form.elements.title?.value || "",
      color: window.CMCENColorPicker.normalize(form.elements.color?.value, "#1d4ed8"),
      textColor: window.CMCENColorPicker.normalize(form.elements.textColor?.value, "#ffffff"),
      countdownAt: CMCENUtils.fromLocalDateAndTime(
        form.elements.countdownAtDate?.value,
        form.elements.countdownAtTime?.value
      )
    };

    previewSlot.replaceChildren(createTimerPreview(previewTimer));
  });

  const actions = document.createElement("div");
  actions.className = "pages-editor-actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = timersState.isSaving ? t("timers_saving") : t("timers_save");
  save.disabled = timersState.isSaving;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = t("admin_delete");
  remove.disabled = timersState.isSaving;
  remove.addEventListener("click", () => deleteTimer(timer));

  actions.append(save, remove);
  form.append(actions);

  form.addEventListener("submit", event => {
    event.preventDefault();
    saveTimer(timer, form);
  });

  return form;
}

function getTimerPayload(form) {
  const formData = new FormData(form);

  return {
    title: formData.get("title"),
    text: {
      en: formData.get("textEn"),
      fr: formData.get("textFr")
    },
    color: formData.get("color"),
    textColor: formData.get("textColor"),
    startsAt: CMCENUtils.fromLocalDateAndTime(
      formData.get("startsAtDate"),
      formData.get("startsAtTime")
    ),
    endsAt: CMCENUtils.fromLocalDateAndTime(
      formData.get("endsAtDate"),
      formData.get("endsAtTime")
    ),
    countdownAt: CMCENUtils.fromLocalDateAndTime(
      formData.get("countdownAtDate"),
      formData.get("countdownAtTime")
    ),
    placement: formData.get("placement"),
    screenPosition: formData.get("belowHeader") === "on" ? "below-header" : "header",
    enabled: formData.get("enabled") === "on",
    order: Number(formData.get("order") || 0)
  };
}

function renderTimersAdmin() {
  const shell = document.createElement("div");
  shell.className = "timers-admin-shell";

  shell.append(createMessage(), createTimerList(), createTimerEditor());
  timersAdminContent.replaceChildren(shell);
}

function reloadVisibleBanners() {
  if (window.CMCENTimers?.reload) {
    window.CMCENTimers.reload();
  }
}

async function loadTimers() {
  try {
    const data = await timersApi("/api/admin/timers", {
      errorMessage: t("timers_load_error")
    });
    const timers = data.timers || [];

    setTimersState({
      timers,
      selectedTimerId: timersState.selectedTimerId || timers[0]?._id || "",
      message: ""
    });
    showTimersPage();
  } catch (error) {
    setTimersStatus(error.message || t("timers_load_error"), "error");
  }
}

async function createTimer() {
  setTimersState({ isSaving: true, message: "" });

  try {
    const data = await timersApi("/api/admin/timers", {
      method: "POST",
      body: {
        title: t("timers_new_title"),
        text: {
          en: t("timers_default_text_en"),
          fr: t("timers_default_text_fr")
        }
      },
      errorMessage: t("timers_create_error")
    });

    await loadTimers();
    reloadVisibleBanners();
    setTimersState({
      selectedTimerId: data.timer?._id || "",
      isSaving: false
    });
    showTimerToast(t("timers_created"), "success");
  } catch (error) {
    setTimersState({
      isSaving: false
    });
    showTimerToast(error.message || t("timers_create_error"), "error");
  }
}

async function saveTimer(timer, form) {
  setTimersState({ isSaving: true, message: "" });

  try {
    const data = await timersApi(`/api/admin/timers/${encodeURIComponent(timer._id)}`, {
      method: "PATCH",
      body: getTimerPayload(form),
      errorMessage: t("timers_save_error")
    });
    const nextTimers = timersState.timers.map(item =>
      String(item._id) === String(timer._id) ? data.timer : item
    );

    setTimersState({
      timers: nextTimers,
      selectedTimerId: data.timer?._id || timer._id,
      isSaving: false
    });
    showTimerToast(t("timers_saved"), "success");
    reloadVisibleBanners();
  } catch (error) {
    setTimersState({
      isSaving: false
    });
    showTimerToast(error.message || t("timers_save_error"), "error");
  }
}

async function deleteTimer(timer) {
  if (!await CMCENModal.confirm(t("timers_delete_confirm", {
    title: timer.title || t("timers_untitled")
  }), {
    title: t("mfa_delete"),
    confirmText: t("mfa_delete"),
    destructive: true
  })) {
    return;
  }

  setTimersState({ isSaving: true, message: "" });

  try {
    await timersApi(`/api/admin/timers/${encodeURIComponent(timer._id)}`, {
      method: "DELETE",
      errorMessage: t("timers_delete_error")
    });

    const nextTimers = timersState.timers.filter(item => String(item._id) !== String(timer._id));
    setTimersState({
      timers: nextTimers,
      selectedTimerId: nextTimers[0]?._id || "",
      isSaving: false
    });
    showTimerToast(t("timers_deleted"), "success");
    reloadVisibleBanners();
  } catch (error) {
    setTimersState({
      isSaving: false
    });
    showTimerToast(error.message || t("timers_delete_error"), "error");
  }
}

async function initializeTimersAdmin() {
  showTimersLoading();

  try {
    const user = await timersApi("/api/me", {
      errorMessage: t("timers_verify_error")
    });

    if (user.permissions?.canManageTimers !== true) {
      window.location.href = "/dashboard";
      return;
    }

    window.updateAdminWorkZoneTabsForUser(user);
    await loadTimers();
  } catch (error) {
    setTimersStatus(error.message || t("timers_load_error"), "error");
  }
}

if (timersAdminToken) {
  initializeTimersAdmin();
} else {
  setTimersStatus(t("sign_in_to_continue"));
}

document.addEventListener("languagechange", () => {
  if (!timersAdminPage.hidden) {
    renderTimersAdmin();
  }
});
