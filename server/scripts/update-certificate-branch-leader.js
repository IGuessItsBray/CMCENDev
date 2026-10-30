// One-time, source-hash-locked preparation for the approved certificate masters.
// Removes the previous leader's actual drawing operations, never covers them.
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument, PDFName, PDFRef, decodePDFRawStream } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const sharp = require('sharp');
const LEADER_NAME = 'Major-General Justin P. Thibert, CD';
const SIGNATURE_SHA256 =
  '91714758c3df914c4440c061717d06465cf05077130a6895e6a9fb599edb5f22';
const RECIPES = Object.freeze({
  'retirement-member.pdf': {
    sha: 'ab29b73b51a4342631e84c123472f60f8b80901139007a6aa1e6a7923d1268b1',
    oldFont: 'FXF3',
    textFont: 'F4+0',
    signatureMatrix: '126 0 0 40.696 153.771 163.323',
    x: 205.118,
    y: 158.78,
    size: 12,
    signatureX: 150.621,
    signatureY: 168,
    signatureWidth: 132.3,
    chiefX: 569.544,
    chiefY: 158.883,
  },
  'retirement-family.pdf': {
    sha: '5fffafa476db9c4e69c6d9988459c9d184499fedd850b87e507f49b8b78d9864',
    oldFont: 'FXF6',
    textFont: 'F2+0',
    signatureMatrix: '126 0 0 40.696 160.5 167',
    x: 211.847,
    y: 163,
    size: 12,
    signatureX: 176.25,
    signatureY: 172,
    signatureWidth: 94.5,
    chiefX: 568.494,
    chiefY: 162.25,
  },
  'trusted-to-serve-master.pdf': {
    sha: '93e03bd0fcb7e702defddb36c96d16c68011e5c8d70e0115206fdff68c569a36',
    x: 237.305,
    y: 122.59,
    size: 9.96,
    signatureX: 178.12,
    signatureY: 128.8,
    signatureWidth: 90.3,
  },
});
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function replaceExactly(source, pattern, replacement, expected = 1) {
  let count = 0;
  const result = source.replace(pattern, (...args) => {
    count++;
    return typeof replacement === 'function'
      ? replacement(...args)
      : replacement;
  });
  if (count !== expected)
    throw new Error('Signatory preparation recipe no longer matches.');
  return result;
}
async function updateLeaderMaster(filename, bytes, signatureBytes, fontBytes) {
  const recipe = RECIPES[filename];
  if (!recipe || digest(bytes) !== recipe.sha)
    throw new Error('Unapproved certificate master; signatory update refused.');
  if (digest(signatureBytes) !== SIGNATURE_SHA256)
    throw new Error('Unapproved branch leader signature; update refused.');
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  if (document.getPageCount() !== 1)
    throw new Error('Unexpected certificate page count.');
  const page = document.getPage(0),
    oldRef = page.node.get(PDFName.of('Contents'));
  if (!(oldRef instanceof PDFRef))
    throw new Error('Unexpected certificate content representation.');
  let source = Buffer.from(
    decodePDFRawStream(document.context.lookup(oldRef)).decode(),
  ).toString('latin1');
  if (filename === 'trusted-to-serve-master.pdf') {
    source = replaceExactly(
      source,
      /\/Span <<\/MCID (?:43|44|45|46|47)\/Lang \(fr-CA\)>> BDC q[\s\S]*?\bEMC\b/gu,
      '',
      5,
    );
    source = replaceExactly(
      source,
      /\/P <<\/MCID 55>> BDC q[\s\S]*?\/Image45 Do Q\s*EMC/gu,
      '',
    );
    const resources = page.node.Resources().lookup(PDFName.of('XObject'));
    const imageRef = resources.get(PDFName.of('Image45'));
    if (!(imageRef instanceof PDFRef))
      throw new Error('Expected previous leader signature image.');
    const maskRef = resources
      .lookup(PDFName.of('Image45'))
      .dict.get(PDFName.of('SMask'));
    resources.delete(PDFName.of('Image45'));
    document.context.delete(imageRef);
    if (maskRef instanceof PDFRef) document.context.delete(maskRef);
  } else {
    let removed = 0;
    source = source.replace(
      /q\s+([-\d.\s]+) cm\s+BI([\s\S]*?)~>\s*EI\s+Q/gu,
      (block, matrix, body) => {
        if (matrix.trim() !== recipe.signatureMatrix) return block;
        if (
          !body.startsWith(' /CS /RGB /BPC 8 /F[ /A85 /Fl] /W 1361 /H 506 ID')
        )
          throw new Error('Unexpected old signature image.');
        removed++;
        return '';
      },
    );
    if (removed !== 1)
      throw new Error('Expected exactly one previous leader signature.');
    const escaped = recipe.textFont.replace('+', '\\+');
    source = replaceExactly(
      source,
      new RegExp(
        `/${recipe.oldFont} 12 Tf \\(Major\\)Tj /${escaped} 12 Tf \\[\\(-\\)[\\s\\S]*?\\]TJ`,
        'gu',
      ),
      (block) => {
        if (!block.includes('Yarker'))
          throw new Error('Expected previous leader name.');
        return `/${recipe.textFont} 12 Tf`;
      },
    );
  }
  if (filename === 'retirement-member.pdf') {
    // Original FXF2 Bell MT fragments are unembedded and trigger viewer font
    // substitution; remove their text, preserving surrounding line positions.
    source = replaceExactly(
      source,
      /0 0 0 1 548\.342 158\.883 Tm[\s\S]*?\bET\b/gu,
      'ET',
    );
    source = replaceExactly(
      source,
      /BT 437\.993 159\.427 Td[\s\S]*?\bET\b/gu,
      '',
    );
  } else if (filename === 'retirement-family.pdf') {
    source = replaceExactly(
      source,
      /-43\.524 -14 Td \/FXF6 12 Tf \[[\s\S]*?\]TJ/gu,
      '-43.524 -14 Td /F2+0 12 Tf',
    );
    source = replaceExactly(
      source,
      /54\.6 -14 Td \[[\s\S]*?\]TJ/gu,
      '54.6 -14 Td',
    );
    source = replaceExactly(
      source,
      /3\.74408 -14 Td \/F2\+0 12 Tf \[[\s\S]*?\]TJ/gu,
      '3.74408 -14 Td /F2+0 12 Tf',
    );
  }
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  // Crop only empty/near-transparent padding from this exact approved PNG.
  // Original supplied PNG remains unchanged as the private source asset.
  const png = await sharp(signatureBytes)
    .extract({ left: 21, top: 267, width: 1498, height: 496 })
    .png()
    .toBuffer();
  const image = await document.embedPng(png);
  page.node.setFontDictionary(PDFName.of('BranchLeaderName'), font.ref);
  page.node.setXObject(PDFName.of('BranchLeaderSignature'), image.ref);
  const x = recipe.x - font.widthOfTextAtSize(LEADER_NAME, recipe.size) / 2;
  const height = (recipe.signatureWidth * 496) / 1498;
  source += `\nq\nBT /BranchLeaderName ${recipe.size} Tf 0 g 1 0 0 1 ${x} ${recipe.y} Tm ${font.encodeText(LEADER_NAME)} Tj ET\nQ\nq ${recipe.signatureWidth} 0 0 ${height} ${recipe.signatureX} ${recipe.signatureY} cm /BranchLeaderSignature Do Q\n`;
  if (recipe.chiefX !== undefined) {
    page.node.setFontDictionary(PDFName.of('BranchChiefText'), font.ref);
    const lines = [
      'Chief Warrant Officer Renay Groves, MSM, CD',
      'Branch Chief Warrant Officer',
      'Adjudant-chef de la Branche',
    ];
    lines.forEach((line, index) => {
      const left = recipe.chiefX - font.widthOfTextAtSize(line, 12) / 2;
      source += `\nq\nBT /BranchChiefText 12 Tf 0 g 1 0 0 1 ${left} ${recipe.chiefY - index * 14} Tm ${font.encodeText(line)} Tj ET\nQ\n`;
    });
  }
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(
      document.context.flateStream(Buffer.from(source, 'latin1')),
    ),
  );
  // Do not serialize inactive old content or signature bytes into the new PDF.
  document.context.delete(oldRef);
  document.setModificationDate(new Date('2026-10-30T00:00:00.000Z'));
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
}
if (require.main === module) {
  (async () => {
    const [sourceDirectory, outputDirectory] = process.argv.slice(2);
    if (
      !sourceDirectory ||
      !outputDirectory ||
      path.resolve(sourceDirectory) === path.resolve(outputDirectory)
    )
      throw new Error('Provide distinct source and output directories.');
    const assetRoot = path.join(__dirname, '../private/certificates');
    const signature = await readFile(
      path.join(assetRoot, 'branch-leader-signature.png'),
    );
    const font = await readFile(path.join(assetRoot, 'fonts/bellmt.ttf'));
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    for (const filename of Object.keys(RECIPES)) {
      const output = await updateLeaderMaster(
        filename,
        await readFile(path.join(sourceDirectory, filename)),
        signature,
        font,
      );
      await writeFile(path.join(outputDirectory, filename), output, {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(filename, digest(output));
    }
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { LEADER_NAME, SIGNATURE_SHA256, RECIPES, updateLeaderMaster };
