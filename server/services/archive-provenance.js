// Set only by the archival importer, never from a public submission payload.
function isWordPressArchive(document) {
  const legacy = document?.legacy;
  return (
    legacy?.source === 'https://cmcen-rcmce.ca' &&
    legacy?.originalStatus === 'publish' &&
    legacy?.submissionMetadata === 'historically-unknown' &&
    Array.isArray(legacy.sourcePostIds) &&
    legacy.sourcePostIds.length > 0 &&
    legacy.sourcePostIds.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

function requiresSubmissionMetadata() {
  return !isWordPressArchive(this);
}

module.exports = { isWordPressArchive, requiresSubmissionMetadata };
