(function (root) {
  const inlineText = (nodes) =>
    (nodes || [])
      .map((node) =>
        typeof node === "string"
          ? node
          : node.type === "br"
            ? "\n"
            : inlineText(node.children),
      )
      .join("");
  function imageUrls(article) {
    if (article.layout !== "newsletter") return [];
    return [
      ...new Set(
        ["en", "fr"].flatMap((language) =>
          (article.newsletterBlocks?.[language] || [])
            .filter((block) => block.type === "figure")
            .flatMap((block) => [
              block.image.url,
              ...Object.values(block.image.variants || {}).map(
                (variant) => variant.url,
              ),
            ]),
        ),
      ),
    ].filter(Boolean);
  }
  function plainText(blocks) {
    return (blocks || [])
      .map((block) => {
        if (block.type === "heading") return block.text;
        if (block.type === "paragraph") return inlineText(block.children);
        if (block.type === "list")
          return block.items.map(inlineText).join("\n");
        if (block.type === "figure") return block.caption || "";
        if (block.type === "document") return block.label;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  function displayDate(article) {
    return article.newsletter?.archived && article.newsletter.date
      ? `${article.newsletter.date}T12:00:00.000Z`
      : article.publishedAt || article.createdAt || null;
  }
  const api = { imageUrls, plainText, inlineText, displayDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NewsletterFormat = api;
})(typeof window !== "undefined" ? window : globalThis);
