// Dashboard MFA helper: automatic login + TOTP & WebAuthn handlers
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    let token = localStorage.getItem('api_token') || '';

    const loginForm = document.getElementById('login-form');
    const mfaConfig = document.getElementById('mfa-config');
    const logoutBtn = document.getElementById('logout-button');

    function showMfaConfig(show) {
      if (mfaConfig) mfaConfig.hidden = !show;
      if (loginForm) loginForm.hidden = show;
    }

    showMfaConfig(Boolean(token));

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        try {
          const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            alert('Login failed: ' + (j.error || res.status));
            return;
          }

          const j = await res.json();
          token = j.token;
          localStorage.setItem('api_token', token);
          showMfaConfig(true);
          alert('Logged in');
        } catch (err) {
          alert('Login error: ' + err.message);
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        token = '';
        localStorage.removeItem('api_token');
        showMfaConfig(false);
      });
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
      if (token) headers['Authorization'] = 'Bearer ' + token;
      headers['Content-Type'] = opts.json ? 'application/json' : (headers['Content-Type'] || 'application/json');
      const res = await fetch(path, { ...opts, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
      return res.json();
    }

    // Wire TOTP buttons
    const totpSetupBtn = document.getElementById('totp-setup');
    const totpVerifyBtn = document.getElementById('totp-verify');

    if (totpSetupBtn) totpSetupBtn.addEventListener('click', async () => {
      try {
        const res = await api('/api/mfa/totp/setup', { method: 'POST', json: true });
        const container = document.getElementById('totp-otpauth');
        if (container) {
          container.innerText = res.otpauth_url || JSON.stringify(res);
          // show QR returned directly
          if (res.qrcode) {
            let img = document.getElementById('totp-qr');
            if (!img) {
              img = document.createElement('img');
              img.id = 'totp-qr';
              img.style.maxWidth = '200px';
              img.style.display = 'block';
              img.style.marginTop = '8px';
              container.appendChild(img);
            }
            img.src = res.qrcode;
          } else {
            // fallback: fetch QR endpoint
            try {
              const q = await fetch('/api/mfa/totp/qrcode', { headers: { 'Authorization': 'Bearer ' + token } });
              if (q.ok) {
                const j = await q.json();
                let img = document.getElementById('totp-qr');
                if (!img) {
                  img = document.createElement('img');
                  img.id = 'totp-qr';
                  img.style.maxWidth = '200px';
                  img.style.display = 'block';
                  img.style.marginTop = '8px';
                  container.appendChild(img);
                }
                img.src = j.qrcode;
              }
            } catch (e) { console.warn('Could not fetch QR', e); }
          }
        }
        alert('TOTP secret created. Scan the QR or otpauth URL with your authenticator.');
      } catch (e) { alert('Error: '+e.message); }
    });

    if (totpVerifyBtn) totpVerifyBtn.addEventListener('click', async () => {
      try {
        const code = document.getElementById('totp-code').value.trim();
        const res = await fetch('/api/mfa/totp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ token: code })
        });
        const j = await res.json();
        if (res.ok) alert('TOTP verified'); else alert('Verify failed: '+(j.error||JSON.stringify(j)));
      } catch (e) { alert('Error: '+e.message); }
    });

    // WebAuthn handlers
    const waRegisterBtn = document.getElementById('webauthn-register');
    const waAuthBtn = document.getElementById('webauthn-authenticate');

    if (waRegisterBtn) waRegisterBtn.addEventListener('click', async () => {
      try {
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
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ id: cred.id, rawId, type: cred.type, response: { clientDataJSON, attestationObject }, transports: cred.response.getTransports ? cred.response.getTransports() : [] })
        });

        const j = await verifyRes.json();
        if (verifyRes.ok) alert('Passkey registered'); else alert('Register failed: '+(j.error||JSON.stringify(j)));
      } catch (e) { alert('Error: '+e.message); }
    });

    if (waAuthBtn) waAuthBtn.addEventListener('click', async () => {
      try {
        const options = await api('/api/mfa/webauthn/authenticate/options', { method: 'POST', json: true });
        if (!options || Object.keys(options).length === 0) { alert('No authentication options returned'); return; }

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
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ id: assertion.id, rawId, type: assertion.type, response: { authenticatorData: authData, clientDataJSON, signature, userHandle } })
        });

        const j = await verifyRes.json();
        if (verifyRes.ok) alert('Passkey authentication succeeded'); else alert('Auth failed: '+(j.error||JSON.stringify(j)));
      } catch (e) { alert('Error: '+e.message); }
    });

  })();
});