const mongoose = require('mongoose');

const WeeklyBriefDeliverySchema = new mongoose.Schema(
  {
    run: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WeeklyBriefRun',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    state: {
      type: String,
      enum: ['processing', 'sent', 'failed'],
      default: 'processing',
    },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

// Never deliver the same scheduled brief twice to the same subscriber.
WeeklyBriefDeliverySchema.index({ run: 1, user: 1 }, { unique: true });

module.exports = mongoose.model(
  'WeeklyBriefDelivery',
  WeeklyBriefDeliverySchema,
);
