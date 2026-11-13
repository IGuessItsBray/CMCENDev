const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { buildPublicMediaUrl } = require('../services/media-library');
const catalogue = require('../services/document-catalogue');
const OrganizationContent = require('../models/OrganizationContent');
const MediaAsset = require('../models/MediaAsset');
const { overlayLeadership } = require('../services/organization-content');

const router = express.Router();

// Only bundled public JSON files can be requested; request paths never reach fs.
const directory = path.join(__dirname, '../public/page-content');
const pages = new Map(
  fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => [
      entry.name,
      JSON.parse(fs.readFileSync(path.join(directory, entry.name), 'utf8')),
    ]),
);

function resolveMedia(value) {
  if (Array.isArray(value)) return value.map(resolveMedia);
  if (!value || typeof value !== 'object') return value;
  const resolved = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveMedia(item)]),
  );
  if (typeof value.imageKey === 'string' && value.imageKey.trim()) {
    resolved.image = buildPublicMediaUrl(value.imageKey);
  }
  if (typeof value.fileKey === 'string' && value.fileKey.trim()) {
    resolved.fileUrl = buildPublicMediaUrl(value.fileKey);
  }
  return resolved;
}

async function addLeadershipPortraitVariants(content) {
  const cards = ['en', 'fr'].flatMap((language) =>
    content[language].sections.flatMap((section) => section.cards),
  );
  const keys = [...new Set(cards.map((card) => card.imageKey).filter(Boolean))];
  if (!keys.length) return;
  const assets = await MediaAsset.find({ key: { $in: keys }, mimeType: /^image\//u })
    .select('key variants').lean();
  const byKey = new Map();
  for (const asset of assets) {
    const byWidth = new Map();
    for (const name of ['thumb', 'medium', 'large', 'hero']) {
      const variant = asset.variants?.[name];
      if (!/^images\/[a-zA-Z0-9/_ .-]+$/u.test(variant?.key || '')
        || variant.key.split('/').includes('..')
        || !Number.isSafeInteger(variant.width) || variant.width <= 0) continue;
      byWidth.set(variant.width, { width: variant.width, url: buildPublicMediaUrl(variant.key) });
    }
    if (byWidth.size)
      byKey.set(asset.key, [...byWidth.values()].sort((left, right) => left.width - right.width));
  }
  for (const card of cards) {
    const variants = byKey.get(card.imageKey);
    if (variants) card.imageVariants = variants;
  }
}

router.get('/page-content/document-library.json', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Document library temporarily unavailable' });
  }
  try {
    const documents = await catalogue.publicDocuments();
    res.set('Cache-Control', 'no-store');
    res.json({ ...catalogue.labels, documents });
  } catch (error) {
    console.error('Could not load document library:', error.name);
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Document library temporarily unavailable' });
  }
});

router.get('/page-content/:filename', async (req, res) => {
  if (!pages.has(req.params.filename)) return res.sendStatus(404);
  if (req.params.filename === 'leadership.json') {
    res.set('Cache-Control', 'no-cache');
    const record = mongoose.connection.readyState === 1
      ? await OrganizationContent.findOne({ key: 'leadership' }).lean()
      : null;
    const content = resolveMedia(overlayLeadership(structuredClone(pages.get(req.params.filename)), record?.content));
    if (mongoose.connection.readyState === 1) {
      try {
        await addLeadershipPortraitVariants(content);
      } catch (error) {
        console.error('Could not load leadership portrait variants:', error.name);
      }
    }
    return res.json(content);
  }
  res.set('Cache-Control', 'no-cache');
  res.json(resolveMedia(pages.get(req.params.filename)));
});

module.exports = router;
module.exports.resolveMedia = resolveMedia;
