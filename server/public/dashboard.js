function requireDashboardAuth() {
  const token = String(
    localStorage.getItem("token") ||
    localStorage.getItem("api_token") ||
    ""
  ).trim().replace(/^Bearer\s+/i, "");

  if (!token) {
    window.location.replace("/login.html");
    return null;
  }

  localStorage.setItem("token", token);
  localStorage.setItem("api_token", token);

  return token;
}

const token = requireDashboardAuth();

const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardContent = document.getElementById("dashboardContent");
const dashboardDetails = document.getElementById("dashboardDetails");
const dashboardActions = document.getElementById("dashboardActions");
const dashboardTitle = document.getElementById("dashboardTitle");
const dashboardMemberName = document.getElementById("dashboardMemberName");
const dashboardRoleSummary = document.getElementById("dashboardRoleSummary");
const dashboardRoleBadge = document.getElementById("dashboardRoleBadge");
const dashboardRoleDescription = document.getElementById("dashboardRoleDescription");

let currentDashboardUser = null;
const profileSaveSuccessDisplayMs = 2200;

const profileSelectOptions = {
  status: [
    "regular",
    "reserve",
    "honourary",
    "civilian",
    "retired",
    "released",
    "other"
  ],
  affiliationElement: [
    "army",
    "navy",
    "air_force",
    "other"
  ]
};

function showDashboardLoading() {
  const spinner = document.createElement("span");
  const label = document.createElement("span");
  const message = translate("loading_text");

  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  label.className = "visually-hidden";
  label.textContent = message;

  dashboardStatus.replaceChildren(spinner, label);
  dashboardStatus.className = "dashboard-status is-loading";
  dashboardStatus.setAttribute("aria-label", message);
  dashboardStatus.hidden = false;
  dashboardContent.hidden = true;
}

function getRoleKey(role) {
  const knownRoles = [
    "subscriber",
    "contributor",
    "author",
    "editor",
    "administrator",
    "developer"
  ];

  return knownRoles.includes(role)
    ? role
    : "subscriber";
}

function formatContentArea(contentArea) {
  return String(contentArea)
    .replace(/[_-]+/g, " ")
    .replace(
      /\b\w/g,
      character => character.toUpperCase()
    );
}

function formatContentAreas(contentAreas) {
  if (
    !Array.isArray(contentAreas) ||
    contentAreas.length === 0
  ) {
    return translate("no_content_areas");
  }

  return contentAreas
    .map(formatContentArea)
    .join(", ");
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

function createProfileMessage() {
  const message = document.createElement("p");
  message.className = "dashboard-profile-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;

  return message;
}

function setProfileMessage(messageElement, text, state = "") {
  messageElement.textContent = text;
  messageElement.className = "dashboard-profile-message";

  if (state) {
    messageElement.classList.add(`is-${state}`);
  }

  messageElement.hidden = false;
}

function createProfileField({
  name,
  labelKey,
  value = "",
  autocomplete = "",
  required = false,
  wide = false,
  addressField = "",
  fieldDataset = {}
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
  preserveUnknownValue = false
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

  options.forEach(optionValue => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionPrefix
      ? translate(`${optionPrefix}_${optionValue}`)
      : window.getCmcenTradeOptionLabel?.(optionValue) || optionValue;
    select.appendChild(option);
  });

  if (
    preserveUnknownValue &&
    value &&
    !options.includes(value)
  ) {
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

  form.querySelectorAll("input").forEach(input => {
    input.readOnly = !isEditing;
    input.tabIndex = isEditing ? 0 : -1;
  });

  form.querySelectorAll("select").forEach(select => {
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
    address: {}
  };

  form.querySelectorAll("[data-profile-field]").forEach(field => {
    payload[field.dataset.profileField] = field.value;
  });

  form.querySelectorAll("[data-address-field]").forEach(field => {
    payload.address[field.dataset.addressField] = field.value;
  });

  return payload;
}

function syncProfileTradeOtherVisibility(form) {
  const trade = form.querySelector("[data-profile-field='trade']");
  const tradeOther = form.querySelector("[data-profile-field='tradeOther']");
  const tradeOtherField = form.querySelector("[data-profile-extra='tradeOther']");
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

function createProfileForm(user) {
  const form = document.createElement("form");
  form.className = "dashboard-profile-form";
  form.noValidate = false;

  const message = createProfileMessage();

  const grid = document.createElement("div");
  grid.className = "dashboard-profile-grid";

  grid.append(
    createProfileField({
      name: "firstName",
      labelKey: "first_name",
      value: user.firstName,
      autocomplete: "given-name",
      required: true
    }),
    createProfileField({
      name: "lastName",
      labelKey: "last_name",
      value: user.lastName,
      autocomplete: "family-name",
      required: true
    }),
    createProfileField({
      name: "address.line1",
      labelKey: "address_line_1",
      value: user.address?.line1,
      autocomplete: "address-line1",
      required: true,
      wide: true,
      addressField: "line1"
    }),
    createProfileField({
      name: "address.line2",
      labelKey: "address_line_2",
      value: user.address?.line2,
      autocomplete: "address-line2",
      wide: true,
      addressField: "line2"
    }),
    createProfileField({
      name: "address.city",
      labelKey: "city",
      value: user.address?.city,
      autocomplete: "address-level2",
      required: true,
      addressField: "city"
    }),
    createProfileField({
      name: "address.country",
      labelKey: "country",
      value: user.address?.country,
      autocomplete: "country-name",
      required: true,
      addressField: "country"
    }),
    createProfileField({
      name: "address.stateProvince",
      labelKey: "state_province",
      value: user.address?.stateProvince,
      autocomplete: "address-level1",
      required: true,
      addressField: "stateProvince"
    }),
    createProfileField({
      name: "address.postalCode",
      labelKey: "postal_code",
      value: user.address?.postalCode,
      autocomplete: "postal-code",
      required: true,
      addressField: "postalCode"
    }),
    createProfileField({
      name: "rank",
      labelKey: "rank",
      value: user.rank
    }),
    createProfileField({
      name: "postNominals",
      labelKey: "post_nominals",
      value: user.postNominals
    }),
    createProfileField({
      name: "company",
      labelKey: "company",
      value: user.company,
      autocomplete: "organization"
    }),
    createProfileSelect({
      name: "status",
      labelKey: "status",
      value: user.status,
      options: profileSelectOptions.status,
      optionPrefix: "status",
      required: true
    }),
    createProfileSelect({
      name: "affiliationElement",
      labelKey: "affiliation_element",
      value: user.affiliationElement,
      options: profileSelectOptions.affiliationElement,
      optionPrefix: "element",
      required: true
    }),
    createProfileSelect({
      name: "trade",
      labelKey: "trade",
      value: user.trade,
      options: window.cmcenTradeOptions || [],
      preserveUnknownValue: true
    }),
    createProfileField({
      name: "tradeOther",
      labelKey: "trade_other",
      value: user.tradeOther,
      fieldDataset: {
        profileExtra: "tradeOther"
      }
    }),
    createProfileField({
      name: "currentUnit",
      labelKey: "current_unit",
      value: user.currentUnit,
      wide: true
    })
  );

  const readonlyDetails = document.createElement("div");
  readonlyDetails.className = "dashboard-profile-readonly";
  readonlyDetails.append(
    createDetailRow(
      "field_email",
      user.email
    ),
    createDetailRow(
      "field_content_areas",
      formatContentAreas(user.contentAreas)
    )
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
  form.append(message, grid, readonlyDetails, controls);

  form
    .querySelector("[data-profile-field='trade']")
    ?.addEventListener("change", () => syncProfileTradeOtherVisibility(form));

  editButton.addEventListener("click", () => {
    message.hidden = true;
    setProfileFormMode(form, true);
    syncProfileTradeOtherVisibility(form);
    form.querySelector("input, select")?.focus();
  });

  cancelButton.addEventListener("click", () => {
    renderDashboard(currentDashboardUser);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    message.hidden = true;
    cancelButton.disabled = true;
    setProfileSaveButtonLoading(saveButton);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(getProfilePayload(form))
      });

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("api_token");
        window.location.href = "/login.html";
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || translate("dashboard_profile_save_error"));
      }

      currentDashboardUser = data;
      cancelButton.hidden = true;
      setProfileSaveButtonSaved(saveButton, () => {
        renderDashboard(currentDashboardUser);
      });
    } catch (error) {
      console.error("Profile save failed:", error);
      resetProfileSaveButton(saveButton);
      cancelButton.disabled = false;
      setProfileMessage(
        message,
        error.message || translate("dashboard_profile_save_error"),
        "error"
      );
    }
  });

  setProfileFormMode(form, false);
  syncProfileTradeOtherVisibility(form);

  return form;
}

function createActionLink({ href, titleKey, descriptionKey }) {
  const link = document.createElement("a");
  link.className = "dashboard-action";
  link.href = href;

  const copy = document.createElement("span");
  copy.className = "dashboard-action-copy";

  const title = document.createElement("strong");
  title.textContent = translate(titleKey);

  const description = document.createElement("span");
  description.textContent = translate(descriptionKey);

  const arrow = document.createElement("span");
  arrow.className = "dashboard-action-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";

  copy.append(title, description);
  link.append(copy, arrow);

  return link;
}

function renderDashboard(user) {
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
  const displayName = user.firstName;

  dashboardTitle.textContent =
    translate("dashboard_welcome", {
      name: displayName
    });

  dashboardMemberName.textContent = displayName;

  dashboardRoleBadge.textContent = roleTitle;
  dashboardRoleBadge.className = `dashboard-role-badge role-${role}`;
  dashboardRoleDescription.textContent = translate(`role_description_${role}`);
  dashboardRoleSummary.hidden = false;

  dashboardDetails.replaceChildren(
    createProfileForm(user)
  );

  const actions = [];

  if (user.permissions?.canSubmitRetirementMessages === true) {
    actions.push({
      href: "/submit-retirement.html",
      titleKey: "dashboard_action_submit_retirement",
      descriptionKey: "dashboard_action_submit_retirement_description"
    });
  }

  if (user.permissions?.canCreateDrafts === true) {
    actions.push({
      href: "/submit-event.html",
      titleKey: "dashboard_action_submit_event",
      descriptionKey: "dashboard_action_submit_event_description"
    });
  }

  if (user.permissions?.canReviewAndPublish === true) {
    actions.push({
      href: "/review-submissions.html",
      titleKey: "dashboard_action_review_events",
      descriptionKey: "dashboard_action_review_events_description"
    });
  }

  if (user.permissions?.canManageTranslations === true) {
    actions.push({
      href: "/translations-admin.html",
      titleKey: "dashboard_action_manage_translations",
      descriptionKey: "dashboard_action_manage_translations_description"
    });
  }

  if (user.permissions?.canManageUsers === true) {
    actions.push({
      href: "/admin-users.html",
      titleKey: "dashboard_action_admin_work_zone",
      descriptionKey: "dashboard_action_admin_work_zone_description"
    });
  }

  dashboardActions.replaceChildren(
    ...actions.map(createActionLink)
  );

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

async function loadDashboard() {
  showDashboardLoading();

  try {
    const response = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem("token");

      window.location.href = "/login.html";

      return;
    }

    if (!response.ok) {
      throw new Error(
        "Could not load account data"
      );
    }

    const user = await response.json();

    renderDashboard(user);
  } catch (error) {
    console.error(
      "Dashboard load failed:",
      error
    );

    showDashboardError(translate("dashboard_load_error"));
  }
}

document.addEventListener(
  "languagechange",
  () => {
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
  }
);

window.addEventListener("pageshow", () => {
  if (!requireDashboardAuth()) {
    window.location.replace("/login.html");
  }
});

loadDashboard();
