require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Connect to MongoDB using the URI from your .env file
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect', err));

// Example API Route
app.get('/api/data', async (req, res) => {
    // Perform database queries here
    res.json({ message: "Data fetched securely" });
});

// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ message: "User created" });
  } catch (err) {
    // DIAGNOSTIC LOGGING
    console.error("--- FULL ERROR DETAILS ---");
    console.error("Name:", err.name);
    console.error("Message:", err.message);
    console.error("Stack:", err.stack); // This reveals the exact file/line of the failure
    
    res.status(400).json({ error: err.message, details: err.errors });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign({ userId: user._id }, 'YOUR_SECRET_KEY', { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));