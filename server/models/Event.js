const mongoose = require('mongoose');

const {
  CONTENT_STATUSES,
  EVENT_ORGANIZING_ENTITIES,
  EVENT_TYPES,
  CANADIAN_REGIONS,
  CANADIAN_TIMEZONES,
} = require('../config/content');

const LocalizedTextSchema = new mongoose.Schema(
  {
    en: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    fr: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    _id: false,
  },
);

const LocalizedLongTextSchema = new mongoose.Schema(
  {
    en: {
      type: String,
      trim: true,
      maxlength: 10000,
    },

    fr: {
      type: String,
      trim: true,
      maxlength: 10000,
    },
  },
  {
    _id: false,
  },
);

const SubmitterSchema = new mongoose.Schema(
  {
    rank: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    firstName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },

    lastName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },

    unitRole: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 320,
      default: '',
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },
  },
  {
    _id: false,
  },
);

const PublicationPermissionSchema = new mongoose.Schema(
  {
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
  {
    _id: false,
  },
);

const EventSchema = new mongoose.Schema(
  {
    title: {
      type: LocalizedTextSchema,
      required: true,

      validate: {
        validator(value) {
          return Boolean(value?.en || value?.fr);
        },

        message: 'An English or French event title is required',
      },
    },

    description: {
      type: LocalizedLongTextSchema,
      default: () => ({}),
    },

    location: {
      type: LocalizedTextSchema,
      default: () => ({}),
    },

    registration: {
      type: LocalizedLongTextSchema,
      default: () => ({}),
    },

    rsvpEnabled: {
      type: Boolean,
      default: false,
    },

    rsvpDeadline: {
      type: Date,
      default: null,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },

    provinceRegion: {
      type: String,
      enum: [...CANADIAN_REGIONS, ''],
      default: '',
    },

    organizingEntity: {
      type: String,
      enum: [...EVENT_ORGANIZING_ENTITIES, ''],
      default: '',
    },

    eventType: {
      type: String,
      enum: [...EVENT_TYPES, ''],
      default: '',
    },

    timezone: {
      type: String,
      enum: [...CANADIAN_TIMEZONES, ''],
      default: '',
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    allDay: {
      type: Boolean,
      default: true,
    },

    imagePath: {
      type: String,
      trim: true,
      default: null,
    },

    contentArea: {
      type: String,
      trim: true,
      default: 'general',
    },

    submitter: {
      type: SubmitterSchema,
      default: () => ({}),
    },

    publicationPermission: {
      type: PublicationPermissionSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: CONTENT_STATUSES,
      default: 'draft',
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

    lastSubmittedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
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

    deleteRequested: {
      type: Boolean,
      default: false,
    },

    deleteRequestReason: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },

    deleteRequestedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

EventSchema.pre('validate', function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date cannot be earlier than start date');
  }

  if (
    !this.allDay &&
    this.startDate &&
    this.endDate &&
    this.endDate <= this.startDate
  ) {
    this.invalidate('endDate', 'A timed event must end after it starts');
  }

  if (
    this.publicationPermission?.confirmed &&
    !this.publicationPermission.confirmedAt
  ) {
    this.publicationPermission.confirmedAt = new Date();
  }
});

// Public calendar queries.
EventSchema.index({
  status: 1,
  startDate: 1,
});

// Contributor dashboards and My Events.
EventSchema.index({
  createdBy: 1,
  status: 1,
  startDate: -1,
});

// Header review-result notifications.
EventSchema.index({
  createdBy: 1,
  status: 1,
  reviewedAt: -1,
});

// Review queue.
EventSchema.index({
  status: 1,
  createdAt: 1,
});

module.exports = mongoose.model('Event', EventSchema);
