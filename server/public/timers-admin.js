const timersAdminToken = CMCENUtils.requireAuthToken();
const timersAdminStatus = document.getElementById("timersAdminStatus");
const timersAdminPage = document.getElementById("timersAdminPage");
const timersAdminContent = document.getElementById("timersAdminContent");

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

function showTimersLoading(message = "Loading banners...") {
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

function timersApi(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: timersAdminToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: "Please sign in again."
  });
}

function getSelectedTimer() {
  return timersState.timers.find(timer => String(timer._id) === String(timersState.selectedTimerId)) ||
    timersState.timers[0] ||
    null;
}

function toDateTimeLocal(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  return value ? new Date(value).toISOString() : "";
}

function toDateValue(value) {
  return toDateTimeLocal(value).slice(0, 10);
}

function toTimeValue(value) {
  return toDateTimeLocal(value).slice(11, 16);
}

function fromDateAndTime(dateValue, timeValue) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T${timeValue || "00:00"}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeHexColor(value, fallback) {
  if (window.CMCENColorPicker?.normalize) {
    return window.CMCENColorPicker.normalize(value, fallback);
  }

  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/iu.test(color) ? color.toLowerCase() : fallback.toLowerCase();
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
  add.textContent = "New banner";
  add.disabled = timersState.isSaving;
  add.addEventListener("click", createTimer);
  actions.append(add);

  const list = document.createElement("div");
  list.className = "timers-admin-list";

  if (!timersState.timers.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty-state";
    empty.textContent = "No banners yet.";
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
      title.textContent = timer.title || "Untitled banner";

      const meta = document.createElement("span");
      meta.textContent = `${timer.enabled ? "Enabled" : "Disabled"} · ${timer.placement === "home" ? "Home page" : "Global"} · ${timer.screenPosition === "below-header" ? "Below header" : "Top of screen"}`;

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
      date: toDateValue(value),
      time: toTimeValue(value),
      label: name === "countdownAt" ? "Countdown target" : "Banner date and time",
      placeholder: "Select date and time"
    });
  }

  const input = document.createElement("input");
  input.name = `${name}Date`;
  input.type = "date";
  input.value = toDateValue(value);
  return input;
}

function createColorInput(name, value, fallback) {
  return window.CMCENColorPicker.create({
    name,
    value,
    fallback,
    label: name === "textColor" ? "Text color" : "Background color"
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
  text.textContent = timer.text?.en || timer.title || "Countdown";
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
    empty.textContent = "Create a banner to begin.";
    form.append(empty);
    return form;
  }

  const previewSlot = document.createElement("div");
  previewSlot.className = "timers-preview-slot";
  previewSlot.append(createTimerPreview(timer));

  form.append(
    previewSlot,
    createField("Admin title", createTextInput("title", timer.title)),
    createField("English text", createTextarea("textEn", timer.text?.en || "")),
    createField("French text", createTextarea("textFr", timer.text?.fr || "")),
    createField("Background color", createColorInput("color", timer.color, "#1d4ed8")),
    createField("Text color", createColorInput("textColor", timer.textColor, "#ffffff")),
    createField("Start date", createDateInput("startsAt", timer.startsAt)),
    createField("End date", createDateInput("endsAt", timer.endsAt)),
    createField("Countdown target", createDateInput("countdownAt", timer.countdownAt))
  );

  const placement = document.createElement("select");
  placement.name = "placement";
  [
    ["global", "Global"],
    ["home", "Home page only"]
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    placement.append(option);
  });
  placement.value = timer.placement || "global";
  form.append(createField("Placement", placement));

  form.append(createField(
    "Below sticky header",
    createToggle("belowHeader", timer.screenPosition === "below-header")
  ));

  form.append(createField("Enabled", createToggle("enabled", timer.enabled !== false)));

  const order = document.createElement("input");
  order.name = "order";
  order.type = "number";
  order.step = "1";
  order.value = String(timer.order || 0);
  form.append(createField("Display order", order));

  form.addEventListener("input", () => {
    const previewTimer = {
      ...timer,
      text: {
        en: form.elements.textEn?.value || "",
        fr: form.elements.textFr?.value || ""
      },
      title: form.elements.title?.value || "",
      color: normalizeHexColor(form.elements.color?.value, "#1d4ed8"),
      textColor: normalizeHexColor(form.elements.textColor?.value, "#ffffff"),
      countdownAt: fromDateAndTime(form.elements.countdownAtDate?.value, form.elements.countdownAtTime?.value)
    };

    previewSlot.replaceChildren(createTimerPreview(previewTimer));
  });

  const actions = document.createElement("div");
  actions.className = "pages-editor-actions";

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "admin-work-zone-button is-primary";
  save.textContent = timersState.isSaving ? "Saving..." : "Save banner";
  save.disabled = timersState.isSaving;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "admin-work-zone-button is-danger";
  remove.textContent = "Delete";
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
    startsAt: fromDateAndTime(formData.get("startsAtDate"), formData.get("startsAtTime")),
    endsAt: fromDateAndTime(formData.get("endsAtDate"), formData.get("endsAtTime")),
    countdownAt: fromDateAndTime(formData.get("countdownAtDate"), formData.get("countdownAtTime")),
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
      errorMessage: "Could not load banners"
    });
    const timers = data.timers || [];

    setTimersState({
      timers,
      selectedTimerId: timersState.selectedTimerId || timers[0]?._id || "",
      message: ""
    });
    showTimersPage();
  } catch (error) {
    setTimersStatus(error.message || "Could not load banners", "error");
  }
}

async function createTimer() {
  setTimersState({ isSaving: true, message: "" });

  try {
    const data = await timersApi("/api/admin/timers", {
      method: "POST",
      body: {
        title: "New banner",
        text: { en: "Countdown", fr: "Compte à rebours" }
      },
      errorMessage: "Could not create banner"
    });

    await loadTimers();
    reloadVisibleBanners();
    setTimersState({
      selectedTimerId: data.timer?._id || "",
      isSaving: false,
      message: "Banner created."
    });
  } catch (error) {
    setTimersState({
      isSaving: false,
      message: error.message || "Could not create banner"
    });
  }
}

async function saveTimer(timer, form) {
  setTimersState({ isSaving: true, message: "" });

  try {
    const data = await timersApi(`/api/admin/timers/${encodeURIComponent(timer._id)}`, {
      method: "PATCH",
      body: getTimerPayload(form),
      errorMessage: "Could not save banner"
    });
    const nextTimers = timersState.timers.map(item =>
      String(item._id) === String(timer._id) ? data.timer : item
    );

    setTimersState({
      timers: nextTimers,
      selectedTimerId: data.timer?._id || timer._id,
      isSaving: false,
      message: "Banner saved."
    });
    reloadVisibleBanners();
  } catch (error) {
    setTimersState({
      isSaving: false,
      message: error.message || "Could not save banner"
    });
  }
}

async function deleteTimer(timer) {
  if (!window.confirm(`Delete "${timer.title || "this banner"}"? This will be recorded in the audit log.`)) {
    return;
  }

  setTimersState({ isSaving: true, message: "" });

  try {
    await timersApi(`/api/admin/timers/${encodeURIComponent(timer._id)}`, {
      method: "DELETE",
      errorMessage: "Could not delete banner"
    });

    const nextTimers = timersState.timers.filter(item => String(item._id) !== String(timer._id));
    setTimersState({
      timers: nextTimers,
      selectedTimerId: nextTimers[0]?._id || "",
      isSaving: false,
      message: "Banner deleted."
    });
    reloadVisibleBanners();
  } catch (error) {
    setTimersState({
      isSaving: false,
      message: error.message || "Could not delete banner"
    });
  }
}

async function initializeTimersAdmin() {
  showTimersLoading();

  try {
    const user = await timersApi("/api/me", {
      errorMessage: "Could not verify your account"
    });

    if (user.permissions?.canManageTimers !== true) {
      window.location.href = "/dashboard";
      return;
    }

    window.updateAdminWorkZoneTabsForUser(user);
    await loadTimers();
  } catch (error) {
    setTimersStatus(error.message || "Could not load banners", "error");
  }
}

if (timersAdminToken) {
  initializeTimersAdmin();
} else {
  setTimersStatus("Sign in to continue.");
}
