const mongoose = require('mongoose');
const { CONTENT_STATUSES } = require('../config/content');

const LocalizedTextSchema = new mongoose.Schema(
  {
    en: {
      type: String,
      trim: true,
      maxlength: 500
    },

    fr: {
      type: String,
      trim: true,
      maxlength: 500
    }
  },
  {
    _id: false
  }
);

const LocalizedLongTextSchema = new mongoose.Schema(
  {
    en: {
      type: String,
      trim: true,
      maxlength: 10000
    },

    fr: {
      type: String,
      trim: true,
      maxlength: 10000
    }
  },
  {
    _id: false
  }
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
        message: 'An English or French event title is required'
      }
    },

    description: {
      type: LocalizedLongTextSchema,
      default: () => ({})
    },

    location: {
      type: LocalizedTextSchema,
      default: () => ({})
    },

    startDate: {
      type: Date,
      required: true
    },

    endDate: {
      type: Date,
      default: null
    },

    allDay: {
      type: Boolean,
      default: true
    },

    imagePath: {
      type: String,
      trim: true,
      default: null
    },

    contentArea: {
      type: String,
      trim: true,
      default: 'general'
    },

    status: {
      type: String,
      enum: CONTENT_STATUSES,
      default: 'draft'
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
      default: null
    }
  },
  {
    timestamps: true
  }
);

EventSchema.pre('validate', function () {
  if (
    this.startDate &&
    this.endDate &&
    this.endDate < this.startDate
  ) {
    this.invalidate(
      'endDate',
      'End date cannot be earlier than start date'
    );
  }
});

// Public calendar queries will primarily use these fields.
EventSchema.index({
  status: 1,
  startDate: 1
});

// Useful for account dashboards and contributor drafts.
EventSchema.index({
  createdBy: 1,
  status: 1
});

module.exports = mongoose.model('Event', EventSchema);