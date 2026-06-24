require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// 1. Logic to sign token (does not open/close DB)
async function signAdminToken() {
  const adminUser = await User.findOne({ username: process.env.ADMIN_USER });
  if (!adminUser) throw new Error(`Admin user '${process.env.ADMIN_USER}' not found!`);
  
  return jwt.sign({ userId: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
}

// 2. Logic for standalone execution (when running 'node generate-admin-token.js')
async function runStandalone() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const token = await signAdminToken();
    console.log('--- GENERATED ADMIN TOKEN ---');
    console.log(token);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

// Check if file is being run directly
if (require.main === module) {
  runStandalone();
}

module.exports = { signAdminToken };