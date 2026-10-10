const crypto = require('node:crypto');
const { normalizeBlocks, plainText } = require('../../../public/body-content');
const { titleTradeRole } = require('./notice-identity');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const SOURCE = 'https://cmcen-rcmce.ca';
const modelNames = {
  retirement: 'RetirementMessage',
  'last-post': 'LastPostMessage',
};

// Pure validation: never saves a document, sends mail, or fetches a URL.
async function inspectBatch(input, { models, mediaEvidence = [] } = {}) {
  if (!Array.isArray(input.items) || !input.items.length)
    throw new Error('Empty batch');
  const seenPosts = new Set();
  const seenComments = new Set();
  const results = [];
  for (const item of input.items) {
    const issues = [];
    const flag = (code, details = {}) => issues.push({ code, ...details });
    const sources = item.sources || [];
    if (!sources.length) flag('missing-source-records');
    const ids = sources.map((s) => s.id);
    for (const source of sources) {
      if (
        !Number.isSafeInteger(source.id) ||
        source.id <= 0 ||
        seenPosts.has(source.id)
      )
        flag('invalid-or-duplicate-source-id');
      seenPosts.add(source.id);
      if (source.status !== 'publish' || source.passwordProtected)
        flag('source-not-publicly-published', { sourceId: source.id });
      if (!['en', 'fr'].includes(source.language))
        flag('unknown-source-language', { sourceId: source.id });
      if (
        typeof source.originalBody !== 'string' ||
        source.bodySha256 !== hash(source.originalBody)
      )
        flag('source-hash-mismatch', { sourceId: source.id });
      if (!Number.isSafeInteger(source.authorId) || source.authorId < 1)
        flag('invalid-source-author', { sourceId: source.id });
      if (!source.convertedText?.trim())
        flag('empty-converted-body', { sourceId: source.id });
      if (source.conversionIssues?.length)
        flag('conversion-review-required', {
          sourceId: source.id,
          reasons: source.conversionIssues,
        });
    }
    const languages = sources.map((s) => s.language);
    if (new Set(languages).size !== languages.length)
      flag('duplicate-language');
    const english = sources.find((s) => s.language === 'en');
    const french = sources.find((s) => s.language === 'fr');
    if (
      english &&
      french &&
      english.convertedText?.trim() === french.convertedText?.trim()
    )
      flag('identical-en-fr-copy');
    // Human review must be bound to this exact source material, not a bare boolean.
    const sourceFingerprint = hash(
      JSON.stringify(sources.map((s) => [s.id, s.bodySha256])),
    );
    if (
      item.languageReview?.sourceFingerprint !== sourceFingerprint ||
      !item.languageReview?.reviewedBy
    )
      flag('language-review-required');
    const document = item.document || {};
    if (item.kind === 'retirement') {
      const retiree = document.retiree || {};
      if (/\d{5}/u.test(retiree.postNominals || ''))
        flag('specialty-in-post-nominals');
      const roles = {};
      for (const record of document.legacy?.sourceRecords || []) {
        if (typeof record.title !== 'string' || !['en', 'fr'].includes(record.language)) continue;
        try { roles[record.language] = titleTradeRole(record.title); }
        catch { flag('source-specialty-review-required', { sourceId: record.sourceId }); }
      }
      if (roles.en && roles.fr && roles.en !== roles.fr && !retiree.tradeRoles)
        flag('bilingual-specialty-required');
      for (const language of ['en', 'fr']) {
        if (roles[language] && retiree.tradeRoles && retiree.tradeRoles[language] !== roles[language])
          flag('source-specialty-changed', { language });
      }
    }
    if (
      document.status !== 'draft' ||
      document.publishedAt ||
      document.publishedBy ||
      document.scheduledPublishAt ||
      document.scheduledBy ||
      document.scheduledAt
    )
      flag('not-unscheduled-migration-draft');
    if (
      document.legacy?.source !== SOURCE ||
      !Array.isArray(document.legacy?.sourcePostIds) ||
      JSON.stringify([...document.legacy.sourcePostIds].sort()) !==
        JSON.stringify([...ids].sort())
    )
      flag('missing-source-provenance');
    for (const source of sources) {
      if (document.messages?.[source.language] !== source.convertedText)
        flag('converted-copy-changed', { sourceId: source.id });
      if (source.convertedBlocks !== undefined) {
        try {
          const blocks = normalizeBlocks(source.convertedBlocks);
          const body = document.formattedBody?.[source.language];
          if (plainText(blocks) !== source.convertedText || body?.version !== 1 ||
              body.text !== source.convertedText || JSON.stringify(body.blocks) !== JSON.stringify(blocks))
            flag('converted-formatting-changed', { sourceId: source.id });
        } catch { flag('invalid-converted-formatting', { sourceId: source.id }); }
      } else if (document.formattedBody?.[source.language]) {
        flag('missing-converted-formatting-source', { sourceId: source.id });
      }
    }
    if (
      item.kind === 'retirement' &&
      document.message !== document.messages?.[document.messageLanguage]
    )
      flag('primary-copy-mismatch');
    if (!item.destinationEvidence) flag('destination-not-checked');
    else {
      if (item.destinationEvidence.destinationMatches?.length)
        flag('existing-destination-review');
      if (item.destinationEvidence.unmappedAuthorIds?.length)
        flag('unmapped-authors', {
          sourceIds: item.destinationEvidence.unmappedAuthorIds,
        });
      if (item.destinationEvidence.unmappedRegisteredCommenterIds?.length)
        flag('unmapped-commenters', {
          sourceIds: item.destinationEvidence.unmappedRegisteredCommenterIds,
        });
    }
    // A source account match does not supply an actual Mongo reference by itself.
    for (const source of sources) {
      if (
        !item.authorMappings?.some(
          (m) =>
            m.sourceUserId === source.authorId &&
            /^[a-f\d]{24}$/iu.test(m.userId),
        )
      )
        flag('author-reference-not-prepared', { sourceId: source.id });
    }
    if (
      !sources.some((source) =>
        item.authorMappings?.some(
          (mapping) =>
            mapping.sourceUserId === source.authorId &&
            mapping.userId === String(document.createdBy || ''),
        ),
      )
    )
      flag('post-author-not-mapped');
    if (!item.mediaInventoryComplete) flag('media-inventory-incomplete');
    for (const url of item.mediaUrls || []) {
      const evidence = mediaEvidence.find((m) => m.sourceUrl === url);
      if (!evidence?.sourceVerified)
        flag('source-media-unverified', { sourceUrl: url });
      if (
        !evidence?.destinationVerified ||
        !evidence.destinationUrl ||
        !/^[a-f\d]{64}$/u.test(evidence.sourceSha256 || '') ||
        evidence.sourceSha256 !== evidence.destinationSha256
      )
        flag('destination-media-unverified', { sourceUrl: url });
    }
    const allCommentIds = new Set(
      (item.comments || []).map((c) => c.sourceCommentId),
    );
    for (const comment of item.comments || []) {
      if (
        !Number.isSafeInteger(comment.sourceCommentId) ||
        comment.sourceCommentId < 1 ||
        seenComments.has(comment.sourceCommentId)
      )
        flag('invalid-or-duplicate-comment-id');
      seenComments.add(comment.sourceCommentId);
      if (!ids.includes(comment.sourcePostId))
        flag('comment-outside-selected-sources');
      if (comment.sourceParentId && !allCommentIds.has(comment.sourceParentId))
        flag('unresolved-comment-parent', {
          sourceCommentId: comment.sourceCommentId,
        });
      if (
        comment.sourceApproval !== '1' &&
        !(
          comment.sourceApproval === '0' &&
          comment.importReview?.decision === 'preserve-as-draft' &&
          comment.importReview?.reviewedBy &&
          comment.importReview?.reason
        )
      )
        flag('originally-unapproved-comment', {
          sourceCommentId: comment.sourceCommentId,
        });
      if (comment.document?.body !== comment.convertedText)
        flag('comment-copy-changed');
      if (
        comment.document?.status !== 'draft' ||
        comment.document?.publishedAt ||
        comment.document?.publishedBy
      )
        flag('comment-not-migration-draft');
      const legacy = comment.document?.legacy;
      if (
        legacy?.source !== SOURCE ||
        legacy.wordpressCommentId !== comment.sourceCommentId ||
        legacy.postId !== comment.sourcePostId ||
        legacy.parentCommentId !== comment.sourceParentId ||
        legacy.authorUserId !== comment.sourceUserId ||
        legacy.originalApproval !== comment.sourceApproval
      )
        flag('missing-comment-provenance');
      if (comment.sourceUserId === 0 && comment.document?.author)
        flag('guest-assigned-account');
      if (
        comment.sourceUserId > 0 &&
        !item.authorMappings?.some(
          (m) =>
            m.sourceUserId === comment.sourceUserId &&
            m.userId === String(comment.document?.author),
        )
      )
        flag('comment-author-not-mapped');
      const Comment = models.Comment;
      if (
        comment.document?.parentType !==
          (item.kind === 'retirement' ? 'retirement' : 'lastPost') ||
        String(comment.document?.parentId || '') !== String(document._id || '')
      )
        flag('comment-parent-mismatch');
      await validateDocument(
        Comment,
        comment.document,
        flag,
        `comment:${comment.sourceCommentId}`,
      );
    }
    await validateDocument(
      models[modelNames[item.kind]],
      document,
      flag,
      'content',
    );
    results.push({
      key: item.key,
      sourceIds: ids,
      sourceFingerprint,
      ready: issues.length === 0,
      issues,
    });
  }
  return {
    readOnly: true,
    groups: results.length,
    readyGroups: results.filter((r) => r.ready).length,
    safeToApply: results.every((r) => r.ready),
    results,
  };
}

async function validateDocument(Model, values, flag, target) {
  if (!Model || !values) {
    flag('missing-converted-document', { target });
    return;
  }
  const document = new Model(values);
  try {
    await document.validate();
  } catch (error) {
    if (!error.errors) throw error;
    for (const [field, failure] of Object.entries(error.errors))
      flag('model-validation', {
        target,
        field,
        kind: failure.kind || failure.name,
      });
  }
  // Mongoose trim/casting must not silently change the prepared public copy.
  for (const field of ['message', 'messages.en', 'messages.fr', 'body']) {
    const before = field.split('.').reduce((v, key) => v?.[key], values);
    if (before !== undefined && document.get(field) !== before)
      flag('model-changes-copy', { target, field });
  }
}

module.exports = { inspectBatch, hash };
