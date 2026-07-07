const retirementSubmitForm = document.getElementById("retirementSubmitForm");
const retirementFormMessage = document.getElementById("retirementFormMessage");
const retirementSubmitButton = document.getElementById("retirementSubmitButton");
const retirementMessageLanguage = document.getElementById("retirementMessageLanguage");
const retirementPhotoInput = document.getElementById("retirementPhoto");
const retireeTradeCategory = document.getElementById("retireeTradeCategory");
const retireeTradeRole = document.getElementById("retireeTradeRole");
const retireeOfficerTradePanel = document.getElementById("retireeOfficerTradePanel");
const retireeNcmTradePanel = document.getElementById("retireeNcmTradePanel");

const retirementAuthToken = CMCENUtils.requireAuthToken();
const RETIREMENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const redirectToLogin = CMCENUtils.redirectToLogin;

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

function setRetirementSubmitting(isSubmitting) {
    retirementSubmitButton.disabled = isSubmitting;
    retirementSubmitButton.setAttribute("aria-busy", String(isSubmitting));
    retirementSubmitButton.setAttribute(
        "aria-label",
        translate(
            isSubmitting
                ? "retirement_submitting"
                : "retirement_submit_button"
        )
    );
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

    const response = await fetch(
        "/api/upload",
        {
            method: "POST",

            headers: CMCENUtils.authHeaders(retirementAuthToken),

            body:
                uploadData
        }
    );

    if (response.status === 401) {
        redirectToLogin();
        throw new Error(translate("retirement_permission_error"));
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
        throw new Error(data.error || translate("retirement_photo_upload_error"));
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
        photoUrl,
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
        const response = await fetch(
            "/api/me",
            {
                headers: CMCENUtils.authHeaders(retirementAuthToken)
            }
        );

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(translate("retirement_permission_error"));
        }

        const user = await response.json();

        if (user.permissions?.canSubmitRetirementMessages !== true) {
            showRetirementFormMessage(translate("retirement_access_denied"));
            return;
        }

        const submitterEmail = document.getElementById("retirementSubmitterEmail");

        if (submitterEmail && !submitterEmail.value) {
            submitterEmail.value = user.email || "";
        }

        retirementSubmitForm.hidden = false;
    } catch (error) {
        showRetirementFormMessage(error.message || translate("retirement_permission_error"));
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
            showRetirementFormMessage(error.message);

            return;
        }

        setRetirementSubmitting(true);

        try {
            formData.photoUrl =
                await uploadRetirementPhoto();

            const response = await fetch(
                "/api/retirement-messages",
                {
                    method: "POST",

                    headers: CMCENUtils.authHeaders(retirementAuthToken, {
                        "Content-Type":
                            "application/json"
                    }),

                    body:
                        JSON.stringify(formData)
                }
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || translate("retirement_submit_error"));
            }

            retirementSubmitForm.reset();
            setDefaultMessageLanguage();
            updateRetirementTradePicker();

            showRetirementFormMessage(
                data.status === "published"
                    ? translate("retirement_submit_success_published")
                    : data.message || translate("retirement_submit_success"),
                "success"
            );
        } catch (error) {
            showRetirementFormMessage(error.message || translate("retirement_submit_error"));
        } finally {
            setRetirementSubmitting(false);
        }
    }
);

retireeTradeCategory.addEventListener("change", updateRetirementTradePicker);

document
    .querySelectorAll('input[name="retireeTradeRoleOption"]')
    .forEach(option => {
        option.addEventListener(
            "change",
            () => updateRetirementTradePicker({
                clearSelection: false
            })
        );
    });

setDefaultMessageLanguage();
updateRetirementTradePicker();
verifyRetirementAccess();

window.addEventListener("languagechange", setDefaultMessageLanguage);
