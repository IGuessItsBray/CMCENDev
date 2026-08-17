const mongoose = require('mongoose');

const NewsBlastSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('NewsBlast', NewsBlastSchema);
