const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'devs.js'),
  'utf8',
);

test('developers changelog safely renders inline Markdown links', () => {
  assert.match(source, /function appendInlineMarkdown\(container, value\)/u);
  assert.match(source, /new URL\(destination, window\.location\.origin\)/u);
  assert.match(source, /\["http:", "https:"\]\.includes\(url\.protocol\)/u);
  assert.match(source, /link\.rel = "noopener noreferrer"/u);
  assert.match(source, /appendInlineMarkdown\(paragraph, note\)/u);
  assert.match(source, /appendInlineMarkdown\(item, change\)/u);
});
