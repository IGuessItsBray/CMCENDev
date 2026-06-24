const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");
const passwordInput = document.getElementById("regPassword");
const passwordConfirmationInput = document.getElementById("regPasswordConfirmation");
const passwordStrength = document.getElementById("passwordStrength");

function getPasswordStrength(password) {
  let score = 0;

  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return score;
}

function updatePasswordStrength() {
  const password = passwordInput.value;
  const score = getPasswordStrength(password);
  const levels = [
    "is-empty",
    "is-weak",
    "is-weak",
    "is-fair",
    "is-good",
    "is-strong"
  ];

  passwordStrength.className = `password-strength ${password ? levels[score] : "is-empty"}`;
}

passwordInput.addEventListener("input", updatePasswordStrength);
passwordConfirmationInput.addEventListener("input", updatePasswordStrength);

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  registerError.textContent = "";
  registerError.hidden = true;
  registerButton.disabled = true;
  registerButton.setAttribute("aria-busy", "true");

  const formData = new FormData(registerForm);

  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") || "");

  if (password !== passwordConfirmation) {
    registerError.textContent = translate("passwords_do_not_match");
    registerError.hidden = false;
    registerButton.disabled = false;
    registerButton.removeAttribute("aria-busy");
    return;
  }

  const registration = {
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    addressLine1: String(formData.get("addressLine1") || "").trim(),
    addressLine2: String(formData.get("addressLine2") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    country: String(formData.get("country") || "").trim(),
    stateProvince: String(formData.get("stateProvince") || "").trim(),
    postalCode: String(formData.get("postalCode") || "").trim(),
    rank: String(formData.get("rank") || "").trim(),
    postNominals: String(formData.get("postNominals") || "").trim(),
    company: String(formData.get("company") || "").trim(),
    status: String(formData.get("status") || "").trim(),
    affiliationElement: String(formData.get("affiliationElement") || "").trim(),
    trade: String(formData.get("trade") || "").trim(),
    tradeOther: String(formData.get("tradeOther") || "").trim(),
    currentUnit: String(formData.get("currentUnit") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    password,
    passwordConfirmation
  };

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(registration)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Could not create account");
    }

    window.location.href = "/login.html";

  } catch (error) {
    registerError.textContent = error.message;
    registerError.hidden = false;
    registerError.focus?.();
  } finally {
    registerButton.disabled = false;
    registerButton.removeAttribute("aria-busy");
  }
});
