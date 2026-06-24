const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/data
// Basic public API smoke-test response.
router.get('/data', async (req, res) => {
  res.json({ message: 'Data fetched securely' });
});

// GET /api/protected_data
// Basic authenticated API smoke-test response.
router.get('/protected_data', authMiddleware, async (req, res) => {
  res.json({ message: 'This is protected data' });
});

module.exports = router;
