// Bounded source repair: the legacy family PDF uses unembedded Bell MT fonts
// for a few visible letter fragments and spacing. Preserve simple-font encoding,
// widths and every drawing operation; embed the matching approved full fonts.
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument, PDFName } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const SOURCE_SHA256 =
  '61c3f6431094163d1a11b00347b0420d1d16d52ac31d4aa3b976674609517a35';
const FONT_RESOURCES = Object.freeze({
  FXF1: 'BellMTItalic',
  FXF3: 'BellMT',
  FXF4: 'BellMTItalic',
  FXF5: 'BellMTItalic',
  FXF6: 'BellMT',
});
async function embedFamilyFonts(bytes, fontBytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== SOURCE_SHA256)
    throw new Error('Unknown family master; font repair refused.');
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = document
    .getPage(0)
    .node.Resources()
    .lookup(PDFName.of('Font'));
  const files = {};
  for (const name of ['BellMT', 'BellMTItalic']) {
    const font = fontkit.create(fontBytes[name]);
    if (
      font.postscriptName !== name ||
      [...'hesbf éèàçœ’'].some(
        (char) => !font.hasGlyphForCodePoint(char.codePointAt(0)),
      )
    )
      throw new Error(
        'The approved font identity or glyph coverage does not match.',
      );
    files[name] = document.context.register(
      document.context.flateStream(fontBytes[name], {
        Length1: fontBytes[name].length,
      }),
    );
  }
  for (const [key, name] of Object.entries(FONT_RESOURCES)) {
    const font = resources.lookup(PDFName.of(key));
    const descriptor = font.lookup(PDFName.of('FontDescriptor'));
    if (
      font.get(PDFName.of('BaseFont')).toString() !== `/${name}` ||
      font.get(PDFName.of('Encoding')).toString() !== '/WinAnsiEncoding' ||
      descriptor.has(PDFName.of('FontFile2'))
    )
      throw new Error('Legacy family font resources no longer match.');
    descriptor.set(PDFName.of('FontFile2'), files[name]);
  }
  document.setModificationDate(new Date('2026-11-02T00:00:00.000Z'));
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
}
if (require.main === module) {
  (async () => {
    const [source, output] = process.argv.slice(2);
    if (!source || !output || path.resolve(source) === path.resolve(output))
      throw new Error('Provide distinct source/output paths.');
    const fonts = path.join(__dirname, '../private/certificates/fonts');
    const result = await embedFamilyFonts(await readFile(source), {
      BellMT: await readFile(path.join(fonts, 'bellmt.ttf')),
      BellMTItalic: await readFile(path.join(fonts, 'bellmtitalic.ttf')),
    });
    await writeFile(output, result, { flag: 'wx', mode: 0o600 });
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { SOURCE_SHA256, FONT_RESOURCES, embedFamilyFonts };
