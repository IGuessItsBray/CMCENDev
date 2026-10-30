const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const sharp = require('sharp');
const {
  CertificateDocumentError,
  loadCertificateFont,
} = require('./certificate-documents');
const { BODY_EN, BODY_FR, FR_GRAMMAR } = require('../config/trusted-to-serve');
const { certificateFontPath } = require('../config/certificate-fonts');
const {
  catalogue: ranks,
  abbreviation: abbreviateRank,
} = require('../public/person-rank-options');
const MASTER_PATH = path.join(
  __dirname,
  '../private/certificates/trusted-to-serve-master.pdf',
);
const MASTER_SHA256 =
  '5c2e17d8997c2f54c76db75c9a139859a54a82e192d17941d3040e64a9370a6e';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function invalid(message, code = 'award_data_invalid') {
  throw new CertificateDocumentError(code, message);
}
function text(value, max, label) {
  if (typeof value !== 'string') invalid(`${label} is required.`);
  const result = value.trim().normalize('NFC');
  if (!result || result.length > max || /[\p{Cc}\p{Cf}]/u.test(result))
    invalid(`${label} is invalid.`);
  return result;
}
function getTrustedToServeData(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          'firstName',
          'lastName',
          'postNominals',
          'fullRankEn',
          'rankEn',
          'rankFr',
          'presentationDate',
          'frPronoun',
          'frRankGrammar',
          'reviewed',
        ].includes(key),
    )
  )
    invalid('The award certificate input is invalid.');
  const firstName = text(input.firstName, 100, 'First name');
  const lastName = text(input.lastName, 100, 'Last name');
  const postNominals =
    input.postNominals === undefined ||
    (typeof input.postNominals === 'string' && !input.postNominals.trim())
      ? ''
      : text(input.postNominals, 120, 'Post-nominals');
  const fullRankEn = ranks.find((rank) => rank.en === input.fullRankEn)?.en;
  if (!fullRankEn) invalid('Choose the full rank for the large name display.');
  const rankEn = text(input.rankEn, 40, 'English rank');
  const rankFr = text(input.rankFr, 40, 'French rank');
  if (
    !['il', 'elle'].includes(input.frPronoun) ||
    !Object.hasOwn(FR_GRAMMAR, input.frRankGrammar || '')
  )
    invalid(
      'Choose and review the French pronoun and rank grammar.',
      'award_wording_required',
    );
  const iso = input.presentationDate;
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(iso))
    invalid('A presentation date is required.');
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    invalid('The presentation date is invalid.');
  if (input.reviewed !== undefined && typeof input.reviewed !== 'boolean')
    invalid('The award review confirmation is invalid.');
  const recipientEn = `${rankEn} ${lastName}`,
    recipientFr = `${rankFr} ${lastName}`;
  const grammar = FR_GRAMMAR[input.frRankGrammar];
  const variables = {
    recipientEn,
    recipientFr,
    pronoun: input.frPronoun === 'il' ? 'Il' : 'Elle',
    contributionRecipient: grammar.contribution + recipientFr,
    futureLeader:
      input.frPronoun === 'il' ? 'un futur leader' : 'une future leader',
  };
  const render = (source) =>
    source.replace(/\{(\w+)\}/gu, (_, key) => variables[key]);
  return {
    firstName,
    lastName,
    postNominals,
    fullRankEn,
    rankEn,
    rankFr,
    isoDate: iso,
    frPronoun: input.frPronoun,
    frRankGrammar: input.frRankGrammar,
    bodyEn: render(BODY_EN),
    bodyFr: render(BODY_FR),
    abbreviatedHeadline: `${abbreviateRank(fullRankEn, 'en')} ${firstName} ${lastName}${postNominals ? `, ${postNominals}` : ''}`,
    headline: `${fullRankEn} ${firstName} ${lastName}${postNominals ? `, ${postNominals}` : ''}`,
    dedicationEn: recipientEn,
    dedicationFr: `Décerné ${grammar.dedication}${recipientFr}`,
    date: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`,
  };
}

function linesFor(text, font, size, width) {
  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/u)) {
    if (font.widthOfTextAtSize(word, size) > width) return null;
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function planAwardText(data, fonts) {
  for (const value of [
    data.bodyEn,
    data.bodyFr,
    data.dedicationEn,
    data.dedicationFr,
  ]) {
    if (
      Array.from(value).some(
        (character) =>
          !fonts.body.getCharacterSet().includes(character.codePointAt(0)),
      )
    )
      invalid('The award font cannot represent every character.');
  }
  for (const value of [data.headline, data.date]) {
    if (
      Array.from(value).some(
        (character) =>
          !fonts.script.getCharacterSet().includes(character.codePointAt(0)),
      )
    )
      invalid('The award font cannot represent every character.');
  }
  const plans = [];
  let found = false;
  for (let size = 9.96; size >= 8.79; size -= 0.12) {
    const leading = (12 * size) / 9.96;
    const en = linesFor(data.bodyEn, fonts.body, size, 259.128);
    const fr = linesFor(data.bodyFr, fonts.body, size, 258.367);
    if (
      en &&
      fr &&
      385.92 - (en.length - 1) * leading >= 218 &&
      386.35 - (fr.length - 1) * leading >= 218
    ) {
      plans.push({
        lines: en,
        font: fonts.body,
        size,
        leading,
        x: 129.01,
        width: 259.128,
        y: 385.92,
        color: rgb(0, 0, 0),
      });
      plans.push({
        lines: fr,
        font: fonts.body,
        size,
        leading,
        x: 400.44,
        width: 258.367,
        y: 386.35,
        color: rgb(0, 0, 0),
      });
      found = true;
      break;
    }
  }
  if (!found)
    invalid(
      'The award paragraphs cannot fit legibly. Shorten the reviewed recipient/rank wording.',
      'award_text_overflow',
    );
  const single = (
    value,
    font,
    max,
    min,
    x,
    width,
    y,
    color,
    shadow = false,
  ) => {
    const size = Math.min(max, width / font.widthOfTextAtSize(value, 1));
    if (!Number.isFinite(size) || size < min)
      invalid(
        'The award text cannot fit without colliding with the artwork or signatures.',
        'award_text_overflow',
      );
    plans.push({
      lines: [value],
      font,
      size,
      leading: 0,
      x,
      width,
      y,
      color,
      shadow,
    });
  };
  single(
    fonts.script.widthOfTextAtSize(data.headline, 32.04) <= 672
      ? data.headline
      : data.abbreviatedHeadline,
    fonts.script,
    32.04,
    18,
    60.12,
    672,
    191.69,
    rgb(0, 0, 0.4),
    true,
  );
  single(
    'Trusted to Serve and Fighting Spirit Award, Presented to',
    fonts.body,
    9.96,
    8.5,
    131.536,
    225.709,
    172.99,
    rgb(0, 0, 0),
  );
  single(
    data.dedicationEn,
    fonts.body,
    9.96,
    8.5,
    131.536,
    225.709,
    160.99,
    rgb(0, 0, 0),
  );
  single(
    "La Distinction de Service et Prix de l'Esprit Combatif,",
    fonts.body,
    9.96,
    8.5,
    434.489,
    225.168,
    173.81,
    rgb(0, 0, 0),
  );
  single(
    data.dedicationFr,
    fonts.body,
    9.96,
    8.5,
    434.489,
    225.168,
    161.81,
    rgb(0, 0, 0),
  );
  single(
    data.date,
    fonts.script,
    15.96,
    12,
    346.698,
    99.078,
    134.83,
    rgb(0, 0.125, 0.376),
    true,
  );
  return plans;
}

async function drawScriptShadow(
  document,
  page,
  value,
  font,
  fontBytes,
  size,
  x,
  y,
) {
  // Rebuild only variable shadows from the supplied full font's glyph outlines.
  // No old raster shadow or hidden recipient text survives in the fixed master.
  const face = fontkit.create(fontBytes),
    run = face.layout(value),
    scale = size / face.unitsPerEm;
  const width = font.widthOfTextAtSize(value, size),
    padding = 8;
  const height = size * 2 + padding * 2;
  let advance = 0;
  const paths = run.glyphs
    .map((glyph, index) => {
      const pos = run.positions[index];
      const element = `<path d="${glyph.path.toSVG()}" transform="translate(${advance + pos.xOffset} ${pos.yOffset})"/>`;
      advance += pos.xAdvance;
      return element;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + padding * 2}pt" height="${height}pt" viewBox="0 0 ${width + padding * 2} ${height}"><defs><filter id="s" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="1.5"/></filter></defs><g opacity="0.43137" filter="url(#s)"><g transform="translate(${padding} ${padding + size}) scale(${scale} ${-scale})">${paths}</g></g></svg>`;
  const png = await sharp(Buffer.from(svg), { density: 200 }).png().toBuffer();
  const image = await document.embedPng(png);
  page.drawImage(image, {
    x: x - padding + 2.121,
    y: y - (height - padding - size) - 2.121,
    width: width + padding * 2,
    height,
  });
}

async function renderTrustedToServe(document, data, fonts, scriptBytes) {
  const plans = planAwardText(data, fonts),
    page = document.getPage(0);
  for (const plan of plans) {
    for (const [index, value] of plan.lines.entries()) {
      const x =
        plan.x +
        (plan.width - plan.font.widthOfTextAtSize(value, plan.size)) / 2;
      const y = plan.y - index * plan.leading;
      if (plan.shadow && scriptBytes)
        await drawScriptShadow(
          document,
          page,
          value,
          plan.font,
          scriptBytes,
          plan.size,
          x,
          y,
        );
      page.drawText(value, {
        x,
        y,
        size: plan.size,
        font: plan.font,
        color: plan.color,
      });
    }
  }
  document.setTitle('Trusted to Serve and Fighting Spirit Award');
  document.setProducer('CMCEN');
  return Buffer.from(await document.save());
}

async function loadAwardMaster() {
  try {
    const bytes = await readFile(MASTER_PATH);
    if (createHash('sha256').update(bytes).digest('hex') !== MASTER_SHA256)
      throw new Error('Master changed');
    return PDFDocument.load(bytes);
  } catch {
    throw new CertificateDocumentError(
      'certificate_template_invalid',
      'The approved award master is unavailable.',
      503,
    );
  }
}
async function generateTrustedToServe(input) {
  const data = getTrustedToServeData(input);
  const [scriptBytes, bodyBytes] = await Promise.all([
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_SCRIPT_MT_BOLD_PATH'),
      'ScriptMTBold',
    ),
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_BELL_MT_ITALIC_PATH'),
      'BellMTItalic',
    ),
  ]);
  const document = await loadAwardMaster();
  document.registerFontkit(fontkit);
  return renderTrustedToServe(
    document,
    data,
    {
      script: await document.embedFont(scriptBytes, { subset: true }),
      body: await document.embedFont(bodyBytes, { subset: true }),
    },
    scriptBytes,
  );
}
module.exports = {
  MASTER_PATH,
  MASTER_SHA256,
  getTrustedToServeData,
  linesFor,
  planAwardText,
  renderTrustedToServe,
  loadAwardMaster,
  generateTrustedToServe,
};
