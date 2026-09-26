(function (root) {
  const categories = [
    "news",
    "newsletter",
    "unit-updates",
    "history-heritage",
    "museum-foundation",
  ];
  function categoryOf(article) {
    return (
      article.category ||
      (article.layout === "newsletter" ? "newsletter" : "news")
    );
  }
  function blocksFor(article, language) {
    if (article.layout === "newsletter")
      return article.newsletterBlocks?.[language] || [];
    const text = article.content?.[language] || "";
    return text
      ? [
          {
            type: "paragraph",
            children: text
              .split(/(\n)/)
              .map((part) => (part === "\n" ? { type: "br" } : part)),
          },
        ]
      : [];
  }
  // Align existing sequences without dropping or reordering either language.
  // Saved pair IDs keep partially translated, repeated block types aligned.
  function pairBlocks(en = [], fr = []) {
    const matches = (a, b) =>
      a.type === b.type &&
      (a.pairId || b.pairId ? a.pairId === b.pairId : true);
    const lengths = Array.from({ length: en.length + 1 }, () =>
      Array(fr.length + 1).fill(0),
    );
    for (let i = en.length - 1; i >= 0; i--)
      for (let j = fr.length - 1; j >= 0; j--)
        lengths[i][j] = matches(en[i], fr[j])
          ? 1 + lengths[i + 1][j + 1]
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    const rows = [];
    let i = 0,
      j = 0;
    while (i < en.length || j < fr.length) {
      if (i < en.length && j < fr.length && matches(en[i], fr[j]))
        rows.push({ en: en[i++], fr: fr[j++] });
      else if (
        i < en.length &&
        (j === fr.length || lengths[i + 1][j] >= lengths[i][j + 1])
      )
        rows.push({ en: en[i++], fr: null });
      else rows.push({ en: null, fr: fr[j++] });
    }
    return rows;
  }
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
  const api = {
    imageUrls,
    plainText,
    inlineText,
    displayDate,
    categories,
    categoryOf,
    blocksFor,
    pairBlocks,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NewsletterFormat = api;
})(typeof window !== "undefined" ? window : globalThis);
