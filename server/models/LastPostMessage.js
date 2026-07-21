const mongoose = require('mongoose');

const LegacySchema = new mongoose.Schema(
  {
    source: {
      type: String,
      trim: true,
      default: 'wordpress'
    },

    postId: {
      type: Number,
      required: true,
      index: true
    },

    postType: {
      type: String,
      trim: true,
      default: ''
    },

    guid: {
      type: String,
      trim: true,
      default: ''
    },

    slug: {
      type: String,
      trim: true,
      default: ''
    },

    authorId: {
      type: Number,
      default: null
    },

    importedAt: {
      type: Date,
      default: Date.now
    },

    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    _id: false
  }
);

const LegacyCommentSchema = new mongoose.Schema(
  {
    commentId: {
      type: Number,
      required: true
    },

    authorName: {
      type: String,
      trim: true,
      default: ''
    },

    authorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },

    body: {
      type: String,
      trim: true,
      default: ''
    },

    status: {
      type: String,
      trim: true,
      default: ''
    },

    publishedAt: {
      type: Date,
      default: null
    }
  },
  {
    _id: false
  }
);

const LastPostMessageSchema = new mongoose.Schema(
  {
    /*
     * These records were originally created for the WordPress import. Keep
     * the legacy fields below so that history remains displayable, while new
     * Last Post submissions use the structured fields that follow.
     */
    title: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ''
    },

    slug: {
      type: String,
      trim: true,
      maxlength: 220,
      default: ''
    },

    message: {
      type: String,
      trim: true,
      default: ''
    },

    messageLanguage: {
      type: String,
      enum: ['en', 'fr', 'unknown'],
      default: 'unknown'
    },

    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    // Retained solely for imported WordPress records.
    photoUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    deceased: {
      fullRank: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      firstName: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      surname: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      postNominal: {
        type: String,
        trim: true,
        maxlength: 120,
        default: ''
      }
    },

    submitter: {
      rank: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      firstName: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      lastName: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
      },

      email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: ''
      }
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'private', 'pending', 'archived'],
      default: 'draft',
      index: true
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true
    },

    legacyComments: {
      type: [LegacyCommentSchema],
      default: []
    },

    legacy: {
      type: LegacySchema,
      default: null
    }
  },
  {
    timestamps: true
  }
);

LastPostMessageSchema.index(
  {
    'legacy.source': 1,
    'legacy.postId': 1
  },
  {
    unique: true,
    partialFilterExpression: {
      'legacy.postId': { $exists: true }
    }
  }
);

LastPostMessageSchema.index({
  status: 1,
  publishedAt: -1
});

module.exports =
  mongoose.model('LastPostMessage', LastPostMessageSchema);
