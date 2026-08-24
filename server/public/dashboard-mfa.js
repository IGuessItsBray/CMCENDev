// Dashboard MFA helper: TOTP & WebAuthn handlers
document.addEventListener("DOMContentLoaded", () => {
  (async () => {
    const translateMfa = (key, replacements = {}) =>
      typeof window.translate === "function"
        ? window.translate(key, replacements)
        : key;

    const showMfaToast = (message, color = "info") => {
      CMCENUtils.showToast(message, {
        color,
        position: "bottom-right",
        animation: "slide",
      });
    };

    let currentTotpStatus = null;
    let currentPasskeys = null;
    let currentPasskeyError = "";
    let currentTotpError = "";
    let isLoadingPasskeys = false;
    let isLoadingTotpStatus = false;
    let isTotpSetupInProgress = false;
    let activeMfaTooltip = null;

    function removeMfaTooltip() {
      if (activeMfaTooltip) {
        activeMfaTooltip.remove();
        activeMfaTooltip = null;
      }
    }

    function showMfaTooltip(trigger) {
      removeMfaTooltip();

      const tooltip = document.createElement("div");
      tooltip.className = "mfa-card-tooltip";
      tooltip.textContent = trigger.dataset.tooltip || "";
      document.body.append(tooltip);

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const left = Math.max(
        12,
        Math.min(
          triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
          window.innerWidth - tooltipRect.width - 12,
        ),
      );
      const top = Math.max(12, triggerRect.bottom + 10);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      activeMfaTooltip = tooltip;
    }

    function refreshMfaHelpTooltips() {
      document.querySelectorAll(".mfa-card-help").forEach((help) => {
        const tooltip = translateMfa(help.dataset.tooltipKey);
        help.dataset.tooltip = tooltip;
        help.setAttribute("aria-label", tooltip);
      });
    }

    function ensureWebAuthnAvailable() {
      CMCENUtils.ensureWebAuthnAvailable(
        translateMfa("mfa_webauthn_unavailable"),
      );
    }

    refreshMfaHelpTooltips();

    document.querySelectorAll(".mfa-card-help").forEach((help) => {
      help.addEventListener("mouseenter", () => showMfaTooltip(help));
      help.addEventListener("mouseleave", removeMfaTooltip);
      help.addEventListener("focus", () => showMfaTooltip(help));
      help.addEventListener("blur", removeMfaTooltip);
      help.addEventListener("click", (event) => {
        event.preventDefault();
        showMfaTooltip(help);
      });
    });

    let token = CMCENUtils.getStoredAuthToken();

    if (token) {
      token = CMCENUtils.storeAuthToken(token);
    }

    function requireToken() {
      token = CMCENUtils.requireAuthToken("/login");

      if (!token) {
        throw new Error(translateMfa("mfa_authentication_required"));
      }

      return token;
    }

    async function api(path, opts = {}) {
      return CMCENUtils.apiJson(path, {
        ...opts,
        token: requireToken(),
        redirectOnUnauthorized: "/login",
        unauthorizedMessage: translateMfa("mfa_authentication_required"),
      });
    }

    function credentialLabel(credential, index) {
      return (
        credential.nickname ||
        translateMfa("mfa_passkey_number", {
          number: index + 1,
        })
      );
    }

    function describeCredential(credential) {
      const parts = [];

      if (
        credential.providerName &&
        credential.providerName !== credential.nickname
      ) {
        parts.push(credential.providerName);
      }

      if (credential.credentialDeviceType) {
        parts.push(
          credential.credentialDeviceType === "multiDevice"
            ? translateMfa("mfa_passkey_synced")
            : translateMfa("mfa_passkey_device_bound"),
        );
      }

      if (
        Array.isArray(credential.transports) &&
        credential.transports.length
      ) {
        parts.push(credential.transports.join(", "));
      }

      if (credential.credentialBackedUp) {
        parts.push(translateMfa("mfa_passkey_backed_up"));
      }

      return parts.join(" · ") || translateMfa("mfa_passkey_title");
    }

    function createEmptyMessage(message) {
      const empty = document.createElement("p");
      empty.className = "passkey-empty";
      empty.textContent = message;

      return empty;
    }

    function updatePasskeySetupButton(credentials) {
      const button = document.getElementById("webauthn-register");
      if (!button) return;

      button.textContent =
        Array.isArray(credentials) && credentials.length > 0
          ? translateMfa("mfa_add")
          : translateMfa("mfa_setup");
    }

    function renderPasskeys(credentials) {
      const list = document.getElementById("passkey-list");
      const manager = document.querySelector(".passkey-manager");
      if (!list) return;

      updatePasskeySetupButton(credentials);

      if (isLoadingPasskeys) {
        if (manager) manager.hidden = false;
        list.textContent = translateMfa("mfa_passkeys_loading");
        return;
      }

      if (currentPasskeyError) {
        if (manager) manager.hidden = false;
        list.replaceChildren(createEmptyMessage(currentPasskeyError));
        return;
      }

      if (!Array.isArray(credentials) || credentials.length === 0) {
        if (manager) manager.hidden = true;
        return;
      }

      if (manager) manager.hidden = false;

      list.replaceChildren(
        ...credentials.map((credential, index) => {
          const item = document.createElement("div");
          item.className = "passkey-item";

          const details = document.createElement("div");
          details.className = "passkey-details";

          const title = document.createElement("strong");
          title.textContent = credentialLabel(credential, index);

          const meta = document.createElement("span");
          meta.textContent = describeCredential(credential);

          details.append(title, meta);

          const actions = document.createElement("div");
          actions.className = "passkey-actions";

          const rename = document.createElement("button");
          rename.className = "mfa-link-button";
          rename.type = "button";
          rename.textContent = translateMfa("mfa_rename");
          rename.dataset.action = "rename-passkey";
          rename.dataset.credentialId = credential.id;
          rename.dataset.currentName = credentialLabel(credential, index);

          const remove = document.createElement("button");
          remove.className = "mfa-link-button mfa-link-button-danger";
          remove.type = "button";
          remove.textContent = translateMfa("mfa_delete");
          remove.dataset.action = "delete-passkey";
          remove.dataset.credentialId = credential.id;
          remove.dataset.currentName = credentialLabel(credential, index);

          actions.append(rename, remove);
          item.append(details, actions);

          return item;
        }),
      );
    }

    async function loadPasskeys() {
      const list = document.getElementById("passkey-list");
      if (!list) return;

      isLoadingPasskeys = true;
      currentPasskeyError = "";
      renderPasskeys(currentPasskeys);

      try {
        const credentials = await api("/api/mfa/webauthn/credentials");
        currentPasskeys = credentials;
      } catch (error) {
        currentPasskeyError = error.message;
      } finally {
        isLoadingPasskeys = false;
        renderPasskeys(currentPasskeys);
      }
    }

    async function renamePasskey(credentialID, currentName) {
      const nickname = await CMCENModal.prompt(
        translateMfa("mfa_passkey_provider_prompt"),
        {
          title: translateMfa("mfa_passkey_title"),
          inputLabel: translateMfa("mfa_passkey_provider_prompt"),
          defaultValue: currentName || "",
          confirmText: translateMfa("mfa_rename"),
        },
      );

      if (nickname === null) return;

      await api(
        `/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`,
        {
          method: "PATCH",
          json: true,
          body: { nickname },
        },
      );

      await loadPasskeys();
    }

    async function deletePasskey(credentialID, currentName) {
      const label = currentName || translateMfa("mfa_this_passkey");

      if (
        !(await CMCENModal.confirm(
          translateMfa("mfa_delete_passkey_confirm", { label }),
          {
            title: translateMfa("mfa_delete"),
            confirmText: translateMfa("mfa_delete"),
            destructive: true,
          },
        ))
      )
        return;

      await api(
        `/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`,
        {
          method: "DELETE",
          json: true,
          body: {},
        },
      );

      await loadPasskeys();
    }

    function renderTotpStatus(status) {
      const container = document.getElementById("totp-status");
      const manager = document.querySelector(".totp-manager");
      if (!container) return;

      const enabled = status?.enabled === true;
      const pending = status?.pending === true;

      if (isLoadingTotpStatus) {
        if (pending) {
          if (manager) manager.hidden = true;
          container.replaceChildren();
          return;
        }

        if (manager) manager.hidden = false;
        container.textContent = translateMfa("mfa_totp_status_loading");
        return;
      }

      if (currentTotpError) {
        if (pending) {
          if (manager) manager.hidden = true;
          container.replaceChildren();
          return;
        }

        if (manager) manager.hidden = false;
        container.replaceChildren(createEmptyMessage(currentTotpError));
        return;
      }

      const setupButton = document.getElementById("totp-setup");
      const verificationRow = document.getElementById("totp-verification");
      const setupOutput = document.getElementById("totp-otpauth");

      if (verificationRow) verificationRow.hidden = !pending;
      if (enabled && setupOutput) setupOutput.replaceChildren();

      if (setupButton) {
        setupButton.hidden = enabled;
        setupButton.disabled = false;
        setupButton.textContent = pending
          ? translateMfa("mfa_cancel_setup")
          : translateMfa("mfa_setup_totp");
      }

      container.replaceChildren();

      if (!enabled) {
        if (manager) manager.hidden = true;
        return;
      }

      if (manager) manager.hidden = false;

      const title = translateMfa("mfa_totp_default_app");
      const detail = translateMfa("mfa_totp_active_detail");

      const item = document.createElement("div");
      item.className = "totp-status-card";

      const copy = document.createElement("div");
      copy.className = "passkey-details";

      const strong = document.createElement("strong");
      strong.textContent = title;

      const span = document.createElement("span");
      span.textContent = detail;

      copy.append(strong, span);

      const actions = document.createElement("div");
      actions.className = "passkey-actions";

      const disable = document.createElement("button");
      disable.className = "mfa-link-button mfa-link-button-danger";
      disable.type = "button";
      disable.textContent = translateMfa("mfa_disable");
      disable.dataset.action = "disable-totp";
      actions.appendChild(disable);

      item.append(copy, actions);
      container.appendChild(item);
    }

    async function loadTotpStatus() {
      const container = document.getElementById("totp-status");
      if (!container) return;

      isLoadingTotpStatus = true;
      currentTotpError = "";
      renderTotpStatus(currentTotpStatus);

      try {
        const status = await api("/api/mfa/totp/status");

        currentTotpStatus =
          status.pending && !isTotpSetupInProgress
            ? await api("/api/mfa/totp", {
                method: "DELETE",
                json: true,
                body: {},
              })
            : status;
      } catch (error) {
        currentTotpError = error.message;
      } finally {
        isLoadingTotpStatus = false;
        renderTotpStatus(currentTotpStatus);
      }
    }

    async function disableTotp() {
      if (
        !(await CMCENModal.confirm(translateMfa("mfa_totp_disable_confirm"), {
          title: translateMfa("mfa_disable"),
          confirmText: translateMfa("mfa_disable"),
          destructive: true,
        }))
      )
        return;

      const status = await api("/api/mfa/totp", {
        method: "DELETE",
        json: true,
        body: {},
      });

      const container = document.getElementById("totp-otpauth");
      if (container) container.replaceChildren();

      const code = document.getElementById("totp-code");
      if (code) code.value = "";

      isTotpSetupInProgress = false;
      currentTotpStatus = status;
      renderTotpStatus(currentTotpStatus);
    }

    async function cancelTotpSetup() {
      const status = await api("/api/mfa/totp", {
        method: "DELETE",
        json: true,
        body: {},
      });

      const container = document.getElementById("totp-otpauth");
      if (container) container.replaceChildren();

      const code = document.getElementById("totp-code");
      if (code) code.value = "";

      isTotpSetupInProgress = false;
      currentTotpStatus = status;
      renderTotpStatus(currentTotpStatus);
    }

    // Wire TOTP buttons
    const totpSetupBtn = document.getElementById("totp-setup");
    const totpVerifyBtn = document.getElementById("totp-verify");
    const totpStatus = document.getElementById("totp-status");

    function appendTotpQrCode(container, qrcode) {
      if (!qrcode) return false;

      const setup = document.createElement("div");
      setup.className = "totp-qr-setup";

      const img = document.createElement("img");
      img.id = "totp-qr";
      img.src = qrcode;
      img.alt = translateMfa("mfa_totp_qr_alt");

      const instruction = document.createElement("p");
      instruction.className = "mfa-qr-instruction";
      instruction.id = "totp-qr-instruction";
      instruction.textContent = translateMfa("mfa_totp_scan_qr");

      setup.append(img, instruction);
      container.appendChild(setup);
      return true;
    }

    if (totpSetupBtn)
      totpSetupBtn.addEventListener("click", async () => {
        try {
          totpSetupBtn.disabled = true;

          if (currentTotpStatus?.pending) {
            await cancelTotpSetup();
            return;
          }

          const res = await api("/api/mfa/totp/setup", {
            method: "POST",
            json: true,
          });
          const container = document.getElementById("totp-otpauth");
          if (container) {
            container.replaceChildren();
            if (!appendTotpQrCode(container, res.qrcode)) {
              // fallback: fetch QR endpoint
              try {
                const qr = await api("/api/mfa/totp/qrcode");
                appendTotpQrCode(container, qr.qrcode);
              } catch (e) {
              }
            }
          }
          isTotpSetupInProgress = true;
          currentTotpStatus = { enabled: false, pending: true };
          renderTotpStatus(currentTotpStatus);
          await loadTotpStatus();
        } catch (e) {
          showMfaToast(
            translateMfa("mfa_error", { message: e.message }),
            "error",
          );
        } finally {
          totpSetupBtn.disabled = false;
        }
      });

    if (totpVerifyBtn)
      totpVerifyBtn.addEventListener("click", async () => {
        try {
          totpVerifyBtn.disabled = true;
          const code = document.getElementById("totp-code").value.trim();
          await api("/api/mfa/totp/verify", {
            method: "POST",
            body: {
              token: code,
            },
            errorMessage: "Could not verify TOTP token",
          });
          isTotpSetupInProgress = false;
          showMfaToast(translateMfa("mfa_totp_verified"), "success");
          await loadTotpStatus();
        } catch (e) {
          showMfaToast(
            translateMfa("mfa_verify_failed", { message: e.message }),
            "error",
          );
        } finally {
          totpVerifyBtn.disabled = false;
        }
      });

    // WebAuthn handlers
    const waRegisterBtn = document.getElementById("webauthn-register");
    const passkeyList = document.getElementById("passkey-list");

    if (waRegisterBtn)
      waRegisterBtn.addEventListener("click", async () => {
        try {
          waRegisterBtn.disabled = true;
          ensureWebAuthnAvailable();
          const options = CMCENUtils.preparePublicKeyCreationOptions(
            await api("/api/mfa/webauthn/register/options", {
              method: "POST",
              json: true,
            }),
          );
          if (!options || !options.challenge) {
            showMfaToast(
              translateMfa("mfa_registration_options_missing"),
              "error",
            );
            return;
          }

          // Fallback for missing pubKeyCredParams
          if (!options.pubKeyCredParams)
            options.pubKeyCredParams = [
              { type: "public-key", alg: -7 },
              { type: "public-key", alg: -257 },
            ];
          if (!options.rp) options.rp = { name: "CMCEN" };

          const cred = await navigator.credentials.create({
            publicKey: options,
          });

          await api("/api/mfa/webauthn/register/verify", {
            method: "POST",
            body: CMCENUtils.serializeAttestationCredential(cred),
            errorMessage: "Could not verify passkey registration",
          });

          showMfaToast(translateMfa("mfa_passkey_registered"), "success");
          await loadPasskeys();
        } catch (e) {
          showMfaToast(
            translateMfa("mfa_error", { message: e.message }),
            "error",
          );
        } finally {
          waRegisterBtn.disabled = false;
        }
      });

    if (totpStatus) {
      totpStatus.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        try {
          button.disabled = true;

          if (button.dataset.action === "disable-totp") {
            await disableTotp();
          }
        } catch (error) {
          showMfaToast(
            translateMfa("mfa_error", { message: error.message }),
            "error",
          );
        } finally {
          button.disabled = false;
        }
      });
    }

    if (passkeyList) {
      passkeyList.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        try {
          button.disabled = true;

          if (button.dataset.action === "rename-passkey") {
            await renamePasskey(
              button.dataset.credentialId,
              button.dataset.currentName,
            );
          }

          if (button.dataset.action === "delete-passkey") {
            await deletePasskey(
              button.dataset.credentialId,
              button.dataset.currentName,
            );
          }
        } catch (error) {
          showMfaToast(
            translateMfa("mfa_error", { message: error.message }),
            "error",
          );
        } finally {
          button.disabled = false;
        }
      });
    }

    document.addEventListener("languagechange", () => {
      removeMfaTooltip();
      refreshMfaHelpTooltips();
      renderTotpStatus(currentTotpStatus);
      renderPasskeys(currentPasskeys);

      const qrCode = document.getElementById("totp-qr");
      if (qrCode) {
        qrCode.alt = translateMfa("mfa_totp_qr_alt");
      }

      const qrInstruction = document.getElementById("totp-qr-instruction");
      if (qrInstruction) {
        qrInstruction.textContent = translateMfa("mfa_totp_scan_qr");
      }
    });

    await loadTotpStatus();
    await loadPasskeys();
  })();
});
