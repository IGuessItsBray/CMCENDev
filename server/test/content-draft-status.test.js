const test = require('node:test');
const assert = require('node:assert/strict');

for (const name of ['RetirementMessage', 'LastPostMessage', 'Comment']) {
  test(`${name} accepts explicit drafts and keeps the submission default`, async () => {
    const Model = require(`../models/${name}`);
    assert.equal(new Model().status, 'pending');
    const draft = new Model({ status: 'draft' });
    await draft.validate(['status']);
    assert.equal(draft.status, 'draft');
    draft.status = 'unknown-state';
    await assert.rejects(draft.validate(['status']));
  });
}
