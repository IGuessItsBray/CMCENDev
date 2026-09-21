"use strict";

(() => {
  const t = (key, replacements) => window.translate(key, replacements);

  function validationMessage(control) {
    const validity = control.validity;
    if (validity.customError) return control.validationMessage;
    if (validity.valueMissing) {
      return t(
        control.tagName === "SELECT"
          ? "validation_select_required"
          : ["checkbox", "radio"].includes(control.type)
            ? "validation_choice_required"
            : "validation_field_required",
      );
    }
    if (validity.typeMismatch && ["email", "url"].includes(control.type))
      return t(`validation_${control.type}_invalid`);
    if (validity.patternMismatch) return t("validation_pattern_mismatch");
    if (validity.rangeUnderflow)
      return t("validation_range_underflow", { min: control.min });
    if (validity.rangeOverflow)
      return t("validation_range_overflow", { max: control.max });
    if (validity.tooShort)
      return t("validation_too_short", { min: control.minLength });
    if (validity.tooLong)
      return t("validation_too_long", { max: control.maxLength });
    return t("validation_invalid_value");
  }

  function setError(control, message) {
    const error = control
      .closest(".cmcen-field")
      ?.querySelector(".cmcen-field-error");
    if (!error) throw new Error("A shared form field needs an error element.");
    error.textContent = message;
    const descriptions = new Set(
      (control.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter(Boolean),
    );
    if (message) {
      control.setAttribute("aria-invalid", "true");
      descriptions.add(error.id);
    } else {
      control.removeAttribute("aria-invalid");
      descriptions.delete(error.id);
    }
    if (descriptions.size)
      control.setAttribute("aria-describedby", [...descriptions].join(" "));
    else control.removeAttribute("aria-describedby");
  }

  function clearErrors(form) {
    form
      .querySelectorAll(".cmcen-field [aria-invalid='true']")
      .forEach((control) => setError(control, ""));
  }

  // Pages supply business-rule errors, including a visible target for custom pickers.
  // This helper only presents errors; it never submits, saves, or changes field values.
  function validate(form, { errors = [], focus = true } = {}) {
    clearErrors(form);
    const invalid = Array.from(form.elements)
      .filter((control) => control.willValidate && !control.validity.valid)
      .map((control) => ({ control, message: validationMessage(control) }));
    invalid.push(
      ...errors.filter(
        ({ control, message }) => message && !control.matches(":disabled"),
      ),
    );
    invalid.forEach(({ control, message }) => setError(control, message));
    if (focus && invalid.length)
      window.CMCENUtils.focusInvalidField(
        form.querySelector("[aria-invalid='true']"),
      );
    return invalid.length === 0;
  }

  function createField({
    id,
    name,
    label,
    labelKey,
    type = "text",
    options,
    ...attributes
  }) {
    const field = document.createElement("label");
    field.className = "cmcen-field";
    const title = document.createElement("span");
    title.id = `${id}-label`;
    title.className = "cmcen-field-label";
    title.textContent = labelKey ? t(labelKey) : label;
    if (labelKey) title.dataset.i18n = labelKey;
    const control = document.createElement(
      options ? "select" : type === "textarea" ? "textarea" : "input",
    );
    control.id = id;
    control.name = name;
    control.setAttribute("aria-labelledby", title.id);
    control.className = "cmcen-control";
    if (!options && type !== "textarea") control.type = type;
    for (const option of options || []) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.labelKey ? t(option.labelKey) : option.label;
      if (option.labelKey) node.dataset.i18n = option.labelKey;
      control.append(node);
    }
    Object.assign(control, attributes);
    const error = document.createElement("span");
    error.id = `${id}-error`;
    error.className = "cmcen-field-error";
    field.append(title, control, error);
    return { field, control };
  }

  window.CMCENForms = Object.freeze({
    validate,
    clearErrors,
    setError,
    createField,
  });
})();
