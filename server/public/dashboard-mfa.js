// Dashboard MFA helper: TOTP & WebAuthn handlers
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    function normalizeToken(value) {
      return String(value || '').trim().replace(/^Bearer\s+/i, '');
    }

    function ensureWebAuthnAvailable() {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        throw new Error('Passkeys are not available in this browser context. Use HTTPS or localhost in a supported browser.');
      }
    }

    function getDashboardToken() {
      return normalizeToken(localStorage.getItem('token') || localStorage.getItem('api_token'));
    }

    let token = getDashboardToken();

    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('api_token', token);
    }

    function requireToken() {
      token = getDashboardToken();

      if (!token) {
        window.location.replace('/login.html');
        throw new Error('Authentication required');
      }

      return token;
    }

    function handleUnauthorized() {
      localStorage.removeItem('token');
      localStorage.removeItem('api_token');
      window.location.replace('/login.html');
    }

    function b64ToUint8Array(b64url) {
      const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4;
      const withPad = b64 + (pad ? '='.repeat(4 - pad) : '');
      const binary = atob(withPad);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function arrayBufferToBase64url(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);
      return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }

    async function api(path, opts = {}){
      const headers = opts.headers || {};
      headers['Authorization'] = 'Bearer ' + requireToken();
      headers['Content-Type'] = opts.json ? 'application/json' : (headers['Content-Type'] || 'application/json');
      const res = await fetch(path, { ...opts, headers });
      if (res.status === 401) {
        handleUnauthorized();
        throw new Error('Authentication required');
      }
      if (!res.ok) {
        const contentType = res.headers.get('Content-Type') || '';
        const detail = contentType.includes('application/json')
          ? (await res.json().catch(() => ({}))).error
          : '';

        throw new Error(detail || `HTTP ${res.status} ${res.statusText}`);
      }
      return res.json();
    }

    function credentialLabel(credential, index) {
      return credential.nickname || `Passkey ${index + 1}`;
    }

    function describeCredential(credential) {
      const parts = [];

      if (credential.providerName && credential.providerName !== credential.nickname) {
        parts.push(credential.providerName);
      }

      if (credential.credentialDeviceType) {
        parts.push(credential.credentialDeviceType === 'multiDevice'
          ? 'Synced passkey'
          : 'Device-bound passkey');
      }

      if (Array.isArray(credential.transports) && credential.transports.length) {
        parts.push(credential.transports.join(', '));
      }

      if (credential.credentialBackedUp) {
        parts.push('backed up');
      }

      return parts.join(' · ') || 'Passkey';
    }

    async function loadPasskeys() {
      const list = document.getElementById('passkey-list');
      if (!list) return;

      list.textContent = 'Loading passkeys...';

      try {
        const credentials = await api('/api/mfa/webauthn/credentials');

        if (!Array.isArray(credentials) || credentials.length === 0) {
          list.innerHTML = '<p class="passkey-empty">No passkeys registered yet.</p>';
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
            rename.textContent = 'Rename';
            rename.dataset.action = 'rename-passkey';
            rename.dataset.credentialId = credential.id;
            rename.dataset.currentName = credentialLabel(credential, index);

            const remove = document.createElement('button');
            remove.className = 'mfa-link-button mfa-link-button-danger';
            remove.type = 'button';
            remove.textContent = 'Delete';
            remove.dataset.action = 'delete-passkey';
            remove.dataset.credentialId = credential.id;
            remove.dataset.currentName = credentialLabel(credential, index);

            actions.append(rename, remove);
            item.append(details, actions);

            return item;
          })
        );
      } catch (error) {
        list.innerHTML = `<p class="passkey-empty">${error.message}</p>`;
      }
    }

    async function renamePasskey(credentialID, currentName) {
      const nickname = prompt('Passkey or provider name', currentName || '');

      if (nickname === null) return;

      await api(`/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`, {
        method: 'PATCH',
        json: true,
        body: JSON.stringify({ nickname })
      });

      await loadPasskeys();
    }

    async function deletePasskey(credentialID, currentName) {
      const label = currentName || 'this passkey';

      if (!confirm(`Delete ${label}?`)) return;

      await api(`/api/mfa/webauthn/credentials/${encodeURIComponent(credentialID)}`, {
        method: 'DELETE',
        json: true,
        body: JSON.stringify({})
      });

      await loadPasskeys();
    }

    function renderTotpStatus(status) {
      const container = document.getElementById('totp-status');
      if (!container) return;

      const enabled = status?.enabled === true;
      const pending = status?.pending === true;
      const appName = status?.appName || 'Authenticator app';

      const setupButton = document.getElementById('totp-setup');
      if (setupButton) {
        setupButton.disabled = enabled;
        setupButton.textContent = enabled
          ? 'TOTP Enabled'
          : pending
            ? 'Restart TOTP Setup'
            : 'Setup TOTP';
      }

      const title = enabled
        ? appName
        : pending
          ? `${appName} setup pending`
          : 'Not enabled';
      const detail = enabled
        ? 'TOTP login codes are active for this account.'
        : pending
          ? 'A secret has been generated. Verify a six-digit code to activate it.'
          : 'Set up an authenticator app to use six-digit login codes.';

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
        rename.textContent = 'Rename';
        rename.dataset.action = 'rename-totp';
        rename.dataset.currentName = appName;
        actions.appendChild(rename);
      }

      if (enabled || pending) {
        const disable = document.createElement('button');
        disable.className = 'mfa-link-button mfa-link-button-danger';
        disable.type = 'button';
        disable.textContent = enabled ? 'Disable' : 'Cancel setup';
        disable.dataset.action = 'disable-totp';
        actions.appendChild(disable);
      }

      item.append(copy, actions);
      container.appendChild(item);
    }

    async function loadTotpStatus() {
      const container = document.getElementById('totp-status');
      if (!container) return;

      container.textContent = 'Loading authenticator app status...';

      try {
        renderTotpStatus(await api('/api/mfa/totp/status'));
      } catch (error) {
        container.innerHTML = `<p class="passkey-empty">${error.message}</p>`;
      }
    }

    async function renameTotp(currentName) {
      const appName = prompt('Authenticator app name', currentName || 'Authenticator app');

      if (appName === null) return;

      const status = await api('/api/mfa/totp/rename', {
        method: 'POST',
        json: true,
        body: JSON.stringify({ appName })
      });

      renderTotpStatus(status);
    }

    async function disableTotp() {
      if (!confirm('Disable authenticator app MFA?')) return;

      const status = await api('/api/mfa/totp', {
        method: 'DELETE',
        json: true,
        body: JSON.stringify({})
      });

      const container = document.getElementById('totp-otpauth');
      if (container) container.replaceChildren();

      const code = document.getElementById('totp-code');
      if (code) code.value = '';

      renderTotpStatus(status);
    }

    // Wire TOTP buttons
    const totpSetupBtn = document.getElementById('totp-setup');
    const totpVerifyBtn = document.getElementById('totp-verify');
    const totpRefreshBtn = document.getElementById('totp-refresh');
    const totpStatus = document.getElementById('totp-status');

    if (totpSetupBtn) totpSetupBtn.addEventListener('click', async () => {
      try {
        totpSetupBtn.disabled = true;
        const appName = prompt('Authenticator app name', 'Authenticator app');
        if (appName === null) return;

        const res = await api('/api/mfa/totp/setup', {
          method: 'POST',
          json: true,
          body: JSON.stringify({ appName })
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
            img.alt = 'TOTP QR code';
            container.appendChild(img);
          } else {
            // fallback: fetch QR endpoint
            try {
              const q = await fetch('/api/mfa/totp/qrcode', { headers: { 'Authorization': 'Bearer ' + requireToken() } });
              if (q.ok) {
                const j = await q.json();
                let img = document.getElementById('totp-qr');
                if (!img) {
                  img = document.createElement('img');
                  img.id = 'totp-qr';
                }
                img.src = j.qrcode;
                img.alt = 'TOTP QR code';
                container.appendChild(img);
              }
            } catch (e) { console.warn('Could not fetch QR', e); }
          }

          const secret = document.createElement('code');
          secret.className = 'mfa-secret';
          secret.textContent = res.otpauth_url || JSON.stringify(res);
          container.appendChild(secret);
        }
        alert('TOTP secret created. Scan the QR or otpauth URL with your authenticator.');
        await loadTotpStatus();
      } catch (e) { alert('Error: '+e.message); }
      finally { totpSetupBtn.disabled = false; }
    });

    if (totpVerifyBtn) totpVerifyBtn.addEventListener('click', async () => {
      try {
        totpVerifyBtn.disabled = true;
        const code = document.getElementById('totp-code').value.trim();
        const status = await api('/api/mfa/totp/status');
        const res = await fetch('/api/mfa/totp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + requireToken() },
          body: JSON.stringify({ token: code, appName: status.appName || 'Authenticator app' })
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        const j = await res.json();
        if (res.ok) {
          alert('TOTP verified');
          await loadTotpStatus();
        } else {
          alert('Verify failed: '+(j.error||JSON.stringify(j)));
        }
      } catch (e) { alert('Error: '+e.message); }
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
        const options = await api('/api/mfa/webauthn/register/options', { method: 'POST', json: true });
        if (!options || !options.challenge) { alert('No registration options returned'); return; }

        options.challenge = b64ToUint8Array(options.challenge);
        if (options.user && options.user.id) options.user.id = b64ToUint8Array(options.user.id);
        if (options.excludeCredentials) options.excludeCredentials = options.excludeCredentials.map(c => ({ ...c, id: b64ToUint8Array(c.id) }));

        // Fallback for missing pubKeyCredParams
        if (!options.pubKeyCredParams) options.pubKeyCredParams = [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 } ];
        if (!options.rp) options.rp = { name: 'CMCEN' };

        const cred = await navigator.credentials.create({ publicKey: options });

        const clientDataJSON = arrayBufferToBase64url(cred.response.clientDataJSON);
        const attestationObject = arrayBufferToBase64url(cred.response.attestationObject);
        const rawId = arrayBufferToBase64url(cred.rawId);

        const verifyRes = await fetch('/api/mfa/webauthn/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + requireToken() },
          body: JSON.stringify({
            id: cred.id,
            rawId,
            type: cred.type,
            authenticatorAttachment: cred.authenticatorAttachment || '',
            response: { clientDataJSON, attestationObject },
            transports: cred.response.getTransports ? cred.response.getTransports() : []
          })
        });
        if (verifyRes.status === 401) {
          handleUnauthorized();
          return;
        }

        const j = await verifyRes.json();
        if (verifyRes.ok) {
          alert('Passkey registered');
          await loadPasskeys();
        } else {
          alert('Register failed: '+(j.error||JSON.stringify(j)));
        }
      } catch (e) { alert('Error: '+e.message); }
      finally { waRegisterBtn.disabled = false; }
    });

    if (waAuthBtn) waAuthBtn.addEventListener('click', async () => {
      try {
        waAuthBtn.disabled = true;
        ensureWebAuthnAvailable();
        const options = await api('/api/mfa/webauthn/authenticate/options', { method: 'POST', json: true });
        if (!options || Object.keys(options).length === 0) { alert('No authentication options returned'); return; }
        if (!options.allowCredentials || options.allowCredentials.length === 0) {
          alert('No passkeys are registered for this account yet.');
          return;
        }

        options.challenge = b64ToUint8Array(options.challenge);
        if (options.allowCredentials) options.allowCredentials = options.allowCredentials.map(c => ({ ...c, id: b64ToUint8Array(c.id) }));

        const assertion = await navigator.credentials.get({ publicKey: options });
        const authData = arrayBufferToBase64url(assertion.response.authenticatorData);
        const clientDataJSON = arrayBufferToBase64url(assertion.response.clientDataJSON);
        const signature = arrayBufferToBase64url(assertion.response.signature);
        const userHandle = assertion.response.userHandle ? arrayBufferToBase64url(assertion.response.userHandle) : null;
        const rawId = arrayBufferToBase64url(assertion.rawId);

        const verifyRes = await fetch('/api/mfa/webauthn/authenticate/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + requireToken() },
          body: JSON.stringify({ id: assertion.id, rawId, type: assertion.type, response: { authenticatorData: authData, clientDataJSON, signature, userHandle } })
        });
        if (verifyRes.status === 401) {
          handleUnauthorized();
          return;
        }

        const j = await verifyRes.json();
        if (verifyRes.ok) alert('Passkey authentication succeeded'); else alert('Auth failed: '+(j.error||JSON.stringify(j)));
      } catch (e) { alert('Error: '+e.message); }
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
          alert('Error: ' + error.message);
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
          alert('Error: ' + error.message);
        } finally {
          button.disabled = false;
        }
      });
    }

    await loadTotpStatus();
    await loadPasskeys();

  })();
});
