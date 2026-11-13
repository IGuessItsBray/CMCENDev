const mongoose = require('mongoose');

// Bundled content remains the fallback until an authorized editor saves it.
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, required: true, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('OrganizationContent', schema);
