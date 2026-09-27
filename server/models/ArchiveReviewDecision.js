const mongoose = require('mongoose');

const entry = new mongoose.Schema(
  {
    choice: { type: String, required: true },
    note: { type: String, default: '', maxlength: 4000 },
    revision: { type: Number, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    batchId: { type: String, required: true, index: true },
    itemId: { type: String, required: true },
    catalogueHash: { type: String, required: true },
    choice: { type: String, required: true },
    note: { type: String, default: '', maxlength: 4000 },
    revision: { type: Number, required: true, min: 1 },
    history: { type: [entry], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ArchiveReviewDecision', schema);
