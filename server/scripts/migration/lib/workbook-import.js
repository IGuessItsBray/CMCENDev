const crypto = require('crypto');

function slugify(value) {
  return (
    String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 120) || 'legacy-record'
  );
}

function sourceIdentity(candidate) {
  return {
    source: 'workbook-bilingual-inventory',
    recordId: candidate.recordId,
  };
}

function getPublishedAt(candidate) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate.publishedDate)) {
    return null;
  }

  return new Date(`${candidate.publishedDate}T12:00:00.000Z`);
}

function buildLegacy(candidate, mediaResult) {
  return {
    ...sourceIdentity(candidate),
    sourcePostIds: candidate.sourcePostIds,
    sourceUrls: candidate.sourceUrls,
    sourceMediaUrls: candidate.mediaLinks,
    translationGroup: candidate.translationGroup,
    recordClass: candidate.recordClass,
    notes: candidate.notes,
    mediaAssetKeys: mediaResult.assets.map((asset) => asset.key).filter(Boolean),
    importedAt: new Date(),
  };
}

function buildRetirementDocument(candidate, mediaResult, legacyUser) {
  const publishedAt = getPublishedAt(candidate);
  const isPublished = candidate.bilingual;
  const primaryMessage = candidate.messages[candidate.primaryLanguage];

  return {
    retiree: {
      rank: candidate.identity.rank,
      firstName: candidate.identity.firstName,
      lastName: candidate.identity.lastName,
      tradeRole: candidate.identity.trade,
      retirementDate: null,
    },
    message: primaryMessage,
    messageLanguage: candidate.primaryLanguage,
    messages: candidate.messages,
    photoUrl: mediaResult.primaryAsset?.url || '',
    photoDisplayUrl: mediaResult.primaryAsset?.display?.url || '',
    submitter: {
      firstName: 'Legacy',
      lastName: 'Import',
      relationship: 'other',
      email: 'legacy-import@cmcen.local',
      unit: 'CMCEN',
    },
    publicationConsent: {
      confirmed: true,
      confirmedAt: publishedAt || new Date(),
    },
    memberReviewConfirmation: {
      confirmed: candidate.bilingual,
      confirmedAt: candidate.bilingual ? publishedAt || new Date() : null,
    },
    status: isPublished ? 'published' : 'pending',
    createdBy: legacyUser._id,
    updatedBy: legacyUser._id,
    reviewedBy: isPublished ? legacyUser._id : null,
    reviewedAt: isPublished ? publishedAt : null,
    publishedBy: isPublished ? legacyUser._id : null,
    publishedAt: isPublished ? publishedAt : null,
    rejectionReason: '',
    legacy: buildLegacy(candidate, mediaResult),
  };
}

function buildLastPostDocument(candidate, mediaResult, legacyUser) {
  const publishedAt = getPublishedAt(candidate);
  const isPublished = candidate.bilingual;
  const title =
    candidate.titles.en || candidate.titles.fr || 'Legacy Last Post';

  return {
    title,
    slug: `${slugify(title)}-${candidate.recordId}`.slice(0, 240),
    messageLanguage: candidate.primaryLanguage,
    messages: candidate.messages,
    imageUrl: mediaResult.primaryAsset?.url || '',
    imageDisplayUrl: mediaResult.primaryAsset?.display?.url || '',
    photoUrl: mediaResult.primaryAsset?.url || '',
    deceased: {
      fullRank: candidate.identity.rank,
      firstName: candidate.identity.firstName,
      surname: candidate.identity.lastName,
      postNominal: '',
    },
    submitter: {
      rank: 'Legacy Import',
      firstName: 'Legacy',
      lastName: 'Import',
      email: 'legacy-import@cmcen.local',
    },
    status: isPublished ? 'published' : 'pending',
    createdBy: legacyUser._id,
    reviewedBy: isPublished ? legacyUser._id : null,
    reviewedAt: isPublished ? publishedAt : null,
    publishedBy: isPublished ? legacyUser._id : null,
    publishedAt: isPublished ? publishedAt : null,
    rejectionReason: '',
    legacy: buildLegacy(candidate, mediaResult),
  };
}

function buildDocument(candidate, mediaResult, legacyUser) {
  return candidate.type === 'retirement'
    ? buildRetirementDocument(candidate, mediaResult, legacyUser)
    : buildLastPostDocument(candidate, mediaResult, legacyUser);
}

function buildRecordFilter(candidate) {
  return {
    $or: [
      {
        'legacy.source': 'workbook-bilingual-inventory',
        'legacy.recordId': candidate.recordId,
      },
      { 'legacy.wordpressPostId': { $in: candidate.sourcePostIds } },
      { 'legacy.postId': { $in: candidate.sourcePostIds } },
    ],
  };
}

function getCommentKey(candidate, comment) {
  return crypto
    .createHash('sha256')
    .update(`${candidate.recordId}:${comment.index}:${comment.raw}`)
    .digest('hex');
}

module.exports = {
  buildDocument,
  buildRecordFilter,
  getCommentKey,
  getPublishedAt,
  slugify,
  sourceIdentity,
};
