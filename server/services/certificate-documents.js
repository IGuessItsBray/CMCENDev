const { readFile, realpath } = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PDFDocument, PDFName } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { resolve: resolveRank } = require('../public/person-rank-options');
const { CERTIFICATE_DECORATIONS } = require('../config/certificate-requests');
const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');
const { certificateFontPath } = require('../config/certificate-fonts');

const MEMBER_TEMPLATE_PATH = path.join(
  __dirname,
  '../private/certificates/retirement-member.pdf',
);
const MEMBER_TEMPLATE_SHA256 =
  'ab29b73b51a4342631e84c123472f60f8b80901139007a6aa1e6a7923d1268b1';
const PRINT_FIELDS = ['name_field', 'date-en', 'date-fr'];
const HELPERS = ['dt1_en', 'dt2_en', 'Text Field0'];
const FAMILY_TEMPLATE_PATH = path.join(
  __dirname,
  '../private/certificates/retirement-family.pdf',
);
const FAMILY_TEMPLATE_SHA256 =
  '5fffafa476db9c4e69c6d9988459c9d184499fedd850b87e507f49b8b78d9864';
const MONTHS = {
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  fr: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
};

class CertificateDocumentError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function invalid(message) {
  throw new CertificateDocumentError('certificate_data_invalid', message);
}

function dateOnly(value) {
  // Stored dates are UTC midnight. Reject ambiguous timestamps rather than
  // silently changing the calendar day in the server's local timezone.
  const text =
    value instanceof Date && Number.isFinite(value.getTime())
      ? value.toISOString()
      : String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00\.000Z)?$/u.test(text))
    invalid('The certificate service dates are invalid.');
  const iso = text.slice(0, 10);
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    invalid('The certificate service dates are invalid.');
  return iso;
}

function formatDate(iso, language) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTHS[language][month - 1]} ${year}`;
}

function getMemberCertificateData(request) {
  if (request?.certificateType !== 'retirement')
    invalid('Only member retirement certificates are supported.');
  const member = request.member || {};
  const name = String(member.fullName || '')
    .trim()
    .normalize('NFC');
  const rank = String(member.rank || '')
    .trim()
    .normalize('NFC');
  if (!name || name.length > 160 || /[\p{Cc}\p{Cf}]/u.test(name))
    invalid('A valid certificate member name is required.');
  if (!['en', 'fr'].includes(member.rankLanguage) || !rank)
    invalid('A valid certificate rank and rank language are required.');
  const catalogueRank = resolveRank(rank, 'en') || resolveRank(rank, 'fr');
  // Do not guess translations for custom or historical ranks.
  if (!catalogueRank)
    invalid('The certificate rank needs staff review before generation.');
  if (
    !Array.isArray(member.decorations) ||
    member.decorations.some((value) => !CERTIFICATE_DECORATIONS.includes(value))
  )
    invalid('Valid certificate decorations are required.');
  const decorations = CERTIFICATE_DECORATIONS.filter((value) =>
    member.decorations.includes(value),
  );
  const start = dateOnly(member.ceBranchEnrollmentDate);
  const end = dateOnly(member.releaseDate);
  if (end < start)
    invalid('The release date must follow the C&E Branch enrollment date.');
  return {
    recipient: `${catalogueRank[member.rankLanguage]} ${name}${decorations.length ? `, ${decorations.join(', ')}` : ''}`,
    datesEn: `${formatDate(start, 'en')} — ${formatDate(end, 'en')}`,
    datesFr: `${formatDate(start, 'fr')} — ${formatDate(end, 'fr')}`,
  };
}

async function loadCertificateFont(filePath, expectedPostscriptName) {
  const unavailable = () =>
    new CertificateDocumentError(
      'certificate_fonts_unavailable',
      'The approved certificate fonts are unavailable. Contact the site administrator.',
      503,
    );
  if (!filePath || !path.isAbsolute(filePath)) throw unavailable();
  try {
    const resolved = await realpath(filePath);
    const publicPath = path.resolve(__dirname, '../public');
    const publicRoot = await realpath(publicPath);
    if (
      filePath === publicPath ||
      filePath.startsWith(`${publicPath}${path.sep}`) ||
      resolved === publicRoot ||
      resolved.startsWith(`${publicRoot}${path.sep}`)
    )
      throw unavailable();
    const bytes = await readFile(resolved);
    const font = fontkit.create(bytes);
    if (font.postscriptName !== expectedPostscriptName) throw unavailable();
    // OS/2 flags express technical embedding constraints, not a server licence.
    if (!permitsFontEmbedding(font['OS/2'])) throw unavailable();
    return bytes;
  } catch {
    throw unavailable();
  }
}

function permitsFontEmbedding(os2) {
  const flags = os2?.fsType;
  if (!flags || flags.noSubsetting || flags.bitmapOnly) return false;
  // OS/2 versions 0–2 explicitly use the least restrictive embedding bit when
  // multiple bits are set. The supplied Bell MT v1 fonts use 0x000e (editable).
  // Version 3+ made those permissions mutually exclusive: reject conflicts.
  // https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype
  const permissions = [
    flags.noEmbedding,
    flags.viewOnly,
    flags.editable,
  ].filter(Boolean).length;
  if (os2.version <= 2)
    return !flags.noEmbedding || Boolean(flags.viewOnly || flags.editable);
  return permissions <= 1 && !flags.noEmbedding;
}

function setPrintedText(
  field,
  text,
  font,
  maxSize,
  minSize,
  color = '0 0 0.6 rg',
) {
  if (
    Array.from(text).some(
      (character) => !font.getCharacterSet().includes(character.codePointAt(0)),
    )
  ) {
    invalid(
      'The certificate font cannot represent every character in this request.',
    );
  }
  field.disableMultiline();
  field.setText(text);
  for (const widget of field.acroField.getWidgets()) {
    const { width, height } = widget.getRectangle();
    const border = widget.getBorderStyle()?.getWidth() || 0;
    const availableWidth = width - 2 * (border + 1);
    const availableHeight = height - 2 * (border + 1);
    const size = Math.min(
      maxSize,
      availableWidth / font.widthOfTextAtSize(text, 1),
      availableHeight / font.heightAtSize(1),
    );
    if (!Number.isFinite(size) || size < minSize)
      invalid(
        'The certificate text is too long to fit legibly. Staff review is required.',
      );
    // The approved PDF has widget-level /DA overrides, including a stale 0 pt
    // auto-size override on date-en. Set both levels before generating each AP.
    const appearance = `/${font.name} ${size} Tf ${color}`;
    field.acroField.setDefaultAppearance(appearance);
    widget.setDefaultAppearance(appearance);
    // name_field/date-fr are merged field+widget dictionaries: preserve their
    // new field value. Only date-en's separate child has a stale /V override.
    if (widget.dict !== field.acroField.dict)
      widget.dict.delete(PDFName.of('V'));
    widget.dict.delete(PDFName.of('DV'));
    widget.dict.delete(PDFName.of('AA'));
  }
  field.acroField.dict.delete(PDFName.of('DV'));
  field.acroField.dict.delete(PDFName.of('AA'));
  field.updateAppearances(font);
}

// Low-level form operation also exercised with explicit base-14 test fonts.
// Production always enters through generateMemberCertificate's exact font checks.
async function fillMemberCertificate(document, data, fonts) {
  const form = document.getForm();
  const fields = form.getFields();
  const expected = [...PRINT_FIELDS, ...HELPERS];
  if (
    document.getPageCount() !== 1 ||
    document.getPage(0).getWidth() !== 792 ||
    document.getPage(0).getHeight() !== 612 ||
    fields.length !== expected.length ||
    fields.some((field) => !expected.includes(field.getName()))
  ) {
    throw new CertificateDocumentError(
      'certificate_template_invalid',
      'The approved certificate template could not be loaded.',
      503,
    );
  }
  for (const name of HELPERS) form.removeField(form.getField(name));
  setPrintedText(
    form.getTextField('name_field'),
    data.recipient,
    fonts.name,
    30,
    12,
  );
  setPrintedText(
    form.getTextField('date-en'),
    data.datesEn,
    fonts.dates,
    12,
    8,
  );
  setPrintedText(
    form.getTextField('date-fr'),
    data.datesFr,
    fonts.dates,
    12,
    8,
  );
  form.flatten({ updateFieldAppearances: false });
  // pdf-lib 1.17.1 removes merged field/widgets but leaves dangling /Annots
  // references for the approved template's separate child widgets. All six
  // original annotations belong to the verified form; no annotations survive.
  document.getPage(0).node.delete(PDFName.of('Annots'));
  // Copy only reachable printed page content to a fresh document. This drops
  // orphaned old values/APs, helper scripts, AcroForm defaults and document JS.
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(document, [0]);
  output.addPage(page);
  output.setTitle(
    'Member retirement certificate / Certificat de retraite du membre',
  );
  output.setProducer('CMCEN');
  return Buffer.from(await output.save({ updateFieldAppearances: false }));
}

async function generateMemberCertificate(request) {
  const data = getMemberCertificateData(request);
  const [nameBytes, dateBytes] = await Promise.all([
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_SCRIPT_MT_BOLD_PATH'),
      'ScriptMTBold',
    ),
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_BELL_MT_BOLD_PATH'),
      'BellMTBold',
    ),
  ]);
  let template;
  try {
    template = await readFile(MEMBER_TEMPLATE_PATH);
    if (
      createHash('sha256').update(template).digest('hex') !==
      MEMBER_TEMPLATE_SHA256
    )
      throw new Error('Unapproved template');
  } catch {
    throw new CertificateDocumentError(
      'certificate_template_invalid',
      'The approved certificate template could not be loaded.',
      503,
    );
  }
  const document = await PDFDocument.load(template);
  document.registerFontkit(fontkit);
  const fonts = {
    name: await document.embedFont(nameBytes, { subset: true }),
    dates: await document.embedFont(dateBytes, { subset: true }),
  };
  return fillMemberCertificate(document, data, fonts);
}

function getFamilyCertificateData(request, index, options = {}) {
  if (request?.certificateType !== 'retirement')
    invalid('Only retirement certificates are supported.');
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !Array.isArray(request.familyMembers) ||
    index >= request.familyMembers.length
  ) {
    throw new CertificateDocumentError(
      'certificate_family_not_found',
      'The requested family certificate was not found.',
      404,
    );
  }
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== 'certificateDate')
  )
    invalid('The family certificate options are invalid.');
  const variant = FAMILY_WORDING_OPTIONS.find(
    (item) =>
      item.key === request.familyMembers[index].memberRelationshipToRecipient,
  );
  if (!variant)
    throw new CertificateDocumentError(
      'certificate_wording_required',
      'The requester must clarify how the retiring member is related to this recipient before generating the family certificate.',
    );
  const recipient = String(request.familyMembers[index]?.fullName || '')
    .trim()
    .normalize('NFC');
  if (!recipient || recipient.length > 160 || /[\p{Cc}\p{Cf}]/u.test(recipient))
    invalid('A valid family recipient name is required.');
  const adjEn = `${variant.en} successful military career.`;
  const adjFr = `carrière militaire ${variant.fr}`;
  const isoDate = dateOnly(
    options.certificateDate === undefined
      ? request.member?.releaseDate
      : options.certificateDate,
  );
  return {
    recipient,
    adjEn,
    adjFr,
    date: formatDate(isoDate, 'en'),
    isoDate,
    wording: variant.key,
  };
}

async function fillFamilyCertificate(document, data, fonts) {
  const form = document.getForm();
  const expected = ['name_field', 'adj_en', 'adj_fr', 'date', 'cb_en', 'tb1'];
  if (
    document.getPageCount() !== 1 ||
    document.getPage(0).getWidth() !== 792 ||
    document.getPage(0).getHeight() !== 612 ||
    form.getFields().length !== expected.length ||
    form.getFields().some((field) => !expected.includes(field.getName()))
  ) {
    throw new CertificateDocumentError(
      'certificate_template_invalid',
      'The approved family template could not be loaded.',
      503,
    );
  }
  for (const name of ['cb_en', 'tb1']) form.removeField(form.getField(name));
  setPrintedText(
    form.getTextField('name_field'),
    data.recipient,
    fonts.name,
    30,
    12,
  );
  setPrintedText(
    form.getTextField('adj_en'),
    data.adjEn,
    fonts.wording,
    11,
    8,
    '0 g',
  );
  setPrintedText(
    form.getTextField('adj_fr'),
    data.adjFr,
    fonts.wording,
    11,
    8,
    '0 g',
  );
  setPrintedText(
    form.getTextField('date'),
    data.date,
    fonts.date,
    12,
    8,
    '0.4 0.509804 0.733333 rg',
  );
  form.flatten({ updateFieldAppearances: false });
  document.getPage(0).node.delete(PDFName.of('Annots'));
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(document, [0]);
  output.addPage(page);
  output.setTitle(
    'Family retirement certificate / Certificat de retraite de la famille',
  );
  output.setProducer('CMCEN');
  return Buffer.from(await output.save({ updateFieldAppearances: false }));
}

async function generateFamilyCertificate(request, index, options) {
  const data = getFamilyCertificateData(request, index, options);
  const [nameBytes, wordingBytes, dateBytes] = await Promise.all([
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_SCRIPT_MT_BOLD_PATH'),
      'ScriptMTBold',
    ),
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_BELL_MT_ITALIC_PATH'),
      'BellMTItalic',
    ),
    loadCertificateFont(
      certificateFontPath('CERTIFICATE_BELL_MT_PATH'),
      'BellMT',
    ),
  ]);
  let template;
  try {
    template = await readFile(FAMILY_TEMPLATE_PATH);
    if (
      createHash('sha256').update(template).digest('hex') !==
      FAMILY_TEMPLATE_SHA256
    )
      throw new Error('Unapproved family template');
  } catch {
    throw new CertificateDocumentError(
      'certificate_template_invalid',
      'The approved family template could not be loaded.',
      503,
    );
  }
  const document = await PDFDocument.load(template);
  document.registerFontkit(fontkit);
  return fillFamilyCertificate(document, data, {
    name: await document.embedFont(nameBytes, { subset: true }),
    wording: await document.embedFont(wordingBytes, { subset: true }),
    date: await document.embedFont(dateBytes, { subset: true }),
  });
}

function validatePacketOptions(request, options = {}) {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== 'certificateDate')
  ) {
    throw new CertificateDocumentError(
      'certificate_wording_required',
      'The packet options are invalid; relationships must come from the saved request.',
    );
  }
  getMemberCertificateData(request);
  return (request.familyMembers || []).map((_, index) =>
    getFamilyCertificateData(request, index, {
      ...(options.certificateDate === undefined
        ? {}
        : { certificateDate: options.certificateDate }),
    }),
  );
}

async function generateCertificatePacket(request, options = {}) {
  validatePacketOptions(request, options);
  // Generate atomically in memory: member first, families in stored request
  // order. Never share documents or form instances between requests.
  const certificates = [await generateMemberCertificate(request)];
  for (let index = 0; index < (request.familyMembers || []).length; index++) {
    certificates.push(
      await generateFamilyCertificate(request, index, {
        ...(options.certificateDate === undefined
          ? {}
          : { certificateDate: options.certificateDate }),
      }),
    );
  }
  return assembleCertificatePacket(certificates);
}

async function assembleCertificatePacket(certificates) {
  const output = await PDFDocument.create();
  for (const bytes of certificates) {
    const document = await PDFDocument.load(bytes);
    for (const page of await output.copyPages(
      document,
      document.getPageIndices(),
    ))
      output.addPage(page);
  }
  output.setTitle(
    'Retirement certificate packet / Dossier de certificats de retraite',
  );
  output.setProducer('CMCEN');
  return Buffer.from(await output.save({ updateFieldAppearances: false }));
}

module.exports = {
  CertificateDocumentError,
  MEMBER_TEMPLATE_PATH,
  MEMBER_TEMPLATE_SHA256,
  getMemberCertificateData,
  loadCertificateFont,
  permitsFontEmbedding,
  fillMemberCertificate,
  generateMemberCertificate,
  FAMILY_TEMPLATE_PATH,
  FAMILY_TEMPLATE_SHA256,
  getFamilyCertificateData,
  fillFamilyCertificate,
  generateFamilyCertificate,
  validatePacketOptions,
  generateCertificatePacket,
  assembleCertificatePacket,
};
