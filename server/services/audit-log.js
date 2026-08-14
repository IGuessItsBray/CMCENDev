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
    role: cleanString(user.role),
  };
}

function splitIpCandidates(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(splitIpCandidates);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIpAddress(value) {
  const rawIp = String(value || '').trim();

  if (rawIp.startsWith('::ffff:')) {
    return rawIp.slice(7);
  }

  if (rawIp === '::1') {
    return '127.0.0.1';
  }

  return rawIp;
}

function isIpv4Address(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || ''));
}

function getRequestIpDetails(req) {
  const candidates = [req?.ips, req?.ip, req?.socket?.remoteAddress].flatMap(
    splitIpCandidates,
  );

  const addresses = [];

  candidates.forEach((candidate) => {
    const normalized = normalizeIpAddress(candidate);

    if (normalized && !addresses.includes(normalized)) {
      addresses.push(normalized);
    }

    if (
      String(candidate || '').trim() === '::1' &&
      !addresses.includes('::1')
    ) {
      addresses.push('::1');
    }
  });

  return {
    ipAddress: addresses.find(isIpv4Address) || addresses[0] || '',
    ipAddresses: addresses,
  };
}

function shouldCaptureRequestIp(action) {
  const normalizedAction = String(action || '');

  return (
    normalizedAction.startsWith('user.') ||
    normalizedAction.startsWith('audit.') ||
    normalizedAction.startsWith('analytics.') ||
    normalizedAction.startsWith('config.') ||
    normalizedAction.startsWith('media.') ||
    normalizedAction.startsWith('role.') ||
    normalizedAction.startsWith('page.') ||
    normalizedAction.startsWith('navigation.') ||
    normalizedAction.startsWith('timer.') ||
    normalizedAction.startsWith('translation.') ||
    normalizedAction.startsWith('content.') ||
    normalizedAction.startsWith('migration.')
  );
}

async function writeAuditLog({
  req = null,
  action,
  actor = null,
  targetType,
  target = null,
  targetSnapshot = {},
  metadata = {},
}) {
  try {
    const requestIpDetails = getRequestIpDetails(req);
    const auditMetadata = {
      ...metadata,
      ...(shouldCaptureRequestIp(action) && requestIpDetails.ipAddress
        ? {
            ipAddress: requestIpDetails.ipAddress,
            ipAddresses: requestIpDetails.ipAddresses,
          }
        : {}),
    };

    await AuditLog.create({
      action,
      actor: actor?._id || actor || null,
      actorSnapshot: snapshotUser(actor),
      targetType,
      target,
      targetSnapshot,
      metadata: auditMetadata,
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
        'metadata.mfaMethod': 'pending',
      },
      {
        $set: {
          'metadata.mfaMethod': cleanString(method),
        },
      },
      {
        sort: { createdAt: -1 },
      },
    );
  } catch (error) {
    console.error('Audit log MFA method update failed:', error);
  }
}

module.exports = {
  writeAuditLog,
  updateAccountCreationMfaMethod,
  snapshotUser,
};
