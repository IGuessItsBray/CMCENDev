const mongoose = require('mongoose');
const {
  PERMISSION_CATALOG,
  normalizePermissionKeys,
} = require('../config/permissions');

const PERMISSION_KEYS = PERMISSION_CATALOG.map((permission) => permission.key);

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeColor(value) {
  const cleanValue = String(value || '').trim();

  return /^#[0-9a-f]{6}$/iu.test(cleanValue)
    ? cleanValue.toUpperCase()
    : '#4F46E5';
}

const RoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      set: normalizeSlug,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 240,
      default: '',
    },

    color: {
      type: String,
      default: '#4F46E5',
      set: normalizeColor,
    },

    permissions: {
      type: [String],
      enum: PERMISSION_KEYS,
      default: [],
      set: normalizePermissionKeys,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

RoleSchema.pre('validate', function () {
  if (!this.slug) {
    this.slug = normalizeSlug(this.name);
  }
});

module.exports = mongoose.model('Role', RoleSchema);
