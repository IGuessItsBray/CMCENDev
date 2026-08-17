const nodemailer = require('nodemailer');

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

function sendMail({ to, cc, subject, text, html, headers }) {
  if (process.env.NODE_ENV === 'test') {
    return Promise.resolve({ accepted: [to].filter(Boolean), test: true });
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    replyTo: process.env.MAIL_REPLY_TO,
    to,
    cc,
    subject,
    text,
    html,
    headers,
  });
}

module.exports = { sendMail, getSmtpClientName, getSmtpSecurityOptions };
