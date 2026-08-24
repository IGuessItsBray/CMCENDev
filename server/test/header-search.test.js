const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const headerScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'index.js'),
  'utf8',
);

test('submits the global search when Enter is pressed in its input', () => {
  assert.match(
    headerScript,
    /headerSearchInput\?\.addEventListener\("keydown", \(event\) => \{\s+if \(event\.key !== "Enter"\) return;\s+event\.preventDefault\(\);/s,
  );
  assert.match(
    headerScript,
    /searchUrl\.searchParams\.set\("q", query\);/,
  );
  assert.match(
    headerScript,
    /window\.location\.assign\(`\$\{searchUrl\.pathname\}\$\{searchUrl\.search\}`\);/,
  );
});
