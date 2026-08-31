const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const publicDirectory = path.join(__dirname, '..', 'public');
const legalDirectory = path.join(publicDirectory, 'legal');

test('includes both language sources for each public legal document', () => {
  ['privacy.en.md', 'privacy.fr.md', 'terms.en.md', 'terms.fr.md'].forEach(
    (fileName) => {
      const source = fs.readFileSync(
        path.join(legalDirectory, fileName),
        'utf8',
      );
      assert.match(source, /^#\s+.+/mu, `${fileName} has a document heading`);
    },
  );
});

test('serves privacy and terms through the shared legal document shell', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const page = fs.readFileSync(path.join(publicDirectory, 'legal.html'), 'utf8');

  assert.match(server, /app\.get\(\['\/privacy', '\/terms'\]/u);
  assert.match(page, /src="\/legal\.js"/u);
  assert.match(page, /data-i18n="legal_document_loading"/u);
  assert.match(page, /id="mainContent"/u);
});

test('renders only the supported Markdown subset without HTML injection', () => {
  const script = fs.readFileSync(path.join(publicDirectory, 'legal.js'), 'utf8');

  assert.match(script, /createElement\("table"\)/u);
  assert.match(script, /createElement\("blockquote"\)/u);
  assert.match(script, /document\.createTextNode/u);
  assert.doesNotMatch(script, /innerHTML\s*=/u);
  assert.match(script, /PRIVACY_POLICY(?:_DRAFT)?/u);
  assert.match(script, /languagechange/u);
  assert.match(script, /document\.title/u);
});
