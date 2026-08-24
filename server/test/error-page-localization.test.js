const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const publicDirectory = path.join(__dirname, '..', 'public');
const translations = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'data', 'translations.json'),
    'utf8',
  ),
);

test('localizes the public 404 page', () => {
  const markup = fs.readFileSync(path.join(publicDirectory, '404.html'), 'utf8');
  const keys = Array.from(markup.matchAll(/data-i18n="([^"]+)"/gu)).map(
    (match) => match[1],
  );

  [
    'error_404_page_title',
    'error_404_eyebrow',
    'error_404_heading',
    'error_404_message',
    'error_404_return_home',
    'error_404_search_site',
  ].forEach((key) => {
    assert.ok(keys.includes(key), `${key} is used by the 404 page`);
    assert.ok(translations.en[key]?.trim(), `${key} has English text`);
    assert.ok(translations.fr[key]?.trim(), `${key} has French text`);
  });
});
