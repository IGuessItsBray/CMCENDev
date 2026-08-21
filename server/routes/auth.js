const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const User = require('../models/User');
const Event = require('../models/Event');
const RetirementMessage = require('../models/RetirementMessage');
const RetirementComment = require('../models/RetirementComment');
const LastPostMessage = require('../models/LastPostMessage');
const EmailUnsubscribeToken = require('../models/EmailUnsubscribeToken');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { sendMail } = require('../services/mailer');
const {
  CASL_CONSENT_TEXT_VERSION,
  getCaslSenderInfo,
  getNewsAnnouncementsSubscription,
  getWeeklyBriefSubscription,
} = require('../services/weekly-brief');
const {
  REFRESH_COOKIE_NAME,
  clearRefreshTokenCookie,
  createSessionToken,
  readCookie,
  setRefreshTokenCookie,
} = require('../services/auth-session');
const {
  createRateLimit,
  getClientIp,
  rateLimitByIp,
  readPositiveInteger,
} = require('../middleware/rate-limit');

const router = express.Router();

const PROFILE_SELECT =
  'accountType profileComplete username email accountName firstName lastName address rank postNominals company status affiliationElement trade tradeOther currentUnit phone preferredLanguage role customRoles contentAreas emailSubscriptions notificationState createdAt updatedAt';

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
  'phone',
  'preferredLanguage',
];

const EDITABLE_ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'country',
  'stateProvince',
  'postalCode',
];

const REQUIRED_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'status',
  'affiliationElement',
];

const REQUIRED_ADDRESS_FIELDS = [
  'line1',
  'city',
  'country',
  'stateProvince',
  'postalCode',
];

const VALID_STATUSES = new Set([
  'regular',
  'reserve',
  'honourary',
  'civilian',
  'retired',
  'released',
  'other',
]);

const VALID_AFFILIATION_ELEMENTS = new Set([
  'army',
  'navy',
  'air_force',
  'other',
]);

const VALID_PREFERRED_LANGUAGES = new Set(['en', 'fr']);

function hasSessionCookieConsent(req) {
  return req.body?.sessionCookieConsent === true;
}
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for that email address, a password reset link has been sent.';
const EMAIL_VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_TEMP_TOKEN_TTL_MS = 30 * 60 * 1000;
const GHOST_PASSWORD_BYTES = 32;
const INITIAL_NOTIFICATION_APPROVAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const passwordResetRequestIpLimit = rateLimitByIp(
  'password-reset-request-ip',
  'PASSWORD_RESET_REQUEST_RATE_LIMIT_WINDOW_SECONDS',
  'PASSWORD_RESET_REQUEST_RATE_LIMIT_MAX',
  { windowSeconds: 15 * 60, max: 5 },
);
const passwordResetRequestEmailLimit = createRateLimit({
  name: 'password-reset-request-email',
  windowMs:
    readPositiveInteger(
      'PASSWORD_RESET_REQUEST_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
      60 * 60,
    ) * 1000,
  max: readPositiveInteger('PASSWORD_RESET_REQUEST_EMAIL_RATE_LIMIT_MAX', 3),
  keyGenerator: (req) =>
    String(req.body?.email || '')
      .trim()
      .toLowerCase() || getClientIp(req),
});
const passwordResetConfirmLimit = rateLimitByIp(
  'password-reset-confirm-ip',
  'PASSWORD_RESET_CONFIRM_RATE_LIMIT_WINDOW_SECONDS',
  'PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX',
  { windowSeconds: 15 * 60, max: 5 },
);

function verifyDestructiveTotp(user, code) {
  if (!user?.totp?.secret || user.totp.enabled !== true) return false;

  return speakeasy.totp.verify({
    secret: user.totp.secret,
    encoding: 'base32',
    token: String(code || '').replace(/\D/gu, ''),
    window: Number(process.env.TOTP_WINDOW || 2),
  });
}

function hasFreshDestructivePasskeyVerification(user) {
  const verifiedAt = user?.twoFactor?.destructiveVerifiedAt;
  return (
    verifiedAt && Date.now() - new Date(verifiedAt).getTime() <= 5 * 60 * 1000
  );
}

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
  user.emailVerification.codeExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_CODE_TTL_MS,
  );
  user.emailVerification.tempTokenHash = hashToken(tempToken);
  user.emailVerification.tempTokenExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_TEMP_TOKEN_TTL_MS,
  );

  return { code, tempToken };
}

async function sendEmailVerificationCode(user, code) {
  await sendMail({
    to: user.email,
    subject: 'Verify your CMCEN / RCMCE account',
    html: renderEmailVerificationEmail({
      code,
      accountName: user.accountName || user.firstName,
    }),
  });
}

function userRequiresEmailVerification(user) {
  return (
    user?.emailVerification?.required === true &&
    user.emailVerification.verified !== true
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
    accountType: user.accountType || 'member',
  };
}

function createGhostPassword() {
  return crypto.randomBytes(GHOST_PASSWORD_BYTES).toString('hex');
}

function getReviewResultQuery(ownerField, user, lastReadAt) {
  return {
    [ownerField]: user._id,
    $or: [
      getRejectedReviewResultQuery(),
      getUnreadApprovalReviewResultQuery(user, lastReadAt),
    ],
  };
}

function getRejectedReviewResultQuery() {
  return { status: 'rejected' };
}

function getUnreadApprovalReviewResultQuery(user, lastReadAt) {
  const approvalReadAt =
    lastReadAt ||
    new Date(Date.now() - INITIAL_NOTIFICATION_APPROVAL_LOOKBACK_MS);

  return {
    status: 'published',
    reviewedAt: { $gt: approvalReadAt },
    reviewedBy: { $ne: user._id },
  };
}

function getReviewResultHref(type, item) {
  const id = encodeURIComponent(String(item._id));

  if (item.status === 'rejected') {
    if (type === 'event') return `/submit-event?id=${id}`;

    if (type === 'retirementMessage') return `/submit-retirement?id=${id}`;

    if (type === 'lastPost') return `/submit-last-post?id=${id}`;

    const messageId = encodeURIComponent(
      String(item.retirementMessage?._id || item.retirementMessage || ''),
    );
    return `/retirement-message?id=${messageId}&editComment=${id}`;
  }

  if (type === 'event') return `/event?id=${id}`;

  if (type === 'retirementMessage') return `/retirement-message?id=${id}`;

  const messageId = encodeURIComponent(
    String(item.retirementMessage?._id || item.retirementMessage || ''),
  );
  return `/retirement-message?id=${messageId}#comments`;
}

async function getEventReviewNotifications(user, lastReadAt) {
  const events = await Event.find(
    getReviewResultQuery('createdBy', user, lastReadAt),
  )
    .select('title status rejectionReason reviewedAt updatedAt')
    .sort({ reviewedAt: -1 })
    .lean();

  return {
    actionCount: events.filter((event) => event.status === 'rejected').length,
    unreadCount: events.filter((event) => event.status === 'published').length,
    items: events.map((event) => ({
      type: 'event',
      id: event._id,
      title: event.title,
      status: event.status,
      reason: event.rejectionReason || '',
      updatedAt: event.reviewedAt || event.updatedAt,
      editHref: getReviewResultHref('event', event),
      href: getReviewResultHref('event', event),
    })),
  };
}

function getRetirementMessageNotificationTitle(retirementMessage) {
  const retiree = retirementMessage.retiree || {};
  const name = [retiree.rank, retiree.firstName, retiree.lastName]
    .filter(Boolean)
    .join(' ');

  return name ? `Retirement message for ${name}` : 'Retirement message';
}

async function getRetirementMessageReviewNotifications(user, lastReadAt) {
  const retirementMessages = await RetirementMessage.find(
    getReviewResultQuery('createdBy', user, lastReadAt),
  )
    .select('retiree status rejectionReason reviewedAt updatedAt')
    .sort({ reviewedAt: -1 })
    .lean();

  return {
    actionCount: retirementMessages.filter(
      (retirementMessage) => retirementMessage.status === 'rejected',
    ).length,
    unreadCount: retirementMessages.filter(
      (retirementMessage) => retirementMessage.status === 'published',
    ).length,
    items: retirementMessages.map((retirementMessage) => ({
      type: 'retirementMessage',
      id: retirementMessage._id,
      title: getRetirementMessageNotificationTitle(retirementMessage),
      status: retirementMessage.status,
      reason: retirementMessage.rejectionReason || '',
      updatedAt: retirementMessage.reviewedAt || retirementMessage.updatedAt,
      editHref: getReviewResultHref('retirementMessage', retirementMessage),
      href: getReviewResultHref('retirementMessage', retirementMessage),
    })),
  };
}

function getLastPostNotificationTitle(lastPost) {
  const deceased = lastPost.deceased || {};
  const name = [deceased.fullRank, deceased.firstName, deceased.surname]
    .filter(Boolean)
    .join(' ');

  return name ? `Last Post for ${name}` : 'Last Post notice';
}

async function getLastPostReviewNotifications(user, lastReadAt) {
  const lastPosts = await LastPostMessage.find(
    getReviewResultQuery('createdBy', user, lastReadAt),
  )
    .select('deceased status rejectionReason reviewedAt updatedAt')
    .sort({ reviewedAt: -1 })
    .lean();

  return {
    actionCount: lastPosts.filter((lastPost) => lastPost.status === 'rejected')
      .length,
    unreadCount: lastPosts.filter((lastPost) => lastPost.status === 'published')
      .length,
    items: lastPosts.map((lastPost) => ({
      type: 'lastPost',
      id: lastPost._id,
      title: getLastPostNotificationTitle(lastPost),
      status: lastPost.status,
      reason: lastPost.rejectionReason || '',
      updatedAt: lastPost.reviewedAt || lastPost.updatedAt,
      editHref: getReviewResultHref('lastPost', lastPost),
      href: getReviewResultHref('lastPost', lastPost),
    })),
  };
}

async function getRetirementCommentReviewNotifications(user, lastReadAt) {
  const comments = await RetirementComment.find(
    getReviewResultQuery('author', user, lastReadAt),
  )
    .select('body status rejectionReason reviewedAt updatedAt retirementMessage')
    .populate('retirementMessage', 'retiree status')
    .sort({ reviewedAt: -1 })
    .lean();

  return {
    actionCount: comments.filter((comment) => comment.status === 'rejected')
      .length,
    unreadCount: comments.filter((comment) => comment.status === 'published')
      .length,
    items: comments.map((comment) => ({
      type: 'retirementComment',
      id: comment._id,
      title: getRetirementMessageNotificationTitle(
        comment.retirementMessage || {},
      ),
      body: comment.body || '',
      status: comment.status,
      reason: comment.rejectionReason || '',
      updatedAt: comment.reviewedAt || comment.updatedAt,
      editHref: getReviewResultHref('retirementComment', comment),
      href: getReviewResultHref('retirementComment', comment),
    })),
  };
}

async function getNotificationSummary(user) {
  const readThrough = new Date();
  const lastReadAt = user.notificationState?.lastReadAt || null;
  const items = [];
  let actionCount = 0;
  let unreadCount = 0;

  const [events, retirementMessages, lastPosts, retirementComments] = await Promise.all([
    getEventReviewNotifications(user, lastReadAt),
    getRetirementMessageReviewNotifications(user, lastReadAt),
    getLastPostReviewNotifications(user, lastReadAt),
    getRetirementCommentReviewNotifications(user, lastReadAt),
  ]);

  [events, retirementMessages, lastPosts, retirementComments].forEach((result) => {
    actionCount += result.actionCount;
    unreadCount += result.unreadCount;
    items.push(...result.items);
  });

  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return {
    count: actionCount + unreadCount,
    actionCount,
    unreadCount,
    shouldMarkRead: !lastReadAt || unreadCount > 0,
    items,
    readThrough: readThrough.toISOString(),
  };
}

async function getReviewResultCounts(Model, ownerField, user, lastReadAt) {
  const ownerQuery = { [ownerField]: user._id };
  const [actionCount, unreadCount] = await Promise.all([
    Model.countDocuments({
      ...ownerQuery,
      ...getRejectedReviewResultQuery(),
    }),
    Model.countDocuments({
      ...ownerQuery,
      ...getUnreadApprovalReviewResultQuery(user, lastReadAt),
    }),
  ]);

  return { actionCount, unreadCount };
}

async function getNotificationCounts(user) {
  const lastReadAt = user.notificationState?.lastReadAt || null;
  const [events, retirementMessages, lastPosts, retirementComments] = await Promise.all([
    getReviewResultCounts(Event, 'createdBy', user, lastReadAt),
    getReviewResultCounts(RetirementMessage, 'createdBy', user, lastReadAt),
    getReviewResultCounts(LastPostMessage, 'createdBy', user, lastReadAt),
    getReviewResultCounts(RetirementComment, 'author', user, lastReadAt),
  ]);

  const actionCount =
    events.actionCount +
    retirementMessages.actionCount +
    lastPosts.actionCount +
    retirementComments.actionCount;
  const unreadCount =
    events.unreadCount +
    retirementMessages.unreadCount +
    lastPosts.unreadCount +
    retirementComments.unreadCount;

  return {
    count: actionCount + unreadCount,
    actionCount,
    unreadCount,
  };
}

async function getProfileResponse(user) {
  const profile = user.toObject ? user.toObject() : user;
  const mfa = {
    hasTotp: profile.totp?.enabled === true && Boolean(profile.totp?.secret),
    hasPasskey:
      Array.isArray(profile.webauthn) &&
      profile.webauthn.some(
        (credential) => credential?.credentialID && credential?.publicKey,
      ),
  };
  delete profile.totp;
  delete profile.webauthn;
  delete profile.twoFactor;
  const permissions = getUserPermissions(profile);
  let notifications = {
    count: 0,
    actionCount: 0,
    unreadCount: 0,
  };

  try {
    notifications = await getNotificationCounts(profile);
  } catch (error) {
    console.error('Could not load notification counts:', error);
  }

  return {
    ...profile,
    weeklyBrief: getWeeklyBriefSubscription(profile),
    newsAnnouncements: getNewsAnnouncementsSubscription(profile),
    mfa,
    permissions,
    notifications,
  };
}

function getProfileUpdate(body, currentUser) {
  const updates = {};
  const source = body || {};

  EDITABLE_PROFILE_FIELDS.forEach((field) => {
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

  EDITABLE_ADDRESS_FIELDS.forEach((field) => {
    if (hasOwnValue(addressSource, field)) {
      updates[`address.${field}`] = cleanProfileString(addressSource[field]);
    }
  });

  REQUIRED_PROFILE_FIELDS.forEach((field) => {
    if (hasOwnValue(updates, field) && !updates[field]) {
      throw new Error('Required profile fields are missing');
    }
  });

  REQUIRED_ADDRESS_FIELDS.forEach((field) => {
    const updateKey = `address.${field}`;

    if (hasOwnValue(updates, updateKey) && !updates[updateKey]) {
      throw new Error('Required address fields are missing');
    }
  });

  if (hasOwnValue(updates, 'status') && !VALID_STATUSES.has(updates.status)) {
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

  if (hasOwnValue(updates, 'firstName') || hasOwnValue(updates, 'lastName')) {
    const firstName = hasOwnValue(updates, 'firstName')
      ? updates.firstName
      : currentUser.firstName;
    const lastName = hasOwnValue(updates, 'lastName')
      ? updates.lastName
      : currentUser.lastName;

    updates.accountName = [firstName, lastName].filter(Boolean).join(' ');
  }

  return updates;
}

// POST /api/ghost/request
// Start a strict guest account session by emailing a one-time code.
router.post('/ghost/request', async (req, res) => {
  const cleanEmail = String(req.body?.email || '')
    .trim()
    .toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({
      error: 'Email is required',
    });
  }

  try {
    let user = await User.findOne({ email: cleanEmail }).select(
      '+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt',
    );

    if (user && user.accountType !== 'ghost') {
      return res.status(409).json({
        error: 'An account already exists for this email. Please sign in.',
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
        role: 'ghost',
      });
    }

    const verification = await prepareEmailVerification(user);
    await user.save();
    await sendEmailVerificationCode(user, verification.code);

    res.json({
      message: 'Check your email for a guest access code.',
      verificationToken: verification.tempToken,
      email: user.email,
    });
  } catch (error) {
    console.error('Ghost account request failed:', error);

    res.status(500).json({
      error: 'Could not request guest access',
    });
  }
});

// POST /api/ghost/confirm
// Verify a guest access code and return a ghost session token.
router.post('/ghost/confirm', async (req, res) => {
  const verificationToken = String(req.body?.verificationToken || '').trim();
  const code = String(req.body?.code || '')
    .replace(/\D/gu, '')
    .trim();
  const firstName = String(req.body?.firstName || '').trim();

  if (!verificationToken || !/^\d{6}$/u.test(code) || !firstName) {
    return res.status(400).json({
      error: 'First name and verification code are required',
    });
  }

  try {
    const user = await User.findOne({
      accountType: 'ghost',
      'emailVerification.tempTokenHash': hashToken(verificationToken),
      'emailVerification.tempTokenExpiresAt': { $gt: new Date() },
      'emailVerification.codeHash': hashToken(code),
      'emailVerification.codeExpiresAt': { $gt: new Date() },
    }).select(
      '+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt',
    );

    if (!user) {
      return res.status(400).json({
        error: 'Guest access code is invalid or has expired',
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
      targetSnapshot: getUserSnapshot(user),
    });

    if (!hasSessionCookieConsent(req)) {
      return res.json({
        message: 'Guest access confirmed. Sign in to continue.',
        sessionCookieConsentRequired: true,
      });
    }

    setRefreshTokenCookie(req, res, user);
    res.json({
      message: 'Guest access confirmed',
      token: createSessionToken(user),
    });
  } catch (error) {
    console.error('Ghost account confirmation failed:', error);

    res.status(500).json({
      error: 'Could not confirm guest access',
    });
  }
});

// GET /api/invitations/activate?token=...
// Return the prefilled identity for a valid invitation without exposing profile data.
router.get('/invitations/activate', async (req, res) => {
  const token = String(req.query?.token || '').trim();

  if (!token) {
    return res.status(400).json({ error: 'Invitation token is required' });
  }

  try {
    const user = await User.findOne({
      accountType: 'invited',
      'invitation.tokenHash': hashToken(token),
      'invitation.expiresAt': { $gt: new Date() },
    }).select('firstName lastName email');

    if (!user) {
      return res
        .status(400)
        .json({ error: 'Invitation link is invalid or has expired' });
    }

    return res.json({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  } catch (error) {
    console.error('Invitation lookup failed:', error);
    return res.status(500).json({ error: 'Could not load invitation' });
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
      passwordConfirmation,
      invitationToken,
    } = req.body;

    if (password !== passwordConfirmation) {
      return res.status(400).json({
        error: 'Passwords do not match',
      });
    }

    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();
    const cleanFirstName = String(firstName || '').trim();
    const cleanLastName = String(lastName || '').trim();
    const incomingPreferredLanguage = String(preferredLanguage || '').trim();

    if (
      incomingPreferredLanguage &&
      !VALID_PREFERRED_LANGUAGES.has(incomingPreferredLanguage)
    ) {
      return res.status(400).json({
        error: 'Invalid preferred language',
      });
    }

    const cleanPreferredLanguage = VALID_PREFERRED_LANGUAGES.has(
      incomingPreferredLanguage,
    )
      ? incomingPreferredLanguage
      : 'en';
    const cleanInvitationToken = String(invitationToken || '').trim();
    const invitedUser = cleanInvitationToken
      ? await User.findOne({
          accountType: 'invited',
          'invitation.tokenHash': hashToken(cleanInvitationToken),
          'invitation.expiresAt': { $gt: new Date() },
        }).select('+password +invitation.tokenHash +invitation.expiresAt')
      : null;

    if (cleanInvitationToken && !invitedUser) {
      return res
        .status(400)
        .json({ error: 'Invitation link is invalid or has expired' });
    }

    if (invitedUser && invitedUser.email !== cleanEmail) {
      return res
        .status(400)
        .json({ error: 'Use the email address that received the invitation' });
    }

    const requiredFields = invitedUser
      ? [cleanEmail, String(password || ''), String(passwordConfirmation || '')]
      : [
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
          String(passwordConfirmation || ''),
        ];

    if (requiredFields.some((value) => !value)) {
      return res.status(400).json({
        error: 'Required registration fields are missing',
      });
    }

    const user =
      invitedUser ||
      new User({
        username: cleanEmail,
        email: cleanEmail,
        accountName: [cleanFirstName, cleanLastName].filter(Boolean).join(' '),
        firstName: cleanFirstName,
        lastName: cleanLastName,
        address: {
          line1: String(addressLine1 || '').trim(),
          line2: String(addressLine2 || '').trim(),
          city: String(city || '').trim(),
          country: String(country || '').trim(),
          stateProvince: String(stateProvince || '').trim(),
          postalCode: String(postalCode || '').trim(),
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
        role: 'subscriber',
      });

    if (invitedUser) {
      user.username = cleanEmail;
      user.email = cleanEmail;
      user.accountType = 'member';
      user.profileComplete = false;
      user.password = password;
      user.invitation.tokenHash = '';
      user.invitation.expiresAt = null;
      user.emailVerification.required = true;
      user.emailVerification.verified = true;
      user.emailVerification.verifiedAt = new Date();
    }

    const verification = invitedUser
      ? null
      : await prepareEmailVerification(user);

    await user.save();
    if (verification) {
      await sendEmailVerificationCode(user, verification.code);
    }

    await writeAuditLog({
      req,
      action: invitedUser ? 'user.invitation_activated' : 'user.created',
      actor: user,
      targetType: 'user',
      target: user._id,
      targetSnapshot: {
        username: user.username,
        email: user.email,
        accountName: user.accountName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      metadata: {
        accountName: user.accountName,
        email: user.email,
        emailVerification: invitedUser ? 'verified' : 'pending',
        mfaMethod: 'pending',
        invitation: invitedUser ? 'activated' : undefined,
      },
    });

    if (invitedUser && hasSessionCookieConsent(req)) {
      setRefreshTokenCookie(req, res, user);
      return res.status(201).json({
        message:
          'Account activated. Complete your profile from your account page.',
        token: createSessionToken(user),
        user: await getProfileResponse(user),
      });
    }

    if (invitedUser) {
      return res.status(201).json({
        message:
          'Account activated. Sign in to complete your profile and security setup.',
        sessionCookieConsentRequired: true,
      });
    }

    res.status(201).json({
      message: 'User created. Check your email for a verification code.',
      emailVerificationRequired: true,
      email: user.email,
      verificationToken: verification.tempToken,
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
  const { username, password, sessionCookieConsent } = req.body;
  const user = await User.findOne({ username }).select(
    '+password +emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt',
  );

  if (user && (await bcrypt.compare(password, user.password))) {
    if (userRequiresEmailVerification(user)) {
      const verification = await prepareEmailVerification(user);
      await user.save();
      await sendEmailVerificationCode(user, verification.code);

      return res.json({
        emailVerificationRequired: true,
        email: user.email,
        verificationToken: verification.tempToken,
        message: 'Check your email for a verification code.',
      });
    }

    if (sessionCookieConsent !== true) {
      return res.json({ sessionCookieConsentRequired: true });
    }

    const hasWebAuthn =
      Array.isArray(user.webauthn) &&
      user.webauthn.some(
        (credential) => credential?.credentialID && credential?.publicKey,
      );
    const hasTOTP = user.totp?.enabled === true && Boolean(user.totp?.secret);

    if (hasWebAuthn || hasTOTP) {
      // create a short-lived temp token for completing 2FA
      const tempToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'twoFactor.tempToken': tempToken,
          'twoFactor.tempExpires': expires,
        },
      });
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
          role: user.role,
        },
        metadata: { methods },
      });
      return res.json({
        twoFactorRequired: true,
        methods,
        tempToken,
        expiresAt: expires.toISOString(),
      });
    }

    const token = createSessionToken(user);
    setRefreshTokenCookie(req, res, user);

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
        role: user.role,
      },
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
  const code = String(req.body?.code || '')
    .replace(/\D/gu, '')
    .trim();

  if (!verificationToken || !/^\d{6}$/u.test(code)) {
    return res.status(400).json({
      error: 'Verification token and code are required',
    });
  }

  try {
    const user = await User.findOne({
      'emailVerification.tempTokenHash': hashToken(verificationToken),
      'emailVerification.tempTokenExpiresAt': { $gt: new Date() },
      'emailVerification.codeHash': hashToken(code),
      'emailVerification.codeExpiresAt': { $gt: new Date() },
    }).select(
      '+emailVerification.codeHash +emailVerification.codeExpiresAt +emailVerification.tempTokenHash +emailVerification.tempTokenExpiresAt',
    );

    if (!user || !userRequiresEmailVerification(user)) {
      return res.status(400).json({
        error: 'Verification code is invalid or has expired',
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
        role: user.role,
      },
    });

    if (!hasSessionCookieConsent(req)) {
      return res.json({
        message: 'Email verified. Sign in to continue.',
        sessionCookieConsentRequired: true,
      });
    }

    setRefreshTokenCookie(req, res, user);
    res.json({
      message: 'Email verified',
      token: createSessionToken(user),
    });
  } catch (error) {
    console.error('Email verification failed:', error);

    res.status(500).json({
      error: 'Could not verify email',
    });
  }
});

// POST /api/password-reset/request
// Send a one-time password reset link when the submitted email belongs to an account.
router.post(
  '/password-reset/request',
  passwordResetRequestIpLimit,
  passwordResetRequestEmailLimit,
  async (req, res) => {
    const cleanEmail = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    try {
      if (!cleanEmail) {
        return res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
      }

      const user = await User.findOne({ email: cleanEmail });

      if (!user) {
        return res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetUrl = `${getBaseUrl(req)}/login?resetToken=${encodeURIComponent(resetToken)}`;
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

      user.passwordReset = {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt,
      };
      await user.save();

      await sendMail({
        to: user.email,
        subject: 'Reset your CMCEN / RCMCE password',
        html: renderPasswordResetEmail({
          resetUrl,
          accountName: user.accountName || user.firstName,
        }),
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
          role: user.role,
        },
      });

      res.json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
    } catch (error) {
      console.error('Password reset request failed:', error);

      res.status(500).json({
        error: 'Could not request password reset',
      });
    }
  },
);

// POST /api/password-reset/confirm
// Consume a valid reset token and set a new account password.
router.post(
  '/password-reset/confirm',
  passwordResetConfirmLimit,
  async (req, res) => {
    const resetToken = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    const passwordConfirmation = String(req.body?.passwordConfirmation || '');

    if (!resetToken || !password || !passwordConfirmation) {
      return res.status(400).json({
        error: 'Required password reset fields are missing',
      });
    }

    if (password !== passwordConfirmation) {
      return res.status(400).json({
        error: 'Passwords do not match',
      });
    }

    try {
      const user = await User.findOne({
        'passwordReset.tokenHash': hashPasswordResetToken(resetToken),
        'passwordReset.expiresAt': { $gt: new Date() },
      }).select('+password +passwordReset.tokenHash +passwordReset.expiresAt');

      if (!user) {
        return res.status(400).json({
          error: 'Password reset link is invalid or has expired',
        });
      }

      user.password = password;
      user.passwordReset = {
        tokenHash: '',
        expiresAt: null,
      };
      user.twoFactor = {
        tempToken: '',
        tempExpires: null,
      };
      user.sessionVersion = Number(user.sessionVersion || 0) + 1;
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
          role: user.role,
        },
      });

      res.json({
        message: 'Password has been reset. You can now sign in.',
      });
    } catch (error) {
      console.error('Password reset confirmation failed:', error);

      res.status(500).json({
        error: 'Could not reset password',
      });
    }
  },
);

// GET /api/me
// Return the authenticated user's profile and computed permissions.
router.get('/me', authMiddleware, async (req, res) => {
  res.json(await getProfileResponse(req.user));
});

router.get('/notifications', authMiddleware, async (req, res) => {
  res.json({
    notifications: await getNotificationSummary(req.user),
  });
});

router.post('/notifications/read', authMiddleware, async (req, res) => {
  const readThrough = new Date(req.body?.readThrough);

  if (Number.isNaN(readThrough.getTime())) {
    return res.status(400).json({
      error: 'A valid notification read time is required',
    });
  }

  const currentReadAt = req.user.notificationState?.lastReadAt;
  const lastReadAt =
    currentReadAt && currentReadAt > readThrough ? currentReadAt : readThrough;

  if (!currentReadAt || currentReadAt < readThrough) {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'notificationState.lastReadAt': lastReadAt } },
    );

    await writeAuditLog({
      req,
      action: 'user.notifications_read',
      actor: req.user,
      targetType: 'user',
      target: req.user._id,
      metadata: { readThrough: readThrough.toISOString() },
    });
  }

  res.json({ lastReadAt });
});

// PUT /api/subscriptions/weekly-brief
// Capture an explicit, account-page opt-in or immediately withdraw it.
router.put('/subscriptions/weekly-brief', authMiddleware, async (req, res) => {
  const subscribed = req.body?.subscribed;

  if (typeof subscribed !== 'boolean') {
    return res.status(400).json({ error: 'A subscription choice is required' });
  }

  const sender = getCaslSenderInfo();
  if (subscribed && (!sender.ready || req.body?.expressConsent !== true)) {
    return res.status(400).json({
      error:
        'You must provide express consent after reviewing the sender information',
    });
  }

  try {
    const user = await User.findById(req.user._id)
      .select(PROFILE_SELECT)
      .populate('customRoles', 'name slug color permissions');

    if (!user) return res.status(404).json({ error: 'User not found' });

    const weeklyBrief = user.emailSubscriptions?.weeklyBrief;
    const currentlySubscribed = weeklyBrief?.subscribed === true;
    const now = new Date();

    if (subscribed && !currentlySubscribed) {
      user.emailSubscriptions.weeklyBrief = {
        subscribed: true,
        consentedAt: now,
        consentSource: 'account_dashboard',
        consentTextVersion: CASL_CONSENT_TEXT_VERSION,
        unsubscribedAt: null,
      };
      await user.save();
      await writeAuditLog({
        req,
        action: 'user.weekly_brief_subscribed',
        actor: user,
        targetType: 'user',
        target: user._id,
        targetSnapshot: getUserSnapshot(user),
        metadata: {
          consentSource: 'account_dashboard',
          consentTextVersion: CASL_CONSENT_TEXT_VERSION,
        },
      });
    } else if (!subscribed && currentlySubscribed) {
      user.emailSubscriptions.weeklyBrief.subscribed = false;
      user.emailSubscriptions.weeklyBrief.unsubscribedAt = now;
      await user.save();
      await writeAuditLog({
        req,
        action: 'user.weekly_brief_unsubscribed',
        actor: user,
        targetType: 'user',
        target: user._id,
        targetSnapshot: getUserSnapshot(user),
        metadata: { source: 'account_dashboard' },
      });
    }

    return res.json(await getProfileResponse(user));
  } catch (error) {
    console.error('Weekly brief subscription update failed:', error);
    return res.status(500).json({ error: 'Could not update email preference' });
  }
});

router.put(
  '/subscriptions/news-announcements',
  authMiddleware,
  async (req, res) => {
    const subscribed = req.body?.subscribed;
    if (typeof subscribed !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'A subscription choice is required' });
    }
    if (
      subscribed &&
      (!getCaslSenderInfo().ready || req.body?.expressConsent !== true)
    ) {
      return res.status(400).json({
        error:
          'You must provide express consent after reviewing the sender information',
      });
    }
    try {
      const user = await User.findById(req.user._id)
        .select(PROFILE_SELECT)
        .populate('customRoles', 'name slug color permissions');
      if (!user) return res.status(404).json({ error: 'User not found' });
      const current =
        user.emailSubscriptions?.newsAnnouncements?.subscribed === true;
      const now = new Date();
      if (subscribed && !current) {
        user.emailSubscriptions.newsAnnouncements = {
          subscribed: true,
          consentedAt: now,
          consentSource: 'account_dashboard',
          consentTextVersion: 'news-announcements-v2-2026-08-17',
          unsubscribedAt: null,
        };
      } else if (!subscribed && current) {
        user.emailSubscriptions.newsAnnouncements.subscribed = false;
        user.emailSubscriptions.newsAnnouncements.unsubscribedAt = now;
      }
      await user.save();
      if (subscribed !== current) {
        await writeAuditLog({
          req,
          action: subscribed
            ? 'user.news_announcements_subscribed'
            : 'user.news_announcements_unsubscribed',
          actor: user,
          targetType: 'user',
          target: user._id,
          targetSnapshot: getUserSnapshot(user),
          metadata: { source: 'account_dashboard' },
        });
      }
      return res.json(await getProfileResponse(user));
    } catch (error) {
      console.error('News announcement subscription update failed:', error);
      return res
        .status(500)
        .json({ error: 'Could not update email preference' });
    }
  },
);

// This opaque-token endpoint is intentionally public: a recipient must be
// able to unsubscribe without signing in. It performs the request immediately
// and keeps the result token out of caches and referrer headers.
async function unsubscribeWeeklyBrief(req, res) {
  const token = String(req.query?.token || '').trim();
  const tokenHash = hashToken(token);

  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });

  if (!token) {
    return res
      .status(400)
      .type('html')
      .send('<p>This unsubscribe link is invalid.</p>');
  }

  try {
    const unsubscribeToken = await EmailUnsubscribeToken.findOne({
      tokenHash,
      subscriptionType: 'weeklyBrief',
      expiresAt: { $gt: new Date() },
    }).select('+tokenHash');

    if (!unsubscribeToken) {
      return res
        .status(404)
        .type('html')
        .send('<p>This unsubscribe link is invalid or has expired.</p>');
    }

    const user = await User.findById(unsubscribeToken.user);
    const subscriptionType = unsubscribeToken.subscriptionType;
    const subscription = user?.emailSubscriptions?.[subscriptionType];
    if (subscription?.subscribed === true) {
      subscription.subscribed = false;
      subscription.unsubscribedAt = new Date();
      await user.save();
      await writeAuditLog({
        req,
        action:
          subscriptionType === 'newsAnnouncements'
            ? 'user.news_announcements_unsubscribed'
            : 'user.weekly_brief_unsubscribed',
        actor: user,
        targetType: 'user',
        target: user._id,
        targetSnapshot: getUserSnapshot(user),
        metadata: { source: 'email_unsubscribe_link', subscriptionType },
      });
    }

    if (!unsubscribeToken.usedAt) {
      unsubscribeToken.usedAt = new Date();
      await unsubscribeToken.save();
    }

    return res
      .type('html')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head><body><main><h1>Unsubscribed</h1><p>You will no longer receive the CMCEN / RCMCE weekly email brief at this address.</p></main></body></html>`,
      );
  } catch (error) {
    console.error('Weekly brief unsubscribe failed:', error);
    return res
      .status(500)
      .type('html')
      .send(
        '<p>We could not complete your unsubscribe request. Please try the link again.</p>',
      );
  }
}

router
  .route('/subscriptions/weekly-brief/unsubscribe')
  .get(unsubscribeWeeklyBrief)
  .post(unsubscribeWeeklyBrief);
router
  .route('/subscriptions/news-announcements/unsubscribe')
  .get(unsubscribeWeeklyBrief)
  .post(unsubscribeWeeklyBrief);

// Exchange the HTTP-only, long-lived refresh cookie for a new short-lived API token.
router.post('/session/refresh', async (req, res) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);

  if (!refreshToken) {
    clearRefreshTokenCookie(req, res);
    return res
      .status(401)
      .json({ error: 'Refresh session is missing or expired' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.tokenType !== 'refresh' || !decoded.userId) {
      throw new Error('Invalid refresh token');
    }

    const user = await User.findById(decoded.userId).select('sessionVersion');

    if (
      !user ||
      Number(decoded.sessionVersion || 0) !== Number(user.sessionVersion || 0)
    ) {
      throw new Error('Refresh session has been revoked');
    }

    setRefreshTokenCookie(req, res, user);
    return res.json({ token: createSessionToken(user) });
  } catch {
    clearRefreshTokenCookie(req, res);
    return res
      .status(401)
      .json({ error: 'Refresh session is missing or expired' });
  }
});

// Signing out revokes refresh sessions and removes the browser cookie.
router.post('/session/logout', async (req, res) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.tokenType === 'refresh' && decoded.userId) {
      await User.findByIdAndUpdate(decoded.userId, {
        $inc: { sessionVersion: 1 },
      });
    }
  } catch {
    // Clearing a missing or expired cookie is still a successful sign-out.
  }

  clearRefreshTokenCookie(req, res);
  return res.status(204).end();
});

// POST /api/ghost/upgrade
// Convert a verified ghost account into a full subscriber account.
router.post('/ghost/upgrade', authMiddleware, async (req, res) => {
  if (req.user.accountType !== 'ghost' || req.user.role !== 'ghost') {
    return res.status(400).json({
      error: 'Only ghost accounts can be upgraded',
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
    passwordConfirmation,
  } = req.body || {};

  if (password !== passwordConfirmation) {
    return res.status(400).json({
      error: 'Passwords do not match',
    });
  }

  const cleanFirstName = String(firstName || '').trim();
  const cleanLastName = String(lastName || '').trim();
  const incomingPreferredLanguage = String(preferredLanguage || '').trim();
  const cleanPreferredLanguage = VALID_PREFERRED_LANGUAGES.has(
    incomingPreferredLanguage,
  )
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
    String(passwordConfirmation || ''),
  ];

  if (requiredFields.some((value) => !value)) {
    return res.status(400).json({
      error: 'Required account fields are missing',
    });
  }

  try {
    const user = await User.findById(req.user._id).select('+password');

    if (!user || user.accountType !== 'ghost') {
      return res.status(404).json({
        error: 'Ghost account not found',
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
      postalCode: String(postalCode || '').trim(),
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
      targetSnapshot: getUserSnapshot(user),
    });

    setRefreshTokenCookie(req, res, user);
    res.json({
      message: 'Account upgraded',
      token: createSessionToken(user),
      user: await getProfileResponse(user),
    });
  } catch (error) {
    console.error('Ghost account upgrade failed:', error);

    res.status(500).json({
      error: 'Could not upgrade account',
    });
  }
});

// DELETE /api/profile
// Delete the current account after a fresh authenticator-app confirmation.
router.delete(
  '/profile',
  authMiddleware,
  requirePermission('canDeleteOwnAccount'),
  async (req, res) => {
    const mfaCode = req.body?.mfaCode;
    const mfaMethod = String(req.body?.mfaMethod || 'totp').trim();

    const mfaVerified =
      mfaMethod === 'webauthn'
        ? hasFreshDestructivePasskeyVerification(req.user)
        : verifyDestructiveTotp(req.user, mfaCode);

    if (!mfaVerified) {
      return res.status(403).json({
        error: 'A recent MFA confirmation is required to delete your account',
      });
    }

    try {
      const userId = req.user._id;
      const snapshot = getUserSnapshot(req.user);

      await Promise.all([
        Event.updateMany({ createdBy: userId }, { $set: { createdBy: null } }),
        RetirementMessage.updateMany(
          { createdBy: userId },
          { $set: { createdBy: null } },
        ),
        RetirementComment.updateMany(
          { author: userId },
          { $set: { author: null } },
        ),
        LastPostMessage.updateMany(
          { createdBy: userId },
          { $set: { createdBy: null } },
        ),
      ]);
      await User.deleteOne({ _id: userId });
      await writeAuditLog({
        req,
        action: 'user.self_deleted',
        actor: req.user,
        targetType: 'user',
        target: userId,
        targetSnapshot: snapshot,
        metadata: { contentDisposition: 'keep_and_anonymize', mfaMethod },
      });

      clearRefreshTokenCookie(req, res);
      return res.json({ message: 'Account deleted' });
    } catch (error) {
      console.error('Self account deletion failed:', error);
      return res.status(500).json({ error: 'Could not delete account' });
    }
  },
);

// PATCH /api/profile
// Update safe, user-owned profile fields for the authenticated account.
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const updates = getProfileUpdate(req.body, req.user);

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        error: 'No editable profile fields were provided',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    )
      .select(PROFILE_SELECT)
      .populate('customRoles', 'name slug color permissions');

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    res.json(await getProfileResponse(user));
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Profile information is invalid',
      });
    }

    if (
      [
        'Required profile fields are missing',
        'Required address fields are missing',
        'Invalid status',
        'Invalid affiliation element',
        'Invalid preferred language',
      ].includes(error.message)
    ) {
      return res.status(400).json({
        error: error.message,
      });
    }

    console.error('Profile update failed:', error);

    res.status(500).json({
      error: 'Could not update profile',
    });
  }
});

// GET /api/contributor-check
// Confirm the current user has contributor-level access or higher.
router.get(
  '/contributor-check',
  authMiddleware,
  requirePermission('canCreateDrafts'),
  (req, res) => {
    res.json({
      message: 'You may submit content',
      role: req.user.role,
    });
  },
);

// GET /api/admin-check
// Confirm the current user has user-management access.
router.get(
  '/admin-check',
  authMiddleware,
  requirePermission('canManageUsers'),
  (req, res) => {
    res.json({
      message: 'Administrator access confirmed',
    });
  },
);

module.exports = router;
