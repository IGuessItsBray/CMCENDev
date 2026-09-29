const test = require('node:test');
const assert = require('node:assert/strict');

for (const name of ['Comment']) {
  test(`${name} preserves long comments and rejects overflow`, () => {
    const Model = require(`../models/${name}`);
    for (const length of [2526, 10000]) {
      const value = 'a'.repeat(length);
      const document = new Model({ body: value });
      assert.equal(document.validateSync()?.errors.body, undefined);
      assert.equal(document.body, value);
    }
    assert.ok(
      new Model({ body: 'a'.repeat(10001) }).validateSync()?.errors.body,
    );
  });
}

for (const name of ['RetirementMessage', 'LastPostMessage']) {
  test(`${name} preserves long bilingual notices and rejects overflow`, () => {
    const Model = require(`../models/${name}`);
    for (const key of ['messages.en', 'messages.fr']) {
      const document = new Model({
        messages: { en: 'a'.repeat(30000), fr: 'b'.repeat(11389) },
      });
      assert.equal(document.validateSync()?.errors[key], undefined);
      document.set(key, 'a'.repeat(30001));
      assert.ok(document.validateSync()?.errors[key]);
    }
  });
}
