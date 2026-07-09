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

function shouldCaptureRequestIp(action) {
  return ['user.created', 'user.login', 'user.login_mfa_required']
    .includes(String(action || ''));
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
      ...(shouldCaptureRequestIp(action) && requestIp
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

async function updateAccountCreationMfaMethod(user, method) {
  try {
    await AuditLog.findOneAndUpdate(
      {
        action: 'user.created',
        target: user?._id || user,
        'metadata.mfaMethod': 'pending'
      },
      {
        $set: {
          'metadata.mfaMethod': cleanString(method)
        }
      },
      {
        sort: { createdAt: -1 }
      }
    );
  } catch (error) {
    console.error('Audit log MFA method update failed:', error);
  }
}

module.exports = {
  writeAuditLog,
  updateAccountCreationMfaMethod,
  snapshotUser
};
