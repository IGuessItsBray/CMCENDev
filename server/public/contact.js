const contactForm = document.getElementById("contactForm");
const contactMessage = document.getElementById("contactMessage");
const contactSubmitButton = document.getElementById("contactSubmitButton");
const contactProfileDetails = document.getElementById("contactProfileDetails");

function showContactMessage(message, type = "error") {
  contactMessage.textContent = message;
  contactMessage.className = `contact-message is-${type}`;
  contactMessage.hidden = false;
}

function setContactSubmitting(isSubmitting) {
  contactSubmitButton.disabled = isSubmitting;
  contactSubmitButton.setAttribute("aria-busy", String(isSubmitting));
  contactSubmitButton.querySelector("span").textContent = translate(
    isSubmitting ? "contact_sending" : "contact_send",
  );
}

function getContactProfileItems(user) {
  const address = user.address || {};
  const name =
    user.accountName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ");
  const addressText = [
    address.line1,
    address.line2,
    [address.city, address.stateProvince].filter(Boolean).join(", "),
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    ["contact_name", name],
    ["contact_email", user.email],
    ["contact_phone", user.phone],
    ["contact_rank", user.rank],
    ["contact_unit", user.currentUnit || user.company],
    ["contact_address", addressText],
  ].filter(([, value]) => value);
}

function renderContactProfile(user) {
  contactProfileDetails.replaceChildren();

  getContactProfileItems(user).forEach(([labelKey, value]) => {
    const label = document.createElement("dt");
    label.textContent = translate(labelKey);
    const detail = document.createElement("dd");
    detail.textContent = value;
    contactProfileDetails.append(label, detail);
  });
}

async function initializeContactForm() {
  const redirect = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
  const token = CMCENUtils.requireAuthToken(redirect);
  if (!token) return;

  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      redirectOnUnauthorized: redirect,
      unauthorizedMessage: translate("contact_login_required"),
    });
    renderContactProfile(user);
    contactForm.hidden = false;
  } catch (error) {
    showContactMessage(error.message || translate("contact_load_error"));
  }
}

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  contactMessage.hidden = true;

  if (!contactForm.checkValidity()) {
    contactForm.reportValidity();
    return;
  }

  const redirect = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
  const token = CMCENUtils.requireAuthToken(redirect);
  if (!token) return;

  setContactSubmitting(true);
  try {
    const response = await CMCENUtils.apiJson("/api/contact", {
      method: "POST",
      token,
      body: {
        subject: document.getElementById("contactSubject").value,
        message: document.getElementById("contactBody").value,
      },
      redirectOnUnauthorized: redirect,
      unauthorizedMessage: translate("contact_login_required"),
    });
    contactForm.reset();
    showContactMessage(
      response.message || translate("contact_success"),
      "success",
    );
  } catch (error) {
    showContactMessage(error.message || translate("contact_send_error"));
  } finally {
    setContactSubmitting(false);
  }
});

initializeContactForm();
