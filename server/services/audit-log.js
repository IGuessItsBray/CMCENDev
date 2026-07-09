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

function getRequestIp(req) {
  const rawIp = String(req?.ip || '').trim();

  if (rawIp.startsWith('::ffff:')) {
    return rawIp.slice(7);
  }

  return rawIp;
}

async function writeAuditLog({
  req = null,
  action,
  actor = null,
  targetType,
  target = null,
  targetSnapshot = {},
  metadata = {}
}) {
  try {
    const requestIp = getRequestIp(req);
    const auditMetadata = {
      ...metadata,
      ...(String(action || '').startsWith('user.login') && requestIp
        ? { ipAddress: requestIp }
        : {})
    };

    await AuditLog.create({
      action,
      actor: actor?._id || actor || null,
      actorSnapshot: snapshotUser(actor),
      targetType,
      target,
      targetSnapshot,
      metadata: auditMetadata
    });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}

module.exports = {
  writeAuditLog,
  snapshotUser
};
