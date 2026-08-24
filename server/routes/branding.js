const express = require('express');
const { BRANDING } = require('../config/branding');

const router = express.Router();

function getBranding(req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(BRANDING);
}

router.get('/api/branding', getBranding);

module.exports = router;
module.exports.getBranding = getBranding;
