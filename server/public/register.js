const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");
const passwordInput = document.getElementById("regPassword");
const passwordConfirmationInput = document.getElementById("regPasswordConfirmation");
const passwordStrength = document.getElementById("passwordStrength");
const registerEmailVerification = document.getElementById("registerEmailVerification");
const registerEmailVerificationError = document.getElementById("registerEmailVerificationError");
const registerEmailVerificationCode = document.getElementById("registerEmailVerificationCode");
const registerEmailVerificationVerify = document.getElementById("registerEmailVerificationVerify");
const registerMfa = document.getElementById("registerMfa");
const registerMfaError = document.getElementById("registerMfaError");
const registerMfaOptions = document.getElementById("registerMfaOptions");
const registerPasskeyOption = document.getElementById("registerPasskeyOption");
const registerTotpOption = document.getElementById("registerTotpOption");
const registerTotpSetup = document.getElementById("registerTotpSetup");
const registerTotpOutput = document.getElementById("registerTotpOutput");
const registerTotpCode = document.getElementById("registerTotpCode");
const registerTotpVerify = document.getElementById("registerTotpVerify");
const registerTrade = document.getElementById("regTrade");
const registerTradeOtherField = document.getElementById("regTradeOtherField");
const registerTradeOther = document.getElementById("regTradeOther");
const registerPreferredLanguage = document.getElementById("regPreferredLanguage");

let registrationToken = "";
let emailVerificationToken = "";

function setStoredToken(token) {
  registrationToken = CMCENUtils.storeAuthToken(token);

  if (!registrationToken) {
    throw new Error("Account created, but no setup session token was returned.");
  }

  if (typeof window.refreshAuthUI === "function") {
    window.refreshAuthUI();
  }
}

function setRegisterError(message) {
  registerError.textContent = message;
  registerError.hidden = !message;
}

function setEmailVerificationError(message, type = "error") {
  registerEmailVerificationError.textContent = message;
  registerEmailVerificationError.hidden = !message;
  registerEmailVerificationError.classList.toggle("is-info", type === "info");
}

function setMfaError(message, type = "error") {
  registerMfaError.textContent = message;
  registerMfaError.hidden = !message;
  registerMfaError.classList.toggle("is-info", type === "info");
}

function getMfaToken() {
  const token = registrationToken || CMCENUtils.getStoredAuthToken();

  if (!token) {
    throw new Error("Your account was created, but the setup session was not available. Please sign in to finish MFA setup.");
  }

  return token;
}

function ensureWebAuthnAvailable() {
  CMCENUtils.ensureWebAuthnAvailable(
    "Passkeys are not available in this browser context. Choose authenticator app instead."
  );
}

async function mfaApi(path, options = {}) {
  return CMCENUtils.apiJson(path, {
    ...options,
    token: getMfaToken(),
    errorMessage: options.errorMessage || "Could not complete MFA setup"
  });
}

function showEmailVerification() {
  registerForm.hidden = true;
  registerEmailVerification.hidden = false;
  registerMfa.hidden = true;
  setEmailVerificationError("Enter the code from your email.", "info");
  document
    .querySelector(".register-shell")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  registerEmailVerificationCode.focus();
}

function showMfaSetup() {
  registerForm.hidden = true;
  registerEmailVerification.hidden = true;
  registerMfa.hidden = false;
  document
    .querySelector(".register-shell")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  registerPasskeyOption.focus();
}

function finishRegistration() {
  window.location.href = "/dashboard";
}

async function verifyEmailCode() {
  const code = registerEmailVerificationCode.value.trim();

  if (!code) {
    setEmailVerificationError("Enter the six-digit code from your email.");
    registerEmailVerificationCode.focus();
    return;
  }

  registerEmailVerificationVerify.disabled = true;

  try {
    const data = await CMCENUtils.apiJson("/api/email-verification/confirm", {
      method: "POST",
      body: {
        verificationToken: emailVerificationToken,
        code
      },
      errorMessage: "Could not verify email"
    });

    setStoredToken(data.token);
    showMfaSetup();
  } catch (error) {
    setEmailVerificationError(error.message);
    registerEmailVerificationCode.focus();
  } finally {
    registerEmailVerificationVerify.disabled = false;
  }
}

async function setupPasskey() {
  registerPasskeyOption.disabled = true;
  registerTotpOption.disabled = true;

  try {
    ensureWebAuthnAvailable();
    setMfaError("Use your passkey to secure this account.", "info");

    const options = CMCENUtils.preparePublicKeyCreationOptions(await mfaApi("/api/mfa/webauthn/register/options", {
      method: "POST",
      body: {}
    }));

    const credential = await navigator.credentials.create({
      publicKey: options
    });

    await mfaApi("/api/mfa/webauthn/register/verify", {
      method: "POST",
      body: CMCENUtils.serializeAttestationCredential(credential)
    });

    finishRegistration();
  } catch (error) {
    setMfaError(error.message);
    registerPasskeyOption.disabled = false;
    registerTotpOption.disabled = false;
  }
}

async function setupTotp() {
  setMfaError("");
  registerTotpOption.disabled = true;
  registerPasskeyOption.disabled = true;

  try {
    const setup = await mfaApi("/api/mfa/totp/setup", {
      method: "POST"
    });

    registerMfaOptions.hidden = true;
    registerTotpSetup.hidden = false;
    registerTotpOutput.replaceChildren();

    if (setup.qrcode) {
      const qrSetup = document.createElement("div");
      qrSetup.className = "totp-qr-setup";

      const img = document.createElement("img");
      img.className = "mfa-qr";
      img.src = setup.qrcode;
      img.alt = translate("mfa_totp_qr_alt");

      const instruction = document.createElement("p");
      instruction.className = "mfa-qr-instruction";
      instruction.textContent = translate("mfa_totp_scan_qr");

      qrSetup.append(img, instruction);
      registerTotpOutput.appendChild(qrSetup);
    }
    registerTotpCode.focus();
  } catch (error) {
    setMfaError(error.message);
    registerTotpOption.disabled = false;
    registerPasskeyOption.disabled = false;
  }
}

async function verifyTotp() {
  const code = registerTotpCode.value.trim();

  if (!code) {
    setMfaError("Enter the six-digit code from your authenticator app.");
    registerTotpCode.focus();
    return;
  }

  registerTotpVerify.disabled = true;

  try {
    await mfaApi("/api/mfa/totp/verify", {
      method: "POST",
      body: { token: code }
    });

    finishRegistration();
  } catch (error) {
    setMfaError(error.message);
    registerTotpCode.focus();
  } finally {
    registerTotpVerify.disabled = false;
  }
}

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

function updateRegisterTradeOtherVisibility() {
  const showOther = registerTrade?.value === "other";

  if (registerTradeOtherField) {
    registerTradeOtherField.hidden = !showOther;
  }

  if (registerTradeOther) {
    registerTradeOther.disabled = !showOther;
    registerTradeOther.required = showOther;

    if (!showOther) {
      registerTradeOther.value = "";
    }
  }
}

passwordInput.addEventListener("input", updatePasswordStrength);
passwordConfirmationInput.addEventListener("input", updatePasswordStrength);
window.populateCmcenTradeSelect?.(registerTrade);
updateRegisterTradeOtherVisibility();
registerTrade?.addEventListener("change", updateRegisterTradeOtherVisibility);

if (registerPreferredLanguage) {
  registerPreferredLanguage.value = CMCENUtils.getCurrentLanguage();
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  setRegisterError("");
  registerButton.disabled = true;
  registerButton.setAttribute("aria-busy", "true");

  const formData = new FormData(registerForm);

  const password = String(formData.get("password") || "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") || "");

  if (password !== passwordConfirmation) {
    setRegisterError(translate("passwords_do_not_match"));
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
    preferredLanguage: String(formData.get("preferredLanguage") || "en").trim(),
    email: String(formData.get("email") || "").trim(),
    password,
    passwordConfirmation
  };

  try {
    const data = await CMCENUtils.apiJson("/api/register", {
      method: "POST",
      body: registration,
      errorMessage: "Could not create account"
    });

    if (data.emailVerificationRequired) {
      emailVerificationToken = data.verificationToken || "";
      showEmailVerification();
      return;
    }

    setStoredToken(data.token);
    if (typeof window.applyLanguage === "function") {
      window.applyLanguage(registration.preferredLanguage);
    }
    showMfaSetup();

  } catch (error) {
    setRegisterError(error.message);
    registerError.focus?.();
  } finally {
    registerButton.disabled = false;
    registerButton.removeAttribute("aria-busy");
  }
});

registerPasskeyOption.addEventListener("click", setupPasskey);
registerTotpOption.addEventListener("click", setupTotp);
registerTotpVerify.addEventListener("click", verifyTotp);
registerEmailVerificationVerify.addEventListener("click", verifyEmailCode);
registerEmailVerificationCode.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyEmailCode();
  }
});
registerTotpCode.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyTotp();
  }
});
