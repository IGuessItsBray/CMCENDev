const crypto = require('node:crypto');

const SOURCE = 'https://cmcen-rcmce.ca';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function validateSource(input) {
  if (
    input?.source !== SOURCE ||
    !Array.isArray(input.users) ||
    !input.users.length
  )
    throw new Error('Invalid account source');
  const ids = new Set();
  const emails = new Set();
  return input.users.map((row) => {
    const email = String(row.email || '')
      .trim()
      .toLowerCase();
    if (
      !Number.isSafeInteger(row.id) ||
      row.id < 1 ||
      ids.has(row.id) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      emails.has(email)
    )
      throw new Error('Invalid or duplicate source identity');
    ids.add(row.id);
    emails.add(email);
    if (String(row.status) !== '0')
      throw new Error('Source account status needs review');
    const accountName = String(row.displayName || '').trim();
    if (!accountName || accountName.length > 240)
      throw new Error('Source display name needs review');
    // Explicit allowlist: WordPress hashes, roles and sessions are never used.
    return { sourceUserId: row.id, email, accountName };
  });
}

function mapKey(row) {
  return `${SOURCE}/users/${row.sourceUserId}`;
}
function identityHash(row) {
  return hash(row.email);
}

function planImport(rows, users, mappings) {
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const byKey = new Map(mappings.map((m) => [m._id, m]));
  return rows.map((row) => {
    const mapping = byKey.get(mapKey(row));
    if (
      mapping &&
      (mapping.source !== SOURCE ||
        mapping.sourceUserId !== row.sourceUserId ||
        mapping.emailHash !== identityHash(row))
    )
      return { row, state: 'conflict', reason: 'source-mapping-changed' };
    const mappedUser = mapping && byId.get(String(mapping.userId));
    if (mappedUser) {
      // Preserve recovered accounts, changed emails, passwords and privileges.
      // Only an already-committed mapping can authorize that preservation.
      if (mapping.state === 'complete')
        return { row, mapping, state: 'existing' };
      if (
        mappedUser.email !== row.email ||
        mappedUser.username !== row.email ||
        mappedUser.role !== 'subscriber' ||
        mappedUser.accountType !== 'member' ||
        mappedUser.profileComplete !== false
      )
        return { row, state: 'conflict', reason: 'pending-mapping-mismatch' };
      return { row, mapping, state: 'recover' };
    }
    if (mapping?.state === 'complete')
      return { row, state: 'conflict', reason: 'mapped-account-missing' };
    if (
      users.some((u) =>
        [u.email, u.username].some(
          (v) =>
            String(v || '')
              .trim()
              .toLowerCase() === row.email,
        ),
      )
    )
      return { row, state: 'conflict', reason: 'existing-account-collision' };
    return { row, mapping, state: 'create' };
  });
}

function buildAccount(row, id) {
  return {
    _id: id,
    accountType: 'member',
    profileComplete: false,
    username: row.email,
    email: row.email,
    accountName: row.accountName,
    password: crypto.randomBytes(48).toString('base64url'),
    role: 'subscriber',
    customRoles: [],
    contentAreas: [],
    // Possession of the password-reset email establishes access; no second
    // activation gate. Do not falsely mark the address previously verified.
    emailVerification: { required: false, verified: false },
  };
}

module.exports = {
  SOURCE,
  hash,
  validateSource,
  mapKey,
  identityHash,
  planImport,
  buildAccount,
};
