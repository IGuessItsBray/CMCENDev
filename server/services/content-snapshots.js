const { getCommentParentTitle } = require('../config/comment-targets');
function getEventTitle(event) {
  return event.title?.en || event.title?.fr || 'Untitled event';
}

function getEventSnapshot(event) {
  return {
    title: getEventTitle(event),
    status: event.status,
    contentArea: event.contentArea || 'general',
    createdBy: event.createdBy,
    publishedBy: event.publishedBy,
    startDate: event.startDate,
  };
}

function getRetirementMessageTitle(message) {
  const retiree = message.retiree || {};
  const name = [retiree?.rank, retiree?.firstName, retiree?.lastName]
    .filter(Boolean)
    .join(' ');

  return name ? `Retirement message for ${name}` : 'Retirement message';
}

function getLastPostMessageTitle(message) {
  const deceased = message.deceased || {};
  const name = [deceased.fullRank, deceased.firstName, deceased.surname]
    .filter(Boolean)
    .join(' ');

  return name ? `Last Post notice for ${name}` : 'Last Post notice';
}

function getRetirementMessageSnapshot(message) {
  return {
    title: getRetirementMessageTitle(message),
    status: message.status,
    createdBy: message.createdBy,
    publishedBy: message.publishedBy,
    retiree: message.retiree,
  };
}

function getLastPostMessageSnapshot(message) {
  return {
    title: message.title || getLastPostMessageTitle(message),
    status: message.status,
    createdBy: message.createdBy,
    publishedBy: message.publishedBy,
    deceased: message.deceased,
  };
}

function getCommentTitle(comment) {
  const title = getCommentParentTitle(comment);
  return title ? `Comment on ${title}` : 'Comment';
}
function getCommentSnapshot(comment, { includeBody = false } = {}) {
  return {
    title: getCommentTitle(comment),
    status: comment.status,
    author: comment.author,
    parentType: comment.parentType,
    parentId: comment.parentId,
    publishedBy: comment.publishedBy,
    excerpt: String(comment.body || '').slice(0, 240),
    ...(includeBody ? { body: String(comment.body || '') } : {}),
  };
}
function getCertificateRequestSnapshot(certificateRequest) {
  const member = certificateRequest.member || {};
  const fullName = String(member.fullName || '').trim();

  return {
    title: fullName
      ? `${certificateRequest.certificateType} certificate request for ${fullName}`
      : 'Certificate request',
    certificateType: certificateRequest.certificateType,
    status: certificateRequest.status,
    source: certificateRequest.source,
    createdBy: certificateRequest.createdBy,
  };
}

module.exports = {
  getCommentSnapshot,
  getCommentTitle,
  getCertificateRequestSnapshot,
  getEventSnapshot,
  getEventTitle,
  getLastPostMessageSnapshot,
  getLastPostMessageTitle,
  getRetirementMessageSnapshot,
  getRetirementMessageTitle,
};
