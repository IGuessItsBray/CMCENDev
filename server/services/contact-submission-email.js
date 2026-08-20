const { sendMail } = require('./mailer');

function cleanString(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function cleanMultilineString(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .trim();
}

function escapeHtml(value) {
  return cleanMultilineString(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function getContactName(user = {}) {
  return (
    cleanString(user.accountName) ||
    [cleanString(user.firstName), cleanString(user.lastName)]
      .filter(Boolean)
      .join(' ') ||
    cleanString(user.username) ||
    'Member'
  );
}

function getReplyToEmail(value) {
  const email = cleanString(value).toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : undefined;
}

function formatContactSubmissionEmail({ user = {}, subject, message }) {
  const address = user.address || {};
  const fields = [
    ['NAME', getContactName(user)],
    ['EMAIL', cleanString(user.email)],
    ['PHONE', cleanString(user.phone)],
    ['RANK', cleanString(user.rank)],
    ['UNIT', cleanString(user.currentUnit)],
    ['COMPANY', cleanString(user.company)],
    ['ADDRESS_LINE_1', cleanString(address.line1)],
    ['ADDRESS_LINE_2', cleanString(address.line2)],
    ['CITY', cleanString(address.city)],
    ['STATE_PROVINCE', cleanString(address.stateProvince)],
    ['POSTAL_CODE', cleanString(address.postalCode)],
    ['COUNTRY', cleanString(address.country)],
    ['SUBJECT', cleanString(subject)],
    ['MESSAGE', cleanMultilineString(message)],
  ];
  const text = fields.map(([label, value]) => `${label}: ${value}`).join('\n');

  return {
    text,
    html: `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(text)}</pre>`,
  };
}

async function sendContactSubmissionEmail({ user, subject, message }) {
  const to = cleanString(process.env.MAIL_TO_BRANCH);

  if (!to) {
    return { skipped: true, reason: 'MAIL_TO_BRANCH is not configured' };
  }

  const email = getReplyToEmail(user?.email);
  const formatted = formatContactSubmissionEmail({ user, subject, message });
  const result = await sendMail({
    to,
    subject: `Contact form: ${cleanString(subject)}`,
    text: formatted.text,
    html: formatted.html,
    replyTo: email,
  });

  return result?.skipped ? result : { skipped: false };
}

module.exports = {
  formatContactSubmissionEmail,
  getReplyToEmail,
  sendContactSubmissionEmail,
};
