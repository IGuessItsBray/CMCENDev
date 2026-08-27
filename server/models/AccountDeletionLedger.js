const mongoose = require('mongoose');

const AccountDeletionLedgerSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    keyName: { type: String, required: true, trim: true, maxlength: 200 },
    provider: { type: String, enum: ['openbao'], required: true },
    deletedAt: { type: Date, required: true, default: Date.now },
    deletionStatus: { type: String, enum: ['destroyed'], required: true },
  },
  { timestamps: true },
);

AccountDeletionLedgerSchema.index({ accountId: 1, deletedAt: -1 });

module.exports = mongoose.model('AccountDeletionLedger', AccountDeletionLedgerSchema);
