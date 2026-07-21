const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env')
});

const mongoose = require('mongoose');
const LastPostMessage = require('../../models/LastPostMessage');

const INDEX_NAME = 'legacy.source_1_legacy.postId_1';

async function updateLastPostIndex() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const indexes = await LastPostMessage.collection.indexes();
    const existing = indexes.find(index => index.name === INDEX_NAME);

    if (existing && !existing.partialFilterExpression) {
      await LastPostMessage.collection.dropIndex(INDEX_NAME);
      console.log('Replaced the legacy Last Post index.');
    }

    await LastPostMessage.collection.createIndex(
      { 'legacy.source': 1, 'legacy.postId': 1 },
      {
        name: INDEX_NAME,
        unique: true,
        partialFilterExpression: {
          'legacy.postId': { $exists: true }
        }
      }
    );
    console.log('Last Post index is ready for imported and new notices.');
  } finally {
    await mongoose.disconnect();
  }
}

updateLastPostIndex().catch(error => {
  console.error('Could not update the Last Post index:', error);
  process.exitCode = 1;
});
