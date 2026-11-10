(function () {
  const form = document.getElementById("resetPasswordForm");
  const policy = window.CMCENPasswordPolicy;
  if (!form || !policy) return;

  const password = document.getElementById("newPassword");
  const confirmation = document.getElementById("newPasswordConfirmation");
  const lengthCheck = document.getElementById("resetPasswordLength");
  const byteCheck = document.getElementById("resetPasswordBytes");
  const recommendations = [
    {
      element: document.getElementById("resetPasswordUppercase"),
      pattern: /\p{Lu}/u,
      key: "password_recommendation_uppercase",
      fallback: "Uppercase letter",
    },
    {
      element: document.getElementById("resetPasswordNumber"),
      pattern: /\p{Nd}/u,
      key: "password_recommendation_number",
      fallback: "Number",
    },
    {
      element: document.getElementById("resetPasswordSpecial"),
      pattern: /[\p{P}\p{S}]/u,
      key: "password_recommendation_special",
      fallback: "Special character (e.g. !, #, ?)",
    },
  ];
  const strength = document.getElementById("resetPasswordStrength");
  const strengthText = document.getElementById("resetPasswordStrengthText");
  const match = document.getElementById("resetPasswordMatch");
  const toggles = [
    {
      input: password,
      button: document.getElementById("newPasswordToggle"),
      suffix: "password",
    },
    {
      input: confirmation,
      button: document.getElementById("newPasswordConfirmationToggle"),
      suffix: "password_confirmation",
    },
  ];

  function translate(key, fallback) {
    const value = window.translate?.(key);
    return value && value !== key ? value : fallback;
  }

  function updateToggles() {
    for (const { input, button, suffix } of toggles) {
      const visible = input.type === "text";
      const action = visible ? "hide" : "show";
      const fallback = `${visible ? "Hide" : "Show"} ${suffix.replaceAll("_", " ")}`;
      button.setAttribute(
        "aria-label",
        translate(`${action}_${suffix}`, fallback),
      );
      button.setAttribute("aria-pressed", String(visible));
      button.classList.toggle("is-visible", visible);
    }
  }

  function conceal() {
    for (const { input } of toggles) input.type = "password";
    updateToggles();
  }

  function updateRequirement(element, met, text, hasPassword) {
    const state = !hasPassword ? "pending" : met ? "met" : "unmet";
    const label = translate(
      `password_requirement_${state}`,
      {
        pending: "Required",
        met: "Met",
        unmet: "Not yet met",
      }[state],
    );
    element.dataset.state = state;
    element.textContent = `${label}: ${text}`;
  }

  function update() {
    const value = password.value;
    const requirements = policy.getPasswordRequirements(value);
    updateRequirement(
      lengthCheck,
      requirements.minimumLength,
      translate(
        "password_requirement_length",
        "At least 12 characters ({count})",
      ).replace("{count}", requirements.characterCount),
      !!value,
    );
    updateRequirement(
      byteCheck,
      requirements.maximumBytes,
      translate(
        "password_requirement_bytes",
        "At most 72 UTF-8 bytes ({count})",
      ).replace("{count}", requirements.byteCount),
      !!value,
    );

    const levels = ["empty", "weak", "weak", "fair", "good", "strong"];
    const level = levels[policy.getPasswordStrength(value)];
    const fallback = {
      empty: "Enter a password",
      weak: "Weak",
      fair: "Fair",
      good: "Good",
      strong: "Strong",
    };
    strength.className = `password-strength is-${level}`;
    strengthText.textContent = `${translate("password_strength_estimate", "Estimated strength")}: ${translate(`password_strength_${level}`, fallback[level])}`;

    for (const { element, pattern, key, fallback } of recommendations) {
      const included = pattern.test(value);
      // Optional variety suggestions never mark an otherwise valid password
      // invalid. Missing suggestions stay neutral rather than error-colored.
      element.dataset.state = included ? "met" : "pending";
      const status = translate(
        included
          ? "password_recommendation_included"
          : "password_recommendation_missing",
        included ? "Included" : "Not included",
      );
      element.textContent = `${status}: ${translate(key, fallback)}`;
    }

    const matches = value === confirmation.value;
    match.dataset.state = confirmation.value
      ? matches
        ? "met"
        : "unmet"
      : "pending";
    match.textContent = confirmation.value
      ? translate(
          matches ? "passwords_match" : "passwords_do_not_match",
          matches ? "Passwords match." : "Passwords do not match.",
        )
      : "";
    // Avoid marking untouched fields invalid before the user has typed.
    password.setAttribute(
      "aria-invalid",
      String(!!value && !!policy.getPasswordValidationError(value)),
    );
    confirmation.setAttribute(
      "aria-invalid",
      String(!!confirmation.value && !matches),
    );
    updateToggles();
  }

  for (const { input, button } of toggles) {
    button.hidden = false;
    input.addEventListener("input", update);
    input.addEventListener("change", update);
    button.addEventListener("click", () => {
      const { selectionStart, selectionEnd, selectionDirection } = input;
      input.type = input.type === "password" ? "text" : "password";
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
      updateToggles();
    });
  }
  form.addEventListener("reset", () => {
    conceal();
    // The reset event fires before the browser restores the input values.
    queueMicrotask(update);
  });
  document.addEventListener("languagechange", update);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) conceal();
  });
  window.addEventListener("pagehide", () => form.reset());
  window.addEventListener("pageshow", update);
  document.getElementById("resetPasswordFeedback").hidden = false;
  update();
})();
