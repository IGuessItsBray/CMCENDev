const { sendMail } = require('./mailer');
const {
  buildPublicMediaUrl,
  getMediaKeyFromValue,
} = require('./media-library');

function cleanEmailValue(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .trim();
}

function escapeHtml(value) {
  return cleanEmailValue(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function formatBoolean(value) {
  return value === true ? 'true' : 'false';
}

function getPublicPhotoUrl(value) {
  const photoUrl = cleanEmailValue(value);
  const mediaKey = getMediaKeyFromValue(photoUrl);

  return mediaKey ? buildPublicMediaUrl(mediaKey) : photoUrl;
}

function formatRetirementSubmissionEmail(retirementMessage = {}) {
  const retiree = retirementMessage.retiree || {};
  const submitter = retirementMessage.submitter || {};
  const fields = [
    ['RANK', retiree.rank],
    ['FIRST_NAME', retiree.firstName],
    ['LAST_NAME', retiree.lastName],
    ['POST_NOMINALS', retiree.postNominals],
    ['TRADE_ROLE', retiree.tradeRole],
    ['RETIREMENT_DATE', formatDate(retiree.retirementDate)],
    ['MESSAGE_LANGUAGE', retirementMessage.messageLanguage],
    ['MESSAGE', retirementMessage.message],
    ['PHOTO_URL', getPublicPhotoUrl(retirementMessage.photoUrl)],
    ['SUBMITTER_FIRST_NAME', submitter.firstName],
    ['SUBMITTER_LAST_NAME', submitter.lastName],
    ['SUBMITTER_RELATIONSHIP', submitter.relationship],
    ['SUBMITTER_EMAIL', submitter.email],
    ['SUBMITTER_UNIT', submitter.unit],
    [
      'PUBLICATION_CONSENT_CONFIRMED',
      formatBoolean(retirementMessage.publicationConsent?.confirmed),
    ],
    [
      'MEMBER_REVIEW_CONFIRMED',
      formatBoolean(retirementMessage.memberReviewConfirmation?.confirmed),
    ],
  ];

  const text = fields
    .map(([label, value]) => `${label}: ${cleanEmailValue(value)}`)
    .join('\n');

  return {
    text,
    html: `<pre style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(text)}</pre>`,
  };
}

function getRetirementSubmissionSubject(retirementMessage = {}) {
  const retiree = retirementMessage.retiree || {};
  const displayName = [retiree.rank, retiree.firstName, retiree.lastName]
    .map(cleanEmailValue)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();

  return `Retirement submission: ${displayName || 'Unnamed member'}`;
}

async function sendRetirementSubmissionEmail(retirementMessage) {
  const to = cleanEmailValue(process.env.MAIL_TO_BRANCH);

  if (!to) {
    return { skipped: true, reason: 'MAIL_TO_BRANCH is not configured' };
  }

  const cc = cleanEmailValue(process.env.MAIL_TO_ADMIN);
  const { text, html } = formatRetirementSubmissionEmail(retirementMessage);

  const result = await sendMail({
    to,
    cc: cc || undefined,
    subject: getRetirementSubmissionSubject(retirementMessage),
    text,
    html,
  });

  return result?.skipped ? result : { skipped: false };
}

module.exports = {
  formatRetirementSubmissionEmail,
  getRetirementSubmissionSubject,
  sendRetirementSubmissionEmail,
};
