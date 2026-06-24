const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  authMiddleware,
  requireExactRole,
  requireMinimumRole
} = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');

const router = express.Router();

// POST /api/register
// Create a subscriber account from the public registration form.
router.post('/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      addressLine1,
      addressLine2,
      city,
      country,
      stateProvince,
      postalCode,
      rank,
      postNominals,
      company,
      status,
      affiliationElement,
      trade,
      tradeOther,
      currentUnit,
      email,
      password,
      passwordConfirmation
    } = req.body;

    if (password !== passwordConfirmation) {
      return res.status(400).json({
        error: 'Passwords do not match'
      });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanFirstName = String(firstName || '').trim();
    const cleanLastName = String(lastName || '').trim();
    const requiredFields = [
      cleanFirstName,
      cleanLastName,
      String(addressLine1 || '').trim(),
      String(city || '').trim(),
      String(country || '').trim(),
      String(stateProvince || '').trim(),
      String(postalCode || '').trim(),
      String(status || '').trim(),
      String(affiliationElement || '').trim(),
      cleanEmail,
      String(password || ''),
      String(passwordConfirmation || '')
    ];

    if (requiredFields.some(value => !value)) {
      return res.status(400).json({
        error: 'Required registration fields are missing'
      });
    }

    const user = new User({
      username: cleanEmail,
      email: cleanEmail,
      accountName: [cleanFirstName, cleanLastName]
        .filter(Boolean)
        .join(' '),
      firstName: cleanFirstName,
      lastName: cleanLastName,
      address: {
        line1: String(addressLine1 || '').trim(),
        line2: String(addressLine2 || '').trim(),
        city: String(city || '').trim(),
        country: String(country || '').trim(),
        stateProvince: String(stateProvince || '').trim(),
        postalCode: String(postalCode || '').trim()
      },
      rank: String(rank || '').trim(),
      postNominals: String(postNominals || '').trim(),
      company: String(company || '').trim(),
      status: String(status || '').trim(),
      affiliationElement: String(affiliationElement || '').trim(),
      trade: String(trade || '').trim(),
      tradeOther: String(tradeOther || '').trim(),
      currentUnit: String(currentUnit || '').trim(),
      password,
      role: 'subscriber'
    });

    await user.save();
    res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('--- FULL ERROR DETAILS ---');
    console.error('Name:', err.name);
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);

    res.status(400).json({ error: 'Could not create account' });
  }
});

// POST /api/login
// Authenticate a user and return a short-lived JWT.
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).select('+password');

  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// GET /api/me
// Return the authenticated user's profile and computed permissions.
router.get('/me', authMiddleware, (req, res) => {
  const user = req.user.toObject();

  res.json({
    ...user,
    permissions: getUserPermissions(user)
  });
});

// GET /api/contributor-check
// Confirm the current user has contributor-level access or higher.
router.get(
  '/contributor-check',
  authMiddleware,
  requireMinimumRole('contributor'),
  (req, res) => {
    res.json({
      message: 'You may submit content',
      role: req.user.role
    });
  }
);

// GET /api/admin-check
// Confirm the current user has the administrator role.
router.get(
  '/admin-check',
  authMiddleware,
  requireExactRole('administrator'),
  (req, res) => {
    res.json({
      message: 'Administrator access confirmed'
    });
  }
);

module.exports = router;
