const mongoose = require('mongoose');

// These files are explicitly approved for public linking, not private attachments.
const schema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      match: /^documents\/uploads\/[a-f0-9-]+\.pdf$/u,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    size: { type: Number, required: true, min: 1 },
    pages: { type: Number, required: true, min: 1 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publicConfirmedAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ createdAt: -1, _id: -1 });
module.exports = mongoose.model('UploadedDocument', schema);
