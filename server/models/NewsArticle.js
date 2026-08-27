const mongoose = require('mongoose');
const { addRetainedContentEncryption } = require('../services/account-encryption');

const DEFAULT_NEWS_IMAGE_URL =
  'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp';

const LocalizedTextSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fr: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const NewsArticleSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true },
);

NewsArticleSchema.index({ status: 1, publishedAt: -1, _id: -1 });
addRetainedContentEncryption(NewsArticleSchema, 'news');

module.exports = mongoose.model('NewsArticle', NewsArticleSchema);
