const express = require('express');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const base64url = require('base64url');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const User = require('../models/User');
const { authMiddleware, authOrTempMiddleware } = require('../middleware/auth');

const router = express.Router();

const rpName = process.env.RP_NAME || 'CMCEN';
const configuredRPID = process.env.RP_ID || '';
const configuredOrigin = process.env.RP_ORIGIN || '';

function getRpID(req) {
  if (configuredRPID) return configuredRPID;

  const hostname = req.hostname || 'localhost';
  if (hostname === '127.0.0.1' || hostname === '::1') return 'localhost';

  return hostname;
}

function getExpectedOrigin(req) {
  if (configuredOrigin) {
    return configuredOrigin
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }

  return `${req.protocol}://${req.get('host')}`;
}

function bufferToBase64url(input) {
  if (!input) return input;
  if (Buffer.isBuffer(input)) return base64url.encode(input);
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return base64url.encode(Buffer.from(input));
  return input;
}

function bufferToBase64(input) {
  if (!input) return input;
  if (Buffer.isBuffer(input)) return input.toString('base64');
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) return Buffer.from(input).toString('base64');
  return Buffer.from(String(input)).toString('base64');
}

function normalizeRegistrationOptions(opts) {
  return {
    ...opts,
    challenge: bufferToBase64url(opts.challenge),
    user: opts.user ? { ...opts.user, id: bufferToBase64url(opts.user.id) } : opts.user,
    excludeCredentials: opts.excludeCredentials ? opts.excludeCredentials.map(c => ({ ...c, id: bufferToBase64url(c.id) })) : opts.excludeCredentials
  };
}

function normalizeAuthenticationOptions(opts) {
  return {
    ...opts,
    challenge: bufferToBase64url(opts.challenge),
    allowCredentials: opts.allowCredentials ? opts.allowCredentials.map(c => ({ ...c, id: bufferToBase64url(c.id) })) : opts.allowCredentials
  };
}

function serializeCredential(credential, index) {
  return {
    id: credential.credentialID,
    nickname: credential.nickname || `Passkey ${index + 1}`,
    transports: credential.transports || [],
    counter: credential.counter || 0,
    credentialDeviceType: credential.credentialDeviceType || '',
    credentialBackedUp: Boolean(credential.credentialBackedUp)
  };
}

function isValidWebAuthnCredential(credential) {
  return Boolean(credential?.credentialID && credential?.publicKey);
}

function hasActiveTotp(user) {
  return user.totp?.enabled === true && Boolean(user.totp?.secret);
}

function countActiveMfaMethods(user) {
  const passkeyCount = Array.isArray(user.webauthn)
    ? user.webauthn.filter(isValidWebAuthnCredential).length
    : 0;

  return passkeyCount + (hasActiveTotp(user) ? 1 : 0);
}

// WebAuthn registration options
router.post('/webauthn/register/options', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const rpID = getRpID(req);

    const existingCreds = (user.webauthn || [])
      .filter(c => c.credentialID)
      .map(c => ({
        id: c.credentialID,
        transports: c.transports || []
      }));

    const challenge = crypto.randomBytes(32);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(String(user._id)),
      userName: user.username,
      userDisplayName: user.accountName || `${user.firstName} ${user.lastName}`,
      challenge,
      attestationType: 'none',
      excludeCredentials: existingCreds,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      supportedAlgorithmIDs: [-7, -257]
    });

    // store base64url challenge in DB
    await User.findByIdAndUpdate(user._id, {
      $set: { webauthnRegistrationChallenge: options.challenge }
    });

    console.log('webauthn/register/options -> challenge length:', options.challenge?.length, 'user.id:', options.user?.id?.length, 'exclude:', (options.excludeCredentials || []).length);
    res.json(normalizeRegistrationOptions(options));
  } catch (err) {
    console.error('webauthn/options error', err);
    res.status(500).json({ error: 'Could not create registration options' });
  }
});

// WebAuthn registration verify
router.post('/webauthn/register/verify', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const body = req.body;

    const expectedChallenge = user.webauthnRegistrationChallenge;
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(req),
      expectedRPID: getRpID(req),
      requireUserVerification: false
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }

    const { registrationInfo } = verification;
    const verifiedCredential = registrationInfo.credential || {};

    // robustly determine credential ID (try several places)
    let idB64url = verifiedCredential.id || bufferToBase64url(registrationInfo.rawId) || bufferToBase64url(registrationInfo.credentialID) || bufferToBase64url(body.rawId) || bufferToBase64url(body.id) || null;
    const publicKeyB64 = verifiedCredential.publicKey
      ? bufferToBase64(verifiedCredential.publicKey)
      : bufferToBase64(registrationInfo.credentialPublicKey);

    if (!idB64url) {
      console.error('webauthn/register/verify -> could not determine credential id from registrationInfo or body', { registrationInfo, body });
      return res.status(400).json({ error: 'Could not determine credential id' });
    }
    if (!publicKeyB64) {
      console.error('webauthn/register/verify -> could not determine credential public key', { registrationInfo });
      return res.status(400).json({ error: 'Could not determine credential public key' });
    }

    const credential = {
      credentialID: idB64url,
      publicKey: publicKeyB64,
      counter: verifiedCredential.counter || registrationInfo.counter || 0,
      transports: verifiedCredential.transports || body.transports || [],
      credentialDeviceType: registrationInfo.credentialDeviceType || '',
      credentialBackedUp: Boolean(registrationInfo.credentialBackedUp),
      nickname: String(body.nickname || '').trim()
    };

    console.log('webauthn/register/verify -> storing credential id length:', idB64url?.length);
    await User.findByIdAndUpdate(user._id, {
      $pull: { webauthn: { credentialID: idB64url } },
      $set: { webauthnRegistrationChallenge: '' }
    });
    await User.findByIdAndUpdate(user._id, { $push: { webauthn: credential } });

    res.json({ verified: true });
  } catch (err) {
    console.error('webauthn/verify error', err);
    res.status(400).json({ error: 'Could not verify registration' });
  }
});

// WebAuthn authentication options
router.post('/webauthn/authenticate/options', authOrTempMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const rpID = getRpID(req);

    // pass credential IDs as base64url strings (simplewebauthn expects strings here)
    const allowCredentials = (user.webauthn || [])
      .filter(c => c.credentialID && c.publicKey)
      .map(c => ({ id: c.credentialID, transports: c.transports || [] }));

    const challenge = crypto.randomBytes(32);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      challenge,
      userVerification: 'preferred'
    });

    await User.findByIdAndUpdate(user._id, {
      $set: { webauthnAuthenticationChallenge: options.challenge }
    });

    console.log('webauthn/auth/options -> challenge length:', options.challenge?.length, 'allow:', (options.allowCredentials || []).length);
    res.json(normalizeAuthenticationOptions(options));
  } catch (err) {
    console.error('webauthn/auth/options error', err);
    res.status(500).json({ error: 'Could not create authentication options' });
  }
});

// WebAuthn authenticate verify
router.post('/webauthn/authenticate/verify', authOrTempMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const body = req.body;

    const expectedChallenge = user.webauthnAuthenticationChallenge;

    const rawIdFromClient = body.rawId;
    console.log('webauthn/auth/verify -> rawId from client length:', rawIdFromClient?.length);
    let dbCred = (user.webauthn || []).find(c => c.credentialID === rawIdFromClient);
    if (!dbCred) {
      // try converting if client sent base64 instead of base64url
      try {
        const alt = bufferToBase64url(Buffer.from(rawIdFromClient, 'base64'));
        dbCred = (user.webauthn || []).find(c => c.credentialID === alt);
        if (dbCred) console.log('webauthn/auth/verify -> matched credential via alt conversion');
      } catch (e) { /* ignore */ }
    }
    if (!dbCred) {
      console.log('webauthn/auth/verify -> stored creds:', (user.webauthn || []).map(c => c.credentialID));
      return res.status(400).json({ error: 'Unknown credential' });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(req),
      expectedRPID: getRpID(req),
      credential: {
        id: dbCred.credentialID,
        publicKey: Buffer.from(dbCred.publicKey, 'base64'),
        counter: dbCred.counter || 0
      },
      requireUserVerification: false
    });

    if (!verification.verified) return res.status(400).json({ error: 'Authentication failed' });

    // update counter
    await User.updateOne(
      { _id: user._id, 'webauthn.credentialID': dbCred.credentialID },
      { $set: { 'webauthn.$.counter': verification.authenticationInfo.newCounter, webauthnAuthenticationChallenge: '' } }
    );

    const responsePayload = { verified: true };
    if (req.isTemp) {
      // issue full JWT and clear temp token
      const fullToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      await User.findByIdAndUpdate(user._id, { $set: { 'twoFactor.tempToken': '', 'twoFactor.tempExpires': null } });
      responsePayload.token = fullToken;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('webauthn/auth/verify error', err);
    res.status(400).json({ error: 'Could not verify authentication' });
  }
});

// TOTP setup (returns otpauth URL)
router.post('/totp/setup', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const secret = speakeasy.generateSecret({ name: `${rpName} (${user.email})` });

    await User.findByIdAndUpdate(user._id, { $set: { 'totp.secret': secret.base32, 'totp.enabled': false } });

    // Generate QR data URL and return both
    const otpauth = secret.otpauth_url;
    let dataUrl = null;
    try {
      dataUrl = await qrcode.toDataURL(otpauth);
      console.log('totp/setup -> qrcode length:', dataUrl?.length);
    } catch (e) {
      console.warn('Could not generate QR', e);
    }

    console.log('totp/setup -> returning otpauth and qrcode present?', !!dataUrl);
    res.json({ otpauth_url: otpauth, qrcode: dataUrl });
  } catch (err) {
    console.error('totp/setup error', err);
    res.status(500).json({ error: 'Could not generate TOTP secret' });
  }
});

router.get('/totp/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      enabled: user.totp?.enabled === true,
      pending: Boolean(user.totp?.secret) && user.totp?.enabled !== true
    });
  } catch (err) {
    console.error('totp/status error', err);
    res.status(500).json({ error: 'Could not fetch TOTP status' });
  }
});

// TOTP QR refresh
router.get('/totp/qrcode', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.totp?.secret) return res.status(400).json({ error: 'No TOTP secret set' });

    const otpauth = speakeasy.otpauthURL({
      secret: user.totp.secret,
      label: `${rpName} (${user.email})`,
      encoding: 'base32'
    });
    const dataUrl = await qrcode.toDataURL(otpauth);

    res.json({ otpauth_url: otpauth, qrcode: dataUrl });
  } catch (err) {
    console.error('totp/qrcode error', err);
    res.status(500).json({ error: 'Could not generate TOTP QR code' });
  }
});

// TOTP verify
router.post('/totp/verify', authOrTempMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { token } = req.body;

    if (!user.totp?.secret) return res.status(400).json({ error: 'No TOTP secret set' });

    const verified = speakeasy.totp.verify({
      secret: user.totp.secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) return res.status(400).json({ error: 'Invalid token' });

    await User.findByIdAndUpdate(user._id, { $set: { 'totp.enabled': true } });

    const responsePayload = { verified: true };
    if (req.isTemp) {
      const fullToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      await User.findByIdAndUpdate(user._id, { $set: { 'twoFactor.tempToken': '', 'twoFactor.tempExpires': null } });
      responsePayload.token = fullToken;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('totp/verify error', err);
    res.status(500).json({ error: 'Could not verify TOTP token' });
  }
});

router.delete('/totp', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const remainingMethods = countActiveMfaMethods({
      ...user.toObject(),
      totp: {
        secret: '',
        enabled: false
      }
    });

    if (hasActiveTotp(user) && remainingMethods < 1) {
      return res.status(400).json({
        error: 'Add a passkey before disabling your only authenticator app method'
      });
    }

    await User.findByIdAndUpdate(user._id, {
      $set: {
        'totp.secret': '',
        'totp.enabled': false
      }
    });

    res.json({ enabled: false, pending: false });
  } catch (err) {
    console.error('totp/disable error', err);
    res.status(500).json({ error: 'Could not disable TOTP' });
  }
});

// Return user's WebAuthn credentials array
router.get('/webauthn/credentials', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const creds = user.webauthn || [];
    console.log('webauthn/credentials -> user:', String(user._id), 'count:', creds.length);
    res.json(creds.map(serializeCredential));
  } catch (err) {
    console.error('webauthn/credentials error', err);
    res.status(500).json({ error: 'Could not fetch credentials' });
  }
});

router.patch('/webauthn/credentials/:credentialID', authMiddleware, async (req, res) => {
  try {
    const nickname = String(req.body?.nickname || '').trim().slice(0, 80);

    const updated = await User.findOneAndUpdate(
      { _id: req.user._id, 'webauthn.credentialID': req.params.credentialID },
      { $set: { 'webauthn.$.nickname': nickname } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Passkey not found' });

    res.json((updated.webauthn || []).map(serializeCredential));
  } catch (err) {
    console.error('webauthn/credentials rename error', err);
    res.status(500).json({ error: 'Could not rename passkey' });
  }
});

router.delete('/webauthn/credentials/:credentialID', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const creds = Array.isArray(user.webauthn) ? user.webauthn : [];
    const credentialExists = creds.some(c => c.credentialID === req.params.credentialID);

    if (!credentialExists) return res.status(404).json({ error: 'Passkey not found' });

    const remainingCredentials = creds.filter(c => c.credentialID !== req.params.credentialID);
    const remainingMethods = countActiveMfaMethods({
      ...user.toObject(),
      webauthn: remainingCredentials
    });

    if (isValidWebAuthnCredential(creds.find(c => c.credentialID === req.params.credentialID)) && remainingMethods < 1) {
      return res.status(400).json({
        error: 'Add another passkey or enable TOTP before deleting your last passkey'
      });
    }

    const updated = await User.findByIdAndUpdate(
      user._id,
      { $pull: { webauthn: { credentialID: req.params.credentialID } } },
      { new: true }
    );

    res.json((updated.webauthn || []).map(serializeCredential));
  } catch (err) {
    console.error('webauthn/credentials delete error', err);
    res.status(500).json({ error: 'Could not delete passkey' });
  }
});

// Cleanup invalid/empty WebAuthn credential entries and return updated array
router.post('/webauthn/cleanup', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const before = Array.isArray(user.webauthn) ? user.webauthn : [];
    const filtered = before.filter(c => c && c.credentialID && String(c.credentialID).trim() !== '');
    const removed = before.length - filtered.length;

    const updated = await User.findByIdAndUpdate(user._id, { $set: { webauthn: filtered } }, { new: true });
    const remaining = Array.isArray(updated.webauthn) ? updated.webauthn.length : 0;
    console.log('webauthn/cleanup -> removed invalid entries:', removed, 'remaining:', remaining);
    res.json(updated.webauthn || []);
  } catch (err) {
    console.error('webauthn/cleanup error', err);
    res.status(500).json({ error: 'Could not cleanup credentials' });
  }
});

module.exports = router;
