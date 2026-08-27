const mongoose = require('mongoose');
const { addRetainedContentEncryption, addRetainedIdentityEncryption } = require('../services/account-encryption');

const LastPostMessageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: 240,
      default: '',
    },

    slug: {
      type: String,
      trim: true,
      maxlength: 240,
      default: '',
      index: true,
    },

    submitter: {
      rank: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },
      firstName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },
      lastName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },
    },

    deceased: {
      fullRank: {
        type: String,
        trim: true,
        maxlength: 80,
        // Legacy notices may not have a rank. New submissions remain validated
        // by the Last Post route before they are stored.
        default: '',
      },
      firstName: {
        type: String,
        trim: true,
        maxlength: 80,
      },
      surname: {
        type: String,
        // Legacy notices may omit a name component. New submissions are
        // validated by the Last Post route before they are stored.
        trim: true,
        maxlength: 80,
      },
      postNominal: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
      },
    },

    // The language selected by the submitter before the other version is translated.
    messageLanguage: {
      type: String,
      enum: ['en', 'fr'],
      required: true,
    },

    messages: {
      en: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: '',
      },
      fr: {
        type: String,
        trim: true,
        maxlength: 10000,
        default: '',
      },
    },

    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // Cropped 4:3 derivative for any compact Last Post presentation. The
    // full memorial image remains in imageUrl for the public notice.
    imageDisplayUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    publicationPermission: {
      confirmed: {
        type: Boolean,
        default: false,
      },
      confirmedAt: {
        type: Date,
        default: null,
      },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    photoUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // Publication metadata is needed for review and for the public archive.
    status: {
      type: String,
      enum: ['pending', 'published', 'rejected', 'hidden'],
      default: 'pending',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    hiddenFromStatus: {
      type: String,
      enum: ['pending', 'published', 'rejected', ''],
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

LastPostMessageSchema.index({
  status: 1,
  publishedAt: -1,
  _id: -1,
});
addRetainedContentEncryption(LastPostMessageSchema, 'lastPost');
addRetainedIdentityEncryption(LastPostMessageSchema, ['submitter']);

LastPostMessageSchema.index({
  'legacy.source': 1,
  'legacy.postId': 1,
});

module.exports = mongoose.model('LastPostMessage', LastPostMessageSchema);
