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
  'token', 'list-users', 'list-events', 'list-retirement-messages', 'set-role', 'search', 'promote', 'test-db'
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
      username:     user.username,
      email:        user.email,
      accountName:  user.accountName,
      role:         user.role,
      contentAreas: user.contentAreas?.join(', ') || '',
      createdAt:    user.createdAt ? user.createdAt.toISOString() : 'unknown'
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
    .populate('createdBy',   'username accountName role')
    .populate('updatedBy',   'username accountName role')
    .populate('reviewedBy',  'username accountName role')
    .populate('publishedBy', 'username accountName role')
    .populate('publicationPermission.confirmedBy', 'username accountName role')
    .sort({ createdAt: -1 })
    .lean();

  console.table(
    events.map(event => ({
      id:             event._id.toString(),
      titleEn:        event.title?.en || '',
      titleFr:        event.title?.fr || '',
      city:           event.city || '',
      region:         event.provinceRegion || '',
      entity:         event.organizingEntity || '',
      eventType:      event.eventType || '',
      timezone:       event.timezone || '',
      start:          formatDate(event.startDate),
      end:            formatDate(event.endDate),
      allDay:         event.allDay === true,
      submitterEmail: event.submitter?.email || '',
      permission:     event.publicationPermission?.confirmed === true,
      status:         event.status || '',
      createdBy:      getUsername(event.createdBy),
      lastSubmitted:  formatDate(event.lastSubmittedAt)
    }))
  );

  if (full) {
    console.log('\nFull event records:\n');
    events.forEach((event, index) => {
      console.log(`Event ${index + 1}`);
      console.dir(
        {
          id:                  event._id.toString(),
          title:               event.title,
          description:         event.description,
          location:            event.location,
          registration:        event.registration,
          city:                event.city,
          provinceRegion:      event.provinceRegion,
          organizingEntity:    event.organizingEntity,
          eventType:           event.eventType,
          timezone:            event.timezone,
          startDate:           formatDate(event.startDate),
          endDate:             formatDate(event.endDate),
          allDay:              event.allDay,
          imagePath:           event.imagePath,
          contentArea:         event.contentArea,
          submitter:           event.submitter,
          publicationPermission: {
            confirmed:   event.publicationPermission?.confirmed,
            confirmedAt: formatDate(event.publicationPermission?.confirmedAt),
            confirmedBy: getUsername(event.publicationPermission?.confirmedBy)
          },
          status:              event.status,
          rejectionReason:     event.rejectionReason,
          createdBy:           getUsername(event.createdBy),
          updatedBy:           getUsername(event.updatedBy),
          reviewedBy:          getUsername(event.reviewedBy),
          publishedBy:         getUsername(event.publishedBy),
          reviewedAt:          formatDate(event.reviewedAt),
          publishedAt:         formatDate(event.publishedAt),
          lastSubmittedAt:     formatDate(event.lastSubmittedAt),
          deleteRequested:     event.deleteRequested,
          deleteRequestReason: event.deleteRequestReason,
          createdAt:           formatDate(event.createdAt),
          updatedAt:           formatDate(event.updatedAt)
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
        rank:           message.retiree?.rank || '—',
        firstName:      message.retiree?.firstName || '—',
        lastName:       message.retiree?.lastName || '—',
        tradeRole:      message.retiree?.tradeRole || '—',
        yearsOfService: message.retiree?.yearsOfService || '—',
        retirementDate: formatDate(message.retiree?.retirementDate)
      },
      message:         message.message,
      messageLanguage: message.messageLanguage,
      photoUrl:        message.photoUrl,
      submitter: {
        firstName:    message.submitter?.firstName || '—',
        lastName:     message.submitter?.lastName || '—',
        relationship: message.submitter?.relationship || '—',
        email:        message.submitter?.email || '—',
        unit:         message.submitter?.unit || '—'
      },
      publicationConsent: {
        confirmed:   message.publicationConsent?.confirmed === true,
        confirmedAt: formatDate(message.publicationConsent?.confirmedAt)
      },
      status: message.status,
      review: {
        reviewedBy:      formatUser(message.reviewedBy),
        reviewedAt:      formatDate(message.reviewedAt),
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
      id:         String(message._id).slice(-8),
      retiree:    [
        message.retiree?.rank,
        message.retiree?.firstName,
        message.retiree?.lastName
      ].filter(Boolean).join(' '),
      service:    message.retiree?.yearsOfService || '—',
      retirement: message.retiree?.retirementDate
        ? new Date(message.retiree.retirementDate).toISOString().slice(0, 10)
        : '—',
      language:   message.messageLanguage,
      status:     message.status,
      submitter:  [
        message.submitter?.firstName,
        message.submitter?.lastName
      ].filter(Boolean).join(' '),
      message:    truncate(message.message),
      submitted:  message.createdAt
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
    username:     user.username,
    email:        user.email,
    accountName:  user.accountName,
    role:         user.role,
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
  set-role <username> <role> [areas]      Set role directly in DB
                                            areas: comma-separated content areas (author only)
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
  const flags    = new Set(raw.filter(a => a.startsWith('--')));
  const positional = raw.filter(a => !a.startsWith('--'));
  const [command, arg1, arg2, arg3] = positional;

  if (!command) {
    printHelp();
    return;
  }

  const needsDb    = DB_COMMANDS.has(command);
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

      case 'set-role':
        if (!arg1 || !arg2) throw new Error('Usage: node admin.js set-role <username> <role> [contentAreas]');
        await cmdSetRole(arg1, arg2, arg3);
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
