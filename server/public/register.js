const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");
const passwordInput = document.getElementById("regPassword");
const passwordConfirmationInput = document.getElementById("regPasswordConfirmation");
const passwordStrength = document.getElementById("passwordStrength");
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

let registrationToken = "";
let pendingTotpAppName = "Authenticator app";

function normalizeToken(value) {
  return String(value || "").trim().replace(/^Bearer\s+/i, "");
}

function setStoredToken(token) {
  registrationToken = normalizeToken(token);

  if (!registrationToken) return;

  localStorage.setItem("token", registrationToken);
  localStorage.setItem("api_token", registrationToken);

  if (typeof window.refreshAuthUI === "function") {
    window.refreshAuthUI();
  }
}

function setRegisterError(message) {
  registerError.textContent = message;
  registerError.hidden = !message;
}

function setMfaError(message, type = "error") {
  registerMfaError.textContent = message;
  registerMfaError.hidden = !message;
  registerMfaError.classList.toggle("is-info", type === "info");
}

function getAuthHeaders() {
  const token = registrationToken || normalizeToken(localStorage.getItem("token"));

  if (!token) {
    throw new Error("Your account was created, but the setup session was not available. Please sign in to finish MFA setup.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function ensureWebAuthnAvailable() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Passkeys are not available in this browser context. Choose authenticator app instead.");
  }
}

function b64ToArrayBuffer(b64url) {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function mfaApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Could not complete MFA setup");
  }

  return data;
}

function showMfaSetup() {
  registerForm.hidden = true;
  registerMfa.hidden = false;
  document
    .querySelector(".register-shell")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  registerPasskeyOption.focus();
}

function finishRegistration() {
  window.location.href = "/dashboard.html";
}

async function setupPasskey() {
  registerPasskeyOption.disabled = true;
  registerTotpOption.disabled = true;

  try {
    ensureWebAuthnAvailable();
    setMfaError("Use your passkey to secure this account.", "info");

    const options = await mfaApi("/api/mfa/webauthn/register/options", {
      method: "POST",
      body: JSON.stringify({})
    });

    options.challenge = b64ToArrayBuffer(options.challenge);

    if (options.user?.id) {
      options.user.id = b64ToArrayBuffer(options.user.id);
    }

    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map(credential => ({
        ...credential,
        id: b64ToArrayBuffer(credential.id)
      }));
    }

    const credential = await navigator.credentials.create({
      publicKey: options
    });

    const payload = {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment || "",
      response: {
        clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
        attestationObject: arrayBufferToBase64url(credential.response.attestationObject)
      },
      transports: credential.response.getTransports
        ? credential.response.getTransports()
        : []
    };

    await mfaApi("/api/mfa/webauthn/register/verify", {
      method: "POST",
      body: JSON.stringify(payload)
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
    const appName = prompt("Authenticator app name", pendingTotpAppName);
    if (appName === null) {
      registerTotpOption.disabled = false;
      registerPasskeyOption.disabled = false;
      return;
    }

    pendingTotpAppName = appName.trim() || "Authenticator app";

    const setup = await mfaApi("/api/mfa/totp/setup", {
      method: "POST",
      body: JSON.stringify({ appName: pendingTotpAppName })
    });

    registerMfaOptions.hidden = true;
    registerTotpSetup.hidden = false;
    registerTotpOutput.replaceChildren();

    if (setup.qrcode) {
      const img = document.createElement("img");
      img.className = "mfa-qr";
      img.src = setup.qrcode;
      img.alt = "TOTP QR code";
      registerTotpOutput.appendChild(img);
    }

    const secret = document.createElement("code");
    secret.className = "mfa-secret";
    secret.textContent = setup.otpauth_url || JSON.stringify(setup);
    registerTotpOutput.appendChild(secret);
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
      body: JSON.stringify({ token: code, appName: pendingTotpAppName })
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

    setStoredToken(data.token);
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
registerTotpCode.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyTotp();
  }
});
