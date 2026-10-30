const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const {
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} = require('pdf-lib');
const sharp = require('sharp');
const {
  LEADER_NAME,
  SIGNATURE_SHA256,
  RECIPES,
  updateLeaderMaster,
} = require('../scripts/update-certificate-branch-leader');
const root = path.join(__dirname, '../private/certificates');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('all masters print the approved leader, use the supplied signature pixels and preserve the other signatory', async () => {
  const signature = await readFile(
    path.join(root, 'branch-leader-signature.png'),
  );
  assert.equal(sha(signature), SIGNATURE_SHA256);
  const cropped = await sharp(signature)
    .extract({ left: 21, top: 267, width: 1498, height: 496 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const alpha = await sharp(signature)
    .extract({ left: 21, top: 267, width: 1498, height: 496 })
    .extractChannel('alpha')
    .raw()
    .toBuffer();
  for (const filename of Object.keys(RECIPES)) {
    const document = await PDFDocument.load(
      await readFile(path.join(root, filename)),
    );
    assert.equal(document.getPageCount(), 1);
    const page = document.getPage(0);
    const content = Buffer.from(
      decodePDFRawStream(page.node.Contents()).decode(),
    ).toString('latin1');
    assert.match(content, /\/BranchLeaderSignature Do/u);
    const encoded = content.match(
      /\/BranchLeaderName [\s\S]*?<([0-9A-Fa-f]+)> Tj/u,
    )?.[1];
    assert.ok(encoded);
    const font = page.node
      .Resources()
      .lookup(PDFName.of('Font'))
      .lookup(PDFName.of('BranchLeaderName'));
    const cmap = Buffer.from(
      decodePDFRawStream(font.lookup(PDFName.of('ToUnicode'))).decode(),
    ).toString();
    const mapping = new Map(
      [...cmap.matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f]{4})>/giu)].map((m) => [
        m[1].toUpperCase(),
        String.fromCodePoint(parseInt(m[2], 16)),
      ]),
    );
    assert.equal(
      encoded
        .match(/.{4}/gu)
        .map((code) => mapping.get(code.toUpperCase()))
        .join(''),
      LEADER_NAME,
    );
    if (!filename.startsWith('trusted')) {
      const footerFont = page.node
        .Resources()
        .lookup(PDFName.of('Font'))
        .lookup(PDFName.of('BranchChiefText'));
      const descriptor = footerFont
        .lookup(PDFName.of('DescendantFonts'))
        .lookup(0)
        .lookup(PDFName.of('FontDescriptor'));
      assert.ok(
        descriptor.lookup(PDFName.of('FontFile2')) instanceof PDFRawStream,
        'Groves footer must use an embedded font, not viewer substitution',
      );
      const footer = [
        ...content.matchAll(/\/BranchChiefText [\s\S]*?<([0-9A-Fa-f]+)> Tj/gu),
      ].map((match) =>
        match[1]
          .match(/.{4}/gu)
          .map((code) => mapping.get(code.toUpperCase()))
          .join(''),
      );
      assert.deepEqual(footer, [
        'Chief Warrant Officer Renay Groves, MSM, CD',
        'Branch Chief Warrant Officer',
        'Adjudant-chef de la Branche',
      ]);
    }
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      if (
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')
      ) {
        const stream = Buffer.from(
          decodePDFRawStream(object).decode(),
        ).toString('latin1');
        assert.doesNotMatch(
          stream,
          /Yarker|\(Yark\)/u,
          'Old leader text must not remain in inactive streams',
        );
      }
    }
    const images = page.node.Resources().lookup(PDFName.of('XObject'));
    assert.equal(images.has(PDFName.of('Image45')), false);
    const image = images.lookup(PDFName.of('BranchLeaderSignature'));
    assert.equal(image.dict.get(PDFName.of('Width')).asNumber(), 1498);
    assert.equal(image.dict.get(PDFName.of('Height')).asNumber(), 496);
    assert.equal(
      Buffer.compare(Buffer.from(decodePDFRawStream(image).decode()), cropped),
      0,
    );
    const mask = document.context.lookup(image.dict.get(PDFName.of('SMask')));
    assert.equal(
      Buffer.compare(Buffer.from(decodePDFRawStream(mask).decode()), alpha),
      0,
    );
    const other = images.lookup(
      PDFName.of(filename.startsWith('trusted') ? 'Image47' : 'FXX1'),
    );
    assert.equal(
      sha(other.getContents()),
      filename.startsWith('trusted')
        ? 'd96053b568047e56bdd339cc2e1cfb29eb51a19d58df6b938605a6f966200198'
        : '8517cb5b49915feba7813a391ebcc3aeb2e4870e37239d9419f4ee1b5f8414a9',
    );
  }
});

test('one-time signatory preparation refuses unknown masters rather than editing arbitrary PDFs', async () => {
  await assert.rejects(
    updateLeaderMaster(
      'retirement-member.pdf',
      Buffer.from('unapproved'),
      Buffer.alloc(0),
      Buffer.alloc(0),
    ),
    /Unapproved certificate master/u,
  );
  await assert.rejects(
    updateLeaderMaster(
      'unknown.pdf',
      Buffer.alloc(0),
      Buffer.alloc(0),
      Buffer.alloc(0),
    ),
    /Unapproved certificate master/u,
  );
});
