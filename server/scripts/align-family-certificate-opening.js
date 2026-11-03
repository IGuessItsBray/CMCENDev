// One-time adjustment of the two original French opening lines. Keep their
// encoded glyphs/font and all other drawing operations unchanged.
const { readFile, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { PDFDocument, PDFName, decodePDFRawStream } = require('pdf-lib');
const SOURCE_SHA256 =
  'dbecba8d4b06277dcbd94a40d7b5f02b46e4a2a37f195c6295447932a85d7bb9';
async function alignFamilyOpening(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== SOURCE_SHA256)
    throw new Error('Unknown family master; alignment refused.');
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = document.getPage(0),
    old = page.node.get(PDFName.of('Contents'));
  const source = Buffer.from(
    decodePDFRawStream(document.context.lookup(old)).decode(),
  ).toString('latin1');
  const pattern =
    /1 0 0 1 494\.717 360 Tm (\/F5\+0 11 Tf \[.*?\]TJ) 6\.58356 -14 Td (\[.*?\]TJ)/gu;
  let matches = 0;
  const aligned = source.replace(pattern, (_, first, second) => {
    matches++;
    // PDFKit measured original centers: 580.042 and 577.803 pt. The body
    // column's final line centers at 569.44 pt. Preserve both baselines.
    return `1 0 0 1 484.115 360 Tm ${first} 8.822 -14 Td ${second}`;
  });
  if (matches !== 1)
    throw new Error('French opening layout no longer matches.');
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(
      document.context.flateStream(Buffer.from(aligned, 'latin1')),
    ),
  );
  document.context.delete(old);
  document.setModificationDate(new Date('2026-11-02T00:00:00.000Z'));
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
}
if (require.main === module) {
  (async () => {
    const [source, output] = process.argv.slice(2);
    if (!source || !output || source === output)
      throw new Error('Provide distinct source/output paths.');
    await writeFile(output, await alignFamilyOpening(await readFile(source)), {
      flag: 'wx',
      mode: 0o600,
    });
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { alignFamilyOpening, SOURCE_SHA256 };
