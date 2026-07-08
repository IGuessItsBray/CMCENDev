const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginBtn");
const errorElement = document.getElementById("loginError");
const mfaOverlay = document.getElementById("mfaOverlay");
const mfaOptions = document.getElementById("mfaOptions");
const mfaTotpForm = document.getElementById("mfaTotpForm");
const mfaTotpCode = document.getElementById("mfaTotpCode");
const mfaError = document.getElementById("mfaError");
const mfaCancel = document.getElementById("mfaCancel");

let pendingMfa = null;

function setLoginMessage(message, type = "error") {
  errorElement.textContent = message;
  errorElement.hidden = !message;
  errorElement.classList.toggle("is-info", type === "info");
}

function setMfaMessage(message, type = "error") {
  mfaError.textContent = message;
  mfaError.hidden = !message;
  mfaError.classList.toggle("is-info", type === "info");
}

async function applyAccountLanguage(token) {
  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      errorMessage: "Could not load account language"
    });

    if (
      ["en", "fr"].includes(user.preferredLanguage) &&
      typeof window.applyLanguage === "function"
    ) {
      window.applyLanguage(user.preferredLanguage);
    }
  } catch (error) {
    console.warn("Could not apply account language preference:", error);
  }
}

async function completeLogin(token) {
  const fullToken = CMCENUtils.storeAuthToken(token);

  if (!fullToken) {
    throw new Error("Login completed but no session token was returned");
  }

  CMCENUtils.clearMfaSession();
  await applyAccountLanguage(fullToken);

  if (typeof window.refreshAuthUI === "function") {
    window.refreshAuthUI();
  }

  window.location.href = "/dashboard.html";
}

function ensureWebAuthnAvailable() {
  CMCENUtils.ensureWebAuthnAvailable(
    "Passkeys are not available in this browser context. Use HTTPS or localhost in a supported browser."
  );
}

function openMfaDialog(methods, tempToken) {
  mfaOptions.replaceChildren();
  mfaTotpForm.hidden = true;
  mfaTotpCode.value = "";
  setMfaMessage("");
  mfaOverlay.hidden = false;

  return new Promise((resolve, reject) => {
    pendingMfa = { resolve, reject, tempToken };

    if (methods.includes("webauthn")) {
      const passkey = document.createElement("button");
      passkey.type = "button";
      passkey.className = "login-mfa-option";
      passkey.dataset.method = "webauthn";
      passkey.innerHTML =
        "<strong>Use passkey</strong><span>Verify with a registered device passkey.</span>";
      mfaOptions.appendChild(passkey);
    }

    if (methods.includes("totp")) {
      const totp = document.createElement("button");
      totp.type = "button";
      totp.className = "login-mfa-option";
      totp.dataset.method = "totp";
      totp.innerHTML =
        "<strong>Use authenticator app</strong><span>Enter a six-digit code from your app.</span>";
      mfaOptions.appendChild(totp);
    }

    const firstButton = mfaOptions.querySelector("button");
    if (firstButton) firstButton.focus();
  });
}

function closeMfaDialog() {
  mfaOverlay.hidden = true;
  mfaTotpForm.hidden = true;
  mfaTotpCode.value = "";
  pendingMfa = null;
}

async function passkeyMfaLogin(tempToken) {
  ensureWebAuthnAvailable();
  setMfaMessage("Use your passkey to finish signing in.", "info");

  const options = await CMCENUtils.apiJson(
    "/api/mfa/webauthn/authenticate/options",
    {
      method: "POST",
      tempToken,
      errorMessage: "Could not start passkey authentication"
    }
  );

  if (!Array.isArray(options.allowCredentials) || !options.allowCredentials.length) {
    throw new Error("No passkeys are registered for this account.");
  }

  const publicKey = CMCENUtils.preparePublicKeyRequestOptions(options);

  let assertion;
  try {
    assertion = await navigator.credentials.get({ publicKey });
  } catch {
    throw new Error(
      "This passkey is not available for this site. Passkeys registered on localhost cannot be used on staging; register a passkey on this domain or use an authenticator app."
    );
  }

  const result = await CMCENUtils.apiJson(
    "/api/mfa/webauthn/authenticate/verify",
    {
      method: "POST",
      tempToken,
      body: CMCENUtils.serializeAssertionCredential(assertion),
      errorMessage: "Passkey authentication failed"
    }
  );

  if (!result.token) {
    throw new Error("Login completed but no session token was returned");
  }

  return result.token;
}

async function totpMfaLogin(tempToken, code) {
  const result = await CMCENUtils.apiJson("/api/mfa/totp/verify", {
    method: "POST",
    tempToken,
    body: { token: code },
    errorMessage: "Authenticator code was not accepted"
  });

  if (!result.token) {
    throw new Error("Login completed but no session token was returned");
  }

  return result.token;
}

mfaOptions.addEventListener("click", async event => {
  const button = event.target.closest("button[data-method]");
  if (!button || !pendingMfa) return;

  setMfaMessage("");

  if (button.dataset.method === "totp") {
    mfaTotpForm.hidden = false;
    mfaTotpCode.focus();
    return;
  }

  try {
    button.disabled = true;
    const token = await passkeyMfaLogin(pendingMfa.tempToken);
    pendingMfa.resolve(token);
  } catch (error) {
    setMfaMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

mfaTotpForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingMfa) return;

  const code = mfaTotpCode.value.trim();
  if (!code) {
    setMfaMessage("Enter the code from your authenticator app.");
    return;
  }

  try {
    setMfaMessage("Checking authenticator code...", "info");
    const token = await totpMfaLogin(pendingMfa.tempToken, code);
    pendingMfa.resolve(token);
  } catch (error) {
    setMfaMessage(error.message);
  }
});

mfaCancel.addEventListener("click", () => {
  if (pendingMfa) {
    pendingMfa.reject(new Error("Sign-in cancelled"));
  }

  closeMfaDialog();
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  setLoginMessage("");
  loginButton.disabled = true;
  loginButton.setAttribute("aria-busy", "true");

  try {
    const data = await CMCENUtils.apiJson("/api/login", {
      method: "POST",
      body: {
        username,
        password
      },
      errorMessage: "Login failed"
    });

    if (data.twoFactorRequired) {
      const methods = Array.isArray(data.methods)
        ? data.methods
        : [];

      sessionStorage.setItem("tempToken", data.tempToken);
      sessionStorage.setItem("twoFactorMethods", JSON.stringify(methods));

      const token = await openMfaDialog(methods, data.tempToken);
      closeMfaDialog();
      await completeLogin(token);
    } else {
      await completeLogin(data.token);
    }
  } catch (error) {
    setLoginMessage(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.removeAttribute("aria-busy");
  }
});
