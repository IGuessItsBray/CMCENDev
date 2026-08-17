const mongoose = require('mongoose');

const WeeklyBriefRunSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true, unique: true },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
    state: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
      index: true,
    },
    lockExpiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('WeeklyBriefRun', WeeklyBriefRunSchema);
