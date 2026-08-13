const lastPostSubmitForm = document.getElementById("lastPostSubmitForm");
const lastPostPageMessage = document.getElementById("lastPostPageMessage");
const lastPostSubmitButton = document.getElementById("lastPostSubmitButton");
const lastPostSubmitButtonLabel = lastPostSubmitButton.querySelector("span");
const lastPostImage = document.getElementById("lastPostImage");
const LAST_POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function getFieldValue(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function showPageMessage(message) {
  lastPostPageMessage.textContent = message;
  lastPostPageMessage.hidden = false;
}

function showFormMessage(message, type = "error") {
  CMCENUtils.showToast(message, {
    color: type === "success" ? "success" : "error",
    position: "bottom-right",
    animation: "slide",
  });
}

function clearFormMessage() {
  // Form results are presented as transient toasts.
}

function setSubmitting(isSubmitting) {
  lastPostSubmitButton.disabled = isSubmitting;
  lastPostSubmitButton.setAttribute("aria-busy", String(isSubmitting));
  lastPostSubmitButtonLabel.textContent = translate(
    isSubmitting ? "last_post_submitting" : "last_post_submit_button",
  );
}

function getSubmissionPayload(imageUrl = "") {
  const messageLanguage = getFieldValue("lastPostMessageLanguage");

  return {
    deceased: {
      fullRank: getFieldValue("lastPostDeceasedRank"),
      firstName: getFieldValue("lastPostDeceasedFirstName"),
      surname: getFieldValue("lastPostDeceasedSurname"),
      postNominal: getFieldValue("lastPostDeceasedPostNominal"),
    },
    messageLanguage,
    message: getFieldValue("lastPostMessage"),
    imageUrl,
  };
}

function validateLastPostImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    throw new Error(translate("last_post_image_invalid"));
  }

  if (file.size > LAST_POST_IMAGE_MAX_BYTES) {
    throw new Error(translate("last_post_image_too_large"));
  }
}

async function uploadLastPostImage(token) {
  const file = lastPostImage.files?.[0] || null;
  validateLastPostImage(file);
  if (!file) return "";

  const preparedFile = await CMCENUtils.prepareImageUploadFile(file);
  const uploadData = new FormData();
  uploadData.append("image", preparedFile);
  uploadData.append("uploadSource", "lastPostMessage");
  uploadData.append("uploadContext", "last-post");
  uploadData.append("sourceField", "imageUrl");
  uploadData.append(
    "sourceName",
    [
      getFieldValue("lastPostDeceasedRank"),
      getFieldValue("lastPostDeceasedFirstName"),
      getFieldValue("lastPostDeceasedSurname"),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const data = await CMCENUtils.apiFetch("/api/upload", {
    method: "POST",
    body: uploadData,
    token,
    redirectOnUnauthorized: true,
    unauthorizedMessage: translate("last_post_permission_error"),
    errorMessage: translate("last_post_image_upload_error"),
  });

  if (!data.url) {
    throw new Error(translate("last_post_image_upload_error"));
  }

  return data.url;
}

async function initializeLastPostSubmission() {
  const token = CMCENUtils.requireAuthToken();
  if (!token) return;

  try {
    const currentUser = await CMCENUtils.apiJson("/api/me", {
      token,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("last_post_permission_error"),
    });

    if (!currentUser.permissions?.canCreateDrafts) {
      showPageMessage(translate("last_post_access_denied"));
      return;
    }

    document.getElementById("lastPostMessageLanguage").value =
      CMCENUtils.getCurrentLanguage();
    lastPostSubmitForm.hidden = false;
  } catch (error) {
    showPageMessage(error.message || translate("last_post_permission_error"));
  }
}

lastPostSubmitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFormMessage();

  if (!lastPostSubmitForm.checkValidity()) {
    lastPostSubmitForm.reportValidity();
    return;
  }

  const token = CMCENUtils.requireAuthToken();
  if (!token) return;

  setSubmitting(true);
  try {
    const imageUrl = await uploadLastPostImage(token);
    const data = await CMCENUtils.apiJson("/api/last-posts", {
      method: "POST",
      token,
      body: getSubmissionPayload(imageUrl),
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("last_post_permission_error"),
    });
    lastPostSubmitForm.reset();
    CMCENUtils.bindCharacterCounters();
    document.getElementById("lastPostMessageLanguage").value =
      CMCENUtils.getCurrentLanguage();
    showFormMessage(
      data.message || translate("last_post_submit_success"),
      "success",
    );
  } catch (error) {
    showFormMessage(error.message || translate("last_post_submit_error"));
  } finally {
    setSubmitting(false);
  }
});

initializeLastPostSubmission();
