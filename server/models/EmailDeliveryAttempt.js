const mongoose = require('mongoose');

const EmailDeliveryAttemptSchema = new mongoose.Schema({
  correlationId: { type: String, required: true, unique: true },
  workflow: { type: String, required: true },
  category: { type: String, required: true },
  recipientMasked: { type: String, default: '' },
  status: {
    type: String,
    enum: ['skipped', 'accepted', 'failed'],
    required: true,
  },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 14 * 24 * 60 * 60 },
});

module.exports = mongoose.model(
  'EmailDeliveryAttempt',
  EmailDeliveryAttemptSchema,
);
