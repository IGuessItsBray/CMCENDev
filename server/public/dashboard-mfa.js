// Dashboard MFA helper: TOTP & WebAuthn handlers
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    const translateMfa = (key, replacements = {}) =>
      typeof window.translate === 'function'
        ? window.translate(key, replacements)
        : key;

    let currentTotpStatus = null;
    let currentPasskeys = null;
    let currentPasskeyError = '';
    let currentTotpError = '';
    let isLoadingPasskeys = false;
    let isLoadingTotpStatus = false;

    function ensureWebAuthnAvailable() {
      CMCENUtils.ensureWebAuthnAvailable(translateMfa('mfa_webauthn_unavailable'));
    }

    let token = CMCENUtils.getStoredAuthToken();

    if (token) {
      token = CMCENUtils.storeAuthToken(token);
    }

    function requireToken() {
      token = CMCENUtils.requireAuthToken('/login.html');

      if (!token) {
        throw new Error(translateMfa('mfa_authentication_required'));
      }

      return token;
    }

    async function api(path, opts = {}){
      return CMCENUtils.apiJson(path, {
        ...opts,
        token: requireToken(),
        redirectOnUnauthorized: '/login.html',
        unauthorizedMessage: translateMfa('mfa_authentication_required')
      });
    }

    function credentialLabel(credential, index) {
      return credential.nickname || translateMfa('mfa_passkey_number', {
        number: index + 1
      });
    }

    function describeCredential(credential) {
      const parts = [];

      if (credential.providerName && credential.providerName !== credential.nickname) {
        parts.push(credential.providerName);
      }

      if (credential.credentialDeviceType) {
        parts.push(credential.credentialDeviceType === 'multiDevice'
          ? translateMfa('mfa_passkey_synced')
          : translateMfa('mfa_passkey_device_bound'));
      }

      if (Array.isArray(credential.transports) && credential.transports.length) {
        parts.push(credential.transports.join(', '));
      }

      if (credential.credentialBackedUp) {
        parts.push(translateMfa('mfa_passkey_backed_up'));
      }

      return parts.join(' · ') || translateMfa('mfa_passkey_title');
    }

    function createEmptyMessage(message) {
      const empty = document.createElement('p');
      empty.className = 'passkey-empty';
      empty.textContent = message;

      return empty;
    }

    function renderPasskeys(credentials) {
      const list = document.getElementById('passkey-list');
      if (!list) return;

      if (isLoadingPasskeys) {
        list.textContent = translateMfa('mfa_passkeys_loading');
        return;
      }

      if (currentPasskeyError) {
        list.replaceChildren(createEmptyMessage(currentPasskeyError));
        return;
      }

      if (!Array.isArray(credentials) || credentials.length === 0) {
        list.replaceChildren(createEmptyMessage(translateMfa('mfa_passkeys_empty')));
        return;
      }

      list.replaceChildren(
        ...credentials.map((credential, index) => {
          const item = document.createElement('div');
          item.className = 'passkey-item';

          const details = document.createElement('div');
          details.className = 'passkey-details';

          const title = document.createElement('strong');
          title.textContent = credentialLabel(credential, index);

          const meta = document.createElement('span');
          meta.textContent = describeCredential(credential);

          details.append(title, meta);

          const actions = document.createElement('div');
          actions.className = 'passkey-actions';

          const rename = document.createElement('button');
          rename.className = 'mfa-link-button';
          rename.type = 'button';
          rename.textContent = translateMfa('mfa_rename');
          rename.dataset.action = 'rename-passkey';
          rename.dataset.credentialId = credential.id;
          rename.dataset.currentName = credentialLabel(credential, index);

          const remove = document.createElement('button');
          remove.className = 'mfa-link-button mfa-link-button-danger';
          remove.type = 'button';
          remove.textContent = translateMfa('mfa_delete');
          remove.dataset.action = 'delete-passkey';
          remove.dataset.credentialId = credential.id;
          remove.dataset.currentName = credentialLabel(credential, index);

          actions.append(rename, remove);
          item.append(details, actions);

          return item;
        })
      );
    }

    async function loadPasskeys() {
      const list = document.getElementById('passkey-list');
      if (!list) return;

      isLoadingPasskeys = true;
      currentPasskeyError = '';
      renderPasskeys(currentPasskeys);

      try {
        const credentials = await api('/api/mfa/webauthn/credentials');
        currentPasskeys = credentials;
      } catch (error) {
        currentPasskeyError = error.message;
      } finally {
        isLoadingPasskeys = false;
        renderPasskeys(currentPasskeys);
      }
    }

    async function renamePasskey(credentialID, currentName) {
      const nickname = prompt(
        translateMfa('mfa_passkey_provider_prompt'),
        currentName || ''
      );

      if (nickname === null) return;

      await api(`/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`, {
        method: 'PATCH',
        json: true,
        body: { nickname }
      });

      await loadPasskeys();
    }

    async function deletePasskey(credentialID, currentName) {
      const label = currentName || translateMfa('mfa_this_passkey');

      if (!confirm(translateMfa('mfa_delete_passkey_confirm', { label }))) return;

      await api(`/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`, {
        method: 'DELETE',
        json: true,
        body: {}
      });

      await loadPasskeys();
    }

    function renderTotpStatus(status) {
      const container = document.getElementById('totp-status');
      if (!container) return;

      if (isLoadingTotpStatus) {
        container.textContent = translateMfa('mfa_totp_status_loading');
        return;
      }

      if (currentTotpError) {
        container.replaceChildren(createEmptyMessage(currentTotpError));
        return;
      }

      const enabled = status?.enabled === true;
      const pending = status?.pending === true;
      const appName = status?.appName || translateMfa('mfa_totp_default_app');

      const setupButton = document.getElementById('totp-setup');
      if (setupButton) {
        setupButton.disabled = enabled;
        setupButton.textContent = enabled
          ? translateMfa('mfa_totp_enabled_button')
          : pending
            ? translateMfa('mfa_totp_restart_setup')
            : translateMfa('mfa_setup_totp');
      }

      const title = enabled
        ? appName
        : pending
          ? translateMfa('mfa_totp_setup_pending_title', { appName })
          : translateMfa('mfa_totp_not_enabled');
      const detail = enabled
        ? translateMfa('mfa_totp_active_detail')
        : pending
          ? translateMfa('mfa_totp_pending_detail')
          : translateMfa('mfa_totp_not_enabled_detail');

      container.replaceChildren();

      const item = document.createElement('div');
      item.className = 'totp-status-card';

      const copy = document.createElement('div');
      copy.className = 'passkey-details';

      const strong = document.createElement('strong');
      strong.textContent = title;

      const span = document.createElement('span');
      span.textContent = detail;

      copy.append(strong, span);

      const actions = document.createElement('div');
      actions.className = 'passkey-actions';

      if ((enabled || pending) && status?.canRename === true) {
        const rename = document.createElement('button');
        rename.className = 'mfa-link-button';
        rename.type = 'button';
        rename.textContent = translateMfa('mfa_rename');
        rename.dataset.action = 'rename-totp';
        rename.dataset.currentName = appName;
        actions.appendChild(rename);
      }

      if (enabled || pending) {
        const disable = document.createElement('button');
        disable.className = 'mfa-link-button mfa-link-button-danger';
        disable.type = 'button';
        disable.textContent = enabled
          ? translateMfa('mfa_disable')
          : translateMfa('mfa_cancel_setup');
        disable.dataset.action = 'disable-totp';
        actions.appendChild(disable);
      }

      item.append(copy, actions);
      container.appendChild(item);
    }

    async function loadTotpStatus() {
      const container = document.getElementById('totp-status');
      if (!container) return;

      isLoadingTotpStatus = true;
      currentTotpError = '';
      renderTotpStatus(currentTotpStatus);

      try {
        currentTotpStatus = await api('/api/mfa/totp/status');
      } catch (error) {
        currentTotpError = error.message;
      } finally {
        isLoadingTotpStatus = false;
        renderTotpStatus(currentTotpStatus);
      }
    }

    async function renameTotp(currentName) {
      const appName = prompt(
        translateMfa('mfa_totp_rename_prompt'),
        currentName || translateMfa('mfa_totp_default_app')
      );

      if (appName === null) return;

      const status = await api('/api/mfa/totp/rename', {
        method: 'POST',
        json: true,
        body: { appName }
      });

      currentTotpStatus = status;
      renderTotpStatus(currentTotpStatus);
    }

    async function disableTotp() {
      if (!confirm(translateMfa('mfa_totp_disable_confirm'))) return;

      const status = await api('/api/mfa/totp', {
        method: 'DELETE',
        json: true,
        body: {}
      });

      const container = document.getElementById('totp-otpauth');
      if (container) container.replaceChildren();

      const code = document.getElementById('totp-code');
      if (code) code.value = '';

      currentTotpStatus = status;
      renderTotpStatus(currentTotpStatus);
    }

    // Wire TOTP buttons
    const totpSetupBtn = document.getElementById('totp-setup');
    const totpVerifyBtn = document.getElementById('totp-verify');
    const totpRefreshBtn = document.getElementById('totp-refresh');
    const totpStatus = document.getElementById('totp-status');

    if (totpSetupBtn) totpSetupBtn.addEventListener('click', async () => {
      try {
        totpSetupBtn.disabled = true;
        const appName = prompt(
          translateMfa('mfa_totp_rename_prompt'),
          translateMfa('mfa_totp_default_app')
        );
        if (appName === null) return;

        const res = await api('/api/mfa/totp/setup', {
          method: 'POST',
          json: true,
          body: { appName }
        });
        const container = document.getElementById('totp-otpauth');
        if (container) {
          container.replaceChildren();
          // show QR returned directly
          if (res.qrcode) {
            let img = document.getElementById('totp-qr');
            if (!img) {
              img = document.createElement('img');
              img.id = 'totp-qr';
            }
            img.src = res.qrcode;
            img.alt = translateMfa('mfa_totp_qr_alt');
            container.appendChild(img);
          } else {
            // fallback: fetch QR endpoint
            try {
              const qr = await api('/api/mfa/totp/qrcode');
              if (qr.qrcode) {
                let img = document.getElementById('totp-qr');
                if (!img) {
                  img = document.createElement('img');
                  img.id = 'totp-qr';
                }
                img.src = qr.qrcode;
                img.alt = translateMfa('mfa_totp_qr_alt');
                container.appendChild(img);
              }
            } catch (e) { console.warn('Could not fetch QR', e); }
          }

          const secret = document.createElement('code');
          secret.className = 'mfa-secret';
          secret.textContent = res.otpauth_url || JSON.stringify(res);
          container.appendChild(secret);
        }
        alert(translateMfa('mfa_totp_secret_created'));
        await loadTotpStatus();
      } catch (e) { alert(translateMfa('mfa_error', { message: e.message })); }
      finally { totpSetupBtn.disabled = false; }
    });

    if (totpVerifyBtn) totpVerifyBtn.addEventListener('click', async () => {
      try {
        totpVerifyBtn.disabled = true;
        const code = document.getElementById('totp-code').value.trim();
        const status = await api('/api/mfa/totp/status');
        await api('/api/mfa/totp/verify', {
          method: 'POST',
          body: {
            token: code,
            appName: status.appName || translateMfa('mfa_totp_default_app')
          },
          errorMessage: 'Could not verify TOTP token'
        });
        alert(translateMfa('mfa_totp_verified'));
        await loadTotpStatus();
      } catch (e) {
        alert(translateMfa('mfa_verify_failed', { message: e.message }));
      }
      finally { totpVerifyBtn.disabled = false; }
    });

    // WebAuthn handlers
    const waRegisterBtn = document.getElementById('webauthn-register');
    const waAuthBtn = document.getElementById('webauthn-authenticate');
    const passkeyRefreshBtn = document.getElementById('passkey-refresh');
    const passkeyList = document.getElementById('passkey-list');

    if (waRegisterBtn) waRegisterBtn.addEventListener('click', async () => {
      try {
        waRegisterBtn.disabled = true;
        ensureWebAuthnAvailable();
        const options = CMCENUtils.preparePublicKeyCreationOptions(
          await api('/api/mfa/webauthn/register/options', { method: 'POST', json: true })
        );
        if (!options || !options.challenge) {
          alert(translateMfa('mfa_registration_options_missing'));
          return;
        }

        // Fallback for missing pubKeyCredParams
        if (!options.pubKeyCredParams) options.pubKeyCredParams = [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 } ];
        if (!options.rp) options.rp = { name: 'CMCEN' };

        const cred = await navigator.credentials.create({ publicKey: options });

        await api('/api/mfa/webauthn/register/verify', {
          method: 'POST',
          body: CMCENUtils.serializeAttestationCredential(cred),
          errorMessage: 'Could not verify passkey registration'
        });

        alert(translateMfa('mfa_passkey_registered'));
        await loadPasskeys();
      } catch (e) { alert(translateMfa('mfa_error', { message: e.message })); }
      finally { waRegisterBtn.disabled = false; }
    });

    if (waAuthBtn) waAuthBtn.addEventListener('click', async () => {
      try {
        waAuthBtn.disabled = true;
        ensureWebAuthnAvailable();
        const options = await api('/api/mfa/webauthn/authenticate/options', { method: 'POST', json: true });
        if (!options || Object.keys(options).length === 0) {
          alert(translateMfa('mfa_auth_options_missing'));
          return;
        }
        if (!options.allowCredentials || options.allowCredentials.length === 0) {
          alert(translateMfa('mfa_no_passkeys_registered'));
          return;
        }

        const publicKey = CMCENUtils.preparePublicKeyRequestOptions(options);
        const assertion = await navigator.credentials.get({ publicKey });

        await api('/api/mfa/webauthn/authenticate/verify', {
          method: 'POST',
          body: CMCENUtils.serializeAssertionCredential(assertion),
          errorMessage: 'Passkey authentication failed'
        });

        alert(translateMfa('mfa_passkey_auth_succeeded'));
      } catch (e) { alert(translateMfa('mfa_error', { message: e.message })); }
      finally { waAuthBtn.disabled = false; }
    });

    if (passkeyRefreshBtn) {
      passkeyRefreshBtn.addEventListener('click', loadPasskeys);
    }

    if (totpRefreshBtn) {
      totpRefreshBtn.addEventListener('click', loadTotpStatus);
    }

    if (totpStatus) {
      totpStatus.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        try {
          button.disabled = true;

          if (button.dataset.action === 'disable-totp') {
            await disableTotp();
          }

          if (button.dataset.action === 'rename-totp') {
            await renameTotp(button.dataset.currentName);
          }
        } catch (error) {
          alert(translateMfa('mfa_error', { message: error.message }));
        } finally {
          button.disabled = false;
        }
      });
    }

    if (passkeyList) {
      passkeyList.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        try {
          button.disabled = true;

          if (button.dataset.action === 'rename-passkey') {
            await renamePasskey(button.dataset.credentialId, button.dataset.currentName);
          }

          if (button.dataset.action === 'delete-passkey') {
            await deletePasskey(button.dataset.credentialId, button.dataset.currentName);
          }
        } catch (error) {
          alert(translateMfa('mfa_error', { message: error.message }));
        } finally {
          button.disabled = false;
        }
      });
    }

    document.addEventListener('languagechange', () => {
      renderTotpStatus(currentTotpStatus);
      renderPasskeys(currentPasskeys);

      const qrCode = document.getElementById('totp-qr');
      if (qrCode) {
        qrCode.alt = translateMfa('mfa_totp_qr_alt');
      }
    });

    await loadTotpStatus();
    await loadPasskeys();

  })();
});
