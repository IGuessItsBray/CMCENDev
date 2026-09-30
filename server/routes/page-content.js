const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { buildPublicMediaUrl } = require('../services/media-library');
const ArchiveDocument = require('../models/ArchiveDocument');

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

router.get('/page-content/document-library.json', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    res.set('Cache-Control', 'no-store');
    return res.json(resolveMedia(pages.get('document-library.json')));
  }
  try {
    const content = pages.get('document-library.json');
    const published = await ArchiveDocument.find({ status: 'published' }).lean();
    const documents = published.map((document) => ({
      id: `archive-${document.sourceId}`,
      organization: document.organization,
      type: document.type,
      fileKey: document.fileKey,
      pageUrl: document.pageUrl,
      en: {
        title: document.title?.en || '',
        description: document.description?.en || '',
        dateLabel: document.dateLabel?.en || '',
        languageLabel: document.languageLabel?.en || '',
      },
      fr: {
        title: document.title?.fr || '',
        description: document.description?.fr || '',
        dateLabel: document.dateLabel?.fr || '',
        languageLabel: document.languageLabel?.fr || '',
      },
    }));
    res.set('Cache-Control', 'no-store');
    res.json(resolveMedia({ ...content, documents: [...content.documents, ...documents] }));
  } catch (error) {
    console.error('Could not load document library:', error.name);
    res.set('Cache-Control', 'no-store');
    res.json(resolveMedia(pages.get('document-library.json')));
  }
});

router.get('/page-content/:filename', (req, res) => {
  if (!pages.has(req.params.filename)) return res.sendStatus(404);
  res.set('Cache-Control', 'no-cache');
  res.json(resolveMedia(pages.get(req.params.filename)));
});

module.exports = router;
module.exports.resolveMedia = resolveMedia;
