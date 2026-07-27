(function () {
  "use strict";

  const localizedMessages = new WeakMap();
  const controlSelector = "input, select, textarea";

  function t(key, replacements = {}) {
    return typeof window.translate === "function"
      ? window.translate(key, replacements)
      : key;
  }

  function isValidatable(control) {
    return (
      control &&
      typeof control.checkValidity === "function" &&
      control.willValidate
    );
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }

  function getValidationMessage(control) {
    const validity = control.validity;

    if (validity.valueMissing) {
      if (control.tagName === "SELECT") {
        return t("validation_select_required");
      }

      if (control.type === "checkbox" || control.type === "radio") {
        return t("validation_choice_required");
      }

      return t("validation_field_required");
    }

    if (validity.typeMismatch) {
      if (control.type === "email") {
        return t("validation_email_invalid");
      }

      if (control.type === "url") {
        return t("validation_url_invalid");
      }
    }

    if (validity.patternMismatch) {
      return t("validation_pattern_mismatch");
    }

    if (validity.rangeUnderflow) {
      return t("validation_range_underflow", { min: control.min });
    }

    if (validity.rangeOverflow) {
      return t("validation_range_overflow", { max: control.max });
    }

    if (validity.tooShort) {
      return t("validation_too_short", { min: control.minLength });
    }

    if (validity.tooLong) {
      return t("validation_too_long", { max: control.maxLength });
    }

    if (validity.badInput || validity.stepMismatch) {
      return t("validation_invalid_value");
    }

    return "";
  }

  function syncControl(control) {
    if (!isValidatable(control)) {
      return;
    }

    const previousMessage = localizedMessages.get(control);
    const hasExternalCustomMessage =
      control.validity.customError &&
      (!previousMessage || control.validationMessage !== previousMessage);

    if (hasExternalCustomMessage) {
      localizedMessages.delete(control);
      return;
    }

    const nextMessage = getValidationMessage(control);

    if (nextMessage) {
      control.setCustomValidity(nextMessage);
      localizedMessages.set(control, nextMessage);
      return;
    }

    if (
      previousMessage &&
      control.validity.customError &&
      control.validationMessage === previousMessage
    ) {
      control.setCustomValidity("");
    }

    localizedMessages.delete(control);
  }

  function syncRadioGroup(control) {
    if (control?.type !== "radio" || !control.name) {
      return;
    }

    const form = control.form || document;
    const radios = form.querySelectorAll(
      `input[type="radio"][name="${cssEscape(control.name)}"]`,
    );

    radios.forEach(syncControl);
  }

  function syncControls(root = document) {
    if (root.matches?.(controlSelector)) {
      syncControl(root);
      syncRadioGroup(root);
      return;
    }

    root.querySelectorAll?.(controlSelector).forEach((control) => {
      syncControl(control);
      syncRadioGroup(control);
    });
  }

  document.addEventListener(
    "invalid",
    (event) => {
      syncControl(event.target);
      syncRadioGroup(event.target);
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      syncControl(event.target);
      syncRadioGroup(event.target);
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      syncControl(event.target);
      syncRadioGroup(event.target);
      syncControls(document);
    },
    true,
  );

  document.addEventListener("languagechange", () => {
    syncControls(document);
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        syncControl(mutation.target);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          syncControls(node);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "disabled",
      "max",
      "maxlength",
      "min",
      "minlength",
      "pattern",
      "required",
      "type",
    ],
  });

  window.refreshLocalizedValidationMessages = () => {
    syncControls(document);
  };

  syncControls(document);
})();
