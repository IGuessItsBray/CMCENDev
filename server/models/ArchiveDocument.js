const mongoose = require('mongoose');
const library = require('../public/page-content/document-library.json');
const organizations = library.en.library.organizations.map(
  (item) => item.value,
);
const types = library.en.library.types.map((item) => item.value);

const localized = () => ({
  en: { type: String, trim: true, maxlength: 4000, default: '' },
  fr: { type: String, trim: true, maxlength: 4000, default: '' },
});

// Documents imported after the bundled library was written stay out of the
// public catalogue until publication. The bundled catalogue is untouched.
const schema = new mongoose.Schema(
  {
    sourceId: { type: Number, required: true, min: 1, unique: true },
    legacy: { type: mongoose.Schema.Types.Mixed, required: true },
    organization: { type: String, required: true, enum: organizations },
    type: { type: String, required: true, enum: types },
    fileKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      match: /^documents\/[a-zA-Z0-9/_-]+\.(pdf|docx)$/u,
    },
    pageUrl: { type: String, trim: true, maxlength: 500, default: '' },
    title: localized(),
    description: localized(),
    dateLabel: localized(),
    languageLabel: localized(),
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: { type: Date, default: null },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ status: 1, updatedAt: -1 });
module.exports = mongoose.model('ArchiveDocument', schema);
