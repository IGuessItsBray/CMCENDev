const mongoose = require('mongoose');
const { publicationDateFields } = require('../services/publication-date');
const { getCommentTarget } = require('../config/comment-targets');

const commentSchema = new mongoose.Schema(
  {
    parentType: {
      type: String,
      required: true,
      validate: {
        validator: (value) => Boolean(getCommentTarget(value)),
        message: 'Unsupported comment parent type',
      },
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: function () {
        return getCommentTarget(this.parentType)?.model;
      },
      required: true,
      index: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    body: {
      type: String,
      trim: true,
      validate: (value) => !value || value.length >= 2,
      maxlength: 10000,
    },

    status: {
      type: String,
      enum: ['draft', 'pending', 'published', 'rejected', 'hidden'],
      default: 'pending',
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    ...publicationDateFields,
    publishedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    hiddenFromStatus: {
      type: String,
      enum: ['draft', 'pending', 'published', 'rejected', ''],
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

    legacy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

commentSchema.index({
  parentType: 1,
  parentId: 1,
  status: 1,
  publishedAt: 1,
});

commentSchema.index({
  status: 1,
  createdAt: 1,
});

commentSchema.index({
  author: 1,
  status: 1,
  reviewedAt: -1,
});

commentSchema.index({
  publishedBy: 1,
  publishedAt: -1,
});
commentSchema.index({ 'legacy.source': 1, 'legacy.wordpressCommentId': 1 });

require('../services/content-edit-metadata').installContentEditMetadata(
  commentSchema,
);

module.exports = mongoose.model('Comment', commentSchema);
