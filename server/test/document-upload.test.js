const assert = require('node:assert/strict');
const test = require('node:test');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const {
  validatePdf,
  MAX_DOCUMENT_BYTES,
} = require('../services/document-upload');

async function fixture(change = () => {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  pdf.setAuthor('Private author');
  await change(pdf, page);
  return Buffer.from(await pdf.save());
}

test('accepts static newsletters and safe links, preserves page geometry and removes document info', async () => {
  const source = await fixture((pdf, page) => {
    const action = pdf.context.register(
      pdf.context.obj({
        S: 'URI',
        URI: PDFString.of('https://example.test/newsletter'),
      }),
    );
    page.node.set(
      PDFName.of('Annots'),
      pdf.context.obj([
        { Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 20, 20], A: action },
      ]),
    );
  });
  const result = await validatePdf(source);
  assert.equal(result.pages, 1);
  const pdf = await PDFDocument.load(result.buffer, { updateMetadata: false });
  assert.equal(pdf.getAuthor(), undefined);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 600, height: 800 });
  assert.ok(pdf.getPage(0).node.Annots());
});

test('rejects invalid, oversized and active-content PDFs before storage', async () => {
  for (const source of [
    Buffer.from('<script>bad</script>'),
    Buffer.from('%PDF-1.7\nfake'),
    Buffer.alloc(MAX_DOCUMENT_BYTES + 1),
  ])
    await assert.rejects(validatePdf(source), { status: 422 });
  for (const modify of [
    (pdf) => pdf.addJavaScript('bad', 'app.alert("bad")'),
    (pdf) => pdf.getForm().createTextField('field'),
    (pdf) => pdf.attach(Buffer.from('embedded'), 'file.txt'),
    (pdf, page) => page.node.set(PDFName.of('AA'), pdf.context.obj({})),
    (pdf, page) =>
      page.node.set(
        PDFName.of('Annots'),
        pdf.context.obj([
          {
            Type: 'Annot',
            Subtype: 'Link',
            A: { S: 'URI', URI: PDFString.of('file:///etc/passwd') },
          },
        ]),
      ),
    (pdf, page) => {
      const action = pdf.context.register(
        pdf.context.obj({ S: 'SetOCGState' }),
      );
      page.node.set(
        PDFName.of('Annots'),
        pdf.context.obj([{ Type: 'Annot', Subtype: 'Link', A: action }]),
      );
    },
  ])
    await assert.rejects(validatePdf(await fixture(modify)), { status: 422 });
});

test('rejects encrypted PDFs and excessive page counts', async () => {
  const encrypted = await fixture((pdf) => {
    pdf.context.trailerInfo.Encrypt = pdf.context.register(
      pdf.context.obj({ Filter: 'Standard' }),
    );
  });
  await assert.rejects(validatePdf(encrypted), { status: 422 });
  const tooMany = await fixture((pdf) => {
    for (let i = 1; i < 501; i++) pdf.addPage();
  });
  await assert.rejects(validatePdf(tooMany), { status: 422 });
});
