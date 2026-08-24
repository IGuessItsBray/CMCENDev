const RetirementMessage = require('../models/RetirementMessage');

// This record was published as test data and includes unlicensed film dialogue.
// Keep the identifier here so every deployment removes it from public listings.
const RETIREMENT_NOTICE_IDS_TO_HIDE = ['6a79ecf2bc6254b9e46430ca'];

async function hidePublicTestRetirementNotices({
  RetirementMessageModel = RetirementMessage,
} = {}) {
  const result = await RetirementMessageModel.updateMany(
    {
      _id: { $in: RETIREMENT_NOTICE_IDS_TO_HIDE },
      status: 'published',
    },
    {
      $set: {
        status: 'hidden',
        hiddenFromStatus: 'published',
        hiddenAt: new Date(),
        hiddenBy: null,
      },
    },
  );

  return result.modifiedCount || 0;
}

module.exports = {
  RETIREMENT_NOTICE_IDS_TO_HIDE,
  hidePublicTestRetirementNotices,
};
