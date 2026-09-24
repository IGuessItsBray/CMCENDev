const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { buildPublicMediaUrl } = require('../services/media-library');

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

router.get('/page-content/:filename', (req, res) => {
  if (!pages.has(req.params.filename)) return res.sendStatus(404);
  res.set('Cache-Control', 'no-cache');
  res.json(resolveMedia(pages.get(req.params.filename)));
});

module.exports = router;
module.exports.resolveMedia = resolveMedia;
