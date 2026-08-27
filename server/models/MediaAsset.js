const { randomUUID } = require('crypto');
const mongoose = require('mongoose');

const MediaVariantSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    width: { type: Number, min: 0, default: 0 },
    height: { type: Number, min: 0, default: 0 },
    size: { type: Number, min: 0, default: 0 },
    mimeType: { type: String, trim: true, default: 'image/webp' },
  },
  { _id: false },
);

const MediaAssetSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      trim: true,
      default: randomUUID,
      unique: true,
      sparse: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    originalKey: {
      type: String,
      trim: true,
      default: '',
    },
    originalUrl: {
      type: String,
      trim: true,
      default: '',
    },
    originalName: {
      type: String,
      trim: true,
      default: '',
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    cdnSlug: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
      unique: true,
      sparse: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    width: {
      type: Number,
      min: 0,
      default: 0,
    },
    height: {
      type: Number,
      min: 0,
      default: 0,
    },
    size: {
      type: Number,
      min: 0,
      default: 0,
    },
    variants: {
      thumb: { type: MediaVariantSchema, default: () => ({}) },
      medium: { type: MediaVariantSchema, default: () => ({}) },
      large: { type: MediaVariantSchema, default: () => ({}) },
      hero: { type: MediaVariantSchema, default: () => ({}) },
    },
    display: { type: MediaVariantSchema, default: () => ({}) },
    uploadContext: {
      type: {
        type: String,
        trim: true,
        default: 'unknown',
      },
      context: {
        type: String,
        trim: true,
        default: '',
      },
      sourceId: {
        type: String,
        trim: true,
        default: '',
      },
      sourceModel: {
        type: String,
        trim: true,
        default: '',
      },
      sourceField: {
        type: String,
        trim: true,
        default: '',
      },
      sourceUrl: {
        type: String,
        trim: true,
        default: '',
      },
      sourceSlug: {
        type: String,
        trim: true,
        default: '',
      },
      label: {
        type: String,
        trim: true,
        default: '',
      },
      linkedAt: {
        type: Date,
        default: null,
      },
    },
    inferredName: {
      type: String,
      trim: true,
      default: '',
    },
    fileMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    imageMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    storageEncryption: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, default: '' },
      keyName: { type: String, default: '' },
      encryptedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

MediaAssetSchema.index({ createdAt: -1 });
MediaAssetSchema.index({ displayName: 1, createdAt: -1 });
MediaAssetSchema.index({ size: -1, createdAt: -1 });
MediaAssetSchema.index({ 'uploadContext.type': 1, createdAt: -1 });
MediaAssetSchema.index({
  'uploadContext.sourceId': 1,
  'uploadContext.sourceField': 1,
});

module.exports = mongoose.model('MediaAsset', MediaAssetSchema);
