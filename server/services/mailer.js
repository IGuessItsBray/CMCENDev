const nodemailer = require('nodemailer');
const crypto = require('node:crypto');
const EmailDeliveryAttempt = require('../models/EmailDeliveryAttempt');
const { isCategoryEnabled } = require('./email-controls');

function getSmtpClientName(environment = process.env) {
  const configuredName = String(environment.SMTP_HELO_NAME || '').trim();

  if (configuredName) {
    return configuredName;
  }

  const fromAddress = String(environment.MAIL_FROM || '').trim();
  const mailboxMatch = fromAddress.match(
    /(?:^|<\s*)[^<>\s@]+@([^<>\s@]+)(?:\s*>|$)/u,
  );
  const senderDomain = String(mailboxMatch?.[1] || '').trim();

  return senderDomain || undefined;
}

function getSmtpSecurityOptions(environment = process.env) {
  const smtpPort = Number(environment.SMTP_PORT);
  const configuredSecurity = String(environment.SMTP_SECURE || '')
    .trim()
    .toLowerCase();
  const secure =
    smtpPort === 465 ||
    ['true', 'tls', 'ssl', 'implicit'].includes(configuredSecurity);

  return {
    secure,
    requireTLS:
      !secure &&
      (configuredSecurity === 'starttls' ||
        environment.SMTP_REQUIRE_TLS !== 'false'),
  };
}

function isEmailSendingDisabled(environment = process.env) {
  return (
    String(environment.DISABLE_EMAIL_SENDING || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

// Reads SMTP_* once at startup. No credentials; the relay authenticates by server IP.
const smtpPort = Number(process.env.SMTP_PORT);
const smtpSecurity = getSmtpSecurityOptions();
const transportOptions = {
  host: process.env.SMTP_HOST,
  port: smtpPort,
  ...smtpSecurity,
};
const smtpClientName = getSmtpClientName();

if (smtpClientName) {
  transportOptions.name = smtpClientName;
}

const transporter = nodemailer.createTransport(transportOptions);

function maskRecipient(to) {
  const address = String(Array.isArray(to) ? to[0] : to || '').trim();
  const match = address.match(/^([^@\s]+)@([^@\s]+)$/u);
  return match ? `${match[1].slice(0, 1)}***@${match[2]}` : '';
}

async function recordAttempt({
  correlationId,
  category,
  workflow,
  to,
  status,
  reason,
}) {
  try {
    await EmailDeliveryAttempt.create({
      correlationId,
      category,
      workflow,
      recipientMasked: maskRecipient(to),
      status,
      reason,
    });
  } catch (error) {
    console.error('Email attempt record failed:', error?.name || 'unknown');
  }
}

async function sendMail(
  {
    to,
    cc,
    subject,
    text,
    html,
    headers,
    replyTo,
    category = 'unclassified',
    workflow = 'notification',
  },
  transport = transporter,
) {
  if (process.env.NODE_ENV === 'test' && !isEmailSendingDisabled()) {
    return { accepted: [to].filter(Boolean), test: true };
  }

  const correlationId = crypto.randomUUID();
  const report = (status, reason = '') =>
    recordAttempt({
      correlationId,
      category,
      workflow,
      to,
      status,
      reason,
    });

  if (isEmailSendingDisabled()) {
    await report('skipped', 'global_disabled');
    return {
      accepted: [],
      rejected: [],
      skipped: true,
      reason: 'DISABLE_EMAIL_SENDING is true',
      correlationId,
    };
  }

  if (category !== 'test' && !(await isCategoryEnabled(category))) {
    await report('skipped', 'category_disabled');
    return {
      accepted: [],
      rejected: [],
      skipped: true,
      reason: 'Email category is disabled',
      correlationId,
    };
  }

  try {
    const result = await transport.sendMail({
      from: process.env.MAIL_FROM,
      replyTo: replyTo || process.env.MAIL_REPLY_TO,
      to,
      cc,
      subject,
      text,
      html,
      headers,
    });
    if (!result.accepted?.length)
      throw new Error('SMTP did not accept a recipient');
    await report('accepted');
    return { ...result, correlationId };
  } catch (error) {
    // Provider messages can contain addresses or message fragments. Persist codes only.
    const code = String(error?.code || 'smtp_error');
    const reason = /^(E[A-Z0-9_]{2,30})$/u.test(code) ? code : 'smtp_error';
    await report('failed', reason);
    const safeError = new Error('SMTP delivery failed');
    safeError.code = reason;
    safeError.correlationId = correlationId;
    throw safeError;
  }
}

module.exports = {
  sendMail,
  getSmtpClientName,
  getSmtpSecurityOptions,
  isEmailSendingDisabled,
};
