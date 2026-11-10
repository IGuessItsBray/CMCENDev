const assert = require('node:assert/strict');
const test = require('node:test');
const diff = require('../public/content-diff');
const { Element } = require('./helpers/dashboard-dom');

function reconstruct(parts, version) {
  return parts.filter((part) => part.type !== (version === 'before' ? 'add' : 'remove')).map((part) => part.text).join('');
}

test('one-word changes highlight only the changed word and collapse long unchanged passages', () => {
  const prefix = 'A long unchanged paragraph. '.repeat(500);
  const before = `${prefix}The red fox crossed the road. ${prefix}`;
  const after = `${prefix}The blue fox crossed the road. ${prefix}`;
  const parts = diff.words(before, after);
  assert.deepEqual(parts.filter((part) => part.type !== 'equal'), [{ type: 'remove', text: 'red' }, { type: 'add', text: 'blue' }]);
  assert.equal(reconstruct(parts, 'before'), before);
  assert.equal(reconstruct(parts, 'after'), after);
  assert(diff.compact(parts).map((part) => part.text).join('').length < 200);
});

test('insertions, deletions, repeated words, Unicode, whitespace and punctuation are lossless', () => {
  for (const [before, after] of [
    ['', 'Added text'], ['Removed text', ''],
    ['Bonjour, été!\nHello hello.', 'Bonjour; hiver!\nHello again hello.'],
    ['one two one two', 'two one three two'], ['a  b\n', 'a b\n\n'],
    ['文字と日本語', '文字と中国語'],
  ]) {
    const parts = diff.words(before, after);
    assert.equal(reconstruct(parts, 'before'), before);
    assert.equal(reconstruct(parts, 'after'), after);
  }
});

test('large unrelated edits use a bounded comparison without losing full values', () => {
  const before = 'before '.repeat(5000), after = 'after '.repeat(5000);
  const parts = diff.words(before, after);
  assert.equal(reconstruct(parts, 'before'), before);
  assert.equal(reconstruct(parts, 'after'), after);
  assert(diff.compact(parts).map((part) => part.text).join('').length < 4100);
});

test('nested snapshots omit unchanged values without confusing false, zero, null or empty strings', () => {
  const changes = diff.changes({ body: { en: 'old', fr: 'texte' }, flag: false, count: 0, nil: null }, { body: { en: 'new', fr: 'texte' }, flag: true, count: 1, nil: '' });
  assert.deepEqual(changes.map((change) => change.field), ['body.en', 'flag', 'count', 'nil']);
  assert.equal(changes[1].before, 'false');
  assert.equal(changes[2].before, '0');
  assert.equal(changes[3].before, 'null');
});

test('rendered comparisons treat HTML as text and retain full snapshots under a collapsed disclosure', () => {
  const document = { createElement: (tag) => new Element(tag) };
  const before = '<script>old()</script>', after = '<img src=x onerror=run()>';
  const view = diff.render(document, { body: before }, { body: after });
  assert.equal(view.querySelectorAll('script').length, 0);
  assert.equal(view.querySelectorAll('img').length, 0);
  assert.deepEqual(view.querySelectorAll('pre').map((element) => element.textContent), [before, after]);
  assert.equal(view.querySelector('details').open, undefined);
  assert(view.querySelector('del').getAttribute('aria-label').startsWith('Removed:'));
  assert(view.querySelector('ins').getAttribute('aria-label').startsWith('Added:'));
});
