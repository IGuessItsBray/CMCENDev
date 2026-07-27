const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    actorSnapshot: {
      username: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
      accountName: { type: String, trim: true, default: '' },
      role: { type: String, trim: true, default: '' },
    },

    targetType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    target: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    targetSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  },
);

AuditLogSchema.index({
  createdAt: -1,
  action: 1,
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
