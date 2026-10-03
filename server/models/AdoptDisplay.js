const mongoose = require('mongoose');
const bilingual = (maxLength) => ({
  en: { type: String, trim: true, maxlength: maxLength, default: '' },
  fr: { type: String, trim: true, maxlength: maxLength, default: '' },
});
const schema = new mongoose.Schema(
  {
    title: bilingual(240),
    description: bilingual(8000),
    displayNumber: { type: String, trim: true, maxlength: 80, default: '' },
    imageUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    adoptionAmount: bilingual(240),
    availability: bilingual(240),
    recognition: bilingual(2000),
    expiry: bilingual(240),
    published: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
schema.index({ published: 1, displayNumber: 1, _id: 1 });
module.exports = mongoose.model('AdoptDisplay', schema);
