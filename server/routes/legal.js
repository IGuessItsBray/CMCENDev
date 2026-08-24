const express = require('express');
const { LEGAL_VERSIONS, getLegalContact } = require('../config/legal');

const router = express.Router();

router.get('/api/client-config/legal', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ...getLegalContact(), versions: LEGAL_VERSIONS });
});

module.exports = router;
