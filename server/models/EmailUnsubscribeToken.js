const mongoose = require('mongoose');

const EmailUnsubscribeTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionType: {
      type: String,
      enum: ['weeklyBrief', 'newsAnnouncements'],
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// CASL requires the unsubscribe mechanism to remain available for at least
// 60 days. Expire the opaque, one-purpose token only after that period.
EmailUnsubscribeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  'EmailUnsubscribeToken',
  EmailUnsubscribeTokenSchema,
);
