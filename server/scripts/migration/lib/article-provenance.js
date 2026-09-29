const SOURCE = 'https://cmcen-rcmce.ca';

function planArticleProvenance(articles, mappings) {
  const ids = new Set();
  const sources = new Set();
  return mappings.map((mapping) => {
    if (
      !Number.isSafeInteger(mapping.sourceId) ||
      mapping.sourceId < 1 ||
      !/^[a-f0-9]{24}$/u.test(mapping.destinationId) ||
      new URL(mapping.sourceUrl).origin !== SOURCE ||
      ids.has(mapping.destinationId) ||
      sources.has(mapping.sourceId)
    )
      throw new Error('Invalid or duplicate article mapping');
    ids.add(mapping.destinationId);
    sources.add(mapping.sourceId);
    const article = articles.find(
      (row) => String(row._id) === mapping.destinationId,
    );
    if (!article || article.migrationSource !== mapping.sourceUrl) {
      throw new Error('Article ID and source URL must both match');
    }
    const expected = {
      source: SOURCE,
      sourcePostIds: [mapping.sourceId],
      sourceUrls: [mapping.sourceUrl],
    };
    if (article.legacy != null) {
      if (
        article.legacy.source !== SOURCE ||
        !Array.isArray(article.legacy.sourcePostIds) ||
        !article.legacy.sourcePostIds.includes(mapping.sourceId) ||
        !Array.isArray(article.legacy.sourceUrls) ||
        !article.legacy.sourceUrls.includes(mapping.sourceUrl)
      )
        throw new Error('Existing provenance needs review');
      return { article, mapping, change: false };
    }
    return { article, mapping, change: true, legacy: expected };
  });
}

module.exports = { SOURCE, planArticleProvenance };
