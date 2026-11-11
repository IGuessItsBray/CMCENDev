const mongoose = require('mongoose');
const { AWARD_ROLES } = require('../config/trusted-to-serve');
function retirementRequired() {
  return this.certificateType !== 'trusted_to_serve';
}
const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');
const {
  CERTIFICATE_FAMILY_RELATIONSHIPS,
  CERTIFICATE_REQUEST_STATUSES,
} = require('../config/certificate-requests');

const certificateFamilyMemberSchema = new mongoose.Schema(
  {
    memberRelationshipToRecipient: {
      type: String,
      enum: FAMILY_WORDING_OPTIONS.map((item) => item.key),
      required: true,
    },
    relationship: {
      type: String,
      enum: CERTIFICATE_FAMILY_RELATIONSHIPS,
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
      maxlength: 201,
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
      lastName: { type: String, trim: true, maxlength: 100 },
      fullName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 201,
        validate: function (value) {
          return (
            this.certificateType === 'trusted_to_serve' || value.length <= 160
          );
        },
      },

      rank: {
        type: String,
        required: true,
        trim: true,
        maxlength: 40,
      },

      tradeRole: {
        type: String,
        required: retirementRequired,
        trim: true,
        maxlength: 120,
      },

      rankLanguage: {
        type: String,
        enum: ['en', 'fr'],
        required: retirementRequired,
      },

      decorations: {
        type: [String],
        default: [],
      },

      lastUnit: {
        type: String,
        required: retirementRequired,
        trim: true,
        maxlength: 200,
      },

      releaseDate: {
        type: Date,
        required: retirementRequired,
      },

      dwdDate: { type: Date, default: null },

      ceBranchEnrollmentDate: {
        type: Date,
        required: retirementRequired,
      },

      neededByDate: {
        type: Date,
        required: true,
      },

      dwdParadeRequested: {
        type: Boolean,
        required: retirementRequired,
      },
    },

    familyMembers: {
      type: [certificateFamilyMemberSchema],
      default: [],
    },

    trustedToServe: {
      type: new mongoose.Schema(
        {
          firstName: { type: String, required: true, maxlength: 100 },
          lastName: { type: String, required: true, maxlength: 100 },
          postNominals: { type: String, default: '', maxlength: 120 },
          awardRole: {
            type: String,
            enum: AWARD_ROLES,
            required: true,
            default: 'student',
          },
          fullRankEn: { type: String, required: true, maxlength: 100 },
          presentationDate: { type: String, required: true },
          frPronoun: { type: String, required: true, enum: ['il', 'elle'] },
        },
        { _id: false },
      ),
      required: function () {
        return this.certificateType === 'trusted_to_serve';
      },
    },
    submissionKey: { type: String, select: false },
    submissionFingerprint: { type: String, select: false },

    mailingAddress: {
      line1: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      line2: {
        type: String,
        default: '',
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

certificateRequestSchema.index(
  { createdBy: 1, submissionKey: 1 },
  {
    unique: true,
    partialFilterExpression: { submissionKey: { $type: 'string' } },
  },
);

certificateRequestSchema.index({
  'source.type': 1,
  'source.id': 1,
});

module.exports = mongoose.model('CertificateRequest', certificateRequestSchema);
