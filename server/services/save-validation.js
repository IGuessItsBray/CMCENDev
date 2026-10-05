// Required descriptive text is a save policy, not a storage invariant.
// Keep previously authorized blanks valid during subsequent unrelated edits.
function hasText(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  return Boolean(value?.en?.trim() || value?.fr?.trim());
}

function requiresTextForSave(actor, previous) {
  return (
    actor?.role !== 'developer' && (previous === undefined || hasText(previous))
  );
}

module.exports = { hasText, requiresTextForSave };
