const mongoose = require('mongoose');
const { hydrateRsvpContact } = require('../services/account-encryption');

const EventRsvpSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    response: {
      type: String,
      enum: ['accepted', 'declined'],
      required: true,
    },
    rank: { type: String, trim: true, maxlength: 80, default: '' },
    firstName: { type: String, trim: true, maxlength: 80, default: '' },
    lastName: { type: String, trim: true, maxlength: 80, default: '' },
    unitOrStatus: { type: String, trim: true, maxlength: 160, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 320, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    encryptedContact: { type: String, select: false, default: '' },
  },
  { timestamps: true },
);

EventRsvpSchema.index({ event: 1, user: 1 }, { unique: true });
EventRsvpSchema.index({ event: 1, response: 1, updatedAt: -1 });

EventRsvpSchema.pre(/^find/, function () {
  this.select('+encryptedContact');
});

EventRsvpSchema.post(/^find/, async function (result) {
  const rsvps = Array.isArray(result) ? result : [result];
  await Promise.all(rsvps.filter(Boolean).map(hydrateRsvpContact));
});

module.exports = mongoose.model('EventRsvp', EventRsvpSchema);
