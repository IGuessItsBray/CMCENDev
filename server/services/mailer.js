const nodemailer = require('nodemailer');

function getSmtpClientName(environment = process.env) {
  const configuredName = String(environment.SMTP_HELO_NAME || '').trim();

  if (configuredName) {
    return configuredName;
  }

  const fromAddress = String(environment.MAIL_FROM || '').trim();
  const atIndex = fromAddress.lastIndexOf('@');
  const senderDomain = atIndex >= 0 ? fromAddress.slice(atIndex + 1).trim() : '';

  return senderDomain || undefined;
}

// Reads SMTP_* once at startup. No credentials; the relay authenticates by server IP.
const smtpPort = Number(process.env.SMTP_PORT);
const transportOptions = {
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465 && process.env.SMTP_REQUIRE_TLS !== 'false',
};
const smtpClientName = getSmtpClientName();

if (smtpClientName) {
  transportOptions.name = smtpClientName;
}

const transporter = nodemailer.createTransport(transportOptions);

function sendMail({ to, cc, subject, text, html }) {
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
  });
}

module.exports = { sendMail, getSmtpClientName };
