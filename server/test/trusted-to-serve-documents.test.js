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
  MASTER_PATH,
  MASTER_SHA256,
  getTrustedToServeData,
  planAwardText,
  loadAwardMaster,
  renderTrustedToServe,
  generateTrustedToServe,
} = require('../services/trusted-to-serve-documents');
const { prepareMaster } = require('../scripts/prepare-trusted-to-serve-master');
const input = (changes = {}) => ({
  firstName: 'Alex',
  lastName: 'Tremblay',
  fullRankEn: 'Aviator',
  postNominals: '',
  rankEn: 'Aviator',
  rankFr: 'Aviateur',
  presentationDate: '2026-11-13',
  frPronoun: 'il',
  frRankGrammar: 'elided',
  ...changes,
});

test('award mapping replaces ten recipient occurrences and applies only explicit French grammatical variants', () => {
  const data = getTrustedToServeData(input());
  const variableText = [
    data.bodyEn,
    data.bodyFr,
    data.headline,
    data.dedicationEn,
    data.dedicationFr,
  ].join('\n');
  assert.equal(variableText.split('Tremblay').length - 1, 10);
  assert.equal(variableText.split('Alex').length - 1, 1);
  assert.equal(data.headline, 'Aviator Alex Tremblay');
  assert.doesNotMatch(data.bodyEn + data.bodyFr, /Alex/u);
  const decorated = getTrustedToServeData(
    input({
      firstName: 'Émilie Anne-Marie',
      lastName: 'van der D’Amour-Lévesque',
      rankEn: 'Cpl',
      rankFr: 'Cpl',
      fullRankEn: 'Corporal',
      postNominals: 'MMM, CD',
    }),
  );
  assert.equal(
    decorated.headline,
    'Corporal Émilie Anne-Marie van der D’Amour-Lévesque, MMM, CD',
  );
  assert.match(decorated.bodyEn, /Cpl van der D’Amour-Lévesque/u);
  assert.doesNotMatch(
    decorated.bodyEn + decorated.bodyFr,
    /Émilie|Anne-Marie|MMM|CD/u,
  );
  for (const postNominals of [undefined, '', '   '])
    assert.equal(
      getTrustedToServeData(input({ postNominals })).headline,
      'Aviator Alex Tremblay',
    );
  assert.match(data.bodyFr, /Il démontre/u);
  assert.match(data.bodyFr, /de l’Aviateur Tremblay/u);
  assert.equal(data.dedicationFr, 'Décerné à l’Aviateur Tremblay');
  assert.equal(data.date, 'Nov 13, 2026');
  const feminine = getTrustedToServeData(
    input({
      firstName: 'Émilie',
      lastName: 'D’Amour',
      rankFr: 'Caporale',
      frPronoun: 'elle',
      frRankGrammar: 'feminine',
    }),
  );
  assert.match(feminine.bodyFr, /Elle démontre/u);
  assert.match(feminine.bodyFr, /une future leader/u);
  assert.match(feminine.dedicationFr, /à la Caporale/u);
  const differentName = getTrustedToServeData(input({ firstName: 'Émilie' }));
  assert.match(differentName.bodyFr, /Il démontre/u); // Name never determines pronoun.
});

test('award dates and inputs are validated independently of retirement data; grammatical choices have no defaults', () => {
  for (const changes of [
    { firstName: '' },
    { firstName: 'A\nB' },
    { rankEn: '' },
    { lastName: '' },
    { fullRankEn: 'Cpl' },
    { postNominals: 'X'.repeat(121) },
    { rankFr: '' },
    { frPronoun: '' },
    { frRankGrammar: '' },
    { frRankGrammar: '__proto__' },
    { presentationDate: '2026-02-30' },
    { presentationDate: '2026-11-13T23:00:00Z' },
    { retirementDate: '2026-11-13' },
    { reviewed: 'yes' },
  ])
    assert.throws(() => getTrustedToServeData(input(changes)), { status: 422 });
  assert.equal(
    getTrustedToServeData(input({ presentationDate: '2028-02-29' })).date,
    'Feb 29, 2028',
  );
});

test('fixed master is hash-locked, keeps fixed title/signature resources and contains no variable text or old shadow resources', async () => {
  const bytes = await fs.readFile(MASTER_PATH);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), MASTER_SHA256);
  await assert.rejects(prepareMaster(Buffer.from('unapproved')), /Unapproved/u);
  const document = await loadAwardMaster(),
    page = document.getPage(0);
  assert.deepEqual(page.getSize(), { width: 792.24, height: 612 });
  assert.equal(page.node.Annots()?.size() || 0, 0);
  const content = Buffer.from(
    decodePDFRawStream(page.node.Contents()).decode(),
  ).toString('latin1');
  assert.equal((content.match(/\bBT\b/gu) || []).length, 12);
  assert.doesNotMatch(
    content,
    /\/F[234] |Nyami|Nov|\/Image(?:33|37|39|43) Do/u,
  );
  assert.deepEqual(
    page.node
      .Resources()
      .lookup(PDFName.of('Font'))
      .keys()
      .map((k) => k.toString()),
    ['/F1', '/F5', '/BranchLeaderName'],
  );
  const images = page.node.Resources().lookup(PDFName.of('XObject'));
  for (const name of ['Image33', 'Image37', 'Image39', 'Image43', 'Image45'])
    assert.equal(images.has(PDFName.of(name)), false);
  for (const name of [
    'Image7',
    'Image12',
    'Image14',
    'Image16',
    'Image18',
    'Image20',
    'Image22',
    'Image24',
    'BranchLeaderSignature',
    'Image47',
  ])
    assert.equal(images.has(PDFName.of(name)), true);
});

async function synthetic(changes = {}) {
  const document = await loadAwardMaster();
  const fonts = {
    body: await document.embedFont(StandardFonts.TimesRomanItalic),
    script: await document.embedFont(StandardFonts.Helvetica),
  };
  const data = getTrustedToServeData(input(changes));
  return { data, fonts, document, plans: planAwardText(data, fonts) };
}

test('measured paragraph wrapping and line fitting stay clear of the recipient and signatures; impossible inputs fail', async () => {
  for (const firstName of ['Alex', 'Émilie Anne-Marie Catherine Alexandra']) {
    const { data, fonts, document, plans } = await synthetic({ firstName });
    for (const plan of plans)
      for (const line of plan.lines)
        assert.ok(
          plan.font.widthOfTextAtSize(line, plan.size) <= plan.width + 0.001,
        );
    for (const plan of plans.slice(0, 2))
      assert.ok(plan.y - (plan.lines.length - 1) * plan.leading >= 218);
    const bytes = await renderTrustedToServe(document, data, fonts);
    const output = await PDFDocument.load(bytes);
    assert.equal(output.getPageCount(), 1);
    assert.equal(output.catalog.has(PDFName.of('AcroForm')), false);
  }
  await assert.rejects(
    synthetic({
      firstName: 'W'.repeat(100),
      lastName: 'W'.repeat(100),
      postNominals: 'W'.repeat(120),
    }),
    {
      code: 'award_text_overflow',
    },
  );
  await assert.rejects(synthetic({ firstName: '漢字' }), {
    code: 'award_data_invalid',
  });
});

test('missing exact fonts fail safely instead of returning a substituted award', async () => {
  const old = process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH;
  process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH =
    '/missing-cmcen-font/ScriptMTBold.ttf';
  try {
    await assert.rejects(generateTrustedToServe(input()), {
      code: 'certificate_fonts_unavailable',
      status: 503,
    });
  } finally {
    if (old === undefined) delete process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH;
    else process.env.CERTIFICATE_SCRIPT_MT_BOLD_PATH = old;
  }
});

test('bundled fonts generate short/long awards without configuration with rebuilt shadows and isolated input', () =>
  withBundledCertificateFonts(async () => {
    const before = await fs.readFile(MASTER_PATH);
    for (const firstName of ['Alex', 'Émilie Anne-Marie Catherine Alexandra']) {
      const request = input({ firstName });
      const snapshot = structuredClone(request);
      const document = await PDFDocument.load(
        await generateTrustedToServe(request),
      );
      const content = document.getPages()[0].node.Contents();
      const streams = content.asArray ? content.asArray() : [content];
      const operators = streams
        .map((ref) =>
          Buffer.from(
            decodePDFRawStream(document.context.lookup(ref)).decode(),
          ).toString(),
        )
        .join('\n');
      assert.doesNotMatch(
        operators,
        /Nyamiaka|\(Nyami|\/Image33 Do|\/Image43 Do/u,
      );
      assert.match(
        document.context
          .enumerateIndirectObjects()
          .map(([, o]) => o.toString())
          .join('\n'),
        /ScriptMTBold/u,
      );
      assert.deepEqual(request, snapshot);
    }
    assert.deepEqual(await fs.readFile(MASTER_PATH), before);
  }));

module.exports = { input };

test('heading fits full rank first, abbreviates before shrinking, and preserves the complete name', async () => {
  const { abbreviation } = require('../public/person-rank-options');
  assert.equal(abbreviation('Chief Warrant Officer', 'en'), 'CWO');
  assert.equal(abbreviation('Adjudant-chef', 'fr'), 'Adjuc');
  assert.equal(abbreviation('Chief Petty Officer 1st Class', 'en'), 'CPO 1');
  assert.equal(abbreviation('Capitaine de frégate', 'fr'), 'Capf');
  assert.equal(abbreviation('Sailor Third Class', 'en'), 'S3');
  const document = await loadAwardMaster();
  const fonts = {
    body: await document.embedFont(StandardFonts.TimesRomanItalic),
    script: await document.embedFont(StandardFonts.Helvetica),
  };
  const heading = (data) =>
    planAwardText(data, fonts).find((plan) => plan.shadow);
  const short = getTrustedToServeData(
    input({ fullRankEn: 'Chief Warrant Officer' }),
  );
  assert.deepEqual(heading(short).lines, [short.headline]);
  assert.equal(heading(short).size, 32.04);
  let medium, long;
  for (let n = 1; n < 70; n++) {
    const data = getTrustedToServeData(
      input({
        fullRankEn: 'Chief Warrant Officer',
        firstName: 'A'.repeat(n),
        postNominals: 'CD',
      }),
    );
    const full = fonts.script.widthOfTextAtSize(data.headline, 32.04);
    const abbreviated = fonts.script.widthOfTextAtSize(
      data.abbreviatedHeadline,
      32.04,
    );
    if (full > 672 && abbreviated <= 672) medium = data;
    if (abbreviated > 672 && abbreviated < 950) long = data;
  }
  assert.ok(medium);
  assert.ok(long);
  assert.deepEqual(heading(medium).lines, [medium.abbreviatedHeadline]);
  assert.equal(heading(medium).size, 32.04);
  assert.deepEqual(heading(long).lines, [long.abbreviatedHeadline]);
  assert.ok(heading(long).size < 32.04 && heading(long).size >= 18);
});
