const mongoose = require('mongoose');

async function removeLegacyAccountData(userId) {
  const db = mongoose.connection.db;
  // Keep the source-key tombstone to prevent migration from recreating a
  // deliberately deleted account, without retaining its identifying payload.
  await db.collection('legacyaccountmaps').updateMany(
    { userId },
    {
      $set: { state: 'deleted', deletedAt: new Date() },
      $unset: { emailHash: '', userId: '' },
    },
  );
  await db.collection('legacyaccountprofiles').deleteMany({ userId });
}

module.exports = { removeLegacyAccountData };
