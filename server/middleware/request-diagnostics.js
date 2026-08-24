const crypto = require('crypto');
const { writeAuditLog } = require('../services/audit-log');

function getRequestDetails(req, res, startedAt) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    durationMs: Date.now() - startedAt,
    ip: req.ip,
  };
}

function requestDiagnostics(req, res, next) {
  const startedAt = Date.now();
  let responseFinished = false;
  let connectionDiagnosticWritten = false;

  req.requestId = crypto.randomUUID();
  res.set('X-Request-ID', req.requestId);

  res.on('finish', () => {
    responseFinished = true;
    const details = getRequestDetails(req, res, startedAt);

    if (res.statusCode >= 500) {
      console.error('HTTP request failed', details);
      void writeAuditLog({
        req,
        action: 'diagnostic.request_failed',
        actor: req.user,
        targetType: 'request',
        targetSnapshot: { name: 'HTTP request' },
        metadata: details,
      });
      return;
    }

    if (res.statusCode === 429) {
      console.warn('HTTP request rate limited', {
        ...details,
        reason: res.locals.diagnosticReason || 'rate_limited',
      });
      return;
    }

    if (res.statusCode === 400 || res.statusCode === 413) {
      console.warn('HTTP request rejected', details);
    }
  });

  function logConnectionFailure(message) {
    if (connectionDiagnosticWritten) return;

    connectionDiagnosticWritten = true;
    console.warn(message, getRequestDetails(req, res, startedAt));
  }

  req.on('aborted', () => {
    logConnectionFailure('Client request aborted before completion');
  });

  res.on('close', () => {
    if (!responseFinished) {
      logConnectionFailure(
        'Client connection closed before response completion',
      );
    }
  });

  next();
}

module.exports = {
  requestDiagnostics,
};
