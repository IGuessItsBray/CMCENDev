(function () {
  const LIGHT_THEME_COLORS = Object.freeze([
    ["Navy 950", "#171c32"],
    ["Navy 900", "#202642"],
    ["Navy 800", "#2c2f55"],
    ["Grey 800", "#5f6772"],
    ["Grey 500", "#969da6"],
    ["Grey 100", "#eef0f2"],
    ["Gold 700", "#a97518"],
    ["Gold 600", "#c58d23"],
    ["Gold 500", "#d59b27"],
    ["Gold 200", "#ead3a3"],
    ["Ink", "#23252b"],
    ["Danger", "#a63c35"],
    ["Success", "#4f7358"],
  ]);

  const DARK_THEME_COLORS = Object.freeze([
    ["Dark bg", "#080d18"],
    ["Surface", "#0d1422"],
    ["Surface 2", "#141b2d"],
    ["Surface 3", "#1d293d"],
    ["Border", "#334155"],
    ["Text", "#e5edf8"],
    ["Text soft", "#b9c4d6"],
    ["Muted", "#94a3b8"],
    ["Link", "#93c5fd"],
    ["Gold", "#facc15"],
    ["Teal", "#2dd4bf"],
    ["Red", "#ef4444"],
  ]);

  const RGB_COLORS = Object.freeze([
    ["Red", "#ef4444"],
    ["Orange", "#f97316"],
    ["Amber", "#f59e0b"],
    ["Yellow", "#eab308"],
    ["Lime", "#84cc16"],
    ["Green", "#22c55e"],
    ["Emerald", "#10b981"],
    ["Teal", "#14b8a6"],
    ["Cyan", "#06b6d4"],
    ["Sky", "#0ea5e9"],
    ["Blue", "#3b82f6"],
    ["Indigo", "#6366f1"],
    ["Violet", "#8b5cf6"],
    ["Purple", "#a855f7"],
    ["Fuchsia", "#d946ef"],
    ["Pink", "#ec4899"],
    ["Rose", "#f43f5e"],
    ["Slate", "#64748b"],
  ]);

  function normalizeColor(value, fallback = "#1d4ed8") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/iu.test(color)
      ? color.toLowerCase()
      : fallback.toLowerCase();
  }

  function createSwatch({ label, value, input, textInput, closePicker }) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "cmcen-color-picker-swatch";
    swatch.style.setProperty("--picker-color", value);
    swatch.title = `${label} ${value}`;
    swatch.setAttribute("aria-label", `${label} ${value}`);

    swatch.addEventListener("click", () => {
      input.value = value;
      textInput.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      closePicker();
    });

    return swatch;
  }

  function createRow(title, colors, input, textInput, closePicker) {
    const row = document.createElement("div");
    row.className = "cmcen-color-picker-row";

    const label = document.createElement("span");
    label.className = "cmcen-color-picker-row-label";
    label.textContent = title;

    const swatches = document.createElement("div");
    swatches.className = "cmcen-color-picker-swatches";
    colors.forEach(([colorLabel, value]) => {
      swatches.append(
        createSwatch({
          label: colorLabel,
          value: normalizeColor(value),
          input,
          textInput,
          closePicker,
        }),
      );
    });

    row.append(label, swatches);
    return row;
  }

  function createColorPicker(options = {}) {
    const name = options.name || "color";
    const fallback = normalizeColor(options.fallback || "#1d4ed8");
    const value = normalizeColor(options.value, fallback);
    const sectionLabels = options.sectionLabels || {};

    const picker = document.createElement("div");
    picker.className = "cmcen-color-picker";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "cmcen-color-picker-preview";
    preview.style.setProperty("--picker-color", value);
    preview.setAttribute("aria-label", options.label || "Choose color");
    preview.setAttribute("aria-expanded", "false");

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.name = `${name}Text`;
    textInput.value = value;
    textInput.maxLength = 7;
    textInput.spellcheck = false;
    textInput.setAttribute("aria-label", options.label || "Color hex value");

    function setColor(nextValue) {
      const color = normalizeColor(nextValue, input.value || fallback);
      input.value = color;
      textInput.value = color;
      preview.style.setProperty("--picker-color", color);
    }

    function setPickerOpen(isOpen) {
      if (isOpen) {
        window.dispatchEvent(
          new CustomEvent("cmcen:picker-open", {
            detail: { picker },
          }),
        );
      }
      picker.classList.toggle("is-open", isOpen);
      preview.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) {
        const previewRect = preview.getBoundingClientRect();
        const width = Math.min(540, window.innerWidth - 24);
        const left = Math.max(
          12,
          Math.min(previewRect.left, window.innerWidth - width - 12),
        );
        popover.style.setProperty("--picker-popover-left", `${left}px`);
        popover.style.setProperty(
          "--picker-popover-top",
          `${previewRect.bottom + 4}px`,
        );
        popover.style.setProperty("--picker-popover-width", `${width}px`);
      }
    }

    textInput.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/iu.test(textInput.value)) {
        setColor(textInput.value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const custom = document.createElement("div");
    custom.className = "cmcen-color-picker-custom";
    custom.append(preview, textInput);

    const popover = document.createElement("div");
    popover.className = "cmcen-color-picker-popover";
    popover.append(
      createRow(
        sectionLabels.light || "Light theme",
        LIGHT_THEME_COLORS,
        input,
        textInput,
        () => setPickerOpen(false),
      ),
      createRow(
        sectionLabels.dark || "Dark theme",
        DARK_THEME_COLORS,
        input,
        textInput,
        () => setPickerOpen(false),
      ),
      createRow(
        sectionLabels.rgb || "RGB",
        RGB_COLORS.slice(0, 9),
        input,
        textInput,
        () => setPickerOpen(false),
      ),
      createRow(
        sectionLabels.rgb || "RGB",
        RGB_COLORS.slice(9),
        input,
        textInput,
        () => setPickerOpen(false),
      ),
    );

    preview.addEventListener("click", (event) => {
      event.stopPropagation();
      setPickerOpen(!picker.classList.contains("is-open"));
    });

    window.addEventListener("resize", () => {
      if (picker.classList.contains("is-open")) {
        setPickerOpen(true);
      }
    });

    window.addEventListener(
      "scroll",
      () => {
        if (picker.classList.contains("is-open")) {
          setPickerOpen(true);
        }
      },
      true,
    );

    picker.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", () => {
      setPickerOpen(false);
    });

    window.addEventListener("cmcen:picker-open", (event) => {
      if (event.detail?.picker !== picker) {
        setPickerOpen(false);
      }
    });

    picker.append(input, custom, popover);

    input.addEventListener("input", () => {
      setColor(input.value);
    });

    return picker;
  }

  window.CMCENColorPicker = {
    create: createColorPicker,
    normalize: normalizeColor,
  };
})();
