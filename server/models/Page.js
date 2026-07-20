const mongoose = require('mongoose');
const { USER_ROLES } = require('../config/roles');
const {
  PERMISSION_CATALOG,
  normalizePermissionKeys
} = require('../config/permissions');

const PERMISSION_KEYS = PERMISSION_CATALOG.map(permission => permission.key);

const LocalizedStringSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fr: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const ImageCropSchema = new mongoose.Schema(
  {
    x: { type: Number, min: 0, max: 100, default: 50 },
    y: { type: Number, min: 0, max: 100, default: 50 },
    zoom: { type: Number, min: 1, max: 3, default: 1 },
    rotate: { type: Number, enum: [0, 90, 180, 270], default: 0 }
  },
  { _id: false }
);

const PageBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['heading', 'text', 'image', 'callout', 'button', 'divider', 'columns', 'carousel'],
      required: true
    },
    level: {
      type: Number,
      min: 2,
      max: 3,
      default: 2
    },
    text: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    body: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    url: {
      type: String,
      trim: true,
      default: ''
    },
    mediaKey: {
      type: String,
      trim: true,
      default: ''
    },
    mediaUrl: {
      type: String,
      trim: true,
      default: ''
    },
    alt: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    caption: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    crop: {
      type: ImageCropSchema,
      default: () => ({})
    },
    variant: {
      type: String,
      enum: ['standard', 'important'],
      default: 'standard'
    },
    columns: {
      type: [
        {
          title: {
            type: LocalizedStringSchema,
            default: () => ({})
          },
          body: {
            type: LocalizedStringSchema,
            default: () => ({})
          },
          mediaKey: {
            type: String,
            trim: true,
            default: ''
          },
          mediaUrl: {
            type: String,
            trim: true,
            default: ''
          },
          alt: {
            type: LocalizedStringSchema,
            default: () => ({})
          },
          crop: {
            type: ImageCropSchema,
            default: () => ({})
          }
        }
      ],
      default: []
    },
    items: {
      type: [
        {
          mediaKey: {
            type: String,
            trim: true,
            default: ''
          },
          mediaUrl: {
            type: String,
            trim: true,
            default: ''
          },
          alt: {
            type: LocalizedStringSchema,
            default: () => ({})
          },
          caption: {
            type: LocalizedStringSchema,
            default: () => ({})
          },
          crop: {
            type: ImageCropSchema,
            default: () => ({})
          }
        }
      ],
      default: []
    }
  },
  { _id: true }
);

const PageAccessSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      enum: ['public', 'authenticated', 'restricted'],
      default: 'public'
    },
    roles: {
      type: [String],
      enum: USER_ROLES,
      default: []
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
    permissions: {
      type: [String],
      enum: PERMISSION_KEYS,
      default: [],
      set: normalizePermissionKeys
    }
  },
  { _id: false }
);

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PageSchema = new mongoose.Schema(
  {
    title: {
      type: LocalizedStringSchema,
      required: true,
      default: () => ({})
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      set: normalizeSlug
    },
    summary: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft'
    },
    blocks: {
      type: [PageBlockSchema],
      default: []
    },
    access: {
      type: PageAccessSchema,
      default: () => ({})
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    publishedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

PageSchema.pre('validate', function () {
  if (!this.slug) {
    this.slug = normalizeSlug(this.title?.en || this.title?.fr);
  }
});

module.exports = mongoose.model('Page', PageSchema);
