const AuditLog = require('../models/AuditLog');

function cleanString(value) {
  return String(value || '').trim();
}

function snapshotUser(user) {
  if (!user) {
    return {};
  }

  return {
    username: cleanString(user.username),
    email: cleanString(user.email),
    accountName: cleanString(user.accountName),
    role: cleanString(user.role)
  };
}

async function writeAuditLog({
  action,
  actor = null,
  targetType,
  target = null,
  targetSnapshot = {},
  metadata = {}
}) {
  try {
    await AuditLog.create({
      action,
      actor: actor?._id || actor || null,
      actorSnapshot: snapshotUser(actor),
      targetType,
      target,
      targetSnapshot,
      metadata
    });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}

module.exports = {
  writeAuditLog,
  snapshotUser
};
