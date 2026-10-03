const ContentRevision = require('../models/ContentRevision');

// Latest shared state supersedes legacy state; legacy language notes stay visible.
async function getArticleReviews(contentIds) {
  const entries = await ContentRevision.aggregate([
    {
      $match: {
        contentType: 'newsArticle',
        fields: { $in: ['editorialNote', 'articleReview'] },
        ...(contentIds ? { contentId: { $in: contentIds } } : {}),
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: {
          id: '$contentId',
          language: '$language',
          shared: { $in: ['articleReview', '$fields'] },
        },
        after: { $first: '$after' },
      },
    },
  ]);
  const reviews = new Map();
  for (const entry of entries) {
    const id = String(entry._id.id);
    if (!reviews.has(id)) reviews.set(id, { legacyNotes: {} });
    const review = reviews.get(id);
    if (entry._id.shared) review.shared = entry.after.articleReview;
    else
      review.legacyNotes[entry._id.language] = entry.after.editorialNote || '';
  }
  for (const [id, review] of reviews) {
    const note = ['en', 'fr']
      .filter((language) => review.legacyNotes[language])
      .map(
        (language) =>
          `${language.toUpperCase()}: ${review.legacyNotes[language]}`,
      )
      .join('\n\n');
    reviews.set(id, {
      ...(review.shared || { needsReview: Boolean(note), note }),
      legacyNotes: review.legacyNotes,
    });
  }
  return reviews;
}

module.exports = { getArticleReviews };
