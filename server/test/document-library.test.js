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

  assert.equal(content.documents.length, 76);
  assert.ok(
    content.documents.some(
      (documentItem) =>
        documentItem.id === 'association-draft-strategic-plan-2015',
    ),
  );
  assert.equal(
    content.documents.filter((documentItem) =>
      documentItem.id.startsWith('ce-senate-'),
    ).length,
    15,
  );
  assert.equal(
    content.documents.filter((documentItem) =>
      documentItem.id.startsWith('ce-bac-'),
    ).length,
    15,
  );

  content.documents.forEach((documentItem) => {
    if (documentItem.fileKey) {
      assert.match(documentItem.fileKey, /^documents\/.+\.(pdf|docx)$/u);
    }
    if (documentItem.fileUrl) {
      if (documentItem.fileUrl.startsWith('https://')) {
        const url = new URL(documentItem.fileUrl);
        assert.equal(url.protocol, 'https:');
        assert.equal(url.hostname, 'cdn.corebot.ca');
        assert.match(url.pathname, /^\/[^/]+\/documents\/.+\.(pdf|docx)$/u);
      } else {
        assert.match(documentItem.fileUrl, /^\/documents\/.+\.(pdf|docx)$/u);
        assert.ok(
          fs.existsSync(path.join(PUBLIC_DIRECTORY, documentItem.fileUrl)),
          `${documentItem.id} source file exists`,
        );
      }
    }
    ['en', 'fr'].forEach((language) => {
      assert.ok(documentItem[language].title.trim());
      assert.ok(documentItem[language].description.trim());
      assert.ok(documentItem[language].dateLabel.trim());
      assert.ok(documentItem[language].languageLabel.trim());
    });
  });
});

test('document library labels Word source files accurately', () => {
  const content = JSON.parse(
    fs.readFileSync(
      path.join(PUBLIC_DIRECTORY, 'page-content', 'document-library.json'),
      'utf8',
    ),
  );
  const script = fs.readFileSync(
    path.join(PUBLIC_DIRECTORY, 'document-library.js'),
    'utf8',
  );

  assert.equal(content.en.library.downloadDocx, 'Download DOCX');
  assert.equal(content.fr.library.downloadDocx, 'Télécharger le DOCX');
  assert.match(script, /endsWith\("\.docx"\)/u);
});

test('appointment policy source documents remain available through the document library', () => {
  const content = JSON.parse(
    fs.readFileSync(
      path.join(PUBLIC_DIRECTORY, 'page-content/document-library.json'),
      'utf8',
    ),
  );
  for (const id of [
    'colonel-commandant-nomination-2020',
    'honorary-appointments-2020',
  ]) {
    const document = content.documents.find((item) => item.id === id);
    assert.ok(document, `${id} is discoverable in the library`);
    assert.match(
      document.fileKey || document.fileUrl,
      /\.pdf$/u,
      `${id} retains its source PDF link`,
    );
  }
});
