// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  accountName: { type: String, required: true }
});

// Use an async function without 'next'
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  // Mongoose will wait for this promise to resolve
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', UserSchema);