const MediaAsset = require('../models/MediaAsset');
const { buildPublicMediaUrl, getMediaKeyFromValue } = require('./media-library');

function publicImageUrl(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/u.test(value)) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? value : '';
  } catch {
    return '';
  }
}

// Detail-only response enrichment. Never guesses original filenames or saves content.
async function withOriginalImages(article) {
  const urls = [...new Set([
    article.imageUrl, article.imageDisplayUrl,
    ...Object.values(article.newsletterBlocks || {}).flatMap((blocks) =>
      blocks.filter((block) => block.type === 'figure').map((block) => block.image?.url)),
  ].filter((url) => typeof url === 'string' && url))];
  if (!urls.length) return article;
  const keys = urls.map(getMediaKeyFromValue).filter(Boolean);
  const paths = ['url', 'originalUrl', ...['thumb', 'medium', 'large', 'hero'].map((name) => `variants.${name}.url`)];
  const keyPaths = ['key', 'originalKey', ...['thumb', 'medium', 'large', 'hero'].map((name) => `variants.${name}.key`)];
  const assets = await MediaAsset.find({ $or: [
    ...paths.map((field) => ({ [field]: { $in: urls } })),
    ...keyPaths.map((field) => ({ [field]: { $in: keys } })),
  ] }).select('key url originalKey originalUrl variants').lean();
  const originals = new Map();
  for (const asset of assets) {
    const original = publicImageUrl(asset.originalUrl) ||
      (asset.originalKey ? publicImageUrl(buildPublicMediaUrl(asset.originalKey)) : '');
    if (!original) continue;
    const aliases = [asset.key, asset.originalKey, asset.url, asset.originalUrl,
      ...Object.values(asset.variants || {}).flatMap((variant) => [variant?.key, variant?.url])];
    for (const alias of aliases.filter(Boolean)) {
      const choices = originals.get(alias) || new Set();
      choices.add(original);
      originals.set(alias, choices);
    }
  }
  const resolve = (url) => {
    const choices = new Set([
      ...(originals.get(url) || []), ...(originals.get(getMediaKeyFromValue(url)) || []),
    ]);
    return choices.size === 1 ? [...choices][0] : '';
  };
  return {
    ...article,
    imageOriginalUrl: resolve(article.imageUrl) || resolve(article.imageDisplayUrl),
    newsletterBlocks: Object.fromEntries(Object.entries(article.newsletterBlocks || {}).map(([language, blocks]) => [language,
      blocks.map((block) => block.type === 'figure' && block.image
        ? { ...block, image: { ...block.image, originalUrl: resolve(block.image.url) } }
        : block),
    ])),
  };
}

module.exports = { withOriginalImages };
