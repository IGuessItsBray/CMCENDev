const mongoose = require('mongoose');

// No account is known until a discoverable passkey is selected. Consume each
// challenge atomically and check expiry independently of MongoDB TTL cleanup.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  challenge: { type: String, required: true },
  rpID: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasskeyLoginChallenge', schema);
