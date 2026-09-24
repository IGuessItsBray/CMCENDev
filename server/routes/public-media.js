const express = require('express');
const { buildPublicMediaUrl } = require('../services/media-library');

const router = express.Router();

// Keep old saved branding references working without storing branding remotely.
for (const key of ['logo.png', 'leadership/princess-anne-laurel-frame.svg']) {
  router.get(`/images/${key}`, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.redirect(302, `/assets/images/${key}`);
  });
}

// Public objects only: this route does not sign requests or expose credentials.
router.get(['/images/*key', '/documents/*key'], (req, res) => {
  const parts = req.params.key;
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\/\u0000-\u001f\u007f]/u.test(part),
    )
  ) {
    return res.sendStatus(400);
  }
  const prefix = req.path.startsWith('/images/') ? 'images/' : 'documents/';
  const target = buildPublicMediaUrl(prefix + parts.join('/'));
  if (!/^https?:\/\//u.test(target)) return res.sendStatus(503);
  res.set('Cache-Control', 'no-cache');
  return res.redirect(302, target);
});

module.exports = router;
