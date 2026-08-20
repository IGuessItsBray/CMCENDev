const token = CMCENUtils.requireAuthToken();

const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardLoadingTemplate = document.getElementById(
  "dashboardLoadingTemplate",
);
const dashboardContent = document.getElementById("dashboardContent");
const dashboardDetails = document.getElementById("dashboardDetails");
const dashboardWorkspace = document.getElementById("dashboardWorkspace");
const dashboardActions = document.getElementById("dashboardActions");
const dashboardTitle = document.getElementById("dashboardTitle");
const dashboardMemberName = document.getElementById("dashboardMemberName");
const dashboardRoleSummary = document.getElementById("dashboardRoleSummary");
const dashboardRoleBadge = document.getElementById("dashboardRoleBadge");
const dashboardRoleDescription = document.getElementById(
  "dashboardRoleDescription",
);
const dashboardReviewWork = document.getElementById("dashboardReviewWork");
const dashboardReviewQueues = document.getElementById("dashboardReviewQueues");
const dashboardReviewSummary = document.getElementById(
  "dashboardReviewSummary",
);
const dashboardProfileDetails = document.getElementById(
  "dashboardProfileDetails",
);
const dashboardProfileSummary = document.getElementById(
  "dashboardProfileSummary",
);
const dashboardDangerZone = document.getElementById("dashboardDangerZone");
const dashboardDangerZoneContent = dashboardDangerZone?.querySelector(
  ".dashboard-danger-zone-content",
);
const weeklyBriefSection = document.getElementById("weeklyBriefSection");
const weeklyBriefPreference = document.getElementById("weeklyBriefPreference");

let currentDashboardUser = null;
let currentReviewCounts = null;
let currentCertificateRequestCount = null;
const profileSaveSuccessDisplayMs = 2200;

const profileSelectOptions = {
  status: [
    "regular",
    "reserve",
    "honourary",
    "civilian",
    "retired",
    "released",
    "other",
  ],
  affiliationElement: ["army", "navy", "air_force", "other"],
  preferredLanguage: ["en", "fr"],
};

function showDashboardLoading() {
  const message = translate("loading_text");

  dashboardStatus.replaceChildren(
    dashboardLoadingTemplate.content.cloneNode(true),
  );
  dashboardStatus.className = "dashboard-status is-loading";
  dashboardStatus.setAttribute("aria-label", message);
  dashboardStatus.hidden = false;
  dashboardStatus.querySelector(".visually-hidden").textContent = message;
  dashboardContent.hidden = true;
}

function getRoleKey(role) {
  const knownRoles = [
    "subscriber",
    "internal_beta",
    "ghost",
    "contributor",
    "author",
    "editor",
    "administrator",
    "developer",
  ];

  return knownRoles.includes(role) ? role : "subscriber";
}

function formatContentArea(contentArea) {
  return CMCENUtils.formatTitleCaseValue(contentArea);
}

function formatContentAreas(contentAreas) {
  if (!Array.isArray(contentAreas) || contentAreas.length === 0) {
    return translate("no_content_areas");
  }

  return contentAreas.map(formatContentArea).join(", ");
}

function createDetailRow(labelKey, value) {
  const row = document.createElement("div");
  row.className = "dashboard-detail-row";

  const label = document.createElement("span");
  label.className = "dashboard-detail-label";
  label.textContent = translate(labelKey);

  const valueElement = document.createElement("span");
  valueElement.className = "dashboard-detail-value";
  valueElement.textContent = value || "—";

  row.append(label, valueElement);

  return row;
}

function createWeeklyBriefPreference(user) {
  const preference = document.createElement("div");
  preference.className = "weekly-brief-preference";
  const brief = user.weeklyBrief || {};
  const copy = {
    description: translate("weekly_brief_description"),
    label: translate("weekly_brief_consent"),
    announcementLabel: translate("news_announcements_consent"),
    optional: translate("email_subscriptions_optional"),
    withdraw: translate("weekly_brief_withdraw"),
    unavailable: translate("weekly_brief_unavailable"),
    sender: translate("weekly_brief_sender"),
  };

  const description = document.createElement("p");
  description.textContent = copy.description;

  preference.append(description);

  const information = document.createElement("div");
  information.className = "weekly-brief-information";

  const optional = document.createElement("p");
  optional.className = "weekly-brief-note";
  optional.textContent = copy.optional;
  information.append(optional);

  if (brief.sender) {
    const sender = document.createElement("p");
    sender.className = "weekly-brief-sender";
    sender.textContent = `${copy.sender}: ${brief.sender.name} — ${brief.sender.mailingAddress} — ${brief.sender.contact}`;
    information.append(sender);
  } else if (!brief.available) {
    const unavailable = document.createElement("p");
    unavailable.className = "weekly-brief-note";
    unavailable.textContent = copy.unavailable;
    information.append(unavailable);
  }

  const control = document.createElement("label");
  control.className = "weekly-brief-control";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = brief.subscribed === true;
  checkbox.disabled = !brief.available && !checkbox.checked;

  const label = document.createElement("span");
  label.textContent = copy.label;
  control.append(checkbox, label);

  const withdrawal = document.createElement("p");
  withdrawal.className = "weekly-brief-note";
  withdrawal.textContent = copy.withdraw;

  information.append(withdrawal);
  preference.append(information, control);

  const announcements = document.createElement("label");
  announcements.className = "weekly-brief-control";
  const announcementInput = document.createElement("input");
  announcementInput.type = "checkbox";
  announcementInput.checked = user.newsAnnouncements?.subscribed === true;
  announcementInput.disabled = !brief.available && !announcementInput.checked;
  const announcementLabel = document.createElement("span");
  announcementLabel.textContent = copy.announcementLabel;
  announcements.append(announcementInput, announcementLabel);
  announcementInput.addEventListener("change", async () => {
    const subscribed = announcementInput.checked;
    announcementInput.disabled = true;
    try {
      const updated = await CMCENUtils.apiJson(
        "/api/subscriptions/news-announcements",
        {
          method: "PUT",
          token,
          body: { subscribed, expressConsent: subscribed },
          redirectOnUnauthorized: true,
        },
      );
      currentDashboardUser = updated;
      renderDashboard(updated);
    } catch (error) {
      announcementInput.checked = !subscribed;
      announcementInput.disabled = false;
      CMCENUtils.showToast(
        error.message || "Could not update news announcement preference",
        { color: "error" },
      );
    }
  });
  preference.append(announcements);

  checkbox.addEventListener("change", async () => {
    const requestedSubscription = checkbox.checked;
    checkbox.disabled = true;

    try {
      const updatedUser = await CMCENUtils.apiJson(
        "/api/subscriptions/weekly-brief",
        {
          method: "PUT",
          token,
          body: {
            subscribed: requestedSubscription,
            expressConsent: requestedSubscription,
          },
          redirectOnUnauthorized: true,
          errorMessage: translate("weekly_brief_update_error"),
        },
      );
      currentDashboardUser = updatedUser;
      renderDashboard(updatedUser);
      CMCENUtils.showToast(
        requestedSubscription
          ? translate("weekly_brief_subscribed")
          : translate("weekly_brief_unsubscribed"),
        { color: "success", position: "bottom-right", animation: "slide" },
      );
    } catch (error) {
      checkbox.checked = !requestedSubscription;
      checkbox.disabled = !brief.available && !checkbox.checked;
      CMCENUtils.showToast(
        error.message || translate("weekly_brief_update_error"),
        { color: "error", position: "bottom-right", animation: "slide" },
      );
    }
  });

  return preference;
}

function createProfileField({
  name,
  labelKey,
  value = "",
  autocomplete = "",
  required = false,
  wide = false,
  addressField = "",
  fieldDataset = {},
}) {
  const field = document.createElement("div");
  field.className = wide
    ? "dashboard-profile-field is-wide"
    : "dashboard-profile-field";

  const id = `profile-${name.replace(/\./g, "-")}`;

  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.textContent = translate(labelKey);

  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.name = name;
  input.value = value || "";
  input.readOnly = true;

  if (autocomplete) {
    input.autocomplete = autocomplete;
  }

  if (required) {
    input.required = true;
  }

  if (addressField) {
    input.dataset.addressField = addressField;
  } else {
    input.dataset.profileField = name;
  }

  Object.entries(fieldDataset).forEach(([key, fieldValue]) => {
    field.dataset[key] = fieldValue;
  });

  field.append(label, input);

  return field;
}

function createProfileSelect({
  name,
  labelKey,
  value = "",
  options,
  optionPrefix,
  required = false,
  preserveUnknownValue = false,
}) {
  const field = document.createElement("div");
  field.className = "dashboard-profile-field";

  const id = `profile-${name}`;

  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.textContent = translate(labelKey);

  const select = document.createElement("select");
  select.id = id;
  select.name = name;
  select.value = value || "";
  select.disabled = true;
  select.dataset.profileField = name;

  if (required) {
    select.required = true;
  }

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = translate("select_option");
  emptyOption.disabled = true;
  select.appendChild(emptyOption);

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionPrefix
      ? translate(`${optionPrefix}_${optionValue}`)
      : window.getCmcenTradeOptionLabel?.(optionValue) || optionValue;
    select.appendChild(option);
  });

  if (preserveUnknownValue && value && !options.includes(value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  select.value = value || "";

  field.append(label, select);

  return field;
}

function setProfileFormMode(form, isEditing) {
  const editButton = form.querySelector("[data-profile-action='edit']");
  const saveButton = form.querySelector("[data-profile-action='save']");
  const cancelButton = form.querySelector("[data-profile-action='cancel']");

  form.dataset.editing = isEditing ? "true" : "false";

  form.querySelectorAll("input").forEach((input) => {
    input.readOnly = !isEditing;
    input.tabIndex = isEditing ? 0 : -1;
  });

  form.querySelectorAll("select").forEach((select) => {
    select.disabled = !isEditing;
    select.tabIndex = isEditing ? 0 : -1;
  });

  editButton.hidden = isEditing;
  saveButton.hidden = !isEditing;
  cancelButton.hidden = !isEditing;
}

function resetProfileSaveButton(saveButton) {
  window.clearTimeout(saveButton.profileSaveResetTimeout);
  saveButton.profileSaveResetTimeout = 0;
  saveButton.disabled = false;
  saveButton.classList.remove("is-loading", "is-saved");
  saveButton.removeAttribute("aria-label");
  saveButton.textContent = translate("dashboard_save_profile");
}

function setProfileSaveButtonLoading(saveButton) {
  window.clearTimeout(saveButton.profileSaveResetTimeout);
  saveButton.profileSaveResetTimeout = 0;
  saveButton.disabled = true;
  saveButton.classList.remove("is-saved");
  saveButton.classList.add("is-loading");

  const spinner = document.createElement("span");
  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  saveButton.setAttribute("aria-label", translate("dashboard_profile_saving"));
  saveButton.replaceChildren(spinner);
}

function setProfileSaveButtonSaved(saveButton, onDone) {
  window.clearTimeout(saveButton.profileSaveResetTimeout);
  saveButton.profileSaveResetTimeout = 0;
  saveButton.disabled = true;
  saveButton.classList.remove("is-loading");
  saveButton.classList.add("is-saved");

  const check = document.createElement("span");
  check.className = "dashboard-profile-save-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = "\u2713";

  saveButton.setAttribute("aria-label", translate("dashboard_profile_saved"));
  saveButton.replaceChildren(check);

  saveButton.profileSaveResetTimeout = window.setTimeout(() => {
    resetProfileSaveButton(saveButton);
    onDone();
  }, profileSaveSuccessDisplayMs);
}

function getProfilePayload(form) {
  const payload = {
    address: {},
  };

  form.querySelectorAll("[data-profile-field]").forEach((field) => {
    payload[field.dataset.profileField] = field.value;
  });

  form.querySelectorAll("[data-address-field]").forEach((field) => {
    payload.address[field.dataset.addressField] = field.value;
  });

  return payload;
}

function syncProfileTradeOtherVisibility(form) {
  const trade = form.querySelector("[data-profile-field='trade']");
  const tradeOther = form.querySelector("[data-profile-field='tradeOther']");
  const tradeOtherField = form.querySelector(
    "[data-profile-extra='tradeOther']",
  );
  const showOther = trade?.value === "other";

  if (tradeOtherField) {
    tradeOtherField.hidden = !showOther;
  }

  if (tradeOther) {
    tradeOther.disabled = !showOther;
    tradeOther.required = showOther;

    if (!showOther) {
      tradeOther.value = "";
    }
  }
}

function createGhostUpgradeForm(user) {
  const form = document.createElement("form");
  form.className = "dashboard-profile-form";

  const grid = document.createElement("div");
  grid.className = "dashboard-profile-grid";

  grid.append(
    createProfileField({
      name: "firstName",
      labelKey: "first_name",
      value: user.firstName,
      autocomplete: "given-name",
      required: true,
    }),
    createProfileField({
      name: "lastName",
      labelKey: "last_name",
      autocomplete: "family-name",
      required: true,
    }),
    createProfileField({
      name: "addressLine1",
      labelKey: "address_line_1",
      autocomplete: "address-line1",
      required: true,
      wide: true,
    }),
    createProfileField({
      name: "city",
      labelKey: "city",
      autocomplete: "address-level2",
      required: true,
    }),
    createProfileField({
      name: "country",
      labelKey: "country",
      autocomplete: "country-name",
      required: true,
    }),
    createProfileField({
      name: "stateProvince",
      labelKey: "state_province",
      autocomplete: "address-level1",
      required: true,
    }),
    createProfileField({
      name: "postalCode",
      labelKey: "postal_code",
      autocomplete: "postal-code",
      required: true,
    }),
    createProfileSelect({
      name: "status",
      labelKey: "status",
      options: profileSelectOptions.status,
      optionPrefix: "status",
      required: true,
    }),
    createProfileSelect({
      name: "affiliationElement",
      labelKey: "affiliation_element",
      options: profileSelectOptions.affiliationElement,
      optionPrefix: "element",
      required: true,
    }),
    createProfileSelect({
      name: "preferredLanguage",
      labelKey: "preferred_language",
      value: CMCENUtils.getCurrentLanguage(),
      options: profileSelectOptions.preferredLanguage,
      optionPrefix: "language",
      required: true,
    }),
  );

  ["password", "passwordConfirmation"].forEach((name) => {
    const field = createProfileField({
      name,
      labelKey: name === "password" ? "password" : "password_confirmation",
      required: true,
    });
    const input = field.querySelector("input");
    input.type = "password";
    input.autocomplete = "new-password";
    grid.append(field);
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "dashboard-profile-button is-primary";
  submit.textContent = translate("dashboard_upgrade_account");

  form.append(grid, submit);
  form.querySelectorAll("input").forEach((input) => {
    input.readOnly = false;
  });
  form.querySelectorAll("select").forEach((select) => {
    select.disabled = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const payload = {};
    form.querySelectorAll("[data-profile-field]").forEach((field) => {
      payload[field.dataset.profileField] = field.value;
    });

    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");

    try {
      const data = await CMCENUtils.apiJson("/api/ghost/upgrade", {
        method: "POST",
        token,
        body: payload,
        errorMessage: translate("dashboard_upgrade_error"),
      });

      CMCENUtils.storeAuthToken(data.token);
      window.location.reload();
    } catch (error) {
      CMCENUtils.showToast(
        error.message || translate("dashboard_upgrade_error"),
        { color: "error", position: "bottom-right", animation: "slide" },
      );
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  });

  return form;
}

function createProfileForm(user) {
  const form = document.createElement("form");
  form.className = "dashboard-profile-form dashboard-profile-form--account";
  form.noValidate = false;

  const grid = document.createElement("div");
  grid.className = "dashboard-profile-grid";

  const profileFields = [
    createProfileField({
      name: "firstName",
      labelKey: "first_name",
      value: user.firstName,
      autocomplete: "given-name",
      required: true,
    }),
    createProfileField({
      name: "lastName",
      labelKey: "last_name",
      value: user.lastName,
      autocomplete: "family-name",
      required: true,
    }),
    createProfileField({
      name: "address.line1",
      labelKey: "address_line_1",
      value: user.address?.line1,
      autocomplete: "address-line1",
      required: true,
      wide: true,
      addressField: "line1",
    }),
    createProfileField({
      name: "address.line2",
      labelKey: "address_line_2",
      value: user.address?.line2,
      autocomplete: "address-line2",
      wide: true,
      addressField: "line2",
    }),
    createProfileField({
      name: "address.city",
      labelKey: "city",
      value: user.address?.city,
      autocomplete: "address-level2",
      required: true,
      addressField: "city",
    }),
    createProfileField({
      name: "address.country",
      labelKey: "country",
      value: user.address?.country,
      autocomplete: "country-name",
      required: true,
      addressField: "country",
    }),
    createProfileField({
      name: "address.stateProvince",
      labelKey: "state_province",
      value: user.address?.stateProvince,
      autocomplete: "address-level1",
      required: true,
      addressField: "stateProvince",
    }),
    createProfileField({
      name: "address.postalCode",
      labelKey: "postal_code",
      value: user.address?.postalCode,
      autocomplete: "postal-code",
      required: true,
      addressField: "postalCode",
    }),
    createProfileField({
      name: "rank",
      labelKey: "rank",
      value: user.rank,
    }),
    createProfileField({
      name: "postNominals",
      labelKey: "post_nominals",
      value: user.postNominals,
    }),
    createProfileField({
      name: "company",
      labelKey: "company",
      value: user.company,
      autocomplete: "organization",
    }),
    createProfileSelect({
      name: "status",
      labelKey: "status",
      value: user.status,
      options: profileSelectOptions.status,
      optionPrefix: "status",
      required: true,
    }),
    createProfileSelect({
      name: "affiliationElement",
      labelKey: "affiliation_element",
      value: user.affiliationElement,
      options: profileSelectOptions.affiliationElement,
      optionPrefix: "element",
      required: true,
    }),
    createProfileSelect({
      name: "trade",
      labelKey: "trade",
      value: user.trade,
      options: window.cmcenTradeOptions || [],
      preserveUnknownValue: true,
    }),
    createProfileField({
      name: "tradeOther",
      labelKey: "trade_other",
      value: user.tradeOther,
      fieldDataset: {
        profileExtra: "tradeOther",
      },
    }),
    createProfileField({
      name: "currentUnit",
      labelKey: "current_unit",
      value: user.currentUnit,
      wide: true,
    }),
    createProfileField({
      name: "phone",
      labelKey: "phone",
      value: user.phone,
      autocomplete: "tel",
    }),
    createProfileSelect({
      name: "preferredLanguage",
      labelKey: "preferred_language",
      value: user.preferredLanguage || "en",
      options: profileSelectOptions.preferredLanguage,
      optionPrefix: "language",
      required: true,
    }),
  ];

  const readonlyDetails = document.createElement("div");
  readonlyDetails.className = "dashboard-profile-readonly";
  readonlyDetails.append(
    createDetailRow("field_email", user.email),
    createDetailRow(
      "field_content_areas",
      formatContentAreas(user.contentAreas),
    ),
  );

  const controls = document.createElement("div");
  controls.className = "dashboard-profile-controls";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "dashboard-profile-button is-secondary";
  editButton.dataset.profileAction = "edit";
  editButton.textContent = translate("dashboard_edit_profile");

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "dashboard-profile-button is-primary";
  saveButton.dataset.profileAction = "save";
  saveButton.textContent = translate("dashboard_save_profile");

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "dashboard-profile-button is-secondary";
  cancelButton.dataset.profileAction = "cancel";
  cancelButton.textContent = translate("dashboard_cancel_profile");

  controls.append(editButton, saveButton, cancelButton);

  const [firstNameField, lastNameField, ...remainingProfileFields] =
    profileFields;
  const profileFieldsPanel = document.createElement("div");
  profileFieldsPanel.className = "dashboard-profile-fields";

  const profileFirstRow = document.createElement("div");
  profileFirstRow.className =
    "dashboard-profile-grid dashboard-profile-grid--first-row";
  profileFirstRow.append(firstNameField, lastNameField);

  grid.append(...remainingProfileFields);
  profileFieldsPanel.append(profileFirstRow, grid);
  form.append(profileFieldsPanel, controls, readonlyDetails);

  form
    .querySelector("[data-profile-field='trade']")
    ?.addEventListener("change", () => syncProfileTradeOtherVisibility(form));

  editButton.addEventListener("click", () => {
    setProfileFormMode(form, true);
    syncProfileTradeOtherVisibility(form);
    form.querySelector("input, select")?.focus();
  });

  cancelButton.addEventListener("click", () => {
    renderDashboard(currentDashboardUser);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    cancelButton.disabled = true;
    setProfileSaveButtonLoading(saveButton);

    try {
      const data = await CMCENUtils.apiJson("/api/profile", {
        method: "PATCH",
        token,
        body: getProfilePayload(form),
        redirectOnUnauthorized: true,
        errorMessage: translate("dashboard_profile_save_error"),
      });

      currentDashboardUser = data;
      cancelButton.hidden = true;
      CMCENUtils.showToast(translate("dashboard_profile_saved"), {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      });
      setProfileSaveButtonSaved(saveButton, () => {
        if (
          typeof window.applyLanguage === "function" &&
          ["en", "fr"].includes(currentDashboardUser.preferredLanguage) &&
          CMCENUtils.getCurrentLanguage() !==
            currentDashboardUser.preferredLanguage
        ) {
          window.applyLanguage(currentDashboardUser.preferredLanguage);
          return;
        }

        renderDashboard(currentDashboardUser);
      });
    } catch (error) {
      resetProfileSaveButton(saveButton);
      cancelButton.disabled = false;
      CMCENUtils.showToast(
        error.message || translate("dashboard_profile_save_error"),
        { color: "error", position: "bottom-right", animation: "slide" },
      );
    }
  });

  setProfileFormMode(form, false);
  syncProfileTradeOtherVisibility(form);

  return form;
}

function createDangerZone(user) {
  if (user.permissions?.canDeleteOwnAccount !== true) {
    return null;
  }

  const action = document.createElement("div");
  action.className = "dashboard-danger-action";

  const copy = document.createElement("div");
  copy.className = "dashboard-danger-copy";

  const title = document.createElement("h3");
  title.textContent = "Delete account";

  const description = document.createElement("p");
  description.textContent =
    "Your account will be removed. Submitted content will remain anonymously.";

  copy.append(title, description);

  const deleteAccount = document.createElement("button");
  deleteAccount.type = "button";
  deleteAccount.className = "dashboard-profile-button is-danger";
  deleteAccount.textContent = "Delete account";
  deleteAccount.addEventListener("click", async () => {
    if (
      !(await CMCENModal.confirm(
        "Your account will be deleted. Your submitted content will remain, but its attribution will be anonymized.",
        {
          title: "Delete account",
          confirmText: "Delete account",
          destructive: true,
        },
      ))
    )
      return;

    const hasTotp = user.mfa?.hasTotp === true;
    const hasPasskey = user.mfa?.hasPasskey === true;

    if (!hasTotp && !hasPasskey) {
      CMCENUtils.showToast(
        "Set up an authenticator app or passkey before deleting your account",
        {
          color: "error",
          position: "bottom-right",
          animation: "slide",
        },
      );
      return;
    }

    let mfaMethod = hasPasskey && !hasTotp ? "webauthn" : "totp";
    let mfaCode = "";

    if (hasTotp && hasPasskey) {
      const choice = await CMCENModal.choose(
        "Choose how you want to confirm this deletion.",
        {
          title: "Choose MFA method",
          choices: [
            {
              value: "totp",
              label: "Authenticator app",
              description: "Enter a current verification code.",
            },
            {
              value: "webauthn",
              label: "Passkey",
              description: "Confirm with a registered device passkey.",
            },
          ],
        },
      );

      if (!choice) return;
      mfaMethod = choice;
    }

    if (mfaMethod === "totp") {
      mfaCode = await CMCENModal.prompt(
        "Enter the current code from your authenticator app.",
        {
          title: "Confirm account deletion",
          inputLabel: "Authenticator code",
          confirmText: "Delete account",
        },
      );
      if (!mfaCode) return;
    }

    deleteAccount.disabled = true;
    try {
      if (mfaMethod === "webauthn") {
        if (!window.PublicKeyCredential) {
          throw new Error(
            "An authenticator code is required because passkeys are unavailable in this browser",
          );
        }

        const options = CMCENUtils.preparePublicKeyRequestOptions(
          await CMCENUtils.apiJson("/api/mfa/webauthn/authenticate/options", {
            method: "POST",
            token,
            errorMessage: "Could not start passkey confirmation",
          }),
        );
        const assertion = await navigator.credentials.get({
          publicKey: options,
        });

        await CMCENUtils.apiJson("/api/mfa/webauthn/authenticate/verify", {
          method: "POST",
          token,
          body: CMCENUtils.serializeAssertionCredential(assertion),
          errorMessage: "Could not verify passkey confirmation",
        });
        mfaMethod = "webauthn";
      }

      await CMCENUtils.apiJson("/api/profile", {
        method: "DELETE",
        token,
        body: { mfaCode, mfaMethod },
        errorMessage: "Could not delete account",
      });
      CMCENUtils.clearAuthToken();
      window.location.href = "/index";
    } catch (error) {
      deleteAccount.disabled = false;
      CMCENUtils.showToast(error.message || "Could not delete account", {
        color: "error",
        position: "bottom-right",
        animation: "slide",
      });
    }
  });

  action.append(copy, deleteAccount);

  return action;
}

function createActionLink({
  href,
  titleKey,
  descriptionKey,
  count = 0,
  variant = "",
}) {
  const link = document.createElement("a");
  link.className = "dashboard-action";

  if (variant) {
    link.classList.add(`is-${variant}`);
  }

  link.href = href;

  const copy = document.createElement("span");
  copy.className = "dashboard-action-copy";

  const titleRow = document.createElement("span");
  titleRow.className = "dashboard-action-title-row";

  const title = document.createElement("strong");
  title.textContent = translate(titleKey);

  titleRow.appendChild(title);

  if (count > 0) {
    const badge = document.createElement("span");
    badge.className = "dashboard-action-count";
    badge.textContent = String(count);
    titleRow.appendChild(badge);
  }

  const description = document.createElement("span");
  description.textContent = translate(descriptionKey);

  const arrow = document.createElement("span");
  arrow.className = "dashboard-action-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";

  copy.append(titleRow, description);
  link.append(copy, arrow);

  return link;
}

function getReviewCountLabel(type, value) {
  const count = Number.isInteger(value) && value >= 0 ? value : 0;
  const plural = count === 1 ? "singular" : "plural";

  return translate(`dashboard_review_${type}_${plural}`, { count });
}

function getReviewWorkTotal({
  canReviewSubmissions,
  canManageCertificateRequests,
}) {
  const counts = [];

  if (canReviewSubmissions && currentReviewCounts) {
    counts.push(
      currentReviewCounts.events,
      currentReviewCounts.retirementMessages,
      currentReviewCounts.lastPosts,
      currentReviewCounts.comments,
    );
  }

  if (canManageCertificateRequests) {
    counts.push(currentCertificateRequestCount);
  }

  if (!counts.length || counts.some((count) => !Number.isInteger(count))) {
    return null;
  }

  return counts.reduce((total, count) => total + Math.max(0, count), 0);
}

function createReviewQueueLink({
  tab,
  type,
  labelKey,
  count,
  href,
  ariaLabelKey = "dashboard_review_open_queue",
}) {
  const reviewCount = Number.isInteger(count) && count >= 0 ? count : 0;
  const link = document.createElement("a");
  link.className = "dashboard-review-queue-link";
  link.href = href || `/review-submissions.html?tab=${encodeURIComponent(tab)}`;
  link.setAttribute(
    "aria-label",
    translate(ariaLabelKey, {
      count: getReviewCountLabel(type, reviewCount),
    }),
  );

  const countElement = document.createElement("strong");
  countElement.textContent = String(reviewCount);
  countElement.classList.toggle("is-empty", reviewCount === 0);

  const label = document.createElement("span");
  label.textContent = translate(labelKey);

  link.append(countElement, label);

  return link;
}

function createReviewQueuesUnavailable() {
  const message = document.createElement("p");
  message.className = "dashboard-review-counts-unavailable";
  message.textContent = translate("dashboard_review_counts_unavailable");

  const link = document.createElement("a");
  link.className = "dashboard-review-open-link";
  link.href = "/review-submissions.html";
  link.textContent = translate("dashboard_review_open_queues");

  return [message, link];
}

function createContentWorkspaceLink() {
  const link = document.createElement("a");
  link.className = "dashboard-review-open-link";
  link.href = "/content-workspace";
  link.textContent = translate("dashboard_review_manage_content");

  return link;
}

function renderDashboard(user) {
  const profileWasOpen = dashboardProfileDetails?.open === true;

  currentDashboardUser = user;

  const role = getRoleKey(user.role);
  const roleTitle = translate(`role_${role}`);
  // const displayName =
  //   user.accountName ||
  //   [user.firstName, user.lastName]
  //     .filter(Boolean)
  //     .join(" ") ||
  //   user.username ||
  //   "";
  const displayName = user.firstName || user.email || "";

  dashboardTitle.textContent = translate("dashboard_welcome", {
    name: displayName,
  });

  dashboardMemberName.textContent = displayName;

  dashboardRoleBadge.textContent = roleTitle;
  dashboardRoleBadge.className = `dashboard-role-badge role-${role}`;
  dashboardRoleDescription.textContent = translate(`role_description_${role}`);
  dashboardRoleSummary.hidden = false;

  dashboardProfileSummary.textContent = [user.email, roleTitle]
    .filter(Boolean)
    .join(" · ");
  dashboardProfileDetails.open = profileWasOpen;

  const isGhost = user.accountType === "ghost" || user.role === "ghost";
  document
    .querySelector(".dashboard-mfa-section")
    ?.toggleAttribute("hidden", isGhost);
  weeklyBriefSection?.toggleAttribute("hidden", isGhost);
  weeklyBriefPreference?.replaceChildren(
    ...(isGhost ? [] : [createWeeklyBriefPreference(user)]),
  );

  const dangerZone = isGhost ? null : createDangerZone(user);
  dashboardDangerZone?.toggleAttribute("hidden", !dangerZone);
  dashboardDangerZoneContent?.replaceChildren(
    ...(dangerZone ? [dangerZone] : []),
  );

  dashboardDetails.replaceChildren(
    isGhost ? createGhostUpgradeForm(user) : createProfileForm(user),
  );

  const actions = [];
  if (isGhost) {
    actions.push({
      href: "/submit-event",
      titleKey: "dashboard_action_my_submissions",
      descriptionKey: "dashboard_action_my_submissions_description",
    });
  } else {
    if (user.permissions?.canSubmitRetirementMessages === true) {
      actions.push({
        href: "/submit-retirement",
        titleKey: "dashboard_action_submit_retirement",
        descriptionKey: "dashboard_action_submit_retirement_description",
      });
    }

    if (user.permissions?.canCreateDrafts === true) {
      actions.push({
        href: "/submit-event",
        titleKey: "dashboard_action_submit_event",
        descriptionKey: "dashboard_action_submit_event_description",
      });
    }

    const hasAdminWorkZoneAccess = [
      "canReadUsers",
      "canManageUsers",
      "canManageRoles",
      "canManagePages",
      "canManageTimers",
      "canViewMediaLibrary",
      "canViewAuditLog",
    ].some((permission) => user.permissions?.[permission] === true);

    if (
      user.permissions?.canManageTranslations === true &&
      !hasAdminWorkZoneAccess
    ) {
      actions.push({
        href: "/translations-admin",
        titleKey: "dashboard_action_manage_translations",
        descriptionKey: "dashboard_action_manage_translations_description",
      });
    }

    if (hasAdminWorkZoneAccess) {
      actions.push({
        href:
          user.permissions?.canReadUsers === true ||
          user.permissions?.canManageUsers === true
            ? "/admin-users"
            : user.permissions?.canManageRoles === true
              ? "/admin-users?view=roles"
              : user.permissions?.canManagePages === true
                ? "/pages-admin"
                : user.permissions?.canViewMediaLibrary === true
                  ? "/admin-users?view=media"
                  : user.permissions?.canViewAuditLog === true
                    ? "/audit-log"
                    : user.permissions?.canViewAnalytics === true
                      ? "/analytics"
                      : "/timers-admin",
        titleKey: "dashboard_action_admin_work_zone",
        descriptionKey: "dashboard_action_admin_work_zone_description",
      });
    }
  }

  dashboardActions.replaceChildren(...actions.map(createActionLink));

  const canReviewSubmissions = user.permissions?.canReviewAndPublish === true;
  const canManageCertificateRequests =
    user.permissions?.canManageCertificateRequests === true;
  const hasReviewWork = canReviewSubmissions || canManageCertificateRequests;

  dashboardWorkspace.classList.toggle("has-review-work", hasReviewWork);
  dashboardReviewWork.hidden = !hasReviewWork;

  if (hasReviewWork) {
    const reviewQueues = [];

    if (canReviewSubmissions && currentReviewCounts) {
      reviewQueues.push(
        createReviewQueueLink({
          tab: "events",
          type: "events",
          labelKey: "review_events_tab",
          count: currentReviewCounts.events,
        }),
        createReviewQueueLink({
          tab: "retirements",
          type: "retirement_messages",
          labelKey: "review_retirements_tab",
          count: currentReviewCounts.retirementMessages,
        }),
        createReviewQueueLink({
          tab: "last-posts",
          type: "last_posts",
          labelKey: "review_last_posts_tab",
          count: currentReviewCounts.lastPosts,
        }),
        createReviewQueueLink({
          tab: "comments",
          type: "comments",
          labelKey: "review_comments_tab",
          count: currentReviewCounts.comments,
        }),
      );
    } else if (canReviewSubmissions) {
      reviewQueues.push(...createReviewQueuesUnavailable());
    }

    if (canManageCertificateRequests) {
      reviewQueues.push(
        createReviewQueueLink({
          href: "/certificate-requests",
          type: "certificate_requests",
          labelKey: "dashboard_action_certificate_requests",
          count: currentCertificateRequestCount,
          ariaLabelKey: "dashboard_certificate_requests_open_queue",
        }),
      );
    }

    if (canReviewSubmissions) {
      reviewQueues.push(createContentWorkspaceLink());
    }

    dashboardReviewQueues.replaceChildren(...reviewQueues);

    const reviewWorkTotal = getReviewWorkTotal({
      canReviewSubmissions,
      canManageCertificateRequests,
    });
    dashboardReviewSummary.hidden = reviewWorkTotal === null;
    dashboardReviewSummary.textContent =
      reviewWorkTotal === null
        ? ""
        : translate(
            reviewWorkTotal === 1
              ? "dashboard_review_open_items_singular"
              : "dashboard_review_open_items_plural",
            { count: reviewWorkTotal },
          );
  } else {
    dashboardReviewQueues.replaceChildren();
    dashboardReviewSummary.hidden = true;
    dashboardReviewSummary.textContent = "";
  }

  dashboardStatus.hidden = true;
  dashboardStatus.removeAttribute("aria-label");
  dashboardContent.hidden = false;
}

function showDashboardError(message) {
  dashboardStatus.replaceChildren();
  dashboardStatus.className = "dashboard-status";
  dashboardStatus.removeAttribute("aria-label");
  dashboardStatus.hidden = false;

  const error = document.createElement("p");
  error.className = "dashboard-error";
  error.textContent = message;

  dashboardStatus.appendChild(error);
}

function enableDashboardDisclosureMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  document
    .querySelectorAll(".dashboard-profile-details, .dashboard-disclosure")
    .forEach((details) => {
      const summary = details.querySelector(":scope > summary");

      if (!summary) {
        return;
      }

      let animationFrame = null;
      let cleanupTimer = null;
      let transitionEndHandler = null;

      const resetAnimationStyles = () => {
        details.classList.remove("is-animating", "is-closing");
        details.style.height = "";
        details.style.overflow = "";
        details.style.transition = "";
      };

      const cancelAnimation = () => {
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }

        if (cleanupTimer !== null) {
          window.clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }

        if (transitionEndHandler) {
          details.removeEventListener("transitionend", transitionEndHandler);
          transitionEndHandler = null;
        }
      };

      const animateHeight = ({
        startHeight,
        endHeight,
        duration,
        easing,
        onFinish,
      }) => {
        cancelAnimation();
        details.style.transition = "none";
        details.style.height = startHeight;
        details.style.overflow = "hidden";

        let finished = false;
        const finish = () => {
          if (finished) {
            return;
          }

          finished = true;
          cancelAnimation();
          onFinish();
        };

        transitionEndHandler = (event) => {
          if (event.target === details && event.propertyName === "height") {
            finish();
          }
        };
        details.addEventListener("transitionend", transitionEndHandler);
        animationFrame = window.requestAnimationFrame(() => {
          details.style.transition = `height ${duration}ms ${easing}`;
          animationFrame = window.requestAnimationFrame(() => {
            details.style.height = endHeight;
            cleanupTimer = window.setTimeout(finish, duration + 120);
          });
        });
      };

      const expand = () => {
        const startHeight = `${details.offsetHeight}px`;
        cancelAnimation();
        details.style.height = "";
        details.open = true;
        const endHeight = `${details.offsetHeight}px`;

        details.classList.add("is-animating");
        details.classList.remove("is-closing");
        animateHeight({
          startHeight,
          endHeight,
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          onFinish: resetAnimationStyles,
        });
      };

      const collapse = () => {
        const startHeight = `${details.offsetHeight}px`;
        const endHeight = `${summary.offsetHeight}px`;

        details.classList.add("is-animating", "is-closing");
        animateHeight({
          startHeight,
          endHeight,
          duration: 200,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          onFinish: () => {
            details.open = false;
            resetAnimationStyles();
          },
        });
      };

      summary.addEventListener("click", (event) => {
        event.preventDefault();

        if (details.open && !details.classList.contains("is-closing")) {
          collapse();
          return;
        }

        expand();
      });
    });
}

async function loadDashboard() {
  showDashboardLoading();

  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      redirectOnUnauthorized: true,
      errorMessage: "Could not load account data",
    });

    if (user.permissions?.canReviewAndPublish === true) {
      try {
        currentReviewCounts = await CMCENUtils.apiJson(
          "/api/admin/review-counts",
          {
            token,
            errorMessage: "Could not load review submission counts",
          },
        );
      } catch (error) {
      }
    } else {
      currentReviewCounts = null;
    }

    if (user.permissions?.canManageCertificateRequests === true) {
      try {
        const certificateCounts = await CMCENUtils.apiJson(
          "/api/certificate-requests/count",
          {
            token,
            errorMessage: "Could not load certificate request count",
          },
        );
        currentCertificateRequestCount = Number.isInteger(
          certificateCounts.actionable,
        )
          ? certificateCounts.actionable
          : 0;
      } catch (error) {
        currentCertificateRequestCount = null;
      }
    } else {
      currentCertificateRequestCount = null;
    }

    renderDashboard(user);
  } catch (error) {

    showDashboardError(translate("dashboard_load_error"));
  }
}

document.addEventListener("languagechange", () => {
  if (currentDashboardUser) {
    renderDashboard(currentDashboardUser);
    return;
  }

  if (dashboardStatus.classList.contains("is-loading")) {
    showDashboardLoading();
    dashboardTitle.textContent = translate("dashboard_title");
    return;
  }

  const error = dashboardStatus.querySelector(".dashboard-error");

  if (error) {
    error.textContent = translate("dashboard_load_error");
  }
});

window.addEventListener("pageshow", () => {
  if (!CMCENUtils.requireAuthToken()) {
    window.location.replace("/login");
  }
});

enableDashboardDisclosureMotion();
loadDashboard();
