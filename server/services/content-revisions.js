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
}) {
  return ContentRevision.create({
    contentType,
    contentId: content._id,
    action: 'staff_content_updated',
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
