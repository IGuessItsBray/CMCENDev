const express = require('express');
const path = require('path');
const { LEGAL_VERSIONS, getLegalContact } = require('../config/legal');

const router = express.Router();
const DOCS_DIRECTORY = path.join(__dirname, '..', '..', 'docs');
const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');
const DOCUMENTS = Object.freeze({
  privacy: 'PRIVACY_POLICY',
  tos: 'TERMS_OF_SERVICE',
});

router.get('/api/client-config/legal', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ...getLegalContact(), versions: LEGAL_VERSIONS });
});

function sendDocument(document, req, res) {
  const baseName = DOCUMENTS[document];
  const language = req.query.lang === 'fr' ? '.fr' : '';
  res.set('Cache-Control', 'public, max-age=300');
  res.type('text/markdown');
  res.sendFile(path.join(DOCS_DIRECTORY, `${baseName}${language}.md`), (error) => {
    if (!error || language !== '.fr') return;
    res.type('text/markdown');
    res.sendFile(path.join(DOCS_DIRECTORY, `${baseName}.md`));
  });
}

router.get('/api/privacy', (req, res) => {
  sendDocument('privacy', req, res);
});
router.get('/api/tos', (req, res) => {
  sendDocument('tos', req, res);
});

router.get('/privacy', (req, res) =>
  res.sendFile(path.join(PUBLIC_DIRECTORY, 'privacy.html')),
);
router.get('/tos', (req, res) =>
  res.sendFile(path.join(PUBLIC_DIRECTORY, 'terms.html')),
);
router.get('/terms', (req, res) => res.redirect(301, '/tos'));

module.exports = router;
