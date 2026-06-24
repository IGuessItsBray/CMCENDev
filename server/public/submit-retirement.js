const retirementSubmitForm = document.getElementById("retirementSubmitForm");
const retirementFormMessage = document.getElementById("retirementFormMessage");
const retirementSubmitButton = document.getElementById("retirementSubmitButton");
const retirementMessageLanguage = document.getElementById("retirementMessageLanguage");

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
}

function getRetirementLanguage() {
    return (document.documentElement.lang === "fr" ? "fr" : "en");
}

function setDefaultMessageLanguage() {
    retirementMessageLanguage.value = getRetirementLanguage();
}

function getFieldValue(id) {
    return (document.getElementById(id)?.value.trim() || "");
}

function buildRetirementMessageData() {
    const message = getFieldValue("retirementMessageText");
    const consentConfirmed = document.getElementById("retirementPublicationConsent").checked;

    if (message.length < 100) {
        throw new Error(translate("retirement_message_too_short"));
    }

    if (!consentConfirmed) {
        throw new Error(translate("retirement_consent_required"));
    }

    return {
        retiree: {
            rank: getFieldValue("retireeRank"),
            firstName: getFieldValue("retireeFirstName"),
            lastName: getFieldValue("retireeLastName"),
            tradeRole: getFieldValue("retireeTradeRole"),
            yearsOfService: getFieldValue("retireeYearsOfService"),
            retirementDate: getFieldValue("retireeRetirementDate")
        },

        message,
        messageLanguage: retirementMessageLanguage.value,
        submitter: {
            firstName: getFieldValue("retirementSubmitterFirstName"),
            lastName: getFieldValue("retirementSubmitterLastName"),
            relationship: getFieldValue("retirementSubmitterRelationship"),
            email: getFieldValue("retirementSubmitterEmail"),
            unit: getFieldValue("retirementSubmitterUnit")
        },

        publicationConsentConfirmed: consentConfirmed,
        website: getFieldValue("retirementWebsite")
    };
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
            const response = await fetch(
                "/api/retirement-messages",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

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

            showRetirementFormMessage(translate("retirement_submit_success"), "success");
        } catch (error) {
            showRetirementFormMessage(error.message || translate("retirement_submit_error"));
        } finally {
            setRetirementSubmitting(false);
        }
    }
);

setDefaultMessageLanguage();

window.addEventListener("languagechange", setDefaultMessageLanguage);
