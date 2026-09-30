const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    contentType: { type: String, required: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    contentUpdatedAt: { type: Date, required: true },
    checks: {
      source: { type: Boolean, default: false },
      translation: { type: Boolean, default: false },
      categorization: { type: Boolean, default: false },
      media: { type: Boolean, default: false },
    },
    note: { type: String, trim: true, maxlength: 4000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ArchiveVerification', schema);
