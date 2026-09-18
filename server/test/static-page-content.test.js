const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');
const PAGES = Object.freeze([
  ['about-family.html', 'about-family'],
  ['about_branch.html', 'about-branch'],
  ['about_association.html', 'about-association'],
  ['about_museum_foundation.html', 'about-museum-foundation'],
  ['association_directors.html', 'association-directors'],
  ['document-library.html', 'document-library'],
  ['governance.html', 'governance'],
  ['leadership.html', 'leadership'],
]);

test('about pages provide matching English and French editorial content', () => {
  PAGES.forEach(([fileName, contentName]) => {
    const html = fs.readFileSync(path.join(PUBLIC_DIRECTORY, fileName), 'utf8');
    const content = JSON.parse(
      fs.readFileSync(
        path.join(PUBLIC_DIRECTORY, 'page-content', `${contentName}.json`),
        'utf8',
      ),
    );
    const referencedKeys = Array.from(
      html.matchAll(/data-page-i18n="([^"]+)"/gu),
      (match) => match[1],
    );
    const referencedAltKeys = Array.from(
      html.matchAll(/data-page-i18n-alt="([^"]+)"/gu),
      (match) => match[1],
    );
    const referencedPlaceholderKeys = Array.from(
      html.matchAll(/data-page-i18n-placeholder="([^"]+)"/gu),
      (match) => match[1],
    );

    assert.match(html, new RegExp(`data-static-page="${contentName}"`, 'u'));
    assert.match(html, /src="\/?static-page-content\.js"/u);
    assert.ok(referencedKeys.length > 0, `${fileName} has localized content`);
    assert.deepEqual(
      Object.keys(content.fr).sort(),
      Object.keys(content.en).sort(),
    );

    [
      ...referencedKeys,
      ...referencedAltKeys,
      ...referencedPlaceholderKeys,
    ].forEach((key) => {
      assert.ok(content.en[key]?.trim(), `${contentName} has English ${key}`);
      assert.ok(content.fr[key]?.trim(), `${contentName} has French ${key}`);
    });
  });
});

test('the extracted charter preserves the complete document structure', () => {
  const charter = JSON.parse(
    fs.readFileSync(
      path.join(PUBLIC_DIRECTORY, 'page-content', 'ce-senate-charter.en.json'),
      'utf8',
    ),
  );
  const sectionTitles = charter.sections.map((section) => section.title);
  const charterText = charter.sections
    .flatMap((section) => section.blocks)
    .map((block) => block.text)
    .join(' ');

  assert.equal(charter.history.length, 7);
  assert.equal(charter.sections.length, 9);
  assert.ok(sectionTitles.some((title) => title.startsWith('Part 1')));
  assert.ok(sectionTitles.some((title) => title.startsWith('Part 2')));
  assert.ok(sectionTitles.some((title) => title.startsWith('Section 6')));
  assert.match(charterText, /UNDERSTANDING GOVERNANCE/u);
  assert.match(charterText, /C&E FAMILY ORGANIZATION/u);
  assert.match(charterText, /6\.02 C&E Senate Agents and Employees/u);
  assert.ok(charterText.split(/\s+/u).length > 5500);
});

test('static page content reapplies when the shared language changes', () => {
  const runtime = fs.readFileSync(
    path.join(PUBLIC_DIRECTORY, 'static-page-content.js'),
    'utf8',
  );

  assert.match(
    runtime,
    /document\.addEventListener\("languagechange", applyPageLanguage\)/u,
  );
});
