require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const eventRoutes = require('./routes/events');
const {
  authMiddleware,
  requireMinimumRole,
  requireExactRole
} = require('./middleware/auth');
const {
  getUserPermissions
} = require('./config/permissions');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/api/events', eventRoutes);

// wait for MongoDB before listening
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    app.listen(process.env.PORT || 3000, () => {
      console.log(
        `Server running on port ${process.env.PORT || 3000}`
      );
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

// Protected route
app.get('/api/protected_data', authMiddleware, async (req, res) => {
  res.json({ message: 'This is protected data' });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = req.user.toObject();

  res.json({
    ...user,
    permissions: getUserPermissions(user)
  });
});

// test route
app.get(
  '/api/contributor-check',
  authMiddleware,
  requireMinimumRole('contributor'),
  (req, res) => {
    res.json({
      message: 'You may submit content',
      role: req.user.role
    });
  }
);

// admin-only test route
app.get(
  '/api/admin-check',
  authMiddleware,
  requireExactRole('administrator'),
  (req, res) => {
    res.json({
      message: 'Administrator access confirmed'
    });
  }
);

// Example API Route
app.get('/api/data', async (req, res) => {
  // Perform database queries here
  res.json({ message: "Data fetched securely" });
});

// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, accountName, password } = req.body;

    // only explicitly accept permitted registration fields
    const user = new User({
      username,
      email,
      accountName,
      password,
      role: 'subscriber'
    });

    await user.save();
    res.status(201).json({ message: "User created" });
  } catch (err) {
    // DIAGNOSTIC LOGGING
    console.error("--- FULL ERROR DETAILS ---");
    console.error("Name:", err.name);
    console.error("Message:", err.message);
    console.error("Stack:", err.stack); // This reveals the exact file/line of the failure

    res.status(400).json({ error: 'Could not create account' });
    //res.status(400).json({ error: err.message, details: err.errors });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username }).select('+password');

  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

startServer();