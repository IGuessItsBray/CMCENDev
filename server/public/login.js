const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginBtn");
const errorElement = document.getElementById("loginError");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const guestAccessLink = document.getElementById("guestAccessLink");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotPasswordButton = document.getElementById("forgotPasswordBtn");
const forgotPasswordBack = document.getElementById("forgotPasswordBack");
const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordButton = document.getElementById("resetPasswordBtn");
const resetPasswordBack = document.getElementById("resetPasswordBack");
const resetPasswordMessage = document.getElementById("resetPasswordMessage");
const emailVerificationForm = document.getElementById("emailVerificationForm");
const emailVerificationButton = document.getElementById("emailVerificationBtn");
const emailVerificationBack = document.getElementById("emailVerificationBack");
const emailVerificationMessage = document.getElementById(
  "emailVerificationMessage",
);
const emailVerificationCode = document.getElementById("emailVerificationCode");
const guestAccessForm = document.getElementById("guestAccessForm");
const guestAccessButton = document.getElementById("guestAccessBtn");
const guestAccessBack = document.getElementById("guestAccessBack");
const guestAccessMessage = document.getElementById("guestAccessMessage");
const guestEmail = document.getElementById("guestEmail");
const guestFirstName = document.getElementById("guestFirstName");
const guestCode = document.getElementById("guestCode");
const guestFirstNameField = document.getElementById("guestFirstNameField");
const guestCodeField = document.getElementById("guestCodeField");
const mfaOverlay = document.getElementById("mfaOverlay");
const mfaOptions = document.getElementById("mfaOptions");
const mfaTotpForm = document.getElementById("mfaTotpForm");
const mfaTotpCode = document.getElementById("mfaTotpCode");
const mfaError = document.getElementById("mfaError");
const mfaCancel = document.getElementById("mfaCancel");

let pendingMfa = null;
let mfaRestoreFocus = null;
let emailVerificationToken = "";
let guestVerificationToken = "";
const resetToken =
  new URLSearchParams(window.location.search).get("resetToken") || "";
const loginNotice =
  new URLSearchParams(window.location.search).get("notice") || "";

function setLoginMessage(message, type = "error") {
  errorElement.textContent = message;
  errorElement.hidden = !message;
  errorElement.classList.toggle("is-info", type === "info");
}

function getLoginTranslation(key, fallback) {
  if (typeof window.translate !== "function") {
    return fallback;
  }

  const translated = window.translate(key);
  return translated && translated !== key ? translated : fallback;
}

function requestLogin(username, password, sessionCookieConsent) {
  return CMCENUtils.apiJson("/api/login", {
    method: "POST",
    body: {
      username,
      password,
      sessionCookieConsent,
    },
    errorMessage: "Login failed",
  });
}

function setMfaMessage(message, type = "error") {
  mfaError.textContent = message;
  mfaError.hidden = !message;
  mfaError.classList.toggle("is-info", type === "info");
}

function setForgotPasswordMessage(message, type = "error") {
  forgotPasswordMessage.textContent = message;
  forgotPasswordMessage.hidden = !message;
  forgotPasswordMessage.classList.toggle("is-info", type === "info");
}

function setResetPasswordMessage(message, type = "error") {
  resetPasswordMessage.textContent = message;
  resetPasswordMessage.hidden = !message;
  resetPasswordMessage.classList.toggle("is-info", type === "info");
}

function setEmailVerificationMessage(message, type = "error") {
  emailVerificationMessage.textContent = message;
  emailVerificationMessage.hidden = !message;
  emailVerificationMessage.classList.toggle("is-info", type === "info");
}

function setGuestAccessMessage(message, type = "error") {
  guestAccessMessage.textContent = message;
  guestAccessMessage.hidden = !message;
  guestAccessMessage.classList.toggle("is-info", type === "info");
}

function showLoginForm(message = "", type = "info") {
  loginForm.hidden = false;
  forgotPasswordForm.hidden = true;
  resetPasswordForm.hidden = true;
  emailVerificationForm.hidden = true;
  guestAccessForm.hidden = true;
  setForgotPasswordMessage("");
  setResetPasswordMessage("");
  setEmailVerificationMessage("");
  setGuestAccessMessage("");
  setLoginMessage(message, type);
}

function showForgotPasswordForm() {
  loginForm.hidden = true;
  forgotPasswordForm.hidden = false;
  resetPasswordForm.hidden = true;
  emailVerificationForm.hidden = true;
  guestAccessForm.hidden = true;
  setLoginMessage("");
  setResetPasswordMessage("");
  setEmailVerificationMessage("");
  setGuestAccessMessage("");
  setForgotPasswordMessage("");
  document.getElementById("resetEmail").focus();
}

function showResetPasswordForm(message = "", type = "info") {
  loginForm.hidden = true;
  forgotPasswordForm.hidden = true;
  resetPasswordForm.hidden = false;
  emailVerificationForm.hidden = true;
  guestAccessForm.hidden = true;
  setLoginMessage("");
  setForgotPasswordMessage("");
  setEmailVerificationMessage("");
  setGuestAccessMessage("");
  setResetPasswordMessage(message, type);
  document.getElementById("newPassword").focus();
}

function showGuestAccessForm() {
  loginForm.hidden = true;
  forgotPasswordForm.hidden = true;
  resetPasswordForm.hidden = true;
  emailVerificationForm.hidden = true;
  guestAccessForm.hidden = false;
  guestVerificationToken = "";
  guestFirstNameField.hidden = true;
  guestCodeField.hidden = true;
  guestFirstName.required = false;
  guestCode.required = false;
  guestAccessButton.textContent = "Send code";
  setLoginMessage("");
  setForgotPasswordMessage("");
  setResetPasswordMessage("");
  setEmailVerificationMessage("");
  setGuestAccessMessage("");
  guestEmail.focus();
}

function showEmailVerificationForm(message = "", type = "info") {
  loginForm.hidden = true;
  forgotPasswordForm.hidden = true;
  resetPasswordForm.hidden = true;
  emailVerificationForm.hidden = false;
  guestAccessForm.hidden = true;
  setLoginMessage("");
  setForgotPasswordMessage("");
  setResetPasswordMessage("");
  setEmailVerificationMessage(message, type);
  emailVerificationCode.focus();
}

async function applyAccountLanguage(token) {
  try {
    const user = await CMCENUtils.apiJson("/api/me", {
      token,
      errorMessage: "Could not load account language",
    });

    if (
      ["en", "fr"].includes(user.preferredLanguage) &&
      typeof window.applyLanguage === "function"
    ) {
      window.applyLanguage(user.preferredLanguage);
    }
  } catch (error) {
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

  window.location.href = "/dashboard";
}

function ensureWebAuthnAvailable() {
  CMCENUtils.ensureWebAuthnAvailable(
    "Passkeys are not available in this browser context. Use HTTPS or localhost in a supported browser.",
  );
}

function openMfaDialog(methods, tempToken) {
  mfaRestoreFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
  mfaRestoreFocus?.focus();
  mfaRestoreFocus = null;
}

function getMfaFocusableElements() {
  return Array.from(
    mfaOverlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.getClientRects().length > 0);
}

async function passkeyMfaLogin(tempToken) {
  ensureWebAuthnAvailable();
  setMfaMessage("Use your passkey to finish signing in.", "info");

  const options = await CMCENUtils.apiJson(
    "/api/mfa/webauthn/authenticate/options",
    {
      method: "POST",
      tempToken,
      errorMessage: "Could not start passkey authentication",
    },
  );

  if (
    !Array.isArray(options.allowCredentials) ||
    !options.allowCredentials.length
  ) {
    throw new Error("No passkeys are registered for this account.");
  }

  const publicKey = CMCENUtils.preparePublicKeyRequestOptions(options);

  let assertion;
  try {
    assertion = await navigator.credentials.get({ publicKey });
  } catch {
    throw new Error(
      "This passkey is not available for this site. Passkeys registered on localhost cannot be used on staging; register a passkey on this domain or use an authenticator app.",
    );
  }

  const result = await CMCENUtils.apiJson(
    "/api/mfa/webauthn/authenticate/verify",
    {
      method: "POST",
      tempToken,
      body: CMCENUtils.serializeAssertionCredential(assertion),
      errorMessage: "Passkey authentication failed",
    },
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
    errorMessage: "Authenticator code was not accepted",
  });

  if (!result.token) {
    throw new Error("Login completed but no session token was returned");
  }

  return result.token;
}

mfaOptions.addEventListener("click", async (event) => {
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

mfaTotpForm.addEventListener("submit", async (event) => {
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

document.addEventListener("keydown", (event) => {
  if (mfaOverlay.hidden || !pendingMfa) return;

  if (event.key === "Escape") {
    event.preventDefault();
    pendingMfa.reject(new Error("Sign-in cancelled"));
    closeMfaDialog();
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = getMfaFocusableElements();
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement || !lastElement) return;

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
});

forgotPasswordLink.addEventListener("click", showForgotPasswordForm);
guestAccessLink.addEventListener("click", showGuestAccessForm);
forgotPasswordBack.addEventListener("click", () => showLoginForm(""));
resetPasswordBack.addEventListener("click", () => {
  window.history.replaceState({}, document.title, "/login");
  showLoginForm("");
});
emailVerificationBack.addEventListener("click", () => showLoginForm(""));
guestAccessBack.addEventListener("click", () => showLoginForm(""));

forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("resetEmail").value.trim();
  forgotPasswordButton.disabled = true;
  forgotPasswordButton.setAttribute("aria-busy", "true");
  setForgotPasswordMessage("");

  try {
    const data = await CMCENUtils.apiJson("/api/password-reset/request", {
      method: "POST",
      body: { email },
      errorMessage: "Could not request password reset",
    });

    setForgotPasswordMessage(
      data.message ||
        "If an account exists for that email address, a password reset link has been sent.",
      "info",
    );
  } catch (error) {
    setForgotPasswordMessage(error.message);
  } finally {
    forgotPasswordButton.disabled = false;
    forgotPasswordButton.removeAttribute("aria-busy");
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("newPassword").value;
  const passwordConfirmation = document.getElementById(
    "newPasswordConfirmation",
  ).value;

  if (password !== passwordConfirmation) {
    setResetPasswordMessage("Passwords do not match.");
    return;
  }

  resetPasswordButton.disabled = true;
  resetPasswordButton.setAttribute("aria-busy", "true");
  setResetPasswordMessage("");

  try {
    const data = await CMCENUtils.apiJson("/api/password-reset/confirm", {
      method: "POST",
      body: {
        token: resetToken,
        password,
        passwordConfirmation,
      },
      errorMessage: "Could not reset password",
    });

    resetPasswordForm.reset();
    window.history.replaceState({}, document.title, "/login");
    showLoginForm(
      data.message || "Password has been reset. You can now sign in.",
      "info",
    );
  } catch (error) {
    setResetPasswordMessage(error.message);
  } finally {
    resetPasswordButton.disabled = false;
    resetPasswordButton.removeAttribute("aria-busy");
  }
});

emailVerificationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const code = emailVerificationCode.value.trim();

  if (!code) {
    setEmailVerificationMessage("Enter the six-digit code from your email.");
    emailVerificationCode.focus();
    return;
  }

  emailVerificationButton.disabled = true;
  emailVerificationButton.setAttribute("aria-busy", "true");
  setEmailVerificationMessage("");

  try {
    const consented =
      CMCENUtils.hasSessionCookieConsent() ||
      (await CMCENUtils.requestSessionCookieConsent());

    if (!consented) {
      setEmailVerificationMessage(
        getLoginTranslation(
          "session_cookie_consent_declined",
          "You were not signed in. CMCEN needs the secure session cookie to protect your account.",
        ),
        "info",
      );
      return;
    }

    const data = await CMCENUtils.apiJson("/api/email-verification/confirm", {
      method: "POST",
      body: {
        verificationToken: emailVerificationToken,
        code,
        sessionCookieConsent: true,
      },
      errorMessage: "Could not verify email",
    });

    await completeLogin(data.token);
  } catch (error) {
    setEmailVerificationMessage(error.message);
  } finally {
    emailVerificationButton.disabled = false;
    emailVerificationButton.removeAttribute("aria-busy");
  }
});

guestAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  guestAccessButton.disabled = true;
  guestAccessButton.setAttribute("aria-busy", "true");
  setGuestAccessMessage("");

  try {
    if (!guestVerificationToken) {
      const data = await CMCENUtils.apiJson("/api/ghost/request", {
        method: "POST",
        body: {
          email: guestEmail.value.trim(),
        },
        errorMessage: "Could not request guest access",
      });

      guestVerificationToken = data.verificationToken || "";
      guestFirstNameField.hidden = false;
      guestCodeField.hidden = false;
      guestFirstName.required = true;
      guestCode.required = true;
      guestAccessButton.textContent = "Verify";
      setGuestAccessMessage(
        data.message || "Check your email for a guest access code.",
        "info",
      );
      guestFirstName.focus();
      return;
    }

    const consented =
      CMCENUtils.hasSessionCookieConsent() ||
      (await CMCENUtils.requestSessionCookieConsent());

    if (!consented) {
      setGuestAccessMessage(
        getLoginTranslation(
          "session_cookie_consent_declined",
          "You were not signed in. CMCEN needs the secure session cookie to protect your account.",
        ),
        "info",
      );
      return;
    }

    const data = await CMCENUtils.apiJson("/api/ghost/confirm", {
      method: "POST",
      body: {
        verificationToken: guestVerificationToken,
        firstName: guestFirstName.value.trim(),
        code: guestCode.value.trim(),
        sessionCookieConsent: true,
      },
      errorMessage: "Could not confirm guest access",
    });

    await completeLogin(data.token);
  } catch (error) {
    setGuestAccessMessage(error.message);
  } finally {
    guestAccessButton.disabled = false;
    guestAccessButton.removeAttribute("aria-busy");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  setLoginMessage("");
  loginButton.disabled = true;
  loginButton.setAttribute("aria-busy", "true");

  try {
    let data = await requestLogin(
      username,
      password,
      CMCENUtils.hasSessionCookieConsent(),
    );

    if (data.sessionCookieConsentRequired) {
      const consented = await CMCENUtils.requestSessionCookieConsent();

      if (!consented) {
        setLoginMessage(
          getLoginTranslation(
            "session_cookie_consent_declined",
            "You were not signed in. CMCEN needs the secure session cookie to protect your account.",
          ),
          "info",
        );
        return;
      }

      data = await requestLogin(username, password, true);
    }

    if (data.emailVerificationRequired) {
      emailVerificationToken = data.verificationToken || "";
      showEmailVerificationForm(
        data.message ||
          "Check your email for a verification code before signing in.",
        "info",
      );
      return;
    }

    if (data.twoFactorRequired) {
      const methods = Array.isArray(data.methods) ? data.methods : [];

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

if (resetToken) {
  showResetPasswordForm("Choose a new password for your account.", "info");
} else if (loginNotice === "td-insurance-members-only") {
  setLoginMessage(
    getLoginTranslation(
      "td_insurance_login_required",
      "You need to be logged in to view this item.",
    ),
  );
}
