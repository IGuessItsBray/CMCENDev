const mongoose = require('mongoose');

const LocalizedStringSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fr: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const NavigationItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['group', 'link'],
      default: 'link'
    },
    group: {
      type: String,
      trim: true,
      required: true
    },
    label: {
      type: LocalizedStringSchema,
      required: true,
      default: () => ({})
    },
    page: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Page',
      default: null
    },
    route: {
      type: String,
      trim: true,
      default: ''
    },
    permission: {
      type: String,
      trim: true,
      default: ''
    },
    visible: {
      type: Boolean,
      default: true
    },
    order: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('NavigationItem', NavigationItemSchema);
