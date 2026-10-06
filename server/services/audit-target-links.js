const mongoose = require('mongoose');
const {
  COMMENT_TARGETS,
  getCommentContextLinks,
} = require('../config/comment-targets');
const RetirementMessage = require('../models/RetirementMessage');
const LastPostMessage = require('../models/LastPostMessage');
const Comment = require('../models/Comment');

const models = { RetirementMessage, LastPostMessage };
const targetTypes = { retirementMessage: 'retirement', lastPost: 'lastPost' };
const idOf = (value) => String(value?._id || value || '');

// Resolve current records, not historical snapshots. Missing or private targets
// must not become public links. Batch by type rather than query per audit row.
async function addAuditTargetLinks(logs) {
  const supported = logs.filter(
    (log) =>
      (targetTypes[log.targetType] || log.targetType === 'comment') &&
      !['content.deleted', 'content.hidden'].includes(log.action) &&
      mongoose.isValidObjectId(idOf(log.target)),
  );
  const commentIds = supported
    .filter((log) => log.targetType === 'comment')
    .map((log) => idOf(log.target));
  const comments = commentIds.length
    ? await Comment.find({ _id: { $in: commentIds }, status: 'published' })
        .select('parentType parentId status')
        .lean()
    : [];
  const parents = new Map();
  await Promise.all(
    Object.entries(COMMENT_TARGETS).map(async ([type, target]) => {
      const ids = [
        ...new Set(
          [
            ...supported
              .filter((log) => targetTypes[log.targetType] === type)
              .map((log) => idOf(log.target)),
            ...comments
              .filter((comment) => comment.parentType === type)
              .map((comment) => idOf(comment.parentId)),
          ].filter((id) => mongoose.isValidObjectId(id)),
        ),
      ];
      if (!ids.length) return;
      const records = await models[target.model]
        .find({ _id: { $in: ids }, status: 'published' })
        .select('_id status')
        .lean();
      for (const record of records)
        parents.set(`${type}:${idOf(record)}`, record);
    }),
  );
  const commentMap = new Map(
    comments.map((comment) => [idOf(comment), comment]),
  );
  const supportedSet = new Set(supported);
  return logs.map((log) => {
    let targetPublicUrl = '';
    if (supportedSet.has(log)) {
      const comment =
        log.targetType === 'comment'
          ? commentMap.get(idOf(log.target))
          : { parentType: targetTypes[log.targetType], parentId: log.target };
      if (comment) {
        const parentId = parents.get(
          `${comment.parentType}:${idOf(comment.parentId)}`,
        );
        targetPublicUrl = getCommentContextLinks({
          ...comment,
          parentId,
        }).publicUrl;
      }
    }
    return { ...log, targetPublicUrl };
  });
}

module.exports = { addAuditTargetLinks };
