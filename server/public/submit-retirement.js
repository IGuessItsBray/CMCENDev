const retirementSubmitForm = document.getElementById("retirementSubmitForm");
const retirementFormMessage = document.getElementById("retirementFormMessage");
const retirementPageLoading = document.getElementById("retirementPageLoading");
const retirementSubmitButton = document.getElementById("retirementSubmitButton");
const retirementSubmitButtonLabel =
    retirementSubmitButton.querySelector("span");
const retirementSubmitTitle = document.getElementById("submitEventTitle");
const retirementSubmitIntro = document.getElementById("submitEventIntro");
const retirementMessageLanguage = document.getElementById("retirementMessageLanguage");
const retirementPhotoInput = document.getElementById("retirementPhoto");
const retireeTradeCategory = document.getElementById("retireeTradeCategory");
const retireeTradeRole = document.getElementById("retireeTradeRole");
const retireeOfficerTradePanel = document.getElementById("retireeOfficerTradePanel");
const retireeNcmTradePanel = document.getElementById("retireeNcmTradePanel");
const retirementTradeOptionContainers =
    document.querySelectorAll("[data-retirement-trade-options]");

const retirementAuthToken = CMCENUtils.requireAuthToken();
const RETIREMENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const redirectToLogin = CMCENUtils.redirectToLogin;
const retirementPageParams = new URLSearchParams(window.location.search);
const editingRetirementMessageId = retirementPageParams.get("id");

let editingRetirementMessage = null;

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
    deleteButton.textContent = "Delete submission";
    deleteButton.addEventListener("click", async () => {
        if (!await CMCENModal.confirm(
            "Delete this submitted retirement message? This cannot be undone.",
            { title: "Delete retirement message", confirmText: "Delete", destructive: true }
        )) return;

        deleteButton.disabled = true;
        try {
            await retirementApiJson(
                `/api/admin/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}`,
                { method: "DELETE", errorMessage: "Could not delete retirement message" }
            );
            window.location.href = "/retirements";
        } catch (error) {
            deleteButton.disabled = false;
            showRetirementSubmissionToast(
                error.message || "Could not delete retirement message"
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
        unauthorizedMessage: translate("retirement_permission_error")
    });
}

function retirementApiFetch(path, options = {}) {
    return CMCENUtils.apiFetch(path, {
        ...options,
        token: retirementAuthToken,
        redirectOnUnauthorized: true,
        unauthorizedMessage: translate("retirement_permission_error")
    });
}

function showRetirementFormMessage(message, type = "error") {
    retirementFormMessage.textContent = message;
    retirementFormMessage.className = `event-page-message is-${type}`;
    retirementFormMessage.hidden = false;
    retirementFormMessage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
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
        animation: "slide"
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
                    : "retirement_submit_button"
        )
    );
}

function updateRetirementFormModeText() {
    const isEditing = Boolean(editingRetirementMessageId);

    if (retirementSubmitTitle) {
        retirementSubmitTitle.textContent = translate(
            isEditing
                ? "retirement_edit_title"
                : "retirement_submit_title"
        );
    }

    if (retirementSubmitIntro) {
        retirementSubmitIntro.textContent = translate(
            isEditing
                ? "retirement_edit_intro"
                : "retirement_submit_intro"
        );
    }

    if (retirementSubmitButtonLabel) {
        retirementSubmitButtonLabel.textContent = translate(
            isEditing
                ? "retirement_save_changes"
                : "retirement_submit_button"
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
    return (document.getElementById(id)?.value.trim() || "");
}

function getSelectedRetirementPhoto() {
    return retirementPhotoInput?.files?.[0] || null;
}

function getSelectedTradeRoleOption() {
    return document.querySelector(
        'input[name="retireeTradeRoleOption"]:checked'
    );
}

function clearTradeRoleOptions() {
    document
        .querySelectorAll('input[name="retireeTradeRoleOption"]')
        .forEach(option => {
            option.checked = false;
        });
}

function createTradeRoleOption(tradeRole) {
    const label = document.createElement("label");
    label.className = "retirement-radio-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "retireeTradeRoleOption";
    input.value = tradeRole;

    const text = document.createElement("span");
    text.textContent = tradeRole;

    label.append(input, text);

    return label;
}

function populateRetirementTradeOptions() {
    retirementTradeOptionContainers.forEach(container => {
        const category = container.dataset.retirementTradeOptions || "";
        const options = typeof window.getCmcenRetirementTradeRoles === "function"
            ? window.getCmcenRetirementTradeRoles(category)
            : [];

        container.replaceChildren(
            ...options.map(createTradeRoleOption)
        );
    });
}

function updateRetirementTradePicker({ clearSelection = true } = {}) {
    const category = retireeTradeCategory?.value || "";
    const isOfficer = category === "officer";
    const isNcm = category === "ncm";

    retireeOfficerTradePanel.hidden = !isOfficer;
    retireeNcmTradePanel.hidden = !isNcm;

    if (clearSelection) {
        clearTradeRoleOptions();
    }

    if (category === "civilian") {
        retireeTradeRole.value = "Civilian";
        retireeTradeCategory.setCustomValidity("");
        return;
    }

    const selectedOption = getSelectedTradeRoleOption();
    retireeTradeRole.value = selectedOption?.value || "";

    if ((isOfficer || isNcm) && !retireeTradeRole.value) {
        retireeTradeCategory.setCustomValidity(
            translate("retirement_trade_role_required")
        );
        return;
    }

    retireeTradeCategory.setCustomValidity("");
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
        return "";
    }

    const uploadData = new FormData();

    uploadData.append("image", file);
    uploadData.append("uploadSource", "retirementMessage");
    uploadData.append("uploadContext", "retirement-message");
    uploadData.append("sourceField", "photoUrl");
    uploadData.append(
        "sourceName",
        [
            getFieldValue("retireeRank"),
            getFieldValue("retireeFirstName"),
            getFieldValue("retireeLastName")
        ].filter(Boolean).join(" ")
    );

    const data = await retirementApiFetch("/api/upload", {
        method: "POST",
        body: uploadData,
        errorMessage: translate("retirement_photo_upload_error")
    });

    if (!data.url) {
        throw new Error(translate("retirement_photo_upload_error"));
    }

    return data.url;
}

function buildRetirementMessageData(photoUrl = "") {
    const message = getFieldValue("retirementMessageText");
    const memberReviewConfirmed =
        document.getElementById("retirementMemberReviewConfirmed").checked;
    const consentConfirmed = document.getElementById("retirementPublicationConsent").checked;

    updateRetirementTradePicker({
        clearSelection: false
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

    return {
        retiree: {
            rank: getFieldValue("retireeRank"),
            firstName: getFieldValue("retireeFirstName"),
            lastName: getFieldValue("retireeLastName"),
            postNominals: getFieldValue("retireePostNominals"),
            tradeRole: getFieldValue("retireeTradeRole"),
            retirementDate: getFieldValue("retireeRetirementDate")
        },

        message,
        messageLanguage: retirementMessageLanguage.value,
        photoUrl:
            photoUrl ||
            editingRetirementMessage?.photoUrl ||
            "",
        submitter: {
            firstName: getFieldValue("retirementSubmitterFirstName"),
            lastName: getFieldValue("retirementSubmitterLastName"),
            relationship: getFieldValue("retirementSubmitterRelationship"),
            email: getFieldValue("retirementSubmitterEmail"),
            unit: getFieldValue("retirementSubmitterUnit")
        },

        publicationConsentConfirmed: consentConfirmed,
        memberReviewConfirmed,
        website: getFieldValue("retirementWebsite")
    };
}

async function verifyRetirementAccess() {
    if (!retirementAuthToken) {
        redirectToLogin();
        return;
    }

    try {
        const user = await retirementApiJson("/api/me", {
            errorMessage: translate("retirement_permission_error")
        });
        if (user.permissions?.canSubmitRetirementMessages !== true) {
            showRetirementFormMessage(translate("retirement_access_denied"));
            return;
        }

        const submitterEmail = document.getElementById("retirementSubmitterEmail");

        if (submitterEmail && !submitterEmail.value) {
            submitterEmail.value = user.email || "";
        }

        if (editingRetirementMessageId) {
            await loadRetirementMessageForEditing();
        }

        retirementSubmitForm.hidden = false;
    } catch (error) {
        showRetirementFormMessage(error.message || translate("retirement_permission_error"));
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

function selectRetirementTradeRole(tradeRole) {
    const option = Array.from(
        document.querySelectorAll('input[name="retireeTradeRoleOption"]')
    ).find(input => input.value === tradeRole);

    if (option) {
        option.checked = true;
        retireeTradeCategory.value =
            option.closest("[data-retirement-trade-options]")?.dataset
                .retirementTradeOptions || "";
        updateRetirementTradePicker({
            clearSelection: false
        });
        return;
    }

    if (tradeRole === "Civilian") {
        retireeTradeCategory.value = "civilian";
        updateRetirementTradePicker({
            clearSelection: false
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

    setRetirementField("retireeRank", retiree.rank);
    setRetirementField("retireeFirstName", retiree.firstName);
    setRetirementField("retireeLastName", retiree.lastName);
    setRetirementField("retireePostNominals", retiree.postNominals);
    setRetirementField(
        "retireeRetirementDate",
        formatDateInputValue(retiree.retirementDate)
    );
    selectRetirementTradeRole(retiree.tradeRole);
    setRetirementField(
        "retirementMessageLanguage",
        retirementMessage.messageLanguage || getRetirementLanguage()
    );
    setRetirementField(
        "retirementMessageText",
        getRetirementMessageText(retirementMessage)
    );
    setRetirementField("retirementSubmitterFirstName", submitter.firstName);
    setRetirementField("retirementSubmitterLastName", submitter.lastName);
    setRetirementField("retirementSubmitterRelationship", submitter.relationship);
    setRetirementField("retirementSubmitterEmail", submitter.email);
    setRetirementField("retirementSubmitterUnit", submitter.unit);
    setRetirementCheckbox("retirementMemberReviewConfirmed", true);
    setRetirementCheckbox("retirementPublicationConsent", true);
}

async function loadRetirementMessageForEditing() {
    retirementSubmitForm.hidden = true;

    const data = await retirementApiJson(
        `/api/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}/edit`,
        {
            errorMessage: translate("retirement_edit_load_error")
        }
    );

    editingRetirementMessage = data.retirementMessage;
    populateRetirementForm(editingRetirementMessage);
    renderRetirementDeleteAction();

    if (editingRetirementMessage.rejectionReason) {
        showRetirementFormMessage(
            `${translate("my_events_rejection_reason")}: ${editingRetirementMessage.rejectionReason}`,
            "error"
        );
    } else {
        clearRetirementFormMessage();
    }
}

retirementSubmitForm.addEventListener(
    "submit",
    async event => {
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
            formData.photoUrl =
                await uploadRetirementPhoto();

            const requestUrl = editingRetirementMessageId
                ? `/api/retirement-messages/${encodeURIComponent(editingRetirementMessageId)}`
                : "/api/retirement-messages";
            const requestMethod = editingRetirementMessageId
                ? "PATCH"
                : "POST";

            const data = await retirementApiJson(requestUrl, {
                method: requestMethod,
                body: formData,
                errorMessage: translate("retirement_submit_error")
            });

            if (!editingRetirementMessageId) {
                retirementSubmitForm.reset();
                setDefaultMessageLanguage();
                updateRetirementTradePicker();
            }

            showRetirementSubmissionToast(
                data.status === "published" ||
                    data.retirementMessage?.status === "published"
                    ? translate("retirement_submit_success_published")
                    : data.message || translate(
                        editingRetirementMessageId
                            ? "retirement_update_success"
                            : "retirement_submit_success"
                    ),
                "success"
            );

            if (typeof window.refreshAuthUI === "function") {
                window.refreshAuthUI();
            }
        } catch (error) {
            showRetirementSubmissionToast(
                error.message || translate("retirement_submit_error")
            );
        } finally {
            setRetirementSubmitting(false);
        }
    }
);

retireeTradeCategory.addEventListener("change", updateRetirementTradePicker);

retirementSubmitForm.addEventListener("change", event => {
    if (event.target.matches('input[name="retireeTradeRoleOption"]')) {
        updateRetirementTradePicker({
            clearSelection: false
        });
    }
});

populateRetirementTradeOptions();
setDefaultMessageLanguage();
updateRetirementTradePicker();
updateRetirementFormModeText();
verifyRetirementAccess();

window.addEventListener("languagechange", () => {
    if (!editingRetirementMessageId) {
        setDefaultMessageLanguage();
    }

    updateRetirementFormModeText();
});
