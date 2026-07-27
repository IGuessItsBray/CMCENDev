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

function requiresMemberProfileFields(context) {
  const document =
    typeof context?.ownerDocument === 'function'
      ? context.ownerDocument()
      : context;
  const accountType =
    document?.accountType ??
    (typeof context?.get === 'function'
      ? context.get('accountType')
      : undefined);

  return accountType === 'member' && document?.profileComplete !== false;
}

const UserSchema = new mongoose.Schema({
  accountType: {
    type: String,
    enum: ['member', 'ghost', 'invited'],
    default: 'member'
  },

  profileComplete: {
    type: Boolean,
    default: true
  },

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
    required() {
      return requiresMemberProfileFields(this);
    },
    trim: true,
    set: formatAccountName,
    get: formatAccountName
  },

  firstName: {
    type: String,
    required() {
      return requiresMemberProfileFields(this);
    },
    trim: true,
    set: capitalizeFirstLetter,
    get: capitalizeFirstLetter,
    maxlength: 80
  },

  lastName: {
    type: String,
    required() {
      return requiresMemberProfileFields(this);
    },
    trim: true,
    set: capitalizeFirstLetter,
    get: capitalizeFirstLetter,
    maxlength: 80
  },

  address: {
    line1: {
      type: String,
      required() {
        return requiresMemberProfileFields(this);
      },
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
      required() {
        return requiresMemberProfileFields(this);
      },
      trim: true,
      maxlength: 100
    },

    country: {
      type: String,
      required() {
        return requiresMemberProfileFields(this);
      },
      trim: true,
      maxlength: 100
    },

    stateProvince: {
      type: String,
      required() {
        return requiresMemberProfileFields(this);
      },
      trim: true,
      maxlength: 100
    },

    postalCode: {
      type: String,
      required() {
        return requiresMemberProfileFields(this);
      },
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
    required() {
      return requiresMemberProfileFields(this);
    }
  },

  affiliationElement: {
    type: String,
    enum: [
      'army',
      'navy',
      'air_force',
      'other'
    ],
    required() {
      return requiresMemberProfileFields(this);
    }
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

  phone: {
    type: String,
    trim: true,
    maxlength: 40,
    default: ''
  },

  preferredLanguage: {
    type: String,
    enum: ['en', 'fr'],
    default: 'en',
    required: true
  },

  role: {
    type: String,
    enum: USER_ROLES,
    default: 'subscriber'
  },

  customRoles: {
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
      }
    ],
    default: []
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
        rpID: { type: String, default: '' },
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
  },

  emailVerification: {
    required: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    codeHash: { type: String, default: '', select: false },
    codeExpiresAt: { type: Date, default: null, select: false },
    tempTokenHash: { type: String, default: '', select: false },
    tempTokenExpiresAt: { type: Date, default: null, select: false }
  },

  passwordReset: {
    tokenHash: { type: String, default: '', select: false },
    expiresAt: { type: Date, default: null, select: false }
  },

  invitation: {
    tokenHash: { type: String, default: '', select: false },
    expiresAt: { type: Date, default: null, select: false },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentAt: { type: Date, default: null }
  },

  // Incrementing this invalidates all browser refresh sessions for the user.
  sessionVersion: { type: Number, default: 0 }
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
