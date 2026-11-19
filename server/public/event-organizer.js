"use strict";

((root, factory) => {
  const organizer = factory();
  if (typeof module === "object" && module.exports) module.exports = organizer;
  else root.CMCENEventOrganizer = organizer;
})(typeof globalThis === "object" ? globalThis : this, () => {
  const presets = Object.freeze(["branch", "association", "foundation", "museum"]);
  const other = "__other__";
  const maxLength = 100;

  function isValid(value, { allowEmpty = false } = {}) {
    if (typeof value !== "string" || /[<>\p{Cc}]/u.test(value)) return false;
    const name = value.trim();
    if (!name) return allowEmpty;
    return name !== other && name.length <= maxLength;
  }

  function initial(value = "") {
    return value && !presets.includes(value) ? other : value || "";
  }

  function resolve(selection, custom, translate = (key) => key) {
    if (selection !== other) return selection || "";
    if (!isValid(custom)) {
      throw new Error(translate("event_organizing_entity_invalid"));
    }
    return custom.trim();
  }

  function label(value, translate) {
    return presets.includes(value) ? translate(`entity_${value}`) : value || "";
  }

  function bind(select, input, container, translate) {
    input.maxLength = maxLength;
    function sync() {
      const enabled = select.value === other;
      container.hidden = !enabled;
      input.disabled = !enabled || select.disabled;
      input.required = enabled && !select.disabled;
      input.setCustomValidity(
        enabled && input.value && !isValid(input.value)
          ? translate("event_organizing_entity_invalid")
          : "",
      );
    }
    function set(value) {
      select.value = initial(value);
      input.value = select.value === other ? value : "";
      sync();
    }
    select.addEventListener("change", sync);
    input.addEventListener("input", sync);
    sync();
    return { set, sync, value: () => resolve(select.value, input.value, translate) };
  }

  return { presets, other, maxLength, isValid, initial, resolve, label, bind };
});
