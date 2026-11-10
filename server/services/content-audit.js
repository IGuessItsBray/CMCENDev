const { writeAuditLog } = require('./audit-log');

// Call only after a successful save. Keep edits distinct from creation, and
// record public visibility changes even when they happen through an edit form.
async function writeContentUpdateAudit({
  req,
  content,
  previousStatus,
  targetType,
  targetSnapshot,
  source = 'update',
}) {
  const entry = {
    req,
    actor: req.user,
    targetType,
    target: content._id,
    targetSnapshot,
    metadata: { source, previousStatus, status: content.status },
  };
  await writeAuditLog({ ...entry, action: 'content.updated' });

  if (previousStatus === content.status) return;
  if (content.status === 'published' || previousStatus === 'published') {
    await writeAuditLog({
      ...entry,
      action: content.status === 'published'
        ? 'content.published'
        : 'content.unpublished',
    });
  }
}

module.exports = { writeContentUpdateAudit };
