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
  MEMBER_TEMPLATE_PATH,
  MEMBER_TEMPLATE_SHA256,
  getMemberCertificateData,
  generateMemberCertificate,
  loadCertificateFont,
  permitsFontEmbedding,
} = require('../services/certificate-documents');
const {
  memberRequest,
  syntheticMemberPdf,
} = require('./helpers/certificate-document');

test('member mapping uses requested rank language, ordered decorations and deterministic bilingual calendar dates', () => {
  assert.deepEqual(getMemberCertificateData(memberRequest()), {
    recipient: 'Adjudant Émilie Anne-Marie D’Amour, MMM, CD',
    datesEn: '29 February 2000 — 01 August 2026',
    datesFr: '29 février 2000 — 01 août 2026',
  });
  assert.match(
    getMemberCertificateData(memberRequest({ rankLanguage: 'en' })).recipient,
    /^Warrant Officer /,
  );
});

test('missing, ambiguous, invalid or unsupported data cannot silently generate a certificate', () => {
  for (const changes of [
    { fullName: '' },
    { fullName: 'A\nB' },
    { fullName: 'X'.repeat(161) },
    { rank: '' },
    { rank: 'Unverified Historical Rank' },
    { rankLanguage: '' },
    { decorations: [] },
    { decorations: ['FAKE'] },
    { cafEnrollmentDate: null },
    { releaseDate: '2026-02-30' },
    { releaseDate: '2026-08-01T23:00:00.000Z' },
    { releaseDate: '1990-01-01' },
  ])
    assert.throws(() => getMemberCertificateData(memberRequest(changes)), {
      code: 'certificate_data_invalid',
      status: 422,
    });
  assert.throws(
    () =>
      getMemberCertificateData({
        ...memberRequest(),
        certificateType: 'award',
      }),
    { status: 422 },
  );
});

test('missing or wrong fonts fail safely without any production fallback', async () => {
  for (const fontPath of [
    '',
    '/not-a-real-certificate-font.ttf',
    MEMBER_TEMPLATE_PATH,
  ]) {
    await assert.rejects(loadCertificateFont(fontPath, 'ScriptMTBold'), {
      code: 'certificate_fonts_unavailable',
      status: 503,
    });
  }
  const original = {
    script: process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH,
    bell: process.env.CERTIFICATE_BELL_MT_BOLD_PATH,
  };
  process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH =
    '/missing-cmcen-font/ScriptMTBold.ttf';
  process.env.CERTIFICATE_BELL_MT_BOLD_PATH =
    '/missing-cmcen-font/bellmtbold.ttf';
  try {
    await assert.rejects(generateMemberCertificate(memberRequest()), {
      code: 'certificate_fonts_unavailable',
      status: 503,
    });
  } finally {
    for (const [key, value] of [
      ['CERTIFICATE_SCRIPT_MT_BOLD_PATH', original.script],
      ['CERTIFICATE_BELL_MT_BOLD_PATH', original.bell],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('embedding permissions follow OS/2 version rules without treating flags as deployment entitlement', () => {
  assert.equal(
    permitsFontEmbedding({
      version: 1,
      fsType: { noEmbedding: true, viewOnly: true, editable: true },
    }),
    true,
  );
  assert.equal(
    permitsFontEmbedding({
      version: 3,
      fsType: { noEmbedding: true, viewOnly: true, editable: true },
    }),
    false,
  );
  assert.equal(
    permitsFontEmbedding({ version: 1, fsType: { noEmbedding: true } }),
    false,
  );
  assert.equal(
    permitsFontEmbedding({ version: 1, fsType: { editable: true } }),
    true,
  );
  assert.equal(
    permitsFontEmbedding({
      version: 1,
      fsType: { editable: true, noSubsetting: true },
    }),
    false,
  );
  assert.equal(
    permitsFontEmbedding({
      version: 1,
      fsType: { editable: true, bitmapOnly: true },
    }),
    false,
  );
  assert.equal(permitsFontEmbedding({ version: 3, fsType: {} }), true);
  assert.equal(permitsFontEmbedding(null), false);
});

test('synthetic fonts flatten only three printed fields, remove helpers/scripts/stale data and preserve the approved input bytes', async () => {
  const before = await fs.readFile(MEMBER_TEMPLATE_PATH);
  assert.equal(
    createHash('sha256').update(before).digest('hex'),
    MEMBER_TEMPLATE_SHA256,
  );
  for (let repeat = 0; repeat < 2; repeat++) {
    const output = await PDFDocument.load(await syntheticMemberPdf());
    assert.equal(output.getPageCount(), 1);
    assert.deepEqual(output.getPage(0).getSize(), { width: 792, height: 612 });
    assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
    assert.equal(output.catalog.has(PDFName.of('Names')), false);
    assert.equal(output.catalog.has(PDFName.of('OpenAction')), false);
    assert.equal(output.getPage(0).node.Annots()?.size() || 0, 0);
    assert.equal(
      output
        .getPage(0)
        .node.Resources()
        .lookup(PDFName.of('XObject'))
        .keys()
        .filter((key) => key.toString().startsWith('/FlatWidget')).length,
      3,
    );
    // Verify each flattened appearance contains its NEW value, rather than
    // merely checking the form is gone. Merged widgets share their /V with the
    // field; removing that value previously blanked the name and French dates.
    const xobjects = output
      .getPage(0)
      .node.Resources()
      .lookup(PDFName.of('XObject'));
    const appearances = xobjects
      .entries()
      .filter(([key]) => key.toString().startsWith('/FlatWidget'))
      .map(([, ref]) =>
        Buffer.from(
          decodePDFRawStream(output.context.lookup(ref)).decode(),
        ).toString(),
      );
    const encodingDocument = await PDFDocument.create();
    const nameFont = await encodingDocument.embedFont(StandardFonts.Helvetica);
    const dateFont = await encodingDocument.embedFont(
      StandardFonts.TimesRomanBold,
    );
    const data = getMemberCertificateData(memberRequest());
    for (const [text, font] of [
      [data.recipient, nameFont],
      [data.datesEn, dateFont],
      [data.datesFr, dateFont],
    ]) {
      assert.ok(
        appearances.some((stream) =>
          stream.includes(`${font.encodeText(text).toString()} Tj`),
        ),
        `Printed appearance missing: ${text}`,
      );
    }
    const objects = output.context
      .enumerateIndirectObjects()
      .map(([, object]) => object.toString())
      .join('\n');
    assert.doesNotMatch(
      objects,
      /name_field|date-en|date-fr|dt1_en|dt2_en|Text Field0|JavaScript|Bloggins|London|Spain|select dates/u,
    );
  }
  assert.deepEqual(await fs.readFile(MEMBER_TEMPLATE_PATH), before);
});

test('long accented names shrink within bounds; names that cannot fit legibly and missing glyphs are rejected', async () => {
  await syntheticMemberPdf(
    memberRequest({
      fullName: 'Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque',
    }),
  );
  await assert.rejects(
    syntheticMemberPdf(memberRequest({ fullName: 'W'.repeat(160) })),
    { code: 'certificate_data_invalid', status: 422 },
  );
  await assert.rejects(
    syntheticMemberPdf(memberRequest({ fullName: '漢字' })),
    { code: 'certificate_data_invalid', status: 422 },
  );
});

test('bundled exact fonts generate ordinary and long accented names without configuration', () =>
  withBundledCertificateFonts(async () => {
    for (const fullName of [
      'Émilie D’Amour',
      'Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque',
    ]) {
      const output = await PDFDocument.load(
        await generateMemberCertificate(memberRequest({ fullName })),
      );
      assert.equal(output.getPageCount(), 1);
      assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
      assert.equal(output.getPage(0).node.Annots()?.size() || 0, 0);
      const objects = output.context
        .enumerateIndirectObjects()
        .map(([, object]) => object.toString())
        .join('\n');
      assert.match(objects, /ScriptMTBold/u);
      assert.match(objects, /BellMTBold/u);
    }
  }));
