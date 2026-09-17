const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');

test('document library references available public source files', () => {
  const content = JSON.parse(
    fs.readFileSync(
      path.join(PUBLIC_DIRECTORY, 'page-content', 'document-library.json'),
      'utf8',
    ),
  );

  assert.equal(content.documents.length, 9);
  assert.ok(
    content.documents.some(
      (documentItem) =>
        documentItem.id === 'association-draft-strategic-plan-2015',
    ),
  );

  content.documents.forEach((documentItem) => {
    if (documentItem.fileUrl) {
      assert.match(documentItem.fileUrl, /^\/documents\/.+\.pdf$/u);
      assert.ok(
        fs.existsSync(path.join(PUBLIC_DIRECTORY, documentItem.fileUrl)),
        `${documentItem.id} source file exists`,
      );
    }
    ['en', 'fr'].forEach((language) => {
      assert.ok(documentItem[language].title.trim());
      assert.ok(documentItem[language].description.trim());
      assert.ok(documentItem[language].dateLabel.trim());
      assert.ok(documentItem[language].languageLabel.trim());
    });
  });
});

test('legacy association-director roster is published as a migration snapshot', () => {
  const pages = ['association_directors.html'];
  const previouslyPublishedNames = [
    'John Leech',
    'Christian Marcotte',
    'Brian McDonnell',
  ];

  pages.forEach((fileName) => {
    const html = fs.readFileSync(path.join(PUBLIC_DIRECTORY, fileName), 'utf8');
    assert.doesNotMatch(html, /name="robots" content="noindex"/u);
    assert.match(html, /data-page-i18n="snapshotBody"/u);
  });

  const combined = pages
    .map((fileName) =>
      fs.readFileSync(path.join(PUBLIC_DIRECTORY, fileName), 'utf8'),
    )
    .join('\n');
  previouslyPublishedNames.forEach((name) =>
    assert.match(combined, new RegExp(name, 'u')),
  );
});

test('appointment policy source documents are publicly linked for review', () => {
  const publicSources = [
    'document-library.html',
    'document-library.js',
    'branch_policies.html',
    'page-content/document-library.json',
    'page-content/branch-policies.json',
  ].map((fileName) =>
    fs.readFileSync(path.join(PUBLIC_DIRECTORY, fileName), 'utf8'),
  );

  const combined = publicSources.join('\n');
  assert.match(combined, /ce-branch-colonel-commandant-sop-2020\.pdf/u);
  assert.match(combined, /ce-branch-honorary-appointments-sop-2020\.pdf/u);
});
