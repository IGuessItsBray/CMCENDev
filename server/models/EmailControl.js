const mongoose = require('mongoose');

const EmailControlSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'site' },
    account: { type: Boolean, default: false },
    operational: { type: Boolean, default: false },
    weekly: { type: Boolean, default: false },
    news: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('EmailControl', EmailControlSchema);
