const test = require('node:test');
const assert = require('node:assert/strict');
const Retirement = require('../models/RetirementMessage');
const LastPost = require('../models/LastPostMessage');
const legacy = {
  source: 'https://cmcen-rcmce.ca',
  sourcePostIds: [123],
  originalStatus: 'publish',
  submissionMetadata: 'historically-unknown',
};
for (const Model of [Retirement, LastPost]) {
  test(`${Model.modelName} preserves unknown archive submission metadata`, async () => {
    for (const status of ['draft', 'published']) {
      const doc = new Model({
        status,
        messageLanguage: 'en',
        messages: { en: 'Original archive copy' },
        legacy,
      });
      await doc.validate();
      assert.notEqual(doc.publicationConsent?.confirmed, true);
      assert.notEqual(doc.publicationPermission?.confirmed, true);
      assert.equal(doc.submitter?.email, undefined);
    }
  });
  test(`${Model.modelName} still requires metadata without complete archive provenance`, async () => {
    for (const provenance of [
      null,
      { ...legacy, originalStatus: 'draft' },
      { ...legacy, sourcePostIds: [] },
    ]) {
      await assert.rejects(
        new Model({ messageLanguage: 'en', legacy: provenance }).validate(),
        { name: 'ValidationError' },
      );
    }
  });
}
