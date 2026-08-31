const mongoose = require('mongoose');

const ContentRevisionSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      enum: [
        'event',
        'retirementMessage',
        'lastPost',
        'retirementComment',
        'newsArticle',
      ],
      required: true,
      index: true,
    },

    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: ['staff_content_updated'],
      required: true,
    },

    status: {
      type: String,
      required: true,
    },

    language: {
      type: String,
      enum: ['en', 'fr', ''],
      default: '',
    },

    fields: {
      type: [String],
      default: [],
    },

    before: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    after: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    actorSnapshot: {
      id: {
        type: String,
        default: '',
      },
      username: {
        type: String,
        default: '',
      },
      accountName: {
        type: String,
        default: '',
      },
      role: {
        type: String,
        default: '',
      },
    },
  },
  {
    timestamps: true,
  },
);

ContentRevisionSchema.index({
  contentType: 1,
  contentId: 1,
  createdAt: -1,
  _id: -1,
});

module.exports = mongoose.model('ContentRevision', ContentRevisionSchema);
