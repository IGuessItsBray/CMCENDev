const mongoose = require('mongoose');
const { buildPublicMediaUrl } = require('../services/media-library');

const DEFAULT_NEWS_IMAGE_URL = buildPublicMediaUrl(
  'images/branch-crest/large.webp',
);

const LocalizedTextSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fr: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const NewsArticleSchema = new mongoose.Schema(
  {
    layout: {
      type: String,
      enum: ['standard', 'newsletter'],
      default: 'standard',
    },
    newsletter: {
      author: { type: String, maxlength: 240, default: '' },
      issue: { type: String, maxlength: 240, default: '' },
      kicker: { type: String, maxlength: 120, default: 'NEWSLETTERS' },
      date: { type: String, maxlength: 10, default: '' },
      language: { type: String, enum: ['en', 'fr'], default: 'en' },
      sourceUrl: { type: String, maxlength: 2000, default: '' },
      headerCrest: { type: Boolean, default: false },
      archived: { type: Boolean, default: false },
    },
    newsletterBlocks: {
      en: { type: [mongoose.Schema.Types.Mixed], default: [] },
      fr: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    migrationSource: { type: String, default: undefined },
    title: {
      type: LocalizedTextSchema,
      required: true,
    },
    content: {
      type: LocalizedTextSchema,
      required: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: DEFAULT_NEWS_IMAGE_URL,
    },
    imageDisplayUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: DEFAULT_NEWS_IMAGE_URL,
    },
    status: {
      type: String,
      enum: ['published', 'draft', 'hidden'],
      default: 'published',
      index: true,
    },
    hiddenFromStatus: {
      type: String,
      enum: ['published', ''],
      default: '',
    },
    hiddenAt: {
      type: Date,
      default: null,
    },
    hiddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    hiddenReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    scheduledPublishAt: { type: Date, default: null },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    scheduledAt: { type: Date, default: null },
    sourceAwardRecipientId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, optimisticConcurrency: true },
);

NewsArticleSchema.index({ status: 1, publishedAt: -1, _id: -1 });
NewsArticleSchema.index(
  { migrationSource: 1 },
  {
    unique: true,
    partialFilterExpression: { migrationSource: { $type: 'string' } },
  },
);
NewsArticleSchema.index({ status: 1, scheduledPublishAt: 1 });
NewsArticleSchema.index(
  { sourceAwardRecipientId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceAwardRecipientId: { $type: 'objectId' } },
  },
);

require('../services/content-edit-metadata').installContentEditMetadata(
  NewsArticleSchema,
);

module.exports = mongoose.model('NewsArticle', NewsArticleSchema);
