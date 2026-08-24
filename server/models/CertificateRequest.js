const mongoose = require('mongoose');
const {
  CERTIFICATE_FAMILY_RELATIONSHIPS,
  CERTIFICATE_REQUEST_STATUSES,
} = require('../config/certificate-requests');

const certificateFamilyMemberSchema = new mongoose.Schema(
  {
    relationship: {
      type: String,
      enum: CERTIFICATE_FAMILY_RELATIONSHIPS,
      required: true,
    },

    relationshipOther: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
  },
  { _id: false },
);

const certificatePrintConfirmationSchema = new mongoose.Schema(
  {
    certificateKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    recipientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
  },
  { _id: false },
);

const certificateRequestSchema = new mongoose.Schema(
  {
    certificateType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },

    source: {
      type: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },

      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },
    },

    member: {
      fullName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      rank: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40,
      },

      tradeRole: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      rankLanguage: {
        type: String,
        enum: ['en', 'fr'],
        required: true,
      },

      decorations: {
        type: [String],
        required: true,
        validate: {
          validator(value) {
            return Array.isArray(value) && value.length > 0;
          },
          message: 'At least one decoration or post-nominal is required',
        },
      },

      lastUnit: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
      },

      cafEnrollmentDate: {
        type: Date,
        required: true,
      },

      releaseDate: {
        type: Date,
        required: true,
      },

      ceBranchEnrollmentDate: {
        type: Date,
        default: null,
      },

      neededByDate: {
        type: Date,
        required: true,
      },

      dwdParadeRequested: {
        type: Boolean,
        required: true,
      },
    },

    familyMembers: {
      type: [certificateFamilyMemberSchema],
      default: [],
    },

    mailingAddress: {
      line1: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      line2: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      province: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      postalCode: {
        type: String,
        required: true,
        trim: true,
        maxlength: 24,
      },

      country: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
    },

    requester: {
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

      unit: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },
    },

    status: {
      type: String,
      enum: CERTIFICATE_REQUEST_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },

    printedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    printedAt: {
      type: Date,
      default: null,
    },

    printedCertificates: {
      type: [certificatePrintConfirmationSchema],
      default: [],
    },

    mailedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    mailedAt: {
      type: Date,
      default: null,
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
  },
  {
    timestamps: true,
  },
);

certificateRequestSchema.index({
  status: 1,
  createdAt: -1,
});

certificateRequestSchema.index({
  'source.type': 1,
  'source.id': 1,
});

module.exports = mongoose.model('CertificateRequest', certificateRequestSchema);
