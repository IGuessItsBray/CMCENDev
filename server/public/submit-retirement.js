const retirementSubmitForm = document.getElementById("retirementSubmitForm");
const retirementFormMessage = document.getElementById("retirementFormMessage");
const retirementPageLoading = document.getElementById("retirementPageLoading");
const retirementSubmitButton = document.getElementById(
  "retirementSubmitButton",
);
const retirementSubmitButtonLabel =
  retirementSubmitButton.querySelector("span");
const retirementPublishNowContainer = document.getElementById(
  "retirementPublishNowContainer",
);
const retirementPublishNow = document.getElementById("retirementPublishNow");
const retirementReviewNote = document.getElementById("retirementReviewNote");
const retirementSubmitTitle = document.getElementById("submitEventTitle");
const retirementSubmitIntro = document.getElementById("submitEventIntro");
const retirementMessageLanguage = document.getElementById(
  "retirementMessageLanguage",
);
const retirementPhotoInput = document.getElementById("retirementPhoto");
const retireeRankPicker = document.getElementById("retireeRankPicker");
const retireeRank = document.getElementById("retireeRank");
const retireeTradeCategory = document.getElementById("retireeTradeCategory");
const retireeTradeRole = document.getElementById("retireeTradeRole");
const retireeOfficerTradePanel = document.getElementById(
  "retireeOfficerTradePanel",
);
const retireeNcmTradePanel = document.getElementById("retireeNcmTradePanel");
const retirementTradeOptionContainers = document.querySelectorAll(
  "[data-retirement-trade-options]",
);
const certificateRequested = document.getElementById("certificateRequested");
const certificateRequestDetails = document.getElementById(
  "certificateRequestDetails",
);
const certificateMemberFullName = document.getElementById(
  "certificateMemberFullName",
);
const certificateFamilyList = document.getElementById("certificateFamilyList");
const addCertificateFamilyMember = document.getElementById(
  "addCertificateFamilyMember",
);
const certificateDateInputs = document.querySelectorAll(
  "#certificateRequestDetails input[type='date']",
);
const certificateRequestSection = document.getElementById(
  "certificateRequestSection",
);
const retirementSubmitterSection = document.getElementById(
  "retirementSubmitterSection",
);

if (certificateRequestSection && retirementSubmitterSection) {
  retirementSubmitterSection.insertAdjacentElement(
    "afterend",
    certificateRequestSection,
  );
}

const retirementAuthToken = CMCENUtils.requireAuthToken();
const RETIREMENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const redirectToLogin = CMCENUtils.redirectToLogin;
const retirementPageParams = new URLSearchParams(window.location.search);
const editingRetirementMessageId = retirementPageParams.get("id");
const retirementPhotoCrop = CMCENUtils.createImageCropController({
  input: retirementPhotoInput,
  container: document.getElementById("retirementPhotoCrop"),
  labels: {
    heading: translate("image_crop_heading"),
    hint: translate("image_crop_hint"),
    horizontal: translate("image_crop_horizontal"),
    vertical: translate("image_crop_vertical"),
    previewAlt: translate("image_crop_preview_alt"),
  },
});

let editingRetirementMessage = null;
let currentRetirementUser = null;
let certificateFamilyMemberSequence = 0;

const RETIREE_RANK_OPTIONS = Array.from(retireeRank.options)
  .filter((option) => option.dataset.rankCategory)
  .map((option) => ({
    category: option.dataset.rankCategory,
    value: option.value,
    translationKey: option.dataset.i18n,
    fallback: option.textContent.trim(),
  }));

const CERTIFICATE_FAMILY_RELATIONSHIPS = Object.freeze([
  ["husband", "certificate_relationship_husband"],
  ["wife", "certificate_relationship_wife"],
  ["partner", "certificate_relationship_partner"],
  ["girlfriend", "certificate_relationship_girlfriend"],
  ["boyfriend", "certificate_relationship_boyfriend"],
  ["father", "certificate_relationship_father"],
  ["mother", "certificate_relationship_mother"],
  ["step-father", "certificate_relationship_step_father"],
  ["step-mother", "certificate_relationship_step_mother"],
  ["adoptive-parent", "certificate_relationship_adoptive_parent"],
  ["foster-parent", "certificate_relationship_foster_parent"],
  ["guardian", "certificate_relationship_guardian"],
  ["cousin", "certificate_relationship_cousin"],
  ["brother", "certificate_relationship_brother"],
  ["sister", "certificate_relationship_sister"],
  ["son", "certificate_relationship_son"],
  ["daughter", "certificate_relationship_daughter"],
  ["uncle", "certificate_relationship_uncle"],
  ["aunt", "certificate_relationship_aunt"],
  ["other", "certificate_relationship_other"],
]);

function renderRetirementDeleteAction() {
  retirementSubmitForm
    .querySelector("[data-action='delete-retirement-submission']")
    ?.remove();

  if (
    !editingRetirementMessageId ||
    editingRetirementMessage?.status !== "pending"
  ) {
    return;
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "event-submit-button is-danger";
  deleteButton.dataset.action = "delete-retirement-submission";
  deleteButton.textContent = "Remove submission";
  deleteButton.addEventListener("click", async () => {
    if (
      !(await CMCENModal.confirm(
        "Remove this submitted retirement message? A content editor can restore it later.",
        {
          title: "Remove retirement message",
          confirmText: "Remove",
          destructive: true,
        },
      ))
    )
      return;

    deleteButton.disabled = true;
    try {
      await retirementApiJson(
        `/api/admin/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}`,
        {
          method: "DELETE",
          errorMessage: "Could not remove retirement message",
        },
      );
      window.location.href = "/retirements";
    } catch (error) {
      deleteButton.disabled = false;
      showRetirementSubmissionToast(
        error.message || "Could not remove retirement message",
      );
    }
  });

  retirementSubmitForm.append(deleteButton);
}

function retirementApiJson(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: retirementAuthToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("retirement_permission_error"),
  });
}

function retirementApiFetch(path, options = {}) {
  return CMCENUtils.apiFetch(path, {
    ...options,
    token: retirementAuthToken,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("retirement_permission_error"),
  });
}

function showRetirementFormMessage(message, type = "error") {
  retirementFormMessage.textContent = message;
  retirementFormMessage.className = `event-page-message is-${type}`;
  retirementFormMessage.hidden = false;
  retirementFormMessage.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

function clearRetirementFormMessage() {
  retirementFormMessage.textContent = "";
  retirementFormMessage.className = "event-page-message";
  retirementFormMessage.hidden = true;
}

function showRetirementSubmissionToast(message, type = "error") {
  CMCENUtils.showToast(message, {
    color: type === "success" ? "success" : "error",
    position: "bottom-right",
    animation: "slide",
  });
}

function setRetirementSubmitting(isSubmitting) {
  retirementSubmitButton.disabled = isSubmitting;
  retirementSubmitButton.setAttribute("aria-busy", String(isSubmitting));
  retirementSubmitButton.setAttribute(
    "aria-label",
    translate(
      isSubmitting
        ? "retirement_submitting"
        : editingRetirementMessageId
          ? "retirement_save_changes"
          : "retirement_submit_button",
    ),
  );
}

function updateRetirementFormModeText() {
  const isEditing = Boolean(editingRetirementMessageId);

  if (retirementSubmitTitle) {
    retirementSubmitTitle.textContent = translate(
      isEditing ? "retirement_edit_title" : "retirement_submit_title",
    );
  }

  if (retirementSubmitIntro) {
    retirementSubmitIntro.textContent = translate(
      isEditing ? "retirement_edit_intro" : "retirement_submit_intro",
    );
  }

  if (retirementSubmitButtonLabel) {
    retirementSubmitButtonLabel.textContent = translate(
      isEditing ? "retirement_save_changes" : "retirement_submit_button",
    );
  }
}

function getRetirementLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

function setDefaultMessageLanguage() {
  retirementMessageLanguage.value = getRetirementLanguage();
}

function getFieldValue(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function getSelectedRetirementPhoto() {
  return retirementPhotoInput?.files?.[0] || null;
}

function getSelectedTradeRoleOption(optionName) {
  return document.querySelector(`input[name="${optionName}"]:checked`);
}

function clearTradeRoleOptions(optionName) {
  document.querySelectorAll(`input[name="${optionName}"]`).forEach((option) => {
    option.checked = false;
  });
}

function createTradeRoleOption(tradeRole, optionName) {
  const label = document.createElement("label");
  label.className = "retirement-radio-option";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = optionName;
  input.value = tradeRole;

  const text = document.createElement("span");
  text.textContent = tradeRole;

  label.append(input, text);

  return label;
}

function populateTradeOptions(containers, optionName, attributeName) {
  containers.forEach((container) => {
    const category = container.dataset[attributeName] || "";
    const options =
      typeof window.getCmcenRetirementTradeRoles === "function"
        ? window.getCmcenRetirementTradeRoles(category)
        : [];

    container.replaceChildren(
      ...options.map((option) => createTradeRoleOption(option, optionName)),
    );
  });
}

function updateTradePicker({
  categorySelect,
  tradeRoleInput,
  officerPanel,
  ncmPanel,
  optionName,
  requiredMessage,
  clearSelection = true,
}) {
  const category = categorySelect?.value || "";
  const isOfficer = category === "officer";
  const isNcm = category === "ncm";

  officerPanel.hidden = !isOfficer;
  ncmPanel.hidden = !isNcm;

  if (clearSelection) {
    clearTradeRoleOptions(optionName);
  }

  if (category === "civilian") {
    tradeRoleInput.value = "Civilian";
    categorySelect.setCustomValidity("");
    return;
  }

  const selectedOption = getSelectedTradeRoleOption(optionName);
  tradeRoleInput.value = selectedOption?.value || "";

  if ((isOfficer || isNcm) && !tradeRoleInput.value) {
    categorySelect.setCustomValidity(requiredMessage);
    return;
  }

  categorySelect.setCustomValidity("");
}

function populateRetirementTradeOptions() {
  populateTradeOptions(
    retirementTradeOptionContainers,
    "retireeTradeRoleOption",
    "retirementTradeOptions",
  );
}

function updateRetirementTradePicker({ clearSelection = true } = {}) {
  updateTradePicker({
    categorySelect: retireeTradeCategory,
    tradeRoleInput: retireeTradeRole,
    officerPanel: retireeOfficerTradePanel,
    ncmPanel: retireeNcmTradePanel,
    optionName: "retireeTradeRoleOption",
    requiredMessage: translate("retirement_trade_role_required"),
    clearSelection,
  });
}

function createRetireeRankOption({ value = "", translationKey, fallback }) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = translationKey ? translate(translationKey) : fallback;

  return option;
}

function updateRetireeRankPicker({ clearSelection = true } = {}) {
  const category = retireeTradeCategory?.value || "";
  const requiresRankSelection = category === "officer" || category === "ncm";
  const selectedRank = clearSelection ? "" : retireeRank.value;

  retireeRankPicker.hidden = !requiresRankSelection;
  retireeRank.disabled = !requiresRankSelection;
  retireeRank.required = requiresRankSelection;

  retireeRank.replaceChildren(
    createRetireeRankOption({
      translationKey: "select_option",
      fallback: "Select an option",
    }),
    ...RETIREE_RANK_OPTIONS.filter((option) => option.category === category).map(
      createRetireeRankOption,
    ),
  );

  if (category === "civilian") {
    retireeRank.value = "Civilian";
  } else {
    retireeRank.value = selectedRank;
  }
}

function selectRetireeRank(rank) {
  const matchingOption = RETIREE_RANK_OPTIONS.find(
    (option) => option.value === rank,
  );
  const category = matchingOption?.category || "";

  retireeTradeCategory.value = category;
  updateRetirementTradePicker({ clearSelection: false });
  updateRetireeRankPicker({ clearSelection: false });
  retireeRank.value = rank || "";
}

function isCertificateRequestActive() {
  return certificateRequested?.checked === true;
}

function getCertificateRetireeName() {
  const certificateName = certificateMemberFullName?.value.trim();

  if (certificateName) {
    return certificateName;
  }

  return translate("certificate_retiring_member");
}

function updateCertificateFamilyCardContext(card) {
  const context = card.querySelector("[data-certificate-family-context]");
  const relationship = card.querySelector(
    "[data-certificate-family-relationship]",
  );

  if (!context || !relationship) {
    return;
  }

  const relationshipLabel = relationship.value
    ? relationship.selectedOptions[0]?.textContent || relationship.value
    : translate("certificate_family_member_generic");

  const memberName = document.createElement("span");
  memberName.className = "certificate-family-retiree-name";
  memberName.textContent = getCertificateRetireeName();

  const relationshipName = document.createElement("strong");
  relationshipName.className = "certificate-family-relationship";
  relationshipName.textContent = relationshipLabel;

  const prefix = document.createTextNode(
    translate("certificate_family_context_prefix"),
  );
  const connector = document.createTextNode(
    translate("certificate_family_context_connector"),
  );
  const end = document.createTextNode(".");
  const isFrench = getRetirementLanguage() === "fr";

  context.replaceChildren(
    prefix,
    ...(isFrench
      ? [relationshipName, connector, memberName, end]
      : [memberName, connector, relationshipName, end]),
  );
}

function updateCertificateFamilyOtherField(card) {
  const relationship = card.querySelector(
    "[data-certificate-family-relationship]",
  );
  const otherField = card.querySelector(
    "[data-certificate-family-other-field]",
  );
  const otherInput = card.querySelector("[data-certificate-family-other]");
  const isOther = relationship?.value === "other";

  if (otherField) {
    otherField.hidden = !isOther;
  }

  if (otherInput) {
    otherInput.disabled = !isCertificateRequestActive() || !isOther;
    otherInput.required = isOther;
  }
}

function updateCertificateFamilyCardLanguage(card, index) {
  const heading = card.querySelector("[data-certificate-family-heading]");
  const removeButton = card.querySelector("[data-certificate-family-remove]");
  const relationshipLabel = card.querySelector(
    "[data-certificate-family-relationship-label]",
  );
  const fullNameLabel = card.querySelector(
    "[data-certificate-family-full-name-label]",
  );
  const otherLabel = card.querySelector(
    "[data-certificate-family-other-label]",
  );
  const fullNameInput = card.querySelector(
    "[data-certificate-family-full-name]",
  );
  const otherInput = card.querySelector("[data-certificate-family-other]");

  if (heading) {
    heading.textContent = translate("certificate_family_member_number", {
      number: index + 1,
    });
  }

  if (removeButton) {
    removeButton.textContent = translate("certificate_remove_family_member");
    removeButton.setAttribute(
      "aria-label",
      translate("certificate_remove_family_member"),
    );
  }

  if (relationshipLabel) {
    relationshipLabel.textContent = translate("certificate_relationship_label");
  }

  if (fullNameLabel) {
    fullNameLabel.textContent = translate("certificate_family_full_name");
  }

  if (otherLabel) {
    otherLabel.textContent = translate("certificate_relationship_other_label");
  }

  if (fullNameInput) {
    fullNameInput.placeholder = translate(
      "certificate_family_full_name_placeholder",
    );
  }

  if (otherInput) {
    otherInput.placeholder = translate(
      "certificate_relationship_other_placeholder",
    );
  }

  const relationship = card.querySelector(
    "[data-certificate-family-relationship]",
  );

  if (relationship?.options[0]) {
    relationship.options[0].textContent = translate("select_option");
  }

  card
    .querySelectorAll("[data-certificate-relationship-key]")
    .forEach((option) => {
      option.textContent = translate(option.dataset.certificateRelationshipKey);
    });

  updateCertificateFamilyCardContext(card);
}

function updateCertificateFamilyCards() {
  Array.from(
    certificateFamilyList.querySelectorAll("[data-certificate-family-card]"),
  ).forEach((card, index) => {
    updateCertificateFamilyCardLanguage(card, index);
    updateCertificateFamilyOtherField(card);
  });
}

function createCertificateFamilyMemberCard() {
  certificateFamilyMemberSequence += 1;
  const sequence = certificateFamilyMemberSequence;
  const card = document.createElement("article");
  card.className = "certificate-family-card";
  card.dataset.certificateFamilyCard = "true";

  const header = document.createElement("header");
  header.className = "certificate-family-card-header";

  const heading = document.createElement("h4");
  heading.dataset.certificateFamilyHeading = "true";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "certificate-card-remove-button";
  removeButton.dataset.certificateFamilyRemove = "true";
  removeButton.addEventListener("click", () => {
    card.remove();
    updateCertificateFamilyCards();
  });

  header.append(heading, removeButton);

  const context = document.createElement("p");
  context.className = "certificate-family-context";
  context.dataset.certificateFamilyContext = "true";

  const grid = document.createElement("div");
  grid.className = "event-details-grid";

  const relationshipField = document.createElement("div");
  relationshipField.className = "event-field";

  const relationshipLabel = document.createElement("label");
  relationshipLabel.htmlFor = `certificateFamilyRelationship${sequence}`;
  relationshipLabel.dataset.certificateFamilyRelationshipLabel = "true";

  const relationship = document.createElement("select");
  relationship.id = `certificateFamilyRelationship${sequence}`;
  relationship.name = `certificateFamilyMembers[${sequence}][relationship]`;
  relationship.required = true;
  relationship.dataset.certificateFamilyRelationship = "true";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  relationship.append(placeholder);

  CERTIFICATE_FAMILY_RELATIONSHIPS.forEach(([value, key]) => {
    const option = document.createElement("option");
    option.value = value;
    option.dataset.certificateRelationshipKey = key;
    relationship.append(option);
  });

  relationship.addEventListener("change", () => {
    updateCertificateFamilyOtherField(card);
    updateCertificateFamilyCardContext(card);
  });

  relationshipField.append(relationshipLabel, relationship);

  const fullNameField = document.createElement("div");
  fullNameField.className = "event-field";

  const fullNameLabel = document.createElement("label");
  fullNameLabel.htmlFor = `certificateFamilyFullName${sequence}`;
  fullNameLabel.dataset.certificateFamilyFullNameLabel = "true";

  const fullName = document.createElement("input");
  fullName.id = `certificateFamilyFullName${sequence}`;
  fullName.name = `certificateFamilyMembers[${sequence}][fullName]`;
  fullName.type = "text";
  fullName.maxLength = 160;
  fullName.autocomplete = "name";
  fullName.required = true;
  fullName.dataset.certificateFamilyFullName = "true";
  fullNameField.append(fullNameLabel, fullName);

  const otherField = document.createElement("div");
  otherField.className = "event-field event-field-wide";
  otherField.hidden = true;
  otherField.dataset.certificateFamilyOtherField = "true";

  const otherLabel = document.createElement("label");
  otherLabel.htmlFor = `certificateFamilyRelationshipOther${sequence}`;
  otherLabel.dataset.certificateFamilyOtherLabel = "true";

  const other = document.createElement("input");
  other.id = `certificateFamilyRelationshipOther${sequence}`;
  other.name = `certificateFamilyMembers[${sequence}][relationshipOther]`;
  other.type = "text";
  other.maxLength = 80;
  other.disabled = true;
  other.dataset.certificateFamilyOther = "true";
  otherField.append(otherLabel, other);

  grid.append(relationshipField, fullNameField, otherField);
  card.append(header, context, grid);
  updateCertificateFamilyCardLanguage(
    card,
    certificateFamilyList.children.length,
  );

  return card;
}

function setCertificateRequestActive(active) {
  certificateRequested.setAttribute("aria-expanded", String(active));
  certificateRequestDetails.classList.toggle("is-open", active);
  certificateRequestDetails.setAttribute("aria-hidden", String(!active));

  certificateRequestDetails
    .querySelectorAll("input, select, textarea, button")
    .forEach((control) => {
      control.disabled = !active;
    });

  if (active && !certificateMemberFullName.value.trim()) {
    certificateMemberFullName.value = [
      getFieldValue("retireeFirstName"),
      getFieldValue("retireeLastName"),
    ]
      .filter(Boolean)
      .join(" ");
  }

  updateCertificateFamilyCards();
}

function resetCertificateRequestForm() {
  certificateFamilyList.replaceChildren();
  certificateRequested.checked = false;
  setCertificateRequestActive(false);
  certificateDateInputs.forEach((input) => {
    window.CMCENDateTimePicker?.refreshDateInput(input);
  });
}

function validateRetirementPhoto(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error(translate("retirement_photo_invalid"));
  }

  if (file.size > RETIREMENT_PHOTO_MAX_BYTES) {
    throw new Error(translate("retirement_photo_too_large"));
  }
}

async function uploadRetirementPhoto() {
  const file = getSelectedRetirementPhoto();

  validateRetirementPhoto(file);

  if (!file) {
    return {
      photoUrl: editingRetirementMessage?.photoUrl || "",
      photoDisplayUrl: editingRetirementMessage?.photoDisplayUrl || "",
    };
  }

  const uploadData = new FormData();

  uploadData.append("image", file);
  uploadData.append("uploadSource", "retirementMessage");
  uploadData.append("uploadContext", "retirement-message");
  uploadData.append("sourceField", "photoUrl");
  uploadData.append("displayAspectRatio", "4:3");
  const crop = retirementPhotoCrop.getCrop();
  uploadData.append("displayCropX", String(crop.x));
  uploadData.append("displayCropY", String(crop.y));
  uploadData.append(
    "sourceName",
    [
      getFieldValue("retireeRank"),
      getFieldValue("retireeFirstName"),
      getFieldValue("retireeLastName"),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const data = await retirementApiFetch("/api/upload", {
    method: "POST",
    body: uploadData,
    errorMessage: translate("retirement_photo_upload_error"),
  });

  if (!data.url) {
    throw new Error(translate("retirement_photo_upload_error"));
  }

  return {
    photoUrl: data.url,
    photoDisplayUrl: data.display?.url || "",
  };
}

function buildRetirementMessageData(photoUrl = "", photoDisplayUrl = "") {
  const message = getFieldValue("retirementMessageText");
  const memberReviewConfirmed = document.getElementById(
    "retirementMemberReviewConfirmed",
  ).checked;
  const consentConfirmed = document.getElementById(
    "retirementPublicationConsent",
  ).checked;

  updateRetirementTradePicker({
    clearSelection: false,
  });

  if (message.length < 100) {
    throw new Error(translate("retirement_message_too_short"));
  }

  if (!retireeTradeRole.value) {
    throw new Error(translate("retirement_trade_role_required"));
  }

  if (!memberReviewConfirmed) {
    throw new Error(translate("retirement_member_review_confirmed_required"));
  }

  if (!consentConfirmed) {
    throw new Error(translate("retirement_consent_required"));
  }

  const certificateRequest = isCertificateRequestActive()
    ? buildCertificateRequestData()
    : null;

  return {
    retiree: {
      rank: getFieldValue("retireeRank"),
      firstName: getFieldValue("retireeFirstName"),
      lastName: getFieldValue("retireeLastName"),
      postNominals: getFieldValue("retireePostNominals"),
      tradeRole: getFieldValue("retireeTradeRole"),
      retirementDate: getFieldValue("retireeRetirementDate"),
    },

    message,
    messageLanguage: retirementMessageLanguage.value,
    photoUrl: photoUrl || editingRetirementMessage?.photoUrl || "",
    photoDisplayUrl:
      photoDisplayUrl || editingRetirementMessage?.photoDisplayUrl || "",
    submitter: {
      firstName: getFieldValue("retirementSubmitterFirstName"),
      lastName: getFieldValue("retirementSubmitterLastName"),
      relationship: getFieldValue("retirementSubmitterRelationship"),
      email: getFieldValue("retirementSubmitterEmail"),
      unit: getFieldValue("retirementSubmitterUnit"),
    },

    publicationConsentConfirmed: consentConfirmed,
    memberReviewConfirmed,
    publishNow:
      !retirementPublishNowContainer.hidden && retirementPublishNow.checked,
    website: getFieldValue("retirementWebsite"),
    ...(certificateRequest ? { certificateRequest } : {}),
  };
}

function buildCertificateRequestData() {
  const decorations = Array.from(
    certificateRequestDetails.querySelectorAll(
      'input[name="certificateDecorations"]:checked',
    ),
  ).map((input) => input.value);

  if (!decorations.length) {
    throw new Error(translate("certificate_decorations_required"));
  }

  const familyMembers = Array.from(
    certificateFamilyList.querySelectorAll("[data-certificate-family-card]"),
  ).map((card) => ({
    relationship: card.querySelector(
      "[data-certificate-family-relationship]",
    )?.value,
    relationshipOther: card.querySelector("[data-certificate-family-other]")
      ?.value,
    fullName: card.querySelector("[data-certificate-family-full-name]")?.value,
  }));

  return {
    member: {
      fullName: getFieldValue("certificateMemberFullName"),
      rankLanguage: getFieldValue("certificateRankLanguage"),
      decorations,
      lastUnit: getFieldValue("certificateLastUnit"),
      cafEnrollmentDate: getFieldValue("certificateCafEnrollmentDate"),
      releaseDate: getFieldValue("certificateReleaseDate"),
      ceBranchEnrollmentDate: getFieldValue("certificateCeEnrollmentDate"),
      neededByDate: getFieldValue("certificateNeededByDate"),
      dwdParadeRequested: document.getElementById(
        "certificateDwdParadeRequested",
      ).checked,
    },
    familyMembers,
    mailingAddress: {
      line1: getFieldValue("certificateAddressLine1"),
      line2: getFieldValue("certificateAddressLine2"),
      city: getFieldValue("certificateCity"),
      province: getFieldValue("certificateProvince"),
      postalCode: getFieldValue("certificatePostalCode"),
      country: getFieldValue("certificateCountry"),
    },
  };
}

async function verifyRetirementAccess() {
  if (!retirementAuthToken) {
    redirectToLogin();
    return;
  }

  try {
    const user = await retirementApiJson("/api/me", {
      errorMessage: translate("retirement_permission_error"),
    });
    if (user.permissions?.canSubmitRetirementMessages !== true) {
      showRetirementFormMessage(translate("retirement_access_denied"));
      return;
    }

    currentRetirementUser = user;
    populateRetirementSubmitterFromProfile(user);

    const canBypassReview = user.permissions?.canBypassReviewStages === true;
    retirementPublishNowContainer.hidden = !canBypassReview;
    retirementReviewNote.hidden = canBypassReview;

    if (editingRetirementMessageId) {
      await loadRetirementMessageForEditing();
    }

    retirementSubmitForm.hidden = false;
  } catch (error) {
    showRetirementFormMessage(
      error.message || translate("retirement_permission_error"),
    );
  } finally {
    retirementPageLoading.hidden = true;
  }
}

function formatDateInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function setRetirementField(id, value = "") {
  const field = document.getElementById(id);

  if (field) {
    field.value = value || "";
  }
}

function setRetirementCheckbox(id, value = false) {
  const field = document.getElementById(id);

  if (field) {
    field.checked = Boolean(value);
  }
}

function populateRetirementSubmitterFromProfile(user = {}) {
  setRetirementField("retirementSubmitterFirstName", user.firstName);
  setRetirementField("retirementSubmitterLastName", user.lastName);
  setRetirementField("retirementSubmitterEmail", user.email);
  setRetirementField(
    "retirementSubmitterUnit",
    user.currentUnit || user.company,
  );
}

function selectRetirementTradeRole(tradeRole) {
  const option = Array.from(
    document.querySelectorAll('input[name="retireeTradeRoleOption"]'),
  ).find((input) => input.value === tradeRole);

  if (option) {
    option.checked = true;
    retireeTradeCategory.value =
      option.closest("[data-retirement-trade-options]")?.dataset
        .retirementTradeOptions || "";
    updateRetirementTradePicker({
      clearSelection: false,
    });
    return;
  }

  if (tradeRole === "Civilian") {
    retireeTradeCategory.value = "civilian";
    updateRetirementTradePicker({
      clearSelection: false,
    });
  }
}

function getRetirementMessageText(retirementMessage) {
  return (
    retirementMessage.message ||
    retirementMessage.messages?.[retirementMessage.messageLanguage] ||
    retirementMessage.messages?.en ||
    retirementMessage.messages?.fr ||
    ""
  );
}

function populateRetirementForm(retirementMessage) {
  const retiree = retirementMessage.retiree || {};
  const submitter = retirementMessage.submitter || {};

  selectRetireeRank(retiree.rank);
  setRetirementField("retireeFirstName", retiree.firstName);
  setRetirementField("retireeLastName", retiree.lastName);
  setRetirementField("retireePostNominals", retiree.postNominals);
  setRetirementField(
    "retireeRetirementDate",
    formatDateInputValue(retiree.retirementDate),
  );
  selectRetirementTradeRole(retiree.tradeRole);
  setRetirementField(
    "retirementMessageLanguage",
    retirementMessage.messageLanguage || getRetirementLanguage(),
  );
  setRetirementField(
    "retirementMessageText",
    getRetirementMessageText(retirementMessage),
  );
  CMCENUtils.bindCharacterCounters();
  setRetirementField("retirementSubmitterRelationship", submitter.relationship);
  setRetirementCheckbox("retirementMemberReviewConfirmed", true);
  setRetirementCheckbox("retirementPublicationConsent", true);
}

async function loadRetirementMessageForEditing() {
  retirementSubmitForm.hidden = true;

  const data = await retirementApiJson(
    `/api/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}/edit`,
    {
      errorMessage: translate("retirement_edit_load_error"),
    },
  );

  editingRetirementMessage = data.retirementMessage;
  populateRetirementForm(editingRetirementMessage);
  renderRetirementDeleteAction();

  if (editingRetirementMessage.rejectionReason) {
    showRetirementFormMessage(
      `${translate("my_events_rejection_reason")}: ${editingRetirementMessage.rejectionReason}`,
      "error",
    );
  } else {
    clearRetirementFormMessage();
  }
}

retirementSubmitForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearRetirementFormMessage();

  if (!retirementSubmitForm.checkValidity()) {
    retirementSubmitForm.reportValidity();
    return;
  }

  let formData;

  try {
    formData = buildRetirementMessageData();
  } catch (error) {
    showRetirementSubmissionToast(error.message);

    return;
  }

  setRetirementSubmitting(true);

  try {
    const uploadResult = await uploadRetirementPhoto();
    formData.photoUrl = uploadResult.photoUrl;
    formData.photoDisplayUrl = uploadResult.photoDisplayUrl;

    const requestUrl = editingRetirementMessageId
      ? `/api/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}`
      : "/api/retirement-messages";
    const requestMethod = editingRetirementMessageId ? "PATCH" : "POST";

    const data = await retirementApiJson(requestUrl, {
      method: requestMethod,
      body: formData,
      errorMessage: translate("retirement_submit_error"),
    });

    if (!editingRetirementMessageId) {
      retirementSubmitForm.reset();
      retirementPhotoCrop.reset();
      CMCENUtils.bindCharacterCounters();
      setDefaultMessageLanguage();
      updateRetireeRankPicker();
      updateRetirementTradePicker();
      resetCertificateRequestForm();
      populateRetirementSubmitterFromProfile(currentRetirementUser);
    }

    showRetirementSubmissionToast(
      data.status === "published" ||
        data.retirementMessage?.status === "published"
        ? translate("retirement_submit_success_published")
        : data.message ||
            translate(
              editingRetirementMessageId
                ? "retirement_update_success"
                : "retirement_submit_success",
            ),
      "success",
    );

    if (typeof window.refreshAuthUI === "function") {
      window.refreshAuthUI();
    }
  } catch (error) {
    showRetirementSubmissionToast(
      error.message || translate("retirement_submit_error"),
    );
  } finally {
    setRetirementSubmitting(false);
  }
});

retireeTradeCategory.addEventListener("change", () => {
  updateRetireeRankPicker();
  updateRetirementTradePicker();
});

certificateRequested.addEventListener("change", () => {
  setCertificateRequestActive(isCertificateRequestActive());
});

addCertificateFamilyMember.addEventListener("click", () => {
  const card = createCertificateFamilyMemberCard();
  certificateFamilyList.append(card);
  card.querySelector("[data-certificate-family-relationship]")?.focus();
});

["retireeFirstName", "retireeLastName"].forEach((id) => {
  document
    .getElementById(id)
    ?.addEventListener("input", updateCertificateFamilyCards);
});

certificateMemberFullName.addEventListener(
  "input",
  updateCertificateFamilyCards,
);

retirementSubmitForm.addEventListener("change", (event) => {
  if (event.target.matches('input[name="retireeTradeRoleOption"]')) {
    updateRetirementTradePicker({
      clearSelection: false,
    });
  }
});

populateRetirementTradeOptions();
setDefaultMessageLanguage();
updateRetireeRankPicker();
updateRetirementTradePicker();
setCertificateRequestActive(false);
updateRetirementFormModeText();
verifyRetirementAccess();

document.addEventListener("languagechange", () => {
  if (!editingRetirementMessageId) {
    setDefaultMessageLanguage();
  }

  updateRetireeRankPicker({ clearSelection: false });
  updateRetirementFormModeText();
  updateCertificateFamilyCards();
});
