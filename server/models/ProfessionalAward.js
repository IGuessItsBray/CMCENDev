const mongoose = require('mongoose');

const AwardLinkSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 240 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    kind: {
      type: String,
      enum: ['instruction', 'nomination', 'application', 'other'],
      default: 'other',
    },
  },
  { _id: true },
);

const AwardRecipientSchema = new mongoose.Schema(
  {
    year: { type: Number, min: 1900, max: 3000, required: true },
    medallionNumber: { type: String, trim: true, maxlength: 80, default: '' },
    amount: { type: String, trim: true, maxlength: 80, default: '' },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    role: { type: String, trim: true, maxlength: 240, default: '' },
    imageUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    featured: { type: Boolean, default: false },
    newsArticleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NewsArticle',
      default: null,
    },
  },
  { _id: true },
);

const ProfessionalAwardSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    summary: { type: String, trim: true, maxlength: 8000, default: '' },
    eligibility: { type: String, trim: true, maxlength: 8000, default: '' },
    applicationDetails: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: '',
    },
    deadline: { type: String, trim: true, maxlength: 2000, default: '' },
    recipients: { type: [AwardRecipientSchema], default: [] },
    links: { type: [AwardLinkSchema], default: [] },
    sortOrder: { type: Number, min: 0, default: 0 },
    published: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

ProfessionalAwardSchema.index({ published: 1, sortOrder: 1, title: 1 });

module.exports = mongoose.model('ProfessionalAward', ProfessionalAwardSchema);
