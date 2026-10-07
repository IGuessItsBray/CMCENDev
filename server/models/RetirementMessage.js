const mongoose = require('mongoose');
const { publicationDateFields } = require('../services/publication-date');
const {
  isWordPressArchive,
  requiresSubmissionMetadata,
} = require('../services/archive-provenance');

const retirementMessageSchema = new mongoose.Schema(
  {
    retiree: {
      ranks: {
        en: { type: String, trim: true, maxlength: 40, default: '' },
        fr: { type: String, trim: true, maxlength: 40, default: '' },
      },
      rank: {
        type: String,
        trim: true,
        maxlength: 40,
      },

      firstName: {
        type: String,
        trim: true,
        maxlength: 80,
      },

      lastName: {
        type: String,
        trim: true,
        maxlength: 80,
      },

      postNominals: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
      },

      tradeRole: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
      },

      retirementDate: {
        type: Date,
        default: null,
      },
    },

    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 30000,
    },

    messageLanguage: {
      type: String,
      enum: ['en', 'fr'],
      required: true,
    },

    messages: {
      en: {
        type: String,
        trim: true,
        maxlength: 30000,
        default: '',
      },

      fr: {
        type: String,
        trim: true,
        maxlength: 30000,
        default: '',
      },
    },

    photoUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    // Cropped 4:3 derivative used in consistently sized public card layouts.
    // The original photoUrl remains available for the full message view.
    photoDisplayUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    submitter: {
      firstName: {
        type: String,
        required: requiresSubmissionMetadata,
        trim: true,
        maxlength: 80,
      },

      lastName: {
        type: String,
        required: requiresSubmissionMetadata,
        trim: true,
        maxlength: 80,
      },

      relationship: {
        type: String,
        enum: ['self', 'colleague', 'family', 'other'],
        required: requiresSubmissionMetadata,
      },

      email: {
        type: String,
        required: requiresSubmissionMetadata,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },

      unit: {
        type: String,
        required: requiresSubmissionMetadata,
        trim: true,
        maxlength: 160,
      },
    },

    publicationConsent: {
      confirmed: {
        type: Boolean,
        required: requiresSubmissionMetadata,
        validate: {
          validator(value) {
            return (
              value === true || (isWordPressArchive(this) && value == null)
            );
          },
          message: 'Publication consent must be confirmed',
        },
      },

      confirmedAt: {
        type: Date,
        required: requiresSubmissionMetadata,
      },
    },

    memberReviewConfirmation: {
      confirmed: {
        type: Boolean,
        default: false,
      },

      confirmedAt: {
        type: Date,
        default: null,
      },
    },

    status: {
      type: String,
      enum: ['draft', 'pending', 'published', 'rejected', 'hidden'],
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

    ...publicationDateFields,
    publishedAt: {
      type: Date,
      default: null,
    },

    scheduledPublishAt: {
      type: Date,
      default: null,
      index: true,
    },

    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    scheduledAt: {
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

require('../services/formatted-body').installFormattedBody(retirementMessageSchema, 'messages');

retirementMessageSchema.index({
  status: 1,
  publishedAt: -1,
  _id: -1,
});

retirementMessageSchema.index({
  'retiree.retirementDate': -1,
});

retirementMessageSchema.index({
  createdBy: 1,
  updatedAt: -1,
});

retirementMessageSchema.index({
  createdBy: 1,
  status: 1,
  reviewedAt: -1,
});

retirementMessageSchema.index({
  publishedBy: 1,
  publishedAt: -1,
});

require('../services/content-edit-metadata').installContentEditMetadata(
  retirementMessageSchema,
);

module.exports = mongoose.model('RetirementMessage', retirementMessageSchema);
