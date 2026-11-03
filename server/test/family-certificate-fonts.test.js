const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { PDFDocument, PDFName, decodePDFRawStream } = require('pdf-lib');
const {
  FONT_RESOURCES,
  embedFamilyFonts,
} = require('../scripts/embed-family-certificate-fonts');
const {
  FAMILY_TEMPLATE_PATH,
  generateFamilyCertificate,
} = require('../services/certificate-documents');
const { familyRequest } = require('./helpers/certificate-document');

function descriptor(font) {
  const children = font.get(PDFName.of('DescendantFonts'));
  return children
    ? font
        .lookup(PDFName.of('DescendantFonts'))
        .lookup(0)
        .lookup(PDFName.of('FontDescriptor'))
    : font.lookup(PDFName.of('FontDescriptor'));
}
function assertEmbeddedResources(document, resources) {
  const fonts = resources.lookup(PDFName.of('Font'));
  for (const [, ref] of fonts.entries()) {
    const font = document.context.lookup(ref);
    if (font.get(PDFName.of('BaseFont'))?.toString() === '/Helvetica') continue; // Standard PDF spacing font.
    const details = descriptor(font);
    assert.ok(
      ['FontFile', 'FontFile2', 'FontFile3'].some((key) =>
        details.has(PDFName.of(key)),
      ),
      font.toString(),
    );
  }
  if (resources.has(PDFName.of('XObject')))
    for (const [, ref] of resources.lookup(PDFName.of('XObject')).entries()) {
      const object = document.context.lookup(ref);
      if (object.dict?.has(PDFName.of('Resources')))
        assertEmbeddedResources(
          document,
          object.dict.lookup(PDFName.of('Resources')),
        );
    }
}
test('legacy family letter fragments carry the exact full approved font bytes, not viewer fallback', async () => {
  const document = await PDFDocument.load(await readFile(FAMILY_TEMPLATE_PATH));
  const resources = document.getPage(0).node.Resources();
  assertEmbeddedResources(document, resources);
  const fonts = resources.lookup(PDFName.of('Font'));
  for (const [key, name] of Object.entries(FONT_RESOURCES)) {
    const font = fonts.lookup(PDFName.of(key));
    assert.equal(
      font.get(PDFName.of('Encoding')).toString(),
      '/WinAnsiEncoding',
    );
    const bytes = Buffer.from(
      decodePDFRawStream(
        descriptor(font).lookup(PDFName.of('FontFile2')),
      ).decode(),
    );
    const file = name === 'BellMTItalic' ? 'bellmtitalic.ttf' : 'bellmt.ttf';
    assert.deepEqual(
      bytes,
      await readFile(
        path.join(path.dirname(FAMILY_TEMPLATE_PATH), 'fonts', file),
      ),
    );
  }
});
test('ordinary and long accented output retains embedded static fragments and generated name/wording/date fonts', async () => {
  for (const [name, relation] of [
    ['Camille Bélanger', 'grandfather'],
    ['Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque', 'granddaughter'],
  ]) {
    const request = familyRequest();
    request.member.dwdDate = '2028-02-29';
    request.familyMembers[0].fullName = name;
    request.familyMembers[0].memberRelationshipToRecipient = relation;
    const document = await PDFDocument.load(
      await generateFamilyCertificate(request, 0),
    );
    assertEmbeddedResources(document, document.getPage(0).node.Resources());
    assert.equal(document.getForm().getFields().length, 0);
  }
});
test('font repair refuses unknown source bytes', async () => {
  await assert.rejects(
    embedFamilyFonts(Buffer.from('unknown'), {}),
    /Unknown family master/,
  );
});
