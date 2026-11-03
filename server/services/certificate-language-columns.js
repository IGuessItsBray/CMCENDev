const { createHash } = require('node:crypto');
const {
  PDFName,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} = require('pdf-lib');

// Only the approved retirement content streams are supported. This is a bounded
// transformation, not a general PDF editor. Columns retain their glyphs;
// only the two requested French signatory rank prefixes are rebuilt. Nothing is
// mirrored, clipped, rasterized or covered.
const LAYOUTS = {
  member: {
    hash: '4bc4adec7e63031ddf186168663cb1c95adf882d57784af63288c9b115797f43',
    bands: [
      [430, 515, 360],
      [385, 415, 234.7975],
      [220, 315, 360],
    ],
    fields: { 'date-en': 360, 'date-fr': -360 },
    signatories: [
      [205.118, 158.78],
      [569.544, 158.883],
    ],
    titlesEn: [
      [171.891, 130.237, 144.883],
      [159.40997, 144.780003, 130.883],
    ],
    titlesFr: [
      [171.891, 130.237, 130.883],
      [159.40997, 144.780003, 144.883],
      [496.5391171875, 144.883, 130.883],
      [500.292046875, 130.883, 144.883],
    ],
  },
  family: {
    hash: 'ea97b988ef61885e01221cb2b39ced59eec35ac54c38fdd791742208479236d9',
    bands: [
      [430, 515, 360],
      [245, 375, 360],
    ],
    fields: { adj_en: 360, adj_fr: -360 },
    signatories: [
      [211.847, 163],
      [568.494, 162.25],
    ],
    titlesEn: [
      [178.62, 134.25, 148.25],
      [166.13897, 149, 134.25],
    ],
    titlesFr: [
      [178.62, 134.25, 134.25],
      [166.13897, 149, 148.25],
      [495.4891171875, 148.25, 134.25],
      [499.242046875, 134.25, 148.25],
    ],
  },
};

// Preserve operands verbatim, including nested strings/arrays and inline image
// bytes. The approved masters use ASCII85 inline images and Tm/Td positioning.
function positionEdits(source, bands, titleMoves) {
  let at = 0,
    matrix = [1, 0, 0, 1, 0, 0],
    shift = [0, 0];
  const matchedTitles = new Set();
  const edits = [],
    operands = [];
  const whitespace = /[\0\t\n\f\r ]/u;
  const delimiter = /[\0\t\n\f\r ()<>\[\]{}/%]/u;
  function skip() {
    while (at < source.length) {
      if (whitespace.test(source[at])) at++;
      else if (source[at] === '%') {
        while (at < source.length && !/[\r\n]/u.test(source[at])) at++;
      } else break;
    }
  }
  function token() {
    skip();
    const start = at,
      first = source[at++];
    let object = false;
    if (first === '(') {
      object = true;
      let depth = 1;
      while (at < source.length && depth) {
        const c = source[at++];
        if (c === '\\') at++;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      if (depth) throw new Error('Unterminated certificate string.');
    } else if (first === '[' || (first === '<' && source[at] === '<')) {
      object = true;
      const end = first === '[' ? ']' : '>>';
      if (first === '<') at++;
      while (at < source.length) {
        skip();
        if (source.startsWith(end, at)) {
          at += end.length;
          break;
        }
        token();
      }
    } else if (first === '<') {
      object = true;
      const end = source.indexOf('>', at);
      if (end < 0) throw new Error('Unterminated certificate hex string.');
      at = end + 1;
    } else {
      if (first === '/') object = true;
      while (at < source.length && !delimiter.test(source[at])) at++;
    }
    const raw = source.slice(start, at);
    return {
      start,
      end: at,
      raw,
      object: object || /^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(raw),
    };
  }
  const offset = (m) => {
    const title = titleMoves.findIndex(
      ([x, y]) => Math.abs(m[4] - x) < 0.00001 && Math.abs(m[5] - y) < 0.00001,
    );
    if (title >= 0) {
      matchedTitles.add(title);
      return [0, titleMoves[title][2] - m[5]];
    }
    const band = bands.find(([bottom, top]) => m[5] >= bottom && m[5] <= top);
    return [band ? (m[4] < 396 ? band[2] : -band[2]) : 0, 0];
  };
  const textMatrix = (m, [dx, dy]) =>
    m
      .map((n, i) => Number((n + (i === 4 ? dx : i === 5 ? dy : 0)).toFixed(6)))
      .join(' ') + ' Tm';
  while (at < source.length) {
    skip();
    if (at >= source.length) break;
    const current = token();
    if (current.object) {
      operands.push(current);
      continue;
    }
    if (current.raw === 'BI') {
      const image = /~>\s*EI\b/u.exec(source.slice(at));
      if (!image || !source.slice(at, at + 150).includes('/A85'))
        throw new Error('Unsupported certificate inline image.');
      at += image.index + image[0].length;
    } else if (current.raw === 'BT') {
      matrix = [1, 0, 0, 1, 0, 0];
      shift = [0, 0];
    } else if (['Tm', 'Td', 'TD'].includes(current.raw)) {
      const values = operands.map((item) => Number(item.raw));
      if (
        values.some((n) => !Number.isFinite(n)) ||
        values.length !== (current.raw === 'Tm' ? 6 : 2)
      )
        throw new Error('Unsupported certificate text position.');
      if (current.raw === 'Tm') matrix = values;
      else {
        const [x, y] = values,
          [a, b, c, d, e, f] = matrix;
        matrix = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
      }
      const next = offset(matrix);
      if (
        current.raw === 'Tm'
          ? next.some((value) => value !== 0)
          : next.some((value, index) => value !== shift[index])
      ) {
        edits.push({
          start: operands[0].start,
          end: current.end,
          text:
            (current.raw === 'TD' ? `${-values[1]} TL\n` : '') +
            textMatrix(matrix, next),
        });
      }
      shift = next;
    } else if (['T*', "'", '"'].includes(current.raw)) {
      throw new Error('Unsupported certificate text positioning operator.');
    }
    operands.length = 0;
  }
  if (!edits.length || matchedTitles.size !== titleMoves.length)
    throw new Error(
      'The approved certificate title positions no longer match.',
    );
  for (const edit of edits.reverse())
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

function applyRetirementLanguageLayout(
  document,
  kind,
  language,
  signatoryFont,
) {
  const layout = LAYOUTS[kind];
  if (
    !layout ||
    !['en', 'fr'].includes(language) ||
    document.getPageCount() !== 1
  )
    throw new Error('Unsupported certificate language layout.');
  const page = document.getPage(0),
    contents = page.node.Contents();
  const references =
    contents instanceof PDFArray
      ? contents.asArray()
      : [page.node.get(PDFName.of('Contents'))];
  const matches = references
    .map((reference, index) => {
      const stream = document.context.lookup(reference);
      if (!(stream instanceof PDFRawStream)) return null;
      const bytes = Buffer.from(decodePDFRawStream(stream).decode());
      return createHash('sha256').update(bytes).digest('hex') === layout.hash
        ? { reference, index, bytes }
        : null;
    })
    .filter(Boolean);
  if (matches.length !== 1)
    throw new Error('Unapproved bilingual certificate content.');
  const { reference: previous, index, bytes } = matches[0];
  let source = positionEdits(
    bytes.toString('latin1'),
    language === 'fr' ? layout.bands : [],
    language === 'fr' ? layout.titlesFr : layout.titlesEn,
  );
  // Names, post-nominals, 12 pt Bell MT styling and line centers/baselines stay
  // fixed. Published sources for these French rank forms are in CONFIG.md.
  for (const [index, [resource, text]] of (language === 'fr'
    ? [
        ['BranchLeaderName', 'Major-général Justin P. Thibert, CD'],
        ['BranchChiefText', 'Adjudante-chef Renay Groves, MSM, CD'],
      ]
    : []
  ).entries()) {
    if (
      [...text].some(
        (char) =>
          !signatoryFont.getCharacterSet().includes(char.codePointAt(0)),
      )
    )
      throw new Error('The signatory font lacks a required French glyph.');
    const [center, y] = layout.signatories[index];
    const x = center - signatoryFont.widthOfTextAtSize(text, 12) / 2;
    const pattern = new RegExp(
      `BT /${resource} 12 Tf 0 g 1 0 0 1 [-\\d.]+ ${String(y).replace('.', '\\.')} Tm <[\\da-f]+> Tj ET`,
      'giu',
    );
    let count = 0;
    source = source.replace(pattern, () => {
      count++;
      return `BT /FrenchSignatoryNames 12 Tf 0 g 1 0 0 1 ${x} ${y} Tm ${signatoryFont.encodeText(text)} Tj ET`;
    });
    if (count !== 1)
      throw new Error('The approved signatory name line no longer matches.');
  }
  if (language === 'fr')
    page.node.setFontDictionary(
      PDFName.of('FrenchSignatoryNames'),
      signatoryFont.ref,
    );
  const updated = document.context.register(
    document.context.flateStream(Buffer.from(source, 'latin1')),
  );
  if (contents instanceof PDFArray) contents.set(index, updated);
  else page.node.set(PDFName.of('Contents'), updated);
  document.context.delete(previous);
  for (const [field, dx] of Object.entries(
    language === 'fr' ? layout.fields : {},
  )) {
    for (const widget of document
      .getForm()
      .getTextField(field)
      .acroField.getWidgets()) {
      const rectangle = widget.getRectangle();
      widget.setRectangle({ ...rectangle, x: rectangle.x + dx });
    }
  }
}
module.exports = { applyRetirementLanguageLayout };
