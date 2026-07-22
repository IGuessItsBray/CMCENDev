const mongoose = require('mongoose');

const lastPostCommentSchema = new mongoose.Schema(
  {
    lastPostMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LastPostMessage',
      required: true,
      index: true
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 2000
    },

    status: {
      type: String,
      enum: [
        'pending',
        'published',
        'rejected'
      ],
      default: 'pending',
      index: true
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    reviewedAt: {
      type: Date,
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
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    legacy: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

lastPostCommentSchema.index({
  lastPostMessage: 1,
  status: 1,
  publishedAt: 1
});

lastPostCommentSchema.index({
  status: 1,
  createdAt: 1
});

lastPostCommentSchema.index({
  publishedBy: 1,
  publishedAt: -1
});

lastPostCommentSchema.index({
  'legacy.source': 1,
  'legacy.wordpressCommentId': 1
});

module.exports = mongoose.model('LastPostComment', lastPostCommentSchema);
