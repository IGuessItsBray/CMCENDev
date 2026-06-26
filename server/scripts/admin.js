require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// Commands that require a live DB connection
const DB_COMMANDS = new Set([
  'token',
  'list-users',
  'list-events',
  'list-retirement-messages',
  'mfa-status',
  'reset-mfa',
  'set-role',
  'update-user',
  'fill-empty-users',
  'search',
  'promote',
  'test-db'
]);

// Commands that require an admin JWT (implies DB_COMMANDS too)
const API_COMMANDS = new Set(['search', 'promote']);

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'invalid date' : date.toISOString();
}

function getUsername(user) {
  return user?.accountName || user?.username || '';
}

function formatUser(user) {
  if (!user) return '—';
  if (typeof user === 'string') return user;
  return user.accountName || user.username || user.email || String(user._id || '—');
}

function truncate(value, maxLength = 70) {
  const text = typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';

  if (text.length <= maxLength) {
    return text || '—';
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

async function buildAdminToken() {
  const User = require('../models/User');
  const adminUser = await User.findOne({ username: process.env.ADMIN_USER });
  if (!adminUser) throw new Error(`Admin user '${process.env.ADMIN_USER}' not found`);
  return jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

/// for updating user
const USER_FIELD_ALIASES = {
  addressLine1: 'address.line1',
  addressLine2: 'address.line2',
  city: 'address.city',
  country: 'address.country',
  stateProvince: 'address.stateProvince',
  postalCode: 'address.postalCode'
};

const BLOCKED_USER_FIELDS = [
  '_id',
  '__v',
  'password',
  'role',
  'contentAreas',
  'webauthn',
  'webauthnRegistrationChallenge',
  'webauthnAuthenticationChallenge',
  'totp',
  'createdAt',
  'updatedAt'
];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function flattenObject(value, prefix = '', result = {}) {
  for (const [key, childValue] of Object.entries(value)) {
    const pathName = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(childValue)) {
      flattenObject(childValue, pathName, result);
    } else {
      result[pathName] = childValue;
    }
  }

  return result;
}

function normalizeUserUpdates(value) {
  const flattened = flattenObject(value);
  const normalized = {};

  for (const [field, fieldValue] of Object.entries(flattened)) {
    const normalizedField = USER_FIELD_ALIASES[field] || field;
    normalized[normalizedField] = fieldValue;
  }

  return normalized;
}

function parseJsonArgument(value, commandName) {
  let parsed;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${commandName} requires valid JSON. Remember to wrap it in single quotes.`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${commandName} JSON must contain an object`);
  }

  return parsed;
}

function isBlockedUserField(field) {
  return BLOCKED_USER_FIELDS.some(blockedField => (
    field === blockedField ||
    field.startsWith(`${blockedField}.`)
  ));
}

function validateUserUpdateFields(User, updates) {
  const fields = Object.keys(updates);

  if (!fields.length) {
    throw new Error('No fields were supplied');
  }

  for (const field of fields) {
    if (isBlockedUserField(field)) {
      throw new Error(
        `Field "${field}" cannot be changed with this command`
      );
    }

    if (!User.schema.path(field)) {
      throw new Error(
        `Unknown user field "${field}"`
      );
    }
  }
}

function buildUserIdentifierQuery(identifier) {
  const conditions = [
    { username: identifier },
    { email: identifier.toLowerCase() }
  ];

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    conditions.push({ _id: identifier });
  }

  return { $or: conditions };
}

function isEmptyUserField(value) {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function formatUpdateValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function summarizeMfa(user) {
  const passkeys = Array.isArray(user.webauthn)
    ? user.webauthn.filter(credential => credential?.credentialID && credential?.publicKey)
    : [];

  return {
    username: user.username,
    email: user.email,
    accountName: user.accountName,
    passkeys: passkeys.length,
    passkeyNames: passkeys
      .map((credential, index) => credential.nickname || `Passkey ${index + 1}`)
      .join(', '),
    totpEnabled: user.totp?.enabled === true,
    totpSecretPresent: Boolean(user.totp?.secret),
    totpPending: Boolean(user.totp?.secret) && user.totp?.enabled !== true,
    tempTokenPresent: Boolean(user.twoFactor?.tempToken),
    tempExpires: formatDate(user.twoFactor?.tempExpires)
  };
}

async function findUserByIdentifier(User, identifier) {
  const user = await User.findOne(buildUserIdentifierQuery(identifier));

  if (!user) {
    throw new Error(`User "${identifier}" was not found`);
  }

  return user;
}

// ─────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────

/** Generate and print an admin token */
async function cmdToken() {
  const token = await buildAdminToken();
  console.log('--- GENERATED ADMIN TOKEN ---');
  console.log(token);
}

/** List all users in a table */
async function cmdListUsers() {
  const User = require('../models/User');

  const users = await User.find()
    .select('username email accountName role contentAreas createdAt')
    .sort({ createdAt: -1 })
    .lean();

  console.table(
    users.map(user => ({
      username: user.username,
      email: user.email,
      accountName: user.accountName,
      role: user.role,
      contentAreas: user.contentAreas?.join(', ') || '',
      createdAt: user.createdAt ? user.createdAt.toISOString() : 'unknown'
    }))
  );
  console.log(`\nTotal users: ${users.length}`);
}

/** List all events. Pass --full for expanded output. */
async function cmdListEvents(full) {
  const Event = require('../models/Event');
  require('../models/User'); // ensure User is registered for populate

  const populateUser = (field) =>
    Event.populate.bind(Event)(field, 'username accountName role');

  const events = await Event.find()
    .populate('createdBy', 'username accountName role')
    .populate('updatedBy', 'username accountName role')
    .populate('reviewedBy', 'username accountName role')
    .populate('publishedBy', 'username accountName role')
    .populate('publicationPermission.confirmedBy', 'username accountName role')
    .sort({ createdAt: -1 })
    .lean();

  console.table(
    events.map(event => ({
      id: event._id.toString(),
      titleEn: event.title?.en || '',
      titleFr: event.title?.fr || '',
      city: event.city || '',
      region: event.provinceRegion || '',
      entity: event.organizingEntity || '',
      eventType: event.eventType || '',
      timezone: event.timezone || '',
      start: formatDate(event.startDate),
      end: formatDate(event.endDate),
      allDay: event.allDay === true,
      submitterEmail: event.submitter?.email || '',
      permission: event.publicationPermission?.confirmed === true,
      status: event.status || '',
      createdBy: getUsername(event.createdBy),
      lastSubmitted: formatDate(event.lastSubmittedAt)
    }))
  );

  if (full) {
    console.log('\nFull event records:\n');
    events.forEach((event, index) => {
      console.log(`Event ${index + 1}`);
      console.dir(
        {
          id: event._id.toString(),
          title: event.title,
          description: event.description,
          location: event.location,
          registration: event.registration,
          city: event.city,
          provinceRegion: event.provinceRegion,
          organizingEntity: event.organizingEntity,
          eventType: event.eventType,
          timezone: event.timezone,
          startDate: formatDate(event.startDate),
          endDate: formatDate(event.endDate),
          allDay: event.allDay,
          imagePath: event.imagePath,
          contentArea: event.contentArea,
          submitter: event.submitter,
          publicationPermission: {
            confirmed: event.publicationPermission?.confirmed,
            confirmedAt: formatDate(event.publicationPermission?.confirmedAt),
            confirmedBy: getUsername(event.publicationPermission?.confirmedBy)
          },
          status: event.status,
          rejectionReason: event.rejectionReason,
          createdBy: getUsername(event.createdBy),
          updatedBy: getUsername(event.updatedBy),
          reviewedBy: getUsername(event.reviewedBy),
          publishedBy: getUsername(event.publishedBy),
          reviewedAt: formatDate(event.reviewedAt),
          publishedAt: formatDate(event.publishedAt),
          lastSubmittedAt: formatDate(event.lastSubmittedAt),
          deleteRequested: event.deleteRequested,
          deleteRequestReason: event.deleteRequestReason,
          createdAt: formatDate(event.createdAt),
          updatedAt: formatDate(event.updatedAt)
        },
        { depth: null, colors: true }
      );
      console.log('');
    });
  }

  console.log(`Total events: ${events.length}`);
}

function printFullRetirementMessage(message, index) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`RETIREMENT MESSAGE ${index + 1}`);
  console.log(`${'='.repeat(72)}`);

  console.dir(
    {
      id: String(message._id),
      retiree: {
        rank: message.retiree?.rank || '—',
        firstName: message.retiree?.firstName || '—',
        lastName: message.retiree?.lastName || '—',
        postNominals: message.retiree?.postNominals || '—',
        tradeRole: message.retiree?.tradeRole || '—',
        retirementDate: formatDate(message.retiree?.retirementDate)
      },
      message: message.message,
      messageLanguage: message.messageLanguage,
      photoUrl: message.photoUrl,
      submitter: {
        firstName: message.submitter?.firstName || '—',
        lastName: message.submitter?.lastName || '—',
        relationship: message.submitter?.relationship || '—',
        email: message.submitter?.email || '—',
        unit: message.submitter?.unit || '—'
      },
      publicationConsent: {
        confirmed: message.publicationConsent?.confirmed === true,
        confirmedAt: formatDate(message.publicationConsent?.confirmedAt)
      },
      memberReviewConfirmation: {
        confirmed: message.memberReviewConfirmation?.confirmed === true,
        confirmedAt: formatDate(message.memberReviewConfirmation?.confirmedAt)
      },
      status: message.status,
      review: {
        reviewedBy: formatUser(message.reviewedBy),
        reviewedAt: formatDate(message.reviewedAt),
        rejectionReason: message.rejectionReason || '—'
      },
      publication: {
        publishedBy: formatUser(message.publishedBy),
        publishedAt: formatDate(message.publishedAt)
      },
      createdAt: formatDate(message.createdAt),
      updatedAt: formatDate(message.updatedAt)
    },
    { depth: null, colors: true }
  );
}

/** List all retirement messages. Pass --full for expanded output. */
async function cmdListRetirementMessages(full) {
  const RetirementMessage = require('../models/RetirementMessage');
  require('../models/User'); // ensure User is registered for populate

  const messages = await RetirementMessage.find()
    .populate('reviewedBy', 'username accountName email role')
    .populate('publishedBy', 'username accountName email role')
    .sort({ createdAt: -1 })
    .lean();

  if (!messages.length) {
    console.log('No retirement messages found.');
    return;
  }

  console.table(
    messages.map(message => ({
      id: String(message._id).slice(-8),
      retiree: [
        message.retiree?.rank,
        message.retiree?.firstName,
        message.retiree?.lastName
      ].filter(Boolean).join(' ') +
        (message.retiree?.postNominals
          ? `, ${message.retiree.postNominals}`
          : ''),
      postNominals: message.retiree?.postNominals || '—',
      retirement: message.retiree?.retirementDate
        ? new Date(message.retiree.retirementDate).toISOString().slice(0, 10)
        : '—',
      language: message.messageLanguage,
      status: message.status,
      submitter: [
        message.submitter?.firstName,
        message.submitter?.lastName
      ].filter(Boolean).join(' '),
      message: truncate(message.message),
      submitted: message.createdAt
        ? new Date(message.createdAt).toISOString().slice(0, 10)
        : '—'
    }))
  );

  console.log(`\nTotal: ${messages.length}`);

  if (full) {
    messages.forEach(printFullRetirementMessage);
  } else {
    console.log('\nRun with --full to view complete records.');
  }
}

/**
 * Update fields on one user.
 *
 * Example:
 * node scripts/admin.js update-user someone@example.com \
 *   '{"rank":"Cpl","address":{"city":"Québec City"}}'
 */
async function cmdUpdateUser(identifier, updateJson) {
  const User = require('../models/User');

  const suppliedUpdates = parseJsonArgument(
    updateJson,
    'update-user'
  );

  const updates = normalizeUserUpdates(suppliedUpdates);

  validateUserUpdateFields(User, updates);

  const existingUser = await User.findOne(
    buildUserIdentifierQuery(identifier)
  );

  if (!existingUser) {
    throw new Error(`User "${identifier}" was not found`);
  }

  const previousValues = {};

  for (const field of Object.keys(updates)) {
    previousValues[field] = existingUser.get(field);
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: existingUser._id },
    { $set: updates },
    {
      new: true,
      runValidators: true,
      context: 'query'
    }
  );

  console.log(`Updated user: ${updatedUser.username}\n`);

  console.table(
    Object.entries(updates).map(([field, newValue]) => ({
      field,
      previous: formatUpdateValue(previousValues[field]),
      updated: formatUpdateValue(newValue)
    }))
  );
}

async function cmdMfaStatus(identifier) {
  const User = require('../models/User');
  const user = await findUserByIdentifier(User, identifier);

  console.table([summarizeMfa(user)]);
}

async function cmdResetMfa(identifier, flags) {
  const User = require('../models/User');
  const user = await findUserByIdentifier(User, identifier);

  const resetPasskeys = flags.has('--passkeys') || (!flags.has('--passkeys') && !flags.has('--totp'));
  const resetTotp = flags.has('--totp') || (!flags.has('--passkeys') && !flags.has('--totp'));

  const updates = {
    'webauthnRegistrationChallenge': '',
    'webauthnAuthenticationChallenge': '',
    'twoFactor.tempToken': '',
    'twoFactor.tempExpires': null
  };

  if (resetPasskeys) {
    updates.webauthn = [];
  }

  if (resetTotp) {
    updates['totp.secret'] = '';
    updates['totp.enabled'] = false;
  }

  console.log('Before reset:');
  console.table([summarizeMfa(user)]);

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    { $set: updates },
    { new: true }
  );

  console.log('\nAfter reset:');
  console.table([summarizeMfa(updatedUser)]);
  console.log('\nMFA reset complete. The user can sign in with their password and set MFA up again.');
}

/**
 * Fill blank or missing fields across all users.
 *
 * Dry run:
 * node scripts/admin.js fill-empty-users \
 *   '{"country":"Canada","stateProvince":"Quebec"}'
 *
 * Apply:
 * node scripts/admin.js fill-empty-users \
 *   '{"country":"Canada","stateProvince":"Quebec"}' --apply
 */
async function cmdFillEmptyUsers(updateJson, applyChanges) {
  const User = require('../models/User');

  const suppliedUpdates = parseJsonArgument(
    updateJson,
    'fill-empty-users'
  );

  const defaults = normalizeUserUpdates(suppliedUpdates);

  validateUserUpdateFields(User, defaults);

  for (const [field, value] of Object.entries(defaults)) {
    if (isEmptyUserField(value)) {
      throw new Error(
        `The backfill value for "${field}" cannot itself be empty`
      );
    }
  }

  const users = await User.find().sort({ createdAt: 1 });
  const pendingUpdates = [];

  for (const user of users) {
    const updates = {};

    for (const [field, defaultValue] of Object.entries(defaults)) {
      const currentValue = user.get(field);

      if (isEmptyUserField(currentValue)) {
        updates[field] = defaultValue;
      }
    }

    if (Object.keys(updates).length) {
      pendingUpdates.push({
        user,
        updates
      });
    }
  }

  if (!pendingUpdates.length) {
    console.log('No blank fields matched. Nothing to update.');
    return;
  }

  console.table(
    pendingUpdates.map(({ user, updates }) => ({
      username: user.username,
      email: user.email,
      fields: Object.keys(updates).join(', '),
      values: Object.entries(updates)
        .map(([field, value]) => `${field}=${formatUpdateValue(value)}`)
        .join(', ')
    }))
  );

  console.log(
    `\nUsers requiring updates: ${pendingUpdates.length}`
  );

  if (!applyChanges) {
    console.log(
      '\nDry run only. Run the command again with --apply to save these changes.'
    );
    return;
  }

  let updatedCount = 0;
  const failures = [];

  for (const { user, updates } of pendingUpdates) {
    try {
      await User.updateOne(
        { _id: user._id },
        { $set: updates },
        {
          runValidators: true,
          context: 'query'
        }
      );

      updatedCount += 1;
    } catch (error) {
      failures.push({
        username: user.username,
        error: error.message
      });
    }
  }

  console.log(`\nUpdated users: ${updatedCount}`);

  if (failures.length) {
    console.log(`Failed updates: ${failures.length}`);
    console.table(failures);
    process.exitCode = 1;
  }
}

/** Set a user's role (and optionally content areas) directly via DB */
async function cmdSetRole(username, role, contentAreasArg) {
  const { USER_ROLES } = require('../config/roles');
  const User = require('../models/User');

  if (!USER_ROLES.includes(role)) {
    throw new Error(`Invalid role. Choose from: ${USER_ROLES.join(', ')}`);
  }

  const contentAreas = contentAreasArg
    ? contentAreasArg.split(',').map(a => a.trim()).filter(Boolean)
    : [];

  const user = await User.findOneAndUpdate(
    { username },
    { $set: { role, contentAreas: role === 'author' ? contentAreas : [] } },
    { new: true, runValidators: true }
  ).select('username email accountName role contentAreas');

  if (!user) throw new Error(`User "${username}" was not found`);

  console.table([{
    username: user.username,
    email: user.email,
    accountName: user.accountName,
    role: user.role,
    contentAreas: user.contentAreas.join(', ')
  }]);
}

/** Search users via the admin API */
async function cmdSearch(query, token) {
  const response = await fetch(
    `${BASE_URL}/admin/users?query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  const data = await response.json();
  console.log('Search Results:', data);
}

/** Promote / change a user's role via the admin API */
async function cmdPromote(userId, newRole, token) {
  const response = await fetch(
    `${BASE_URL}/admin/users/${userId}/role`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    }
  );
  const data = await response.json();
  if (response.ok) {
    console.log('Success:', data.message);
  } else {
    console.error('Error:', data.error);
  }
}

/** Verify the DB connection and list collections */
async function cmdTestDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('SUCCESS: Database connection established!');
  console.log('Collections:', collections.map(c => c.name));
}

/** Exercise the register + login flow against the running server */
async function cmdTestAuth() {
  const testEmail = `test_${Date.now()}@example.com`;

  console.log('--- Registering User ---');
  const regRes = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Demo',
      lastName: 'Account',
      addressLine1: '1 Test Way',
      addressLine2: '',
      city: 'Ottawa',
      country: 'Canada',
      stateProvince: 'Ontario',
      postalCode: 'K1A 0K2',
      rank: '',
      postNominals: '',
      company: 'CMCEN',
      status: 'civilian',
      affiliationElement: 'other',
      trade: '',
      tradeOther: '',
      currentUnit: '',
      email: testEmail,
      password: 'password123',
      passwordConfirmation: 'password123'
    })
  });

  if (regRes.status !== 201) {
    console.log('Registration failed');
    return;
  }
  console.log('Registration Success!');

  console.log('\n--- Logging In ---');
  const loginRes = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testEmail, password: 'password123' })
  });
  const loginData = await loginRes.json();

  if (loginRes.status === 200) {
    console.log('Login Success! Token:', loginData.token.substring(0, 20) + '...');
  } else {
    console.log('Login Failed:', loginData.error);
  }
}

/** Exercise the full register → login → upload image flow */
async function cmdTestUpload() {
  const testEmail = `test_${Date.now()}@example.com`;
  const TEST_IMAGE_PATH = path.join(__dirname, '..', '..', 'canada.png');

  console.log('--- 1. Registering User ---');
  const regRes = await axios.post(`${BASE_URL}/register`, {
    firstName: 'Demo',
    lastName: 'Account',
    addressLine1: '1 Test Way',
    addressLine2: '',
    city: 'Ottawa',
    country: 'Canada',
    stateProvince: 'Ontario',
    postalCode: 'K1A 0K2',
    rank: '',
    postNominals: '',
    company: 'CMCEN',
    status: 'civilian',
    affiliationElement: 'other',
    trade: '',
    tradeOther: '',
    currentUnit: '',
    email: testEmail,
    password: 'password123',
    passwordConfirmation: 'password123'
  });
  if (regRes.status !== 201) throw new Error('Registration failed');
  console.log('Registration Success!');

  console.log('\n--- 2. Logging In ---');
  const loginRes = await axios.post(`${BASE_URL}/login`, {
    username: testEmail,
    password: 'password123'
  });
  const token = loginRes.data.token;
  if (!token) throw new Error('Login failed: No token received');
  console.log('Login Success!');

  console.log('\n--- 3. Uploading Image ---');
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    throw new Error(`Test image not found at: ${TEST_IMAGE_PATH}`);
  }
  const form = new FormData();
  form.append('image', fs.createReadStream(TEST_IMAGE_PATH));

  const uploadRes = await axios.post(`${BASE_URL}/upload`, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }
  });

  if (uploadRes.status === 201) {
    console.log('Upload Success!');
    console.log('File Key:', uploadRes.data.key);
    console.log('Public URL: https://cdn.corebot.ca/cmcen-demo/' + uploadRes.data.key);
  } else {
    console.error('Upload Failed:', uploadRes.data);
  }
}

// ─────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────

function printHelp() {
  console.log(`
Usage: node admin.js <command> [args] [flags]

User management
  list-users                              List all users
  search <query>                          Search users via admin API
  mfa-status <user>                       Show passkey/TOTP status by username,
                                            email, or MongoDB ID
  reset-mfa <user>                        Clear all MFA for a locked-out user
  reset-mfa <user> --passkeys             Clear passkeys only
  reset-mfa <user> --totp                 Clear TOTP only
  set-role <username> <role> [areas]      Set role directly in DB
  update-user <user> '<json>'             Update one user by username,
                                            email, or MongoDB ID
  fill-empty-users '<json>'               Preview filling blank fields
  fill-empty-users '<json>' --apply       Apply blank-field updates
  promote <userId> <role>                 Change a user's role via admin API

Events
  list-events [--full]                    List all events; --full shows every field
  list-retirement-messages [--full]       List retirement messages; --full shows every field

Auth / tokens
  token                                   Generate and print a 24 h admin JWT

Diagnostics
  test-db                                 Verify DB connection and list collections
  test-auth                               Exercise register + login against the server
  test-upload                             Exercise register → login → image upload
`);
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

async function run() {
  // Separate flags from positional args
  const raw = process.argv.slice(2);
  const flags = new Set(raw.filter(a => a.startsWith('--')));
  const positional = raw.filter(a => !a.startsWith('--'));
  const [command, arg1, arg2, arg3] = positional;

  if (!command) {
    printHelp();
    return;
  }

  const needsDb = DB_COMMANDS.has(command);
  const needsToken = API_COMMANDS.has(command);

  try {
    if (needsDb) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    const token = needsToken ? await buildAdminToken() : null;

    switch (command) {
      case 'token':
        await cmdToken();
        break;

      case 'list-users':
        await cmdListUsers();
        break;

      case 'list-events':
        await cmdListEvents(flags.has('--full'));
        break;

      case 'list-retirement-messages':
        await cmdListRetirementMessages(flags.has('--full'));
        break;

      case 'mfa-status':
        if (!arg1) throw new Error('Usage: node admin.js mfa-status <username-or-email-or-id>');
        await cmdMfaStatus(arg1);
        break;

      case 'reset-mfa':
        if (!arg1) throw new Error('Usage: node admin.js reset-mfa <username-or-email-or-id> [--passkeys|--totp]');
        await cmdResetMfa(arg1, flags);
        break;

      case 'set-role':
        if (!arg1 || !arg2) throw new Error('Usage: node admin.js set-role <username> <role> [contentAreas]');
        await cmdSetRole(arg1, arg2, arg3);
        break;

      case 'update-user':
        if (!arg1 || !arg2) {
          throw new Error(
            'Usage: node admin.js update-user <username-or-email> \'<json>\''
          );
        }

        await cmdUpdateUser(arg1, arg2);
        break;

      case 'fill-empty-users':
        if (!arg1) {
          throw new Error(
            'Usage: node admin.js fill-empty-users \'<json>\' [--apply]'
          );
        }

        await cmdFillEmptyUsers(
          arg1,
          flags.has('--apply')
        );
        break;

      case 'search':
        if (!arg1) throw new Error('Usage: node admin.js search <query>');
        await cmdSearch(arg1, token);
        break;

      case 'promote':
        if (!arg1 || !arg2) throw new Error('Usage: node admin.js promote <userId> <role>');
        await cmdPromote(arg1, arg2, token);
        break;

      case 'test-db':
        await cmdTestDb();
        break;

      case 'test-auth':
        await cmdTestAuth();
        break;

      case 'test-upload':
        await cmdTestUpload();
        break;

      default:
        console.error(`Unknown command: "${command}"\n`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (needsDb) {
      await mongoose.disconnect();
    }
  }
}

run();
