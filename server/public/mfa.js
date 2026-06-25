// Minimal client for MFA (TOTP) and WebAuthn flows
(async () => {
  function normalizeToken(value) {
    return String(value || '').trim().replace(/^Bearer\s+/i, '');
  }

  function ensureWebAuthnAvailable() {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error('Passkeys are not available in this browser context. Use HTTPS or localhost in a supported browser.');
    }
  }

  // prefer JWT in localStorage, but allow short-lived tempToken stored in sessionStorage
  let token = normalizeToken(localStorage.getItem('api_token'));
  const tempToken = String(sessionStorage.getItem('tempToken') || '').trim();

  if (!token && !tempToken) {
    token = prompt('Paste JWT token from /api/login (Bearer)');
    token = normalizeToken(token);
    if (token) localStorage.setItem('api_token', token);
  } else if (token) {
    localStorage.setItem('api_token', token);
  }

  function b64ToUint8Array(b64url) {
    // base64url -> base64
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
    const tempToken = String(sessionStorage.getItem('tempToken') || '').trim();
    if (tempToken) headers['x-temp-token'] = tempToken;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['Content-Type'] = opts.json ? 'application/json' : (headers['Content-Type'] || 'application/json');
    const res = await fetch(path, { ...opts, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
    return res.json();
  }

  // TOTP handlers
  document.getElementById('totp-setup').addEventListener('click', async () => {
    try {
      const res = await api('/api/mfa/totp/setup', { method: 'POST', json: true });
      const container = document.getElementById('totp-otpauth');
      if (container) container.innerText = res.otpauth_url || JSON.stringify(res);
      if (res.qrcode && container) {
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
        // try fetch QR and show
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

      alert('TOTP secret created. Scan the QR or otpauth URL with your authenticator.');
    } catch (e) { alert('Error: '+e.message); }
  });

  document.getElementById('totp-verify').addEventListener('click', async () => {
    const code = document.getElementById('totp-code').value.trim();
    try {
        // use api() helper so temp-token header is included
      const j = await api('/api/mfa/totp/verify', { method: 'POST', json: true, body: JSON.stringify({ token: code }) });
      if (j.token) {
        localStorage.setItem('api_token', j.token);
        sessionStorage.removeItem('tempToken');
      }
      alert('TOTP verified');
    } catch (e) { alert('Error: '+e.message); }
  });

  // WebAuthn register
  document.getElementById('webauthn-register').addEventListener('click', async () => {
    try {
      ensureWebAuthnAvailable();
      const options = await api('/api/mfa/webauthn/register/options', { method: 'POST', json: true });
      if (!options || !options.challenge) { alert('No registration options returned'); return; }

      // convert challenge and user.id if present
      options.challenge = b64ToUint8Array(options.challenge);
      if (options.user && options.user.id) options.user.id = b64ToUint8Array(options.user.id);
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map(c => ({ ...c, id: b64ToUint8Array(c.id) }));
      }

      // Fallbacks for missing fields
      if (!options.pubKeyCredParams) options.pubKeyCredParams = [ { type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 } ];
      if (!options.rp) options.rp = { name: 'CMCEN' };

      const cred = await navigator.credentials.create({ publicKey: options });

      const clientDataJSON = arrayBufferToBase64url(cred.response.clientDataJSON);
      const attestationObject = arrayBufferToBase64url(cred.response.attestationObject);
      const rawId = arrayBufferToBase64url(cred.rawId);

      const j = await api('/api/mfa/webauthn/register/verify', { method: 'POST', json: true, body: JSON.stringify({ id: cred.id, rawId, type: cred.type, response: { clientDataJSON, attestationObject }, transports: cred.response.getTransports ? cred.response.getTransports() : [] }) });
      alert('Passkey registered');
    } catch (e) { alert('Error: '+e.message); }
  });

  // WebAuthn authenticate
  document.getElementById('webauthn-authenticate').addEventListener('click', async () => {
    try {
      ensureWebAuthnAvailable();
      const options = await api('/api/mfa/webauthn/authenticate/options', { method: 'POST', json: true });
      if (!options.allowCredentials || options.allowCredentials.length === 0) {
        alert('No passkeys are registered for this account yet.');
        return;
      }
      options.challenge = b64ToUint8Array(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map(c => ({ ...c, id: b64ToUint8Array(c.id) }));
      }

      const assertion = await navigator.credentials.get({ publicKey: options });
      const authData = arrayBufferToBase64url(assertion.response.authenticatorData);
      const clientDataJSON = arrayBufferToBase64url(assertion.response.clientDataJSON);
      const signature = arrayBufferToBase64url(assertion.response.signature);
      const userHandle = assertion.response.userHandle ? arrayBufferToBase64url(assertion.response.userHandle) : null;
      const rawId = arrayBufferToBase64url(assertion.rawId);

      const j = await api('/api/mfa/webauthn/authenticate/verify', { method: 'POST', json: true, body: JSON.stringify({ id: assertion.id, rawId, type: assertion.type, response: { authenticatorData: authData, clientDataJSON, signature, userHandle } }) });
      if (j.token) {
        localStorage.setItem('api_token', j.token);
        sessionStorage.removeItem('tempToken');
      }
      alert('Passkey authentication succeeded');
    } catch (e) { alert('Error: '+e.message); }
  });
})();
