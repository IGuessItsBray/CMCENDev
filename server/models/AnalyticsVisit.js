const mongoose = require('mongoose');

const AnalyticsVisitSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
    },
    fullPath: {
      type: String,
      trim: true,
      maxlength: 520,
      default: '',
    },
    title: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    referrer: {
      type: String,
      trim: true,
      maxlength: 520,
      default: '',
    },
    referrerHost: {
      type: String,
      trim: true,
      maxlength: 180,
      default: '',
    },
    source: {
      type: String,
      trim: true,
      maxlength: 180,
      default: 'direct',
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'bot', 'unknown'],
      default: 'unknown',
    },
    osType: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'Unknown',
    },
    browser: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'Unknown',
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userRole: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'guest',
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'Unknown',
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 520,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

AnalyticsVisitSchema.index({ createdAt: -1 });
AnalyticsVisitSchema.index({ path: 1, createdAt: -1 });
AnalyticsVisitSchema.index({ source: 1, createdAt: -1 });
AnalyticsVisitSchema.index({ deviceType: 1, createdAt: -1 });
AnalyticsVisitSchema.index({ isRegistered: 1, createdAt: -1 });

module.exports = mongoose.model('AnalyticsVisit', AnalyticsVisitSchema);
