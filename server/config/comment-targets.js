// Register additional commentable content here; model and moderation code are shared.
const COMMENT_TARGETS = Object.freeze({
  retirement: {
    model: 'RetirementMessage',
    label: { en: 'Retirement', fr: 'Retraite' },
    nameFields: ['retiree.rank', 'retiree.firstName', 'retiree.lastName'],
    publicPath: '/retirement-message',
  },
  lastPost: {
    model: 'LastPostMessage',
    label: { en: 'Last Post', fr: 'Dernier appel' },
    nameFields: ['deceased.fullRank', 'deceased.firstName', 'deceased.surname'],
    publicPath: '/last-post-message',
  },
});

function getCommentTarget(type) {
  return Object.hasOwn(COMMENT_TARGETS, type) ? COMMENT_TARGETS[type] : null;
}

function getCommentTypes() {
  return Object.entries(COMMENT_TARGETS).map(([value, { label }]) => ({
    value,
    label,
  }));
}

function getCommentParentTitle(comment) {
  const target = getCommentTarget(comment.parentType);
  return (
    target?.nameFields
      .map((path) =>
        path.split('.').reduce((value, key) => value?.[key], comment.parentId),
      )
      .filter(Boolean)
      .join(' ') || ''
  );
}

function getCommentPublicUrl(comment) {
  const target = getCommentTarget(comment.parentType);
  const id = comment.parentId?._id || comment.parentId;
  return target && id
    ? `${target.publicPath}?id=${encodeURIComponent(String(id))}`
    : '';
}

module.exports = {
  COMMENT_TARGETS,
  getCommentTarget,
  getCommentTypes,
  getCommentParentTitle,
  getCommentPublicUrl,
};
