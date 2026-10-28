const { withBundledCertificateFonts } = require('./helpers/certificate-fonts');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const {
  PDFDocument,
  PDFName,
  StandardFonts,
  decodePDFRawStream,
} = require('pdf-lib');
const {
  getFamilyCertificateData,
  FAMILY_TEMPLATE_PATH,
  FAMILY_TEMPLATE_SHA256,
  validatePacketOptions,
  assembleCertificatePacket,
  generateFamilyCertificate,
  generateCertificatePacket,
} = require('../services/certificate-documents');
const {
  familyRequest,
  syntheticMemberPdf,
  syntheticFamilyPdf,
} = require('./helpers/certificate-document');

test('all supported relationship mappings reproduce original PDF script text exactly', async () => {
  const document = await PDFDocument.load(
    await fs.readFile(FAMILY_TEMPLATE_PATH),
  );
  let script = '';
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const reference = object.get?.(PDFName.of('JS'));
    if (!reference) continue;
    const value = document.context.lookup(reference);
    const text =
      value.decodeText?.() ||
      new TextDecoder('windows-1252').decode(
        decodePDFRawStream(value).decode(),
      );
    if (text.includes('var adjs_en')) script = text;
  }
  const en = JSON.parse(script.match(/var adjs_en = (\[[\s\S]*?\]);/u)[1]);
  const fr = JSON.parse(script.match(/var adjs_fr = (\[[\s\S]*?\]);/u)[1]);
  const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');
  assert.equal(FAMILY_WORDING_OPTIONS.length, 19);
  const request = familyRequest();
  for (const [index, variant] of FAMILY_WORDING_OPTIONS.entries()) {
    request.familyMembers[0].memberRelationshipToRecipient = variant.key;
    const data = getFamilyCertificateData(request, 0);
    assert.equal(data.adjEn, `${en[index]} successful military career.`);
    assert.equal(data.adjFr, `carrière militaire ${fr[index]}`);
  }
});

test('family wording uses saved requester answers, with no inference, neutral fallback or staff override', () => {
  const request = familyRequest();
  const husband = getFamilyCertificateData(request, 0);
  assert.equal(husband.adjEn, "your husband's successful military career.");
  assert.equal(husband.adjFr, 'carrière militaire de votre mari.');
  request.familyMembers[0].relationship = 'son';
  request.member.fullName = 'A different name';
  assert.deepEqual(getFamilyCertificateData(request, 0), husband);
  delete request.familyMembers[0].memberRelationshipToRecipient;
  assert.throws(() => getFamilyCertificateData(request, 0), {
    code: 'certificate_wording_required',
  });
  assert.throws(
    () => getFamilyCertificateData(request, 1, { wording: 'guess' }),
    { code: 'certificate_data_invalid' },
  );
  request.familyMembers[0].memberRelationshipToRecipient = 'member_name';
  assert.throws(() => getFamilyCertificateData(request, 0), {
    code: 'certificate_wording_required',
  });
});

test('family date defaults to UTC release date and supports an explicitly reviewed date correction', () => {
  const request = familyRequest();
  assert.equal(getFamilyCertificateData(request, 0).date, '01 August 2026');
  assert.equal(
    getFamilyCertificateData(request, 0, {
      certificateDate: '2028-02-29',
    }).date,
    '29 February 2028',
  );
  for (const certificateDate of [
    '',
    '2026-02-30',
    '2026-08-01T23:00:00.000Z',
  ]) {
    assert.throws(
      () =>
        getFamilyCertificateData(request, 0, {
          certificateDate,
        }),
      { status: 422 },
    );
  }
  assert.equal(
    request.member.releaseDate.toISOString(),
    '2026-08-01T00:00:00.000Z',
  );
});

test('invalid indices, missing names and unexpected options cannot produce family output', () => {
  const request = familyRequest();
  for (const index of [-1, 2, NaN, '0', 0.5])
    assert.throws(() => getFamilyCertificateData(request, index), {
      status: 404,
    });
  assert.throws(
    () =>
      getFamilyCertificateData(request, 0, {
        name: 'Injected',
      }),
    { status: 422 },
  );
  request.familyMembers[0].fullName = '';
  assert.throws(() => getFamilyCertificateData(request, 0), { status: 422 });
});

function appearances(document) {
  return document.getPages().map((page) =>
    page.node
      .Resources()
      .lookup(PDFName.of('XObject'))
      .entries()
      .filter(([key]) => key.toString().startsWith('/FlatWidget'))
      .map(([, ref]) =>
        Buffer.from(
          decodePDFRawStream(document.context.lookup(ref)).decode(),
        ).toString(),
      )
      .join('\n'),
  );
}

test('family output includes all four new values, correct fonts/colors and no helpers, scripts or stale recipient values', async () => {
  const original = await fs.readFile(FAMILY_TEMPLATE_PATH);
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    FAMILY_TEMPLATE_SHA256,
  );
  const request = familyRequest(),
    options = {};
  const output = await PDFDocument.load(
    await syntheticFamilyPdf(request, 0, options),
  );
  assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
  assert.equal(output.catalog.has(PDFName.of('Names')), false);
  assert.equal(output.getPage(0).node.Annots()?.size() || 0, 0);
  const content = appearances(output)[0];
  const encoder = await PDFDocument.create();
  const name = await encoder.embedFont(StandardFonts.Helvetica),
    wording = await encoder.embedFont(StandardFonts.TimesRomanItalic),
    date = await encoder.embedFont(StandardFonts.TimesRoman);
  const data = getFamilyCertificateData(request, 0, options);
  for (const [text, font] of [
    [data.recipient, name],
    [data.adjEn, wording],
    [data.adjFr, wording],
    [data.date, date],
  ])
    assert.ok(content.includes(`${font.encodeText(text).toString()} Tj`), text);
  assert.match(content, /0 g/u);
  assert.match(content, /0\.4 0\.509804 0\.733333 rg/u);
  const objects = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object.toString())
    .join('\n');
  assert.doesNotMatch(
    objects,
    /cb_en|tb1|name_field|adj_en|adj_fr|JavaScript|Angela|London|select relation/u,
  );
  assert.deepEqual(await fs.readFile(FAMILY_TEMPLATE_PATH), original);
});

test('long accented family names fit, while illegible or unsupported text fails explicitly', async () => {
  await syntheticFamilyPdf(familyRequest(), 1);
  const request = familyRequest();
  request.familyMembers[0].fullName = 'W'.repeat(160);
  await assert.rejects(syntheticFamilyPdf(request), { status: 422 });
  request.familyMembers[0].fullName = '漢字';
  await assert.rejects(syntheticFamilyPdf(request), { status: 422 });
});

test('packets use saved answers and preserve member/family order without cross-request data', async () => {
  const request = familyRequest();
  for (const options of [
    null,
    { familyWordings: [] },
    { familyWordings: ['husband'] },
    { familyWordings: ['husband', ''] },
    { familyWordings: ['husband', 'member_name', 'wife'] },
  ])
    assert.throws(() => validatePacketOptions(request, options), {
      status: 422,
    });
  assert.equal(validatePacketOptions(request).length, 2);
  const member = await syntheticMemberPdf(request),
    family0 = await syntheticFamilyPdf(request, 0),
    family1 = await syntheticFamilyPdf(request, 1);
  const packet = await PDFDocument.load(
    await assembleCertificatePacket([member, family0, family1]),
  );
  const expected = [];
  for (const bytes of [member, family0, family1])
    expected.push(appearances(await PDFDocument.load(bytes))[0]);
  assert.equal(packet.getPageCount(), 3);
  assert.deepEqual(appearances(packet), expected);
  const other = familyRequest();
  other.member.fullName = 'Different member';
  other.familyMembers[0].fullName = 'Different recipient';
  const separate = await PDFDocument.load(
    await assembleCertificatePacket([await syntheticFamilyPdf(other)]),
  );
  assert.notEqual(appearances(separate)[0], appearances(packet)[1]);
  assert.deepEqual(appearances(packet), expected);
});

test('bundled fonts generate family certificates and complete packet without configuration or request mutations', () =>
  withBundledCertificateFonts(async () => {
    const request = familyRequest(),
      snapshot = structuredClone(request);
    for (const index of [0, 1]) {
      const output = await PDFDocument.load(
        await generateFamilyCertificate(request, index),
      );
      const objects = output.context
        .enumerateIndirectObjects()
        .map(([, object]) => object.toString())
        .join('\n');
      assert.match(objects, /BellMTItalic/u);
      assert.match(objects, /ScriptMTBold/u);
      assert.equal(output.getPage(0).node.Annots()?.size() || 0, 0);
    }
    assert.equal(
      (
        await PDFDocument.load(await generateCertificatePacket(request))
      ).getPageCount(),
      3,
    );
    assert.deepEqual(request, snapshot);
  }));
