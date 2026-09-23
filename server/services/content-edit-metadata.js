// Content edits are distinct from moderation, RSVP, and publication activity.
const fields = {
  lastEditedAt: { type: Date, default: null, select: false },
  lastEditedBy: { type: String, default: '', select: false },
};

function installContentEditMetadata(schema) {
  schema.add(fields);
  schema.set('toJSON', {
    transform(_document, value) {
      delete value.lastEditedAt;
      delete value.lastEditedBy;
      return value;
    },
  });
}

function markContentEdited(content, actor, now = new Date()) {
  content.lastEditedAt = now;
  content.lastEditedBy = String(
    actor?.accountName ||
      [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') ||
      '',
  ).trim();
}

module.exports = { installContentEditMetadata, markContentEdited };
