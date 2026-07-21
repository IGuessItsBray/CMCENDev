const mongoose = require('mongoose');

const LocalizedStringSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fr: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const TimerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: 'Untitled banner'
    },
    text: {
      type: LocalizedStringSchema,
      default: () => ({})
    },
    color: {
      type: String,
      trim: true,
      default: '#1d4ed8'
    },
    textColor: {
      type: String,
      trim: true,
      default: '#ffffff'
    },
    startsAt: {
      type: Date,
      default: null
    },
    endsAt: {
      type: Date,
      default: null
    },
    countdownAt: {
      type: Date,
      default: null
    },
    placement: {
      type: String,
      enum: ['global', 'home'],
      default: 'global'
    },
    screenPosition: {
      type: String,
      enum: ['header', 'below-header'],
      default: 'header'
    },
    enabled: {
      type: Boolean,
      default: true
    },
    order: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

TimerSchema.index({ enabled: 1, startsAt: 1, endsAt: 1, placement: 1, order: 1 });

module.exports = mongoose.model('Timer', TimerSchema);
