const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const indexScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'index.js'),
  'utf8',
);

test('skip link explicitly updates the fragment, scrolls, and moves focus to main content', () => {
  assert.match(indexScript, /main\.id \|\|= "mainContent";/u);
  assert.match(indexScript, /main\.tabIndex = -1;/u);
  assert.match(indexScript, /skipLink\.href = `#\$\{main\.id\}`;/u);
  assert.match(indexScript, /event\.preventDefault\(\);/u);
  assert.match(
    indexScript,
    /window\.history\.pushState\(null, "", `#\$\{main\.id\}`\);/u,
  );
  assert.match(indexScript, /main\.scrollIntoView\(\);/u);
  assert.match(indexScript, /main\.focus\(\{ preventScroll: true \}\);/u);
});
