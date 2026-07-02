const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES } = require('../config/roles');

function capitalizeFirstLetter(value) {
  const cleanValue = String(value || '').trim();

  if (!cleanValue) return cleanValue;

  return cleanValue.charAt(0).toUpperCase() + cleanValue.slice(1);
}

function formatAccountName(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(capitalizeFirstLetter)
    .join(' ');
}

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
    trim: true,
    set: formatAccountName,
    get: formatAccountName
  },

  firstName: {
    type: String,
    required: true,
    trim: true,
    set: capitalizeFirstLetter,
    get: capitalizeFirstLetter,
    maxlength: 80
  },

  lastName: {
    type: String,
    required: true,
    trim: true,
    set: capitalizeFirstLetter,
    get: capitalizeFirstLetter,
    maxlength: 80
  },

  address: {
    line1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },

    line2: {
      type: String,
      trim: true,
      maxlength: 160,
      default: ''
    },

    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    stateProvince: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    postalCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    }
  },

  rank: {
    type: String,
    trim: true,
    maxlength: 80,
    default: ''
  },

  postNominals: {
    type: String,
    trim: true,
    maxlength: 120,
    default: ''
  },

  company: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },

  status: {
    type: String,
    enum: [
      'regular',
      'reserve',
      'honourary',
      'civilian',
      'retired',
      'released',
      'other'
    ],
    required: true
  },

  affiliationElement: {
    type: String,
    enum: [
      'army',
      'navy',
      'air_force',
      'other'
    ],
    required: true
  },

  trade: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },

  tradeOther: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },

  currentUnit: {
    type: String,
    trim: true,
    maxlength: 160,
    default: ''
  },

  role: {
    type: String,
    enum: USER_ROLES,
    default: 'subscriber'
  },

  contentAreas: {
    type: [String],
    default: []
  },

  webauthn: {
    type: [
      {
        credentialID: { type: String },
        publicKey: { type: String },
        counter: { type: Number, default: 0 },
        transports: { type: [String], default: [] },
        credentialDeviceType: { type: String, default: '' },
        credentialBackedUp: { type: Boolean, default: false },
        authenticatorAttachment: { type: String, default: '' },
        aaguid: { type: String, default: '' },
        providerName: { type: String, default: '' },
        nickname: { type: String, default: '' }
      }
    ],
    default: []
  },

  webauthnRegistrationChallenge: { type: String, default: '' },
  webauthnAuthenticationChallenge: { type: String, default: '' },

  totp: {
    secret: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    appName: { type: String, default: '' }
  },

  twoFactor: {
    tempToken: { type: String, default: '' },
    tempExpires: { type: Date, default: null }
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model('User', UserSchema);
