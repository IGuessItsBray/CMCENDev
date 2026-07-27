const mongoose = require('mongoose');

const retirementMessageSchema = new mongoose.Schema(
  {
    retiree: {
      rank: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40,
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
      required: true,
      trim: true,
      minlength: 100,
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
        default: '',
      },

      fr: {
        type: String,
        trim: true,
        default: '',
      },
    },

    photoUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    submitter: {
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

      relationship: {
        type: String,
        enum: ['self', 'colleague', 'family', 'other'],
        required: true,
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },

      unit: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },
    },

    publicationConsent: {
      confirmed: {
        type: Boolean,
        required: true,
        validate: {
          validator(value) {
            return value === true;
          },
          message: 'Publication consent must be confirmed',
        },
      },

      confirmedAt: {
        type: Date,
        required: true,
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
      enum: ['pending', 'published', 'rejected'],
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
    },

    rejectionReason: {
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
  publishedBy: 1,
  publishedAt: -1,
});

module.exports = mongoose.model('RetirementMessage', retirementMessageSchema);
