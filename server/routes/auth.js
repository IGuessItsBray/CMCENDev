const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const {
  authMiddleware,
  requirePermission,
  requireMinimumRole
} = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();

const PROFILE_SELECT =
  'username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit preferredLanguage role contentAreas createdAt updatedAt';

const EDITABLE_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'rank',
  'postNominals',
  'company',
  'status',
  'affiliationElement',
  'trade',
  'tradeOther',
  'currentUnit',
  'preferredLanguage'
];

const EDITABLE_ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'country',
  'stateProvince',
  'postalCode'
];

const REQUIRED_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'status',
  'affiliationElement'
];

const REQUIRED_ADDRESS_FIELDS = [
  'line1',
  'city',
  'country',
  'stateProvince',
  'postalCode'
];

const VALID_STATUSES = new Set([
  'regular',
  'reserve',
  'honourary',
  'civilian',
  'retired',
  'released',
  'other'
]);

const VALID_AFFILIATION_ELEMENTS = new Set([
  'army',
  'navy',
  'air_force',
  'other'
]);

const VALID_PREFERRED_LANGUAGES = new Set(['en', 'fr']);

function hasOwnValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function cleanProfileString(value) {
  return String(value || '').trim();
}

function getProfileResponse(user) {
  const profile = user.toObject ? user.toObject() : user;

  return {
    ...profile,
    permissions: getUserPermissions(profile)
  };
}

function getProfileUpdate(body, currentUser) {
  const updates = {};
  const source = body || {};

  EDITABLE_PROFILE_FIELDS.forEach(field => {
    if (hasOwnValue(source, field)) {
      updates[field] = cleanProfileString(source[field]);
    }
  });

  const addressSource =
    source.address &&
    typeof source.address === 'object' &&
    !Array.isArray(source.address)
      ? source.address
      : {};

  EDITABLE_ADDRESS_FIELDS.forEach(field => {
    if (hasOwnValue(addressSource, field)) {
      updates[`address.${field}`] = cleanProfileString(addressSource[field]);
    }
  });

  REQUIRED_PROFILE_FIELDS.forEach(field => {
    if (hasOwnValue(updates, field) && !updates[field]) {
      throw new Error('Required profile fields are missing');
    }
  });

  REQUIRED_ADDRESS_FIELDS.forEach(field => {
    const updateKey = `address.${field}`;

    if (hasOwnValue(updates, updateKey) && !updates[updateKey]) {
      throw new Error('Required address fields are missing');
    }
  });

  if (
    hasOwnValue(updates, 'status') &&
    !VALID_STATUSES.has(updates.status)
  ) {
    throw new Error('Invalid status');
  }

  if (
    hasOwnValue(updates, 'affiliationElement') &&
    !VALID_AFFILIATION_ELEMENTS.has(updates.affiliationElement)
  ) {
    throw new Error('Invalid affiliation element');
  }

  if (
    hasOwnValue(updates, 'preferredLanguage') &&
    !VALID_PREFERRED_LANGUAGES.has(updates.preferredLanguage)
  ) {
    throw new Error('Invalid preferred language');
  }

  if (
    hasOwnValue(updates, 'firstName') ||
    hasOwnValue(updates, 'lastName')
  ) {
    const firstName = hasOwnValue(updates, 'firstName')
      ? updates.firstName
      : currentUser.firstName;
    const lastName = hasOwnValue(updates, 'lastName')
      ? updates.lastName
      : currentUser.lastName;

    updates.accountName = [firstName, lastName]
      .filter(Boolean)
      .join(' ');
  }

  return updates;
}

// POST /api/register
// Create a subscriber account from the public registration form.
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      addressLine1,
      addressLine2,
      city,
      country,
      stateProvince,
      postalCode,
      rank,
      postNominals,
      company,
      status,
      affiliationElement,
      trade,
      tradeOther,
      currentUnit,
      preferredLanguage,
      email,
      password,
      passwordConfirmation
    } = req.body;

    if (password !== passwordConfirmation) {
      return res.status(400).json({
        error: 'Passwords do not match'
      });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanFirstName = String(firstName || '').trim();
    const cleanLastName = String(lastName || '').trim();
    const incomingPreferredLanguage =
      String(preferredLanguage || '').trim();

    if (
      incomingPreferredLanguage &&
      !VALID_PREFERRED_LANGUAGES.has(incomingPreferredLanguage)
    ) {
      return res.status(400).json({
        error: 'Invalid preferred language'
      });
    }

    const cleanPreferredLanguage =
      VALID_PREFERRED_LANGUAGES.has(incomingPreferredLanguage)
        ? incomingPreferredLanguage
        : 'en';
    const requiredFields = [
      cleanFirstName,
      cleanLastName,
      String(addressLine1 || '').trim(),
      String(city || '').trim(),
      String(country || '').trim(),
      String(stateProvince || '').trim(),
      String(postalCode || '').trim(),
      String(status || '').trim(),
      String(affiliationElement || '').trim(),
      cleanEmail,
      String(password || ''),
      String(passwordConfirmation || '')
    ];

    if (requiredFields.some(value => !value)) {
      return res.status(400).json({
        error: 'Required registration fields are missing'
      });
    }

    const user = new User({
      username: cleanEmail,
      email: cleanEmail,
      accountName: [cleanFirstName, cleanLastName]
        .filter(Boolean)
        .join(' '),
      firstName: cleanFirstName,
      lastName: cleanLastName,
      address: {
        line1: String(addressLine1 || '').trim(),
        line2: String(addressLine2 || '').trim(),
        city: String(city || '').trim(),
        country: String(country || '').trim(),
        stateProvince: String(stateProvince || '').trim(),
        postalCode: String(postalCode || '').trim()
      },
      rank: String(rank || '').trim(),
      postNominals: String(postNominals || '').trim(),
      company: String(company || '').trim(),
      status: String(status || '').trim(),
      affiliationElement: String(affiliationElement || '').trim(),
      trade: String(trade || '').trim(),
      tradeOther: String(tradeOther || '').trim(),
      currentUnit: String(currentUnit || '').trim(),
      preferredLanguage: cleanPreferredLanguage,
      password,
      role: 'subscriber'
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(201).json({ message: 'User created', token });
  } catch (err) {
    console.error('--- FULL ERROR DETAILS ---');
    console.error('Name:', err.name);
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);

    res.status(400).json({ error: 'Could not create account' });
  }
});

// POST /api/login
// Authenticate a user and return a short-lived JWT.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).select('+password');

  if (user && (await bcrypt.compare(password, user.password))) {
    const hasWebAuthn = Array.isArray(user.webauthn) && user.webauthn.some(
      credential => credential?.credentialID && credential?.publicKey
    );
    const hasTOTP = user.totp?.enabled === true && Boolean(user.totp?.secret);

    if (hasWebAuthn || hasTOTP) {
      // create a short-lived temp token for completing 2FA
      const tempToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      await User.findByIdAndUpdate(user._id, { $set: { 'twoFactor.tempToken': tempToken, 'twoFactor.tempExpires': expires } });
      const methods = [];
      if (hasWebAuthn) methods.push('webauthn');
      if (hasTOTP) methods.push('totp');
      await writeAuditLog({
        req,
        action: 'user.login_mfa_required',
        actor: user,
        targetType: 'user',
        target: user._id,
        targetSnapshot: {
          username: user.username,
          email: user.email,
          accountName: user.accountName,
          role: user.role
        },
        metadata: { methods }
      });
      return res.json({ twoFactorRequired: true, methods, tempToken, expiresAt: expires.toISOString() });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await writeAuditLog({
      req,
      action: 'user.login',
      actor: user,
      targetType: 'user',
      target: user._id,
      targetSnapshot: {
        username: user.username,
        email: user.email,
        accountName: user.accountName,
        role: user.role
      }
    });

    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// GET /api/me
// Return the authenticated user's profile and computed permissions.
router.get('/me', authMiddleware, (req, res) => {
  res.json(getProfileResponse(req.user));
});

// PATCH /api/profile
// Update safe, user-owned profile fields for the authenticated account.
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const updates = getProfileUpdate(req.body, req.user);

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        error: 'No editable profile fields were provided'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      {
        new: true,
        runValidators: true
      }
    ).select(PROFILE_SELECT);

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json(getProfileResponse(user));
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Profile information is invalid'
      });
    }

    if (
      [
        'Required profile fields are missing',
        'Required address fields are missing',
        'Invalid status',
        'Invalid affiliation element',
        'Invalid preferred language'
      ].includes(error.message)
    ) {
      return res.status(400).json({
        error: error.message
      });
    }

    console.error('Profile update failed:', error);

    res.status(500).json({
      error: 'Could not update profile'
    });
  }
});

// GET /api/contributor-check
// Confirm the current user has contributor-level access or higher.
router.get(
  '/contributor-check',
  authMiddleware,
  requireMinimumRole('contributor'),
  (req, res) => {
    res.json({
      message: 'You may submit content',
      role: req.user.role
    });
  }
);

// GET /api/admin-check
// Confirm the current user has user-management access.
router.get(
  '/admin-check',
  authMiddleware,
  requirePermission('canManageUsers'),
  (req, res) => {
    res.json({
      message: 'Administrator access confirmed'
    });
  }
);

module.exports = router;
