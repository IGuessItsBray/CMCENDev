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

function getRetirementCommentTitle(comment) {
  const retiree = comment.retirementMessage?.retiree;
  const name = [retiree?.rank, retiree?.firstName, retiree?.lastName]
    .filter(Boolean)
    .join(' ');

  return name ? `Retirement comment for ${name}` : 'Retirement comment';
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

function getRetirementCommentSnapshot(comment, options = {}) {
  const { includeBody = false, includeRetirementMessageTitle = false } =
    options;
  const snapshot = {
    title: includeRetirementMessageTitle
      ? getRetirementCommentTitle(comment)
      : 'Retirement comment',
    status: comment.status,
    author: comment.author,
    retirementMessage: comment.retirementMessage,
    publishedBy: comment.publishedBy,
    excerpt: String(comment.body || '').slice(0, 240),
  };

  if (includeBody) {
    snapshot.body = String(comment.body || '');
  }

  return snapshot;
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
  getCertificateRequestSnapshot,
  getEventSnapshot,
  getEventTitle,
  getRetirementCommentSnapshot,
  getRetirementCommentTitle,
  getRetirementMessageSnapshot,
  getRetirementMessageTitle,
};
