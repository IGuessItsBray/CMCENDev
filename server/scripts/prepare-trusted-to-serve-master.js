// One-time preparation for ONE hash-verified official PowerPoint PDF export.
// This is not a general PDF text editor. Any source/layout change must receive
// a new reviewed recipe. Original source bytes are never modified.
const { readFile, writeFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { PDFDocument, PDFName, decodePDFRawStream } = require('pdf-lib');
const SOURCE_SHA256 =
  '3df6945e9a3408328c1ed4fb13e4bdb1e01ebf160573c427e2943373926e7282';

async function prepareMaster(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== SOURCE_SHA256)
    throw new Error('Unapproved award source PDF; preparation refused.');
  const document = await PDFDocument.load(bytes);
  if (
    document.getPageCount() !== 1 ||
    document.getPage(0).getWidth() !== 792.24 ||
    document.getPage(0).getHeight() !== 612
  )
    throw new Error('Unexpected award page dimensions.');
  const page = document.getPage(0);
  const contents = page.node.Contents();
  const source = Buffer.from(decodePDFRawStream(contents).decode()).toString(
    'latin1',
  );
  let seen = 0,
    removed = 0;
  let edited = source.replace(/\bBT\b[\s\S]*?\bET\b/gu, (block) => {
    seen++;
    const font = block.match(/\/(F\d+) [\d.]+ Tf/u)?.[1];
    if (!['F1', 'F2', 'F3', 'F4', 'F5'].includes(font))
      throw new Error('Unexpected award text font.');
    if (['F2', 'F3', 'F4'].includes(font)) {
      removed++;
      return '';
    }
    return block;
  });
  if (seen !== 83 || removed !== 67)
    throw new Error('Award text-removal recipe no longer matches.');
  // Remove the old recipient and date raster shadows themselves, including
  // their drawing operators AND resource references. No covering rectangles.
  for (const name of ['Image33', 'Image37', 'Image39', 'Image43']) {
    // Bound each match to a single artifact block, never adjacent artwork.
    const blocks = [
      ...edited.matchAll(/\/Artifact BMC q(?:(?!\bEMC\b)[\s\S])*?\bEMC\b/gu),
    ].filter((match) => match[0].includes('/' + name + ' Do'));
    if (blocks.length !== 1)
      throw new Error('Award shadow-removal recipe no longer matches.');
    edited = edited.replace(blocks[0][0], '');
    page.node
      .Resources()
      .lookup(PDFName.of('XObject'))
      .delete(PDFName.of(name));
  }
  for (const name of ['F2', 'F3', 'F4'])
    page.node.Resources().lookup(PDFName.of('Font')).delete(PDFName.of(name));
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(
      document.context.flateStream(Buffer.from(edited, 'latin1')),
    ),
  );
  page.node.delete(PDFName.of('Annots'));
  const output = await PDFDocument.create();
  const [copy] = await output.copyPages(document, [0]);
  output.addPage(copy);
  output.setTitle('Trusted to Serve fixed artwork master');
  output.setProducer('CMCEN');
  output.setCreationDate(new Date('2025-10-29T00:00:00.000Z'));
  output.setModificationDate(new Date('2025-10-29T00:00:00.000Z'));
  return Buffer.from(await output.save());
}

if (require.main === module) {
  (async () => {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination || source === destination)
      throw new Error(
        'Provide distinct original PDF and private master paths.',
      );
    await writeFile(destination, await prepareMaster(await readFile(source)), {
      flag: 'wx',
      mode: 0o600,
    });
    console.log('Prepared fixed artwork master. Original untouched.');
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { SOURCE_SHA256, prepareMaster };
