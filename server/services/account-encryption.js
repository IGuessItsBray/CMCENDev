const AccountDeletionLedger = require('../models/AccountDeletionLedger');

const PROFILE_FIELDS = [
  'accountName', 'firstName', 'lastName', 'address', 'rank', 'postNominals',
  'company', 'status', 'affiliationElement', 'trade', 'tradeOther',
  'currentUnit', 'phone', 'preferredLanguage',
];

const RETAINED_CONTENT_FIELDS = Object.freeze({
  news: ['title', 'content'],
  retirement: ['retiree', 'message', 'messages'],
  lastPost: ['title', 'deceased', 'messages'],
  page: ['title', 'summary', 'blocks'],
});

function isTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function config() {
  return {
    enabled: isTrue(process.env.ACCOUNT_ENCRYPTION_ENABLED || 'true'),
    endpoint: String(process.env.OPENBAO_TRANSIT_ENDPOINT || '').trim().replace(/\/+$/u, ''),
    token: String(process.env.OPENBAO_TRANSIT_TOKEN || '').trim(),
    mount: String(process.env.OPENBAO_TRANSIT_MOUNT || 'transit').trim().replace(/^\/+|\/+$/gu, ''),
    retentionKey: String(process.env.OPENBAO_RETENTION_KEY || 'cmcen-retained-content').trim(),
  };
}

function getAvailability() {
  const settings = config();
  return { enabled: settings.enabled && Boolean(settings.endpoint && settings.token), configured: Boolean(settings.endpoint && settings.token), provider: 'openbao' };
}

function keyName(accountId) {
  return `cmcen-account-${String(accountId)}`;
}

async function transit(settings, path, options = {}) {
  const response = await fetch(`${settings.endpoint}/v1/${path}`, {
    ...options,
    headers: { 'X-Vault-Token': settings.token, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`OpenBao Transit request failed (${response.status})`);
  return response.status === 204 ? {} : response.json();
}

function profilePayload(user) {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, user[field]]));
}

function isEncryptionIneligible(user) {
  return user?.accountType === 'ghost' || user?.role === 'ghost';
}

function applyProfile(user, payload) {
  PROFILE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload || {}, field)) {
      if (user._doc) user._doc[field] = payload[field];
      else user[field] = payload[field];
    }
  });
}

async function encryptProfile(user) {
  if (user.encryption?.enabled !== true || !user.encryption.keyName) return;
  if (isEncryptionIneligible(user)) {
    throw new Error('Ghost accounts cannot use account encryption');
  }
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const plaintext = Buffer.from(JSON.stringify(profilePayload(user))).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(user.encryption.keyName)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  user.encryptedProfile = result.data?.ciphertext || '';
  if (!user.encryptedProfile) throw new Error('OpenBao Transit did not return encrypted profile data');
  PROFILE_FIELDS.forEach((field) => user.set(field, field === 'address' ? {} : ''));
  user.encryption.dataEncryptedAt = new Date();
}

async function encryptAccountValue(user, value) {
  if (user.encryption?.enabled !== true || !user.encryption.keyName) return '';
  if (isEncryptionIneligible(user)) throw new Error('Ghost accounts cannot use account encryption');
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const plaintext = Buffer.from(String(value || '')).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(user.encryption.keyName)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  const ciphertext = result.data?.ciphertext || '';
  if (!ciphertext) throw new Error('OpenBao Transit did not return encrypted account data');
  return ciphertext;
}

async function decryptAccountValue(user, ciphertext) {
  if (!ciphertext) return '';
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const result = await transit(settings, `${settings.mount}/decrypt/${encodeURIComponent(user.encryption.keyName)}`, {
    method: 'POST', body: JSON.stringify({ ciphertext }),
  });
  const plaintext = result.data?.plaintext;
  if (!plaintext) throw new Error('OpenBao Transit did not return decrypted account data');
  return Buffer.from(plaintext, 'base64').toString('utf8');
}

async function ensureRetentionKey(settings) {
  if (!settings.retentionKey) throw new Error('OpenBao retention key is not configured');
  const path = `${settings.mount}/keys/${encodeURIComponent(settings.retentionKey)}`;
  await transit(settings, path, { method: 'POST', body: '{}' });
  await transit(settings, `${path}/config`, {
    method: 'POST',
    body: JSON.stringify({ deletion_allowed: false, exportable: false }),
  });
}

async function encryptRetainedData(user, payload) {
  if (user?.encryption?.enabled !== true || !user.encryption?.dataEncryptedAt) return '';
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  await ensureRetentionKey(settings);
  const plaintext = Buffer.from(JSON.stringify(payload)).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  const ciphertext = result.data?.ciphertext || '';
  if (!ciphertext) throw new Error('OpenBao Transit did not return encrypted retained data');
  return ciphertext;
}

async function decryptRetainedData(ciphertext) {
  if (!ciphertext) return null;
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const result = await transit(settings, `${settings.mount}/decrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ ciphertext }),
  });
  const plaintext = result.data?.plaintext;
  if (!plaintext) throw new Error('OpenBao Transit did not return decrypted retained data');
  return JSON.parse(Buffer.from(plaintext, 'base64').toString('utf8'));
}

function isRetainedContentEnabled(user) {
  return user?.encryption?.enabled === true && Boolean(user.encryption?.dataEncryptedAt);
}

function enableRetainedContent(document, user) {
  if (!isRetainedContentEnabled(user)) return document;
  document.retentionEncryption = {
    enabled: true,
    provider: 'openbao',
    keyName: config().retentionKey,
    encryptedAt: document.retentionEncryption?.encryptedAt || null,
  };
  return document;
}

function retainedContentDefault(field) {
  if (field === 'message') return '';
  if (field === 'blocks') return [];
  return {};
}

async function encryptRetainedContent(document, kind) {
  const fields = RETAINED_CONTENT_FIELDS[kind] || [];
  if (document?.retentionEncryption?.enabled !== true || !fields.length) return document;
  if (document.encryptedContent && !fields.some((field) => document.isModified(field))) return document;
  const payload = Object.fromEntries(fields.map((field) => [field, document.get(field)]));
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  await ensureRetentionKey(settings);
  const plaintext = Buffer.from(JSON.stringify(payload)).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  document.encryptedContent = result.data?.ciphertext || '';
  if (!document.encryptedContent) throw new Error('OpenBao Transit did not return encrypted content');
  fields.forEach((field) => document.set(field, retainedContentDefault(field)));
  document.retentionEncryption.encryptedAt = new Date();
  return document;
}

async function hydrateRetainedContent(document) {
  if (!document?.retentionEncryption?.enabled || !document.encryptedContent) return document;
  const payload = await decryptRetainedData(document.encryptedContent);
  Object.entries(payload || {}).forEach(([field, value]) => {
    if (document._doc) document._doc[field] = value;
    else document[field] = value;
  });
  if (document._doc) {
    document.$locals = document.$locals || {};
    document.$locals.encryptedContent = document.encryptedContent;
    delete document._doc.encryptedContent;
  } else {
    delete document.encryptedContent;
  }
  return document;
}

function addRetainedContentEncryption(schema, kind) {
  schema.add({
    retentionEncryption: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, default: '' },
      keyName: { type: String, default: '' },
      encryptedAt: { type: Date, default: null },
    },
    encryptedContent: { type: String, select: false, default: '' },
  });
  schema.pre('save', async function () {
    await encryptRetainedContent(this, kind);
  });
  schema.pre(/^find/, function () {
    this.select('+encryptedContent');
  });
  schema.post(/^find/, async function (result) {
    const documents = Array.isArray(result) ? result : [result];
    await Promise.all(documents.filter(Boolean).map(hydrateRetainedContent));
  });
}

function enableRetainedIdentity(document, user) {
  if (!isRetainedContentEnabled(user)) return document;
  document.identityEncryption = {
    enabled: true,
    provider: 'openbao',
    keyName: config().retentionKey,
    encryptedAt: document.identityEncryption?.encryptedAt || null,
  };
  return document;
}

async function encryptRetainedIdentity(document, fields) {
  if (document?.identityEncryption?.enabled !== true || !fields.length) return document;
  if (document.encryptedIdentity && !fields.some((field) => document.isModified(field))) return document;
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  await ensureRetentionKey(settings);
  const payload = Object.fromEntries(fields.map((field) => [field, document.get(field)]));
  const plaintext = Buffer.from(JSON.stringify(payload)).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  document.encryptedIdentity = result.data?.ciphertext || '';
  if (!document.encryptedIdentity) throw new Error('OpenBao Transit did not return encrypted identity data');
  fields.forEach((field) => document.set(field, field === 'familyMembers' ? [] : {}));
  document.identityEncryption.encryptedAt = new Date();
  return document;
}

async function hydrateRetainedIdentity(document) {
  if (!document?.identityEncryption?.enabled || !document.encryptedIdentity) return document;
  const payload = await decryptRetainedData(document.encryptedIdentity);
  Object.entries(payload || {}).forEach(([field, value]) => {
    if (document._doc) document._doc[field] = value;
    else document[field] = value;
  });
  if (document._doc) {
    document.$locals = document.$locals || {};
    document.$locals.encryptedIdentity = document.encryptedIdentity;
    delete document._doc.encryptedIdentity;
  } else {
    delete document.encryptedIdentity;
  }
  return document;
}

function addRetainedIdentityEncryption(schema, fields) {
  schema.add({
    identityEncryption: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, default: '' },
      keyName: { type: String, default: '' },
      encryptedAt: { type: Date, default: null },
    },
    encryptedIdentity: { type: String, select: false, default: '' },
  });
  schema.pre('save', async function () {
    await encryptRetainedIdentity(this, fields);
  });
  schema.pre(/^find/, function () {
    this.select('+encryptedIdentity');
  });
  schema.post(/^find/, async function (result) {
    const documents = Array.isArray(result) ? result : [result];
    await Promise.all(documents.filter(Boolean).map(hydrateRetainedIdentity));
  });
}

async function encryptRetainedBytes(user, bytes) {
  if (user?.encryption?.enabled !== true || !user.encryption?.dataEncryptedAt) return '';
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  await ensureRetentionKey(settings);
  const plaintext = Buffer.from(bytes).toString('base64');
  const result = await transit(settings, `${settings.mount}/encrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ plaintext }),
  });
  const ciphertext = result.data?.ciphertext || '';
  if (!ciphertext) throw new Error('OpenBao Transit did not return encrypted media data');
  return ciphertext;
}

async function decryptRetainedBytes(ciphertext) {
  if (!ciphertext) return Buffer.alloc(0);
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const result = await transit(settings, `${settings.mount}/decrypt/${encodeURIComponent(settings.retentionKey)}`, {
    method: 'POST', body: JSON.stringify({ ciphertext }),
  });
  const plaintext = result.data?.plaintext;
  if (!plaintext) throw new Error('OpenBao Transit did not return decrypted media data');
  return Buffer.from(plaintext, 'base64');
}

function getRsvpContact(rsvp) {
  return Object.fromEntries([
    'rank', 'firstName', 'lastName', 'unitOrStatus', 'email', 'phone',
  ].map((field) => [field, rsvp[field] || '']));
}

function applyRsvpContact(rsvp, contact = {}) {
  Object.entries(getRsvpContact({})).forEach(([field]) => {
    rsvp[field] = contact[field] || '';
  });
}

async function encryptRsvpContact(rsvp, user) {
  const ciphertext = await encryptRetainedData(user, getRsvpContact(rsvp));
  if (!ciphertext) return rsvp;
  rsvp.encryptedContact = ciphertext;
  applyRsvpContact(rsvp);
  return rsvp;
}

async function hydrateRsvpContact(rsvp) {
  if (!rsvp?.encryptedContact) return rsvp;
  const contact = await decryptRetainedData(rsvp.encryptedContact);
  applyRsvpContact(rsvp, contact);
  if (rsvp._doc) {
    rsvp.$locals = rsvp.$locals || {};
    rsvp.$locals.encryptedContact = rsvp.encryptedContact;
    delete rsvp._doc.encryptedContact;
  } else {
    delete rsvp.encryptedContact;
  }
  return rsvp;
}

async function migrateRetainedAccountData(user) {
  if (user?.encryption?.enabled !== true || !user.encryption?.dataEncryptedAt) return;
  const EventRsvp = require('../models/EventRsvp');
  const rsvps = await EventRsvp.find({ user: user._id, encryptedContact: '' });
  await Promise.all(rsvps.map(async (rsvp) => {
    await encryptRsvpContact(rsvp, user);
    await rsvp.save();
  }));
  const definitions = [
    [require('../models/NewsArticle'), 'news'],
    [require('../models/RetirementMessage'), 'retirement'],
    [require('../models/LastPostMessage'), 'lastPost'],
    [require('../models/Page'), 'page'],
  ];
  await Promise.all(definitions.map(async ([Model, kind]) => {
    const documents = await Model.find({ createdBy: user._id, 'retentionEncryption.enabled': { $ne: true } });
    await Promise.all(documents.map(async (document) => {
      enableRetainedContent(document, user);
      await document.save();
    }));
  }));
  const identities = [
    [require('../models/RetirementMessage'), ['submitter']],
    [require('../models/LastPostMessage'), ['submitter']],
    [require('../models/CertificateRequest'), ['member', 'familyMembers', 'mailingAddress', 'requester']],
  ];
  await Promise.all(identities.map(async ([Model]) => {
    const documents = await Model.find({ createdBy: user._id, 'identityEncryption.enabled': { $ne: true } });
    await Promise.all(documents.map(async (document) => {
      enableRetainedIdentity(document, user);
      await document.save();
    }));
  }));
}

async function anonymizeRetainedAccountData(accountId) {
  const EventRsvp = require('../models/EventRsvp');
  await EventRsvp.updateMany(
    { user: accountId },
    {
      $set: {
        encryptedContact: '',
        rank: '',
        firstName: 'Anonymous',
        lastName: '',
        unitOrStatus: '',
        email: '',
        phone: '',
      },
    },
  );
  const [RetirementMessage, LastPostMessage, CertificateRequest] = [
    require('../models/RetirementMessage'),
    require('../models/LastPostMessage'),
    require('../models/CertificateRequest'),
  ];
  await Promise.all([
    RetirementMessage.updateMany({ createdBy: accountId }, { $set: { encryptedIdentity: '', 'identityEncryption.enabled': false, submitter: {} } }),
    LastPostMessage.updateMany({ createdBy: accountId }, { $set: { encryptedIdentity: '', 'identityEncryption.enabled': false, submitter: {} } }),
    CertificateRequest.updateMany({ createdBy: accountId }, { $set: { encryptedIdentity: '', 'identityEncryption.enabled': false, requester: {}, member: {}, familyMembers: [], mailingAddress: {} } }),
  ]);
}

async function encryptTotpSecret(user) {
  if (user.encryption?.enabled !== true || !user.totp?.secret) return;
  if (user.encryptedTotpSecret && !user.isModified('totp.secret')) return;
  user.encryptedTotpSecret = await encryptAccountValue(user, user.totp.secret);
  user.totp.secret = '';
}

async function hydrateProfile(user) {
  if (!user?.encryption?.enabled || !user.encryptedProfile) return user;
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable');
  const result = await transit(settings, `${settings.mount}/decrypt/${encodeURIComponent(user.encryption.keyName)}`, {
    method: 'POST', body: JSON.stringify({ ciphertext: user.encryptedProfile }),
  });
  const plaintext = result.data?.plaintext;
  if (!plaintext) throw new Error('OpenBao Transit did not return decrypted profile data');
  applyProfile(user, JSON.parse(Buffer.from(plaintext, 'base64').toString('utf8')));
  if (user._doc) {
    user.$locals = user.$locals || {};
    user.$locals.encryptedProfile = user.encryptedProfile;
    delete user._doc.encryptedProfile;
  } else {
    delete user.encryptedProfile;
  }
  return user;
}

async function hydrateAccountSecrets(user) {
  if (!user?.encryption?.enabled || !user.encryptedTotpSecret) return user;
  const secret = await decryptAccountValue(user, user.encryptedTotpSecret);
  if (user._doc) {
    user._doc.totp = { ...(user._doc.totp || {}), secret };
    user.$locals = user.$locals || {};
    user.$locals.encryptedTotpSecret = user.encryptedTotpSecret;
    delete user._doc.encryptedTotpSecret;
  } else {
    user.totp = { ...(user.totp || {}), secret };
    delete user.encryptedTotpSecret;
  }
  return user;
}

async function enrollAccount(accountId) {
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is not configured by this deployment');
  if (await AccountDeletionLedger.exists({ accountId })) {
    const error = new Error('This account is listed in the deletion ledger');
    error.code = 'ACCOUNT_DELETED';
    throw error;
  }
  const name = keyName(accountId);
  const path = `${settings.mount}/keys/${encodeURIComponent(name)}`;
  await transit(settings, path, { method: 'POST', body: '{}' });
  await transit(settings, `${path}/config`, { method: 'POST', body: JSON.stringify({ deletion_allowed: true, exportable: false }) });
  return { provider: 'openbao', keyName: name, enrolledAt: new Date() };
}

async function destroyAccountKey({ accountId, encryption }) {
  if (encryption?.enabled !== true || !encryption.keyName) return;
  const settings = config();
  if (!getAvailability().enabled) throw new Error('Account encryption is unavailable; refusing to delete key-protected account');
  await transit(settings, `${settings.mount}/keys/${encodeURIComponent(encryption.keyName)}`, { method: 'DELETE' });
  await AccountDeletionLedger.create({ accountId, keyName: encryption.keyName, provider: 'openbao', deletionStatus: 'destroyed' });
}

module.exports = {
  decryptAccountValue,
  addRetainedContentEncryption,
  addRetainedIdentityEncryption,
  destroyAccountKey,
  encryptAccountValue,
  encryptProfile,
  encryptRetainedData,
  encryptRetainedBytes,
  encryptRsvpContact,
  encryptTotpSecret,
  enableRetainedContent,
  enableRetainedIdentity,
  enrollAccount,
  getAvailability,
  hydrateAccountSecrets,
  hydrateProfile,
  hydrateRetainedContent,
  hydrateRetainedIdentity,
  hydrateRsvpContact,
  isEncryptionIneligible,
  isRetainedContentEnabled,
  migrateRetainedAccountData,
  anonymizeRetainedAccountData,
  decryptRetainedBytes,
  PROFILE_FIELDS,
  RETAINED_CONTENT_FIELDS,
};
