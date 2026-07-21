const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const {
  authMiddleware,
  requirePermission,
  requireMinimumRole
} = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { sendMail } = require('../services/mailer');

const router = express.Router();

const PROFILE_SELECT =
  'accountType username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit preferredLanguage role customRoles contentAreas createdAt updatedAt';

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
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for that email address, a password reset link has been sent.';
const EMAIL_VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_TEMP_TOKEN_TTL_MS = 30 * 60 * 1000;
const GHOST_PASSWORD_BYTES = 32;

function hasOwnValue(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function cleanProfileString(value) {
  return String(value || '').trim();
}

function hashPasswordResetToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

function generateEmailVerificationCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function getBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/u, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderPasswordResetEmail({ resetUrl, accountName }) {
  const cleanName = escapeHtml(String(accountName || 'there').trim());
  const cleanResetUrl = escapeHtml(resetUrl);

  return `
    <p>Hello ${cleanName},</p>
    <p>We received a request to reset the password for your CMCEN / RCMCE account.</p>
    <p><a href="${cleanResetUrl}">Reset your password</a></p>
    <p>This link expires in 60 minutes. If you did not request a password reset, you can ignore this email.</p>
  `;
}

function renderEmailVerificationEmail({ code, accountName }) {
  const cleanName = escapeHtml(String(accountName || 'there').trim());
  const cleanCode = escapeHtml(code);

  return `
    <p>Hello ${cleanName},</p>
    <p>Use this code to verify your CMCEN / RCMCE account email address:</p>
    <p><strong style="font-size: 24px; letter-spacing: 0.18em;">${cleanCode}</strong></p>
    <p>This code expires in 15 minutes.</p>
  `;
}

async function prepareEmailVerification(user) {
  const code = generateEmailVerificationCode();
  const tempToken = crypto.randomBytes(32).toString('hex');

  user.emailVerification.required = true;
  user.emailVerification.verified = false;
  user.emailVerification.verifiedAt = null;
  user.emailVerification.codeHash = hashToken(code);
  user.emailVerification.codeExpiresAt =
    new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS);
  user.emailVerification.tempTokenHash = hashToken(tempToken);
  user.emailVerification.tempTokenExpiresAt =
    new Date(Date.now() + EMAIL_VERIFICATION_TEMP_TOKEN_TTL_MS);

  return { code, tempToken };
}

async function sendEmailVerificationCode(user, code) {
  await sendMail({
    to: user.email,
    subject: 'Verify your CMCEN / RCMCE account',
    html: renderEmailVerificationEmail({
      code,
      accountName: user.accountName || user.firstName
    })
  });
}

function userRequiresEmailVerification(user) {
  return (
    user?.emailVerification?.required === true &&
    user.emailVerification.verified !== true
  );
}

function createSessionToken(user) {
  return jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function getUserSnapshot(user) {
  return {
    username: user.username,
    email: user.email,
    accountName: user.accountName,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    accountType: user.accountType || 'member'
  };
}

function createGhostPassword() {
  return crypto.randomBytes(GHOST_PASSWORD_BYTES).toString('hex');
}

async function getRejectedEventNotifications(user) {
  const query = {
    createdBy: user._id,
    status: 'rejected'
  };
  const [count, events] = await Promise.all([
    Event.countDocuments(query),
    Event.find(query)
      .select('title rejectionReason updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean()
  ]);

  return {
    count,
    items: events.map(event => ({
      type: 'event',
      id: event._id,
      title: event.title,
      reason: event.rejectionReason || '',
      updatedAt: event.updatedAt,
      editHref: `/submit-event?id=${encodeURIComponent(String(event._id))}`,
      href: `/submit-event?id=${encodeURIComponent(String(event._id))}`
    }))
  };
}

function getRetirementMessageNotificationTitle(retirementMessage) {
  const retiree = retirementMessage.retiree || {};
  const name = [
    retiree.rank,
    retiree.firstName,
    retiree.lastName
  ].filter(Boolean).join(' ');

  return name
    ? `Retirement message for ${name}`
    : 'Retirement message';
}

async function getRejectedRetirementMessageNotifications(user) {
  const query = {
    createdBy: user._id,
    status: 'rejected'
  };
  const [count, retirementMessages] = await Promise.all([
    RetirementMessage.countDocuments(query),
    RetirementMessage.find(query)
      .select('retiree rejectionReason updatedAt')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean()
  ]);

  return {
    count,
    items: retirementMessages.map(retirementMessage => ({
      type: 'retirementMessage',
      id: retirementMessage._id,
      title: getRetirementMessageNotificationTitle(retirementMessage),
      reason: retirementMessage.rejectionReason || '',
      updatedAt: retirementMessage.updatedAt,
      editHref: `/submit-retirement?id=${encodeURIComponent(String(retirementMessage._id))}`,
      href: `/submit-retirement?id=${encodeURIComponent(String(retirementMessage._id))}`
    }))
  };
}

async function getRejectedRetirementCommentNotifications(user) {
  const query = {
    author: user._id,
    status: 'rejected'
  };
  const [count, comments] = await Promise.all([
    RetirementComment.countDocuments(query),
    RetirementComment.find(query)
      .select('body rejectionReason updatedAt retirementMessage')
      .populate('retirementMessage', 'retiree status')
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean()
  ]);

  return {
    count,
    items: comments.map(comment => ({
      type: 'retirementComment',
      id: comment._id,
      title: getRetirementMessageNotificationTitle(
        comment.retirementMessage || {}
      ),
      body: comment.body || '',
      reason: comment.rejectionReason || '',
      updatedAt: comment.updatedAt,
      editHref: `/notifications?comment=${encodeURIComponent(String(comment._id))}`,
      href: `/notifications?comment=${encodeURIComponent(String(comment._id))}`
    }))
  };
}

async function getNotificationSummary(user) {
  const permissions = getUserPermissions(user);
  const items = [];
  let count = 0;

  if (permissions.canCreateDrafts === true) {
    const rejectedEvents = await getRejectedEventNotifications(user);
    count += rejectedEvents.count;
    items.push(...rejectedEvents.items);
  }

  if (permissions.canSubmitRetirementMessages === true) {
    const rejectedRetirementMessages =
      await getRejectedRetirementMessageNotifications(user);
    count += rejectedRetirementMessages.count;
    items.push(...rejectedRetirementMessages.items);
  }

  const rejectedRetirementComments =
    await getRejectedRetirementCommentNotifications(user);
  count += rejectedRetirementComments.count;
  items.push(...rejectedRetirementComments.items);

  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return {
    count,
    items,
    href: '/notifications'
  };
}

async function getProfileResponse(user) {
  const profile = user.toObject ? user.toObject() : user;
  const permissions = getUserPermissions(profile);
  let notifications = {
    count: 0,
    items: [],
    href: '/notifications'
  };

  try {
    notifications = await getNotificationSummary(profile);
  } catch (error) {
    console.error('Could not load notification summary:', error);
  }

  return {
    ...profile,
    permissions,
    notifications
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

// POST /api/ghost/request
// Start a strict guest account session by emailing a one-time code.
router.post('/ghost/request', async (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({
      error: 'Email is required'
    });
  }

  try {
    let user = await User.findOne({ email: cleanEmail })
      .select('+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt');

    if (user && user.accountType !== 'ghost') {
      return res.status(409).json({
        error: 'An account already exists for this email. Please sign in.'
      });
    }

    if (!user) {
      user = new User({
        accountType: 'ghost',
        username: cleanEmail,
        email: cleanEmail,
        accountName: '',
        firstName: '',
        lastName: '',
        password: createGhostPassword(),
        role: 'ghost'
      });
    }

    const verification = await prepareEmailVerification(user);
    await user.save();
    await sendEmailVerificationCode(user, verification.code);

    res.json({
      message: 'Check your email for a guest access code.',
      verificationToken: verification.tempToken,
      email: user.email
    });
  } catch (error) {
    console.error('Ghost account request failed:', error);

    res.status(500).json({
      error: 'Could not request guest access'
    });
  }
});

// POST /api/ghost/confirm
// Verify a guest access code and return a ghost session token.
router.post('/ghost/confirm', async (req, res) => {
  const verificationToken = String(req.body?.verificationToken || '').trim();
  const code = String(req.body?.code || '').replace(/\D/gu, '').trim();
  const firstName = String(req.body?.firstName || '').trim();

  if (!verificationToken || !/^\d{6}$/u.test(code) || !firstName) {
    return res.status(400).json({
      error: 'First name and verification code are required'
    });
  }

  try {
    const user = await User.findOne({
      accountType: 'ghost',
      'emailVerification.tempTokenHash': hashToken(verificationToken),
      'emailVerification.tempTokenExpiresAt': { $gt: new Date() },
      'emailVerification.codeHash': hashToken(code),
      'emailVerification.codeExpiresAt': { $gt: new Date() }
    }).select(
      '+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt'
    );

    if (!user) {
      return res.status(400).json({
        error: 'Guest access code is invalid or has expired'
      });
    }

    user.firstName = firstName;
    user.accountName = firstName;
    user.emailVerification.required = true;
    user.emailVerification.verified = true;
    user.emailVerification.verifiedAt = new Date();
    user.emailVerification.codeHash = '';
    user.emailVerification.codeExpiresAt = null;
    user.emailVerification.tempTokenHash = '';
    user.emailVerification.tempTokenExpiresAt = null;
    await user.save();

    await writeAuditLog({
      req,
      action: 'user.ghost_verified',
      actor: user,
      targetType: 'user',
      target: user._id,
      targetSnapshot: getUserSnapshot(user)
    });

    res.json({
      message: 'Guest access confirmed',
      token: createSessionToken(user)
    });
  } catch (error) {
    console.error('Ghost account confirmation failed:', error);

    res.status(500).json({
      error: 'Could not confirm guest access'
    });
  }
});

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

    const verification = await prepareEmailVerification(user);

    await user.save();
    await sendEmailVerificationCode(user, verification.code);

    await writeAuditLog({
      req,
      action: 'user.created',
      actor: user,
      targetType: 'user',
      target: user._id,
      targetSnapshot: {
        username: user.username,
        email: user.email,
        accountName: user.accountName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      metadata: {
        accountName: user.accountName,
        email: user.email,
        emailVerification: 'pending',
        mfaMethod: 'pending'
      }
    });

    res.status(201).json({
      message: 'User created. Check your email for a verification code.',
      emailVerificationRequired: true,
      email: user.email,
      verificationToken: verification.tempToken
    });
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
  const user = await User.findOne({ username })
    .select('+password +emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt');

  if (user && (await bcrypt.compare(password, user.password))) {
    if (userRequiresEmailVerification(user)) {
      const verification = await prepareEmailVerification(user);
      await user.save();
      await sendEmailVerificationCode(user, verification.code);

      return res.json({
        emailVerificationRequired: true,
        email: user.email,
        verificationToken: verification.tempToken,
        message: 'Check your email for a verification code.'
      });
    }

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

    const token = createSessionToken(user);

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

// POST /api/email-verification/confirm
// Verify a newly registered account email address with the emailed code.
router.post('/email-verification/confirm', async (req, res) => {
  const verificationToken = String(req.body?.verificationToken || '').trim();
  const code = String(req.body?.code || '').replace(/\D/gu, '').trim();

  if (!verificationToken || !/^\d{6}$/u.test(code)) {
    return res.status(400).json({
      error: 'Verification token and code are required'
    });
  }

  try {
    const user = await User.findOne({
      'emailVerification.tempTokenHash': hashToken(verificationToken),
      'emailVerification.tempTokenExpiresAt': { $gt: new Date() },
      'emailVerification.codeHash': hashToken(code),
      'emailVerification.codeExpiresAt': { $gt: new Date() }
    }).select(
      '+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt'
    );

    if (!user || !userRequiresEmailVerification(user)) {
      return res.status(400).json({
        error: 'Verification code is invalid or has expired'
      });
    }

    user.emailVerification.required = true;
    user.emailVerification.verified = true;
    user.emailVerification.verifiedAt = new Date();
    user.emailVerification.codeHash = '';
    user.emailVerification.codeExpiresAt = null;
    user.emailVerification.tempTokenHash = '';
    user.emailVerification.tempTokenExpiresAt = null;
    await user.save();

    await writeAuditLog({
      req,
      action: 'user.email_verified',
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

    res.json({
      message: 'Email verified',
      token: createSessionToken(user)
    });
  } catch (error) {
    console.error('Email verification failed:', error);

    res.status(500).json({
      error: 'Could not verify email'
    });
  }
});

// POST /api/password-reset/request
// Send a one-time password reset link when the submitted email belongs to an account.
router.post('/password-reset/request', async (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();

  try {
    if (!cleanEmail) {
      return res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetUrl =
      `${getBaseUrl(req)}/login?resetToken=${encodeURIComponent(resetToken)}`;
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    user.passwordReset = {
      tokenHash: hashPasswordResetToken(resetToken),
      expiresAt
    };
    await user.save();

    await sendMail({
      to: user.email,
      subject: 'Reset your CMCEN / RCMCE password',
      html: renderPasswordResetEmail({
        resetUrl,
        accountName: user.accountName || user.firstName
      })
    });

    await writeAuditLog({
      req,
      action: 'user.password_reset_requested',
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

    res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
  } catch (error) {
    console.error('Password reset request failed:', error);

    res.status(500).json({
      error: 'Could not request password reset'
    });
  }
});

// POST /api/password-reset/confirm
// Consume a valid reset token and set a new account password.
router.post('/password-reset/confirm', async (req, res) => {
  const resetToken = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const passwordConfirmation = String(req.body?.passwordConfirmation || '');

  if (!resetToken || !password || !passwordConfirmation) {
    return res.status(400).json({
      error: 'Required password reset fields are missing'
    });
  }

  if (password !== passwordConfirmation) {
    return res.status(400).json({
      error: 'Passwords do not match'
    });
  }

  try {
    const user = await User.findOne({
      'passwordReset.tokenHash': hashPasswordResetToken(resetToken),
      'passwordReset.expiresAt': { $gt: new Date() }
    }).select('+password +passwordReset.tokenHash +passwordReset.expiresAt');

    if (!user) {
      return res.status(400).json({
        error: 'Password reset link is invalid or has expired'
      });
    }

    user.password = password;
    user.passwordReset = {
      tokenHash: '',
      expiresAt: null
    };
    user.twoFactor = {
      tempToken: '',
      tempExpires: null
    };
    await user.save();

    await writeAuditLog({
      req,
      action: 'user.password_reset_completed',
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

    res.json({
      message: 'Password has been reset. You can now sign in.'
    });
  } catch (error) {
    console.error('Password reset confirmation failed:', error);

    res.status(500).json({
      error: 'Could not reset password'
    });
  }
});

// GET /api/me
// Return the authenticated user's profile and computed permissions.
router.get('/me', authMiddleware, async (req, res) => {
  res.json(await getProfileResponse(req.user));
});

router.get('/notifications', authMiddleware, async (req, res) => {
  res.json({
    notifications: await getNotificationSummary(req.user)
  });
});

// POST /api/ghost/upgrade
// Convert a verified ghost account into a full subscriber account.
router.post('/ghost/upgrade', authMiddleware, async (req, res) => {
  if (req.user.accountType !== 'ghost' || req.user.role !== 'ghost') {
    return res.status(400).json({
      error: 'Only ghost accounts can be upgraded'
    });
  }

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
    password,
    passwordConfirmation
  } = req.body || {};

  if (password !== passwordConfirmation) {
    return res.status(400).json({
      error: 'Passwords do not match'
    });
  }

  const cleanFirstName = String(firstName || '').trim();
  const cleanLastName = String(lastName || '').trim();
  const incomingPreferredLanguage = String(preferredLanguage || '').trim();
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
    String(password || ''),
    String(passwordConfirmation || '')
  ];

  if (requiredFields.some(value => !value)) {
    return res.status(400).json({
      error: 'Required account fields are missing'
    });
  }

  try {
    const user = await User.findById(req.user._id).select('+password');

    if (!user || user.accountType !== 'ghost') {
      return res.status(404).json({
        error: 'Ghost account not found'
      });
    }

    user.accountType = 'member';
    user.accountName = [cleanFirstName, cleanLastName]
      .filter(Boolean)
      .join(' ');
    user.firstName = cleanFirstName;
    user.lastName = cleanLastName;
    user.address = {
      line1: String(addressLine1 || '').trim(),
      line2: String(addressLine2 || '').trim(),
      city: String(city || '').trim(),
      country: String(country || '').trim(),
      stateProvince: String(stateProvince || '').trim(),
      postalCode: String(postalCode || '').trim()
    };
    user.rank = String(rank || '').trim();
    user.postNominals = String(postNominals || '').trim();
    user.company = String(company || '').trim();
    user.status = String(status || '').trim();
    user.affiliationElement = String(affiliationElement || '').trim();
    user.trade = String(trade || '').trim();
    user.tradeOther = String(tradeOther || '').trim();
    user.currentUnit = String(currentUnit || '').trim();
    user.preferredLanguage = cleanPreferredLanguage;
    user.password = password;
    user.role = 'subscriber';
    user.emailVerification.required = true;
    user.emailVerification.verified = true;
    user.emailVerification.verifiedAt =
      user.emailVerification.verifiedAt || new Date();

    await user.save();

    await writeAuditLog({
      req,
      action: 'user.ghost_upgraded',
      actor: user,
      targetType: 'user',
      target: user._id,
      targetSnapshot: getUserSnapshot(user)
    });

    res.json({
      message: 'Account upgraded',
      token: createSessionToken(user),
      user: await getProfileResponse(user)
    });
  } catch (error) {
    console.error('Ghost account upgrade failed:', error);

    res.status(500).json({
      error: 'Could not upgrade account'
    });
  }
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
        returnDocument: 'after',
        runValidators: true
      }
    )
      .select(PROFILE_SELECT)
      .populate('customRoles', 'name slug color permissions');

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json(await getProfileResponse(user));
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
