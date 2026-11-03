const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const {
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} = require('pdf-lib');
const documents = require('../services/certificate-documents');
const {
  memberRequest,
  familyRequest,
} = require('./helpers/certificate-document');
const {
  applyRetirementLanguageLayout,
} = require('../services/certificate-language-columns');
const decoded = (stream) =>
  Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
function staticContent(document) {
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    let text;
    try {
      text = decoded(object);
    } catch {
      continue;
    }
    if (text.includes('(Communications and Electronics)Tj')) return text;
  }
  throw new Error('Static certificate content not found.');
}
function fontPrograms(document) {
  const hashes = [];
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object.get?.(PDFName.of('Type')) !== PDFName.of('FontDescriptor'))
      continue;
    for (const key of ['FontFile', 'FontFile2', 'FontFile3'])
      if (object.has(PDFName.of(key)))
        hashes.push(
          createHash('sha256')
            .update(
              Buffer.from(
                decodePDFRawStream(object.lookup(PDFName.of(key))).decode(),
              ),
            )
            .digest('hex'),
        );
  }
  return [...new Set(hashes)].sort();
}
test('French-first relocates bilingual columns while English-first keeps their positions', async () => {
  for (const kind of ['member', 'family']) {
    const source = await readFile(
      kind === 'member'
        ? documents.MEMBER_TEMPLATE_PATH
        : documents.FAMILY_TEMPLATE_PATH,
    );
    const original = staticContent(await PDFDocument.load(source));
    const results = {};
    for (const language of ['en', 'fr']) {
      const document = await PDFDocument.load(source),
        form = document.getForm();
      const widgets = Object.fromEntries(
        form
          .getFields()
          .filter((field) =>
            [
              'name_field',
              'date-en',
              'date-fr',
              'date',
              'adj_en',
              'adj_fr',
            ].includes(field.getName()),
          )
          .map((field) => [field.getName(), field.acroField.getWidgets()[0]]),
      );
      const fonts = { name: await document.embedFont(StandardFonts.Helvetica) };
      fonts.signatories = await document.embedFont(StandardFonts.TimesRoman);
      if (kind === 'member')
        fonts.dates = await document.embedFont(StandardFonts.TimesRomanBold);
      else {
        fonts.wording = await document.embedFont(
          StandardFonts.TimesRomanItalic,
        );
        fonts.date = await document.embedFont(StandardFonts.TimesRoman);
      }
      const data =
        kind === 'member'
          ? documents.getMemberCertificateData(memberRequest())
          : documents.getFamilyCertificateData(familyRequest(), 0);
      const output = await PDFDocument.load(
        await (
          kind === 'member'
            ? documents.fillMemberCertificate
            : documents.fillFamilyCertificate
        )(document, { ...data, rankLanguage: language }, fonts),
      );
      results[language] = {
        output,
        positions: Object.fromEntries(
          Object.entries(widgets).map(([key, widget]) => [
            key,
            widget.getRectangle(),
          ]),
        ),
        content: staticContent(output),
      };
      assert.equal(output.getPage(0).node.Annots(), undefined);
    }
    assert.match(
      results.en.content,
      /117\.461 486 Tm \/F\d\+0 14 Tf \(Communications and Electronics\)Tj/u,
    );
    assert.match(
      results.fr.content,
      /477\.461 486 Tm \/F\d\+0 14 Tf \(Communications and Electronics\)Tj/u,
    );
    assert.match(
      results.fr.content,
      /128\.766 486 Tm \(Branche des communications\)Tj/u,
    );
    const images = (text) => text.match(/BI[\s\S]*?~>\s*EI/gu);
    assert.deepEqual(images(results.fr.content), images(original));
    assert.deepEqual(
      fontPrograms(results.fr.output),
      fontPrograms(results.en.output),
    );
    const moves =
      kind === 'member'
        ? { 'date-en': 360, 'date-fr': -360 }
        : { adj_en: 360, adj_fr: -360 };
    for (const [field, rectangle] of Object.entries(results.en.positions)) {
      assert.deepEqual(results.fr.positions[field], {
        ...rectangle,
        x: rectangle.x + (moves[field] || 0),
      });
    }
  }
});
test('rank language controls both retirement page types without changing dates or relationship wording', () => {
  for (const rankLanguage of ['en', 'fr']) {
    assert.equal(
      documents.getMemberCertificateData(memberRequest({ rankLanguage }))
        .rankLanguage,
      rankLanguage,
    );
    const request = familyRequest();
    request.member.rankLanguage = rankLanguage;
    assert.equal(
      documents.getFamilyCertificateData(request, 0).rankLanguage,
      rankLanguage,
    );
    assert.equal(
      documents.getFamilyCertificateData(request, 0).date,
      '01 August 2026',
    );
    assert.equal(
      documents.getFamilyCertificateData(request, 0).wording,
      'husband',
    );
  }
  const request = familyRequest();
  delete request.member.rankLanguage;
  assert.equal(
    documents.getFamilyCertificateData(request, 0).rankLanguage,
    'en',
  );
  request.member.rankLanguage = 'guess';
  assert.throws(() => documents.getFamilyCertificateData(request, 0), {
    code: 'certificate_data_invalid',
  });
});
test('unverified column content is refused rather than moved approximately', async () => {
  const document = await PDFDocument.create();
  document.addPage([792, 612]);
  assert.throws(() => applyRetirementLanguageLayout(document, 'family', 'fr'));
});

test('real retirement output translates only French-first signatory rank name-lines with embedded Bell MT', async () => {
  for (const kind of ['member', 'family'])
    for (const rankLanguage of ['en', 'fr']) {
      const request = familyRequest();
      request.member.rankLanguage = rankLanguage;
      const bytes =
        kind === 'member'
          ? await documents.generateMemberCertificate(request)
          : await documents.generateFamilyCertificate(request, 0);
      const document = await PDFDocument.load(bytes),
        source = staticContent(document);
      const fonts = document
        .getPage(0)
        .node.Resources()
        .lookup(PDFName.of('Font'));
      if (rankLanguage === 'en') {
        assert.equal(fonts.has(PDFName.of('FrenchSignatoryNames')), false);
        assert.match(source, /\/BranchLeaderName 12 Tf/u);
        assert.equal(
          (source.match(/\/BranchChiefText 12 Tf/gu) || []).length,
          3,
        );
        continue;
      }
      const font = fonts.lookup(PDFName.of('FrenchSignatoryNames'));
      const descriptor = font
        .lookup(PDFName.of('DescendantFonts'))
        .lookup(0)
        .lookup(PDFName.of('FontDescriptor'));
      assert.ok(descriptor.has(PDFName.of('FontFile2')));
      const cmap = decoded(font.lookup(PDFName.of('ToUnicode')));
      const mapping = new Map(
        [...cmap.matchAll(/<([\da-f]{4})>\s*<([\da-f]{4})>/giu)].map(
          (match) => [
            match[1].toUpperCase(),
            String.fromCodePoint(parseInt(match[2], 16)),
          ],
        ),
      );
      const lines = [
        ...source.matchAll(
          /\/FrenchSignatoryNames 12 Tf 0 g 1 0 0 1 [-\d.]+ ([-\d.]+) Tm <([\da-f]+)> Tj/giu,
        ),
      ];
      assert.deepEqual(
        lines.map((match) =>
          match[2]
            .match(/.{4}/gu)
            .map((code) => mapping.get(code.toUpperCase()))
            .join(''),
        ),
        [
          'Major-général Justin P. Thibert, CD',
          'Adjudante-chef Renay Groves, MSM, CD',
        ],
      );
      assert.deepEqual(
        lines.map((match) => Number(match[1])),
        kind === 'member' ? [158.78, 158.883] : [163, 162.25],
      );
      assert.equal((source.match(/\/BranchChiefText 12 Tf/gu) || []).length, 2); // Existing role-title lines retained.
      assert.doesNotMatch(source, /\/BranchLeaderName 12 Tf/u);
    }
});

test('French member generation fails safely when the required regular signatory font is unavailable', async () => {
  const previous = process.env.CERTIFICATE_BELL_MT_PATH;
  process.env.CERTIFICATE_BELL_MT_PATH = '/missing/approved-bell-mt.ttf';
  try {
    await assert.rejects(
      documents.generateMemberCertificate(
        memberRequest({ rankLanguage: 'fr' }),
      ),
      { code: 'certificate_fonts_unavailable', status: 503 },
    );
    const bytes = await documents.generateMemberCertificate(
      memberRequest({ rankLanguage: 'en' }),
    );
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  } finally {
    if (previous === undefined) delete process.env.CERTIFICATE_BELL_MT_PATH;
    else process.env.CERTIFICATE_BELL_MT_PATH = previous;
  }
});

test('both signatories put the selected language in the upper role-title row', async () => {
  for (const kind of ['member', 'family'])
    for (const rankLanguage of ['en', 'fr']) {
      const request = familyRequest();
      request.member.rankLanguage = rankLanguage;
      const document = await PDFDocument.load(
        kind === 'member'
          ? await documents.generateMemberCertificate(request)
          : await documents.generateFamilyCertificate(request, 0),
      );
      const source = staticContent(document);
      const font = document
        .getPage(0)
        .node.Resources()
        .lookup(PDFName.of('Font'))
        .lookup(PDFName.of('BranchChiefText'));
      const cmap = decoded(font.lookup(PDFName.of('ToUnicode')));
      const mapping = new Map(
        [...cmap.matchAll(/<([\da-f]{4})>\s*<([\da-f]{4})>/giu)].map(
          (match) => [
            match[1].toUpperCase(),
            String.fromCodePoint(parseInt(match[2], 16)),
          ],
        ),
      );
      const rows = [
        ...source.matchAll(
          /\/BranchChiefText 12 Tf 0 g 1 0 0 1 [-\d.]+ ([-\d.]+) Tm <([\da-f]+)> Tj/giu,
        ),
      ].map((match) => ({
        y: Number(match[1]),
        text: match[2]
          .match(/.{4}/gu)
          .map((code) => mapping.get(code.toUpperCase()))
          .join(''),
      }));
      const english = rows.find(
        (row) => row.text === 'Branch Chief Warrant Officer',
      );
      const french = rows.find(
        (row) => row.text === 'Adjudant-chef de la Branche',
      );
      assert.ok(english && french);
      assert.equal(english.y > french.y, rankLanguage === 'en');
      const leader = source.match(
        /BT\s+(?:0 0 0 rg 0 0 0 RG )?(?:1 0 0 1 )?[-\d.]+ ([-\d.]+) (?:Tm|Td) \/F\d\+0 12 Tf \(Branch Leader\)Tj/u,
      );
      assert.ok(leader);
      const middle = (english.y + french.y) / 2;
      assert.equal(Number(leader[1]) > middle, rankLanguage === 'en');
      assert.equal(Number(leader[1]), english.y);
      const leaderFrench = source.match(
        /1 0 0 1 [-\d.]+ ([-\d.]+) Tm \[\(Ch\)0\.001272\(e\)/u,
      );
      assert.ok(leaderFrench);
      assert.equal(Number(leaderFrench[1]), french.y);
      assert.equal((source.match(/\[\(Ch\)0\.001272\(e\)/gu) || []).length, 1); // Unchanged French leader-title glyphs.
    }
});
