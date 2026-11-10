const ContentRevision = require('../models/ContentRevision');

function getActorSnapshot(actor) {
  return {
    id: String(actor?._id || ''),
    username: String(actor?.username || ''),
    accountName: String(actor?.accountName || ''),
    role: String(actor?.role || ''),
  };
}

function cleanRevisionNote(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 2000);
}

async function recordContentRevision({
  contentType,
  content,
  actor,
  status,
  language = '',
  fields = [],
  before,
  after,
  note = '',
  revertedRevisionId = null,
  revertState = 'applied',
  revertVersion = '',
}) {
  return ContentRevision.create({
    contentType,
    contentId: content._id,
    action: revertedRevisionId ? 'staff_content_reverted' : 'staff_content_updated',
    revertedRevisionId,
    revertState,
    revertVersion,
    status,
    language,
    fields,
    before,
    after,
    note: cleanRevisionNote(note),
    actor: actor?._id || null,
    actorSnapshot: getActorSnapshot(actor),
  });
}

module.exports = {
  recordContentRevision,
};
