const NewsArticle = require('../models/NewsArticle');
const { writeAuditLog } = require('./audit-log');
const { linkMediaAssetToSource } = require('./media-assets');

// The unique recipient source makes retries (and concurrent clicks) reuse the
// draft, including after a response is lost before the award link is saved.
async function createAwardNewsDraft({ award, recipient, req }) {
  let result;
  try {
    result = await NewsArticle.findOneAndUpdate(
      { sourceAwardRecipientId: recipient._id },
      {
        $setOnInsert: {
          createdAt: new Date(),
          updatedAt: new Date(),
          title: {
            en: `Congratulations to ${recipient.name}`.slice(0, 240),
            fr: `Félicitations à ${recipient.name}`.slice(0, 240),
          },
          content: {
            en: `Congratulations to ${recipient.name}, recipient of the ${award.title} (${recipient.year}).`,
            fr: `Félicitations à ${recipient.name}, récipiendaire du prix « ${award.title} » (${recipient.year}).`,
          },
          ...(recipient.imageUrl
            ? {
                imageUrl: recipient.imageUrl,
                imageDisplayUrl: recipient.imageUrl,
              }
            : {}),
          status: 'draft',
          createdBy: req.user._id,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: true,
        runValidators: true,
        timestamps: false,
      },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await NewsArticle.findOne({
      sourceAwardRecipientId: recipient._id,
    });
    if (!existing) throw error;
    return existing;
  }
  const article = result.value;
  if (!result.lastErrorObject.updatedExisting) {
    await writeAuditLog({
      req,
      actor: req.user,
      action: 'content.created',
      targetType: 'newsArticle',
      target: article._id,
      targetSnapshot: { title: article.title.en, status: 'draft' },
      metadata: {
        source: 'professional_award_recipient',
        awardId: award._id,
        recipientId: recipient._id,
      },
    });
  }
  if (recipient.imageUrl) {
    await linkMediaAssetToSource({
      mediaUrl: article.imageUrl,
      sourceType: 'newsArticle',
      context: 'news-story',
      sourceModel: 'NewsArticle',
      sourceId: article._id,
      sourceField: 'imageUrl',
      sourceUrl: `/news-story?id=${article._id}`,
      inferredName: article.title.en,
    });
  }
  return article;
}

module.exports = { createAwardNewsDraft };
