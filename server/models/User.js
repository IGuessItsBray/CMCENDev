const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES } = require('../config/roles');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  accountName: {
    type: String,
    required: true,
    trim: true
  },

  role: {
    type: String,
    enum: USER_ROLES,
    default: 'subscriber'
  },

  contentAreas: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', UserSchema);