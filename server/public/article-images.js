(function (root) {
  function safeImageUrl(value) {
    if (typeof value !== "string" || /[\\\u0000-\u0020]/u.test(value)) return "";
    if (/^\/assets\/images\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|gif|svg)$/u.test(value)) return value;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? value : "";
    } catch {
      return "";
    }
  }

  function originalUrl(data) {
    const original = safeImageUrl(data?.originalUrl);
    if (original) return original;
    const variants = Object.values(data?.variants || {}).filter((variant) =>
      variant && Number.isInteger(variant.width) && variant.width > 0 && variant.width <= 50000 && safeImageUrl(variant.url));
    variants.sort((a, b) => b.width - a.width);
    return variants[0]?.url || safeImageUrl(data?.url);
  }

  function link(image, data, language = "en") {
    if (!image || image.closest("a")) return image;
    const href = originalUrl(data);
    if (!href) return image;
    const anchor = image.ownerDocument.createElement("a");
    anchor.className = "article-image-link";
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const label = language === "fr"
      ? "Ouvrir l’image en grand format dans un nouvel onglet"
      : "Open full-size image in a new tab";
    anchor.setAttribute("aria-label", image.alt ? `${image.alt} — ${label}` : label);
    anchor.title = label;
    if (image.parentNode) image.parentNode.insertBefore(anchor, image);
    anchor.append(image);
    return anchor;
  }

  const api = { originalUrl, link };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ArticleImages = api;
})(typeof window !== "undefined" ? window : globalThis);
