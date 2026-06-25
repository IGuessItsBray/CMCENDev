const express = require('express');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const base64url = require('base64url');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const rpName = process.env.RP_NAME || 'CMCEN';
const rpID = process.env.RP_ID || process.env.HOSTNAME || 'localhost';
const origin = process.env.RP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;

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

// WebAuthn registration options
router.post('/webauthn/register/options', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const existingCreds = (user.webauthn || []).filter(c => c.credentialID).map(c => ({ id: base64url.toBuffer(c.credentialID), type: 'public-key', transports: c.transports || [] }));

    const challenge = crypto.randomBytes(32);

    const options = generateRegistrationOptions({
      rpName,
      rpID,
      user: {
        id: Buffer.from(String(user._id)),
        name: user.username,
        displayName: user.accountName || `${user.firstName} ${user.lastName}`
      },
      challenge,
      attestationType: 'none',
      excludeCredentials: existingCreds
    });

    // store base64url challenge in DB
    const challengeB64 = base64url.encode(challenge);
    await User.findByIdAndUpdate(user._id, { $set: { webauthnRegistrationChallenge: challengeB64 } });

    // Log what generateRegistrationOptions returned
    console.log('options.pubKeyCredParams:', options.pubKeyCredParams);

    // Build a plain JSON-safe options object (avoid spreading library instance)
    const sendOptions = {
      challenge: bufferToBase64url(challenge),
      rp: options.rp,
      user: {
        id: bufferToBase64url(Buffer.from(String(user._id))),
        name: user.username,
        displayName: user.accountName || `${user.firstName} ${user.lastName}`
      },
      pubKeyCredParams: Array.isArray(options.pubKeyCredParams) && options.pubKeyCredParams.length ? options.pubKeyCredParams : [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      timeout: options.timeout,
      attestation: options.attestation || 'none',
      excludeCredentials: (options.excludeCredentials || []).map(c => ({ id: bufferToBase64url(c.id), type: c.type, transports: c.transports })),
      authenticatorSelection: options.authenticatorSelection,
      extensions: options.extensions
    };

    console.log('webauthn/register/options -> challenge length:', sendOptions.challenge?.length, 'user.id:', sendOptions.user?.id?.length, 'exclude:', (sendOptions.excludeCredentials||[]).length);
    try {
      console.log('webauthn/register/options payload:', JSON.stringify(sendOptions));
    } catch (e) {
      console.warn('Could not stringify sendOptions', e);
    }
    res.json(sendOptions);
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
      expectedOrigin: origin,
      expectedRPID: rpID
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Registration verification failed' });
    }

    const { registrationInfo } = verification;

    // robustly determine credential ID (try several places)
    let idB64url = bufferToBase64url(registrationInfo.rawId) || bufferToBase64url(registrationInfo.credentialID) || bufferToBase64url(body.rawId) || bufferToBase64url(body.id) || null;
    const publicKeyB64 = registrationInfo.credentialPublicKey ? bufferToBase64(registrationInfo.credentialPublicKey) : (registrationInfo.credentialPublicKey ? bufferToBase64(registrationInfo.credentialPublicKey) : undefined);

    if (!idB64url) {
      console.error('webauthn/register/verify -> could not determine credential id from registrationInfo or body', { registrationInfo, body });
      return res.status(400).json({ error: 'Could not determine credential id' });
    }

    const credential = {
      credentialID: idB64url,
      publicKey: publicKeyB64,
      counter: registrationInfo.counter || 0,
      transports: body.transports || []
    };

    console.log('webauthn/register/verify -> storing credential id length:', idB64url?.length);
    await User.findByIdAndUpdate(user._id, { $push: { webauthn: credential }, $set: { webauthnRegistrationChallenge: '' } });

    res.json({ verified: true });
  } catch (err) {
    console.error('webauthn/verify error', err);
    res.status(400).json({ error: 'Could not verify registration' });
  }
});

// WebAuthn authentication options
router.post('/webauthn/authenticate/options', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // pass credential IDs as base64url strings (simplewebauthn expects strings here)
    const allowCredentials = (user.webauthn || []).filter(c => c.credentialID).map(c => ({ id: c.credentialID, type: 'public-key', transports: c.transports || [] }));

    const challenge = crypto.randomBytes(32);

    const options = generateAuthenticationOptions({
      allowCredentials,
      challenge
    });

    const challengeB64 = base64url.encode(challenge);
    await User.findByIdAndUpdate(user._id, { $set: { webauthnAuthenticationChallenge: challengeB64 } });

    // Build plain JSON-safe authentication options
    const sendOptions = {
      challenge: bufferToBase64url(challenge),
      timeout: options.timeout,
      rpId: options.rpId,
      allowCredentials: (options.allowCredentials || []).map(c => ({ id: bufferToBase64url(c.id), type: c.type, transports: c.transports })),
      userVerification: options.userVerification,
      extensions: options.extensions
    };

    console.log('webauthn/auth/options -> challenge length:', sendOptions.challenge?.length, 'allow:', (sendOptions.allowCredentials||[]).length);
    try {
      console.log('webauthn/auth/options payload:', JSON.stringify(sendOptions));
    } catch (e) {
      console.warn('Could not stringify auth sendOptions', e);
    }
    res.json(sendOptions);
  } catch (err) {
    console.error('webauthn/auth/options error', err);
    res.status(500).json({ error: 'Could not create authentication options' });
  }
});

// WebAuthn authenticate verify
router.post('/webauthn/authenticate/verify', authMiddleware, async (req, res) => {
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
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialPublicKey: Buffer.from(dbCred.publicKey, 'base64'),
        credentialID: base64url.toBuffer(dbCred.credentialID),
        counter: dbCred.counter || 0
      }
    });

    if (!verification.verified) return res.status(400).json({ error: 'Authentication failed' });

    // update counter
    await User.updateOne(
      { _id: user._id, 'webauthn.credentialID': dbCred.credentialID },
      { $set: { 'webauthn.$.counter': verification.authenticationInfo.newCounter, webauthnAuthenticationChallenge: '' } }
    );

    res.json({ verified: true });
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

// TOTP verify
router.post('/totp/verify', authMiddleware, async (req, res) => {
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

    res.json({ verified: true });
  } catch (err) {
    console.error('totp/verify error', err);
    res.status(500).json({ error: 'Could not verify TOTP token' });
  }
});

// Return user's WebAuthn credentials array
router.get('/webauthn/credentials', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const creds = user.webauthn || [];
    console.log('webauthn/credentials -> user:', String(user._id), 'count:', creds.length);
    res.json(creds);
  } catch (err) {
    console.error('webauthn/credentials error', err);
    res.status(500).json({ error: 'Could not fetch credentials' });
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
