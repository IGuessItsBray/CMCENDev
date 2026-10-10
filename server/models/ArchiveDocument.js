const mongoose = require('mongoose');
const { publicationDateFields } = require('../services/publication-date');
const library = require('../public/page-content/document-library.json');
const organizations = library.en.library.organizations.map(
  (item) => item.value,
);
const types = library.en.library.types.map((item) => item.value);

const localized = () => ({
  en: { type: String, trim: true, maxlength: 4000, default: '' },
  fr: { type: String, trim: true, maxlength: 4000, default: '' },
});

// Published records form the public catalogue after the explicit seed migration.
// Imported drafts retain their existing staff publication workflow.
const schema = new mongoose.Schema(
  {
    catalogueId: { type: String, trim: true, maxlength: 120, match: /^[a-z0-9-]+$/u },
    catalogueAliases: { type: [String], default: undefined },
    catalogueOrder: { type: Number, min: 0, validate: Number.isSafeInteger },
    sourceId: { type: Number, min: 1, required: function () { return !this.catalogueId; }, validate: { validator: value => value === undefined || Number.isSafeInteger(value), message: 'Source ID must be a positive integer' } },
    legacy: { type: mongoose.Schema.Types.Mixed, required: function () { return !this.catalogueId; } },
    availability: { type: String, enum: ['available', 'unavailable'], default: 'available' },
    organization: { type: String, required: true, enum: organizations },
    type: { type: String, required: true, enum: types },
    fileKey: {
      type: String,
      required: function () { return this.availability !== 'unavailable'; },
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
    ...publicationDateFields,
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ status: 1, updatedAt: -1 });
schema.index({ sourceId: 1 }, { unique: true, partialFilterExpression: { sourceId: { $type: 'number' } } });
schema.index({ catalogueId: 1 }, { unique: true, partialFilterExpression: { catalogueId: { $type: 'string' } } });
module.exports = mongoose.model('ArchiveDocument', schema);
