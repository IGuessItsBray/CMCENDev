const assert = require('node:assert/strict');
const test = require('node:test');
const { markContentEdited } = require('../services/content-edit-metadata');

for (const name of [
  'Event',
  'LastPostMessage',
  'RetirementMessage',
  'RetirementComment',
  'NewsArticle',
]) {
  test(`${name} preserves publication metadata and keeps edit metadata private`, () => {
    const Model = require(`../models/${name}`);
    const publishedAt = new Date('2026-01-01T12:00:00Z');
    const editedAt = new Date('2026-09-23T12:00:00Z');
    const content = new Model({ publishedAt });
    markContentEdited(
      content,
      { firstName: 'Test', lastName: 'Editor', email: 'private@example.test' },
      editedAt,
    );
    assert.deepEqual(content.publishedAt, publishedAt);
    assert.deepEqual(content.lastEditedAt, editedAt);
    assert.equal(content.lastEditedBy, 'Test Editor');
    assert.equal(content.toJSON().lastEditedAt, undefined);
    assert.equal(content.toJSON().lastEditedBy, undefined);
    assert.equal(Model.schema.path('lastEditedBy').options.select, false);
    markContentEdited(content, {
      email: 'private@example.test',
      username: 'private@example.test',
    });
    assert.equal(content.lastEditedBy, '');
  });
}
