const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  certificateFilename,
  certificateDisposition,
} = require('../services/certificate-filenames');
const now = new Date('2026-11-10T12:30:00Z');
const member = {
  rank: 'Corporal',
  rankLanguage: 'en',
  fullName: 'John Calayag',
  lastName: 'Calayag',
  decorations: ['CD'],
  releaseDate: '2020-01-01',
};

test('generation dates use the requested local day and Toronto default across midnight and DST', () => {
  const retirement = { certificateType: 'retirement', member };
  for (const [instant, timeZone, day] of [
    ['2026-11-10T00:30:00Z', undefined, '20261109'],
    ['2026-11-10T04:59:59Z', 'America/Toronto', '20261109'],
    ['2026-11-10T05:00:00Z', 'America/Toronto', '20261110'],
    ['2026-07-10T03:59:59Z', 'America/Toronto', '20260709'],
    ['2026-07-10T04:00:00Z', 'America/Toronto', '20260710'],
    ['2026-11-10T00:30:00Z', 'Asia/Tokyo', '20261110'],
  ]) {
    for (const record of [
      retirement,
      {
        certificateType: 'trusted_to_serve',
        trustedToServe: { fullRankEn: 'Corporal', lastName: 'Example' },
      },
    ])
      assert.ok(
        certificateFilename(record, {
          now: new Date(instant),
          timeZone,
        }).startsWith(day + '-'),
        `${instant} ${timeZone}`,
      );
  }
  for (const timeZone of ['', 'Not/AZone', [], {}, 'x'.repeat(101)])
    assert.throws(
      () => certificateFilename(retirement, { now, timeZone }),
      RangeError,
    );
});

test('long UTF-8 names are bounded deterministically without splitting code points or losing document suffixes', () => {
  const retirement = {
    certificateType: 'retirement',
    member: { ...member, lastName: '𐐀'.repeat(100), decorations: ['CD'] },
  };
  for (const kind of ['member', 'family', 'packet']) {
    const options = { now, kind, familyIndex: 2 };
    const filename = certificateFilename(retirement, options);
    assert.ok(Buffer.byteLength(filename, 'utf8') <= 240);
    assert.ok(filename.isWellFormed());
    assert.equal(certificateFilename(retirement, options), filename);
    assert.match(filename, /_[0-9a-f]{12}(?:_family-3|_packet)?\.pdf$/u);
    if (kind === 'family') assert.match(filename, /_family-3\.pdf$/u);
    if (kind === 'packet') assert.match(filename, /_packet\.pdf$/u);
    assert.notEqual(
      certificateFilename(
        {
          ...retirement,
          member: {
            ...retirement.member,
            lastName: `${retirement.member.lastName}A`,
          },
        },
        options,
      ),
      filename,
    );
  }
  retirement.member.lastName = ' /\\\r\n ';
  assert.match(
    certificateFilename(retirement, { now }),
    /Corporal_Recipient_CD\.pdf$/u,
  );
});

test('exact requested naming uses generation day, rank language and explicit surname', () => {
  const retirement = { certificateType: 'retirement', member };
  assert.equal(
    certificateFilename(retirement, { now }),
    '20261110-UU-1000-C&E-EN-Corporal_Calayag_CD.pdf',
  );
  assert.equal(
    certificateFilename(
      { ...retirement, member: { ...member, rankLanguage: 'fr' } },
      { now },
    ),
    '20261110-UU-1000-C&E-FR-Caporal_Calayag_CD.pdf',
  );
  assert.equal(
    certificateFilename(
      {
        certificateType: 'trusted_to_serve',
        trustedToServe: {
          fullRankEn: 'Corporal',
          lastName: 'Calayag',
          presentationDate: '2030-01-01',
        },
      },
      { now },
    ),
    '20261110-UU-1000-C&E_Corporal_Calayag.pdf',
  );
});

test('compound and legacy names, suffixes, Unicode and unsafe separators are handled without guessing', () => {
  const retirement = {
    certificateType: 'retirement',
    member: { ...member, lastName: 'de la Rivière', decorations: [] },
  };
  assert.equal(
    certificateFilename(retirement, { now, kind: 'family', familyIndex: 1 }),
    '20261110-UU-1000-C&E-EN-Corporal_de_la_Rivière_family-2.pdf',
  );
  assert.match(
    certificateFilename(retirement, { now, kind: 'packet' }),
    /Rivière_packet\.pdf$/u,
  );
  delete retirement.member.lastName;
  assert.match(
    certificateFilename(retirement, { now }),
    /Corporal_John_Calayag\.pdf$/u,
  );
  retirement.member.lastName = '../Évil\\Name/\r\nHeader:"x"';
  const filename = certificateFilename(retirement, { now });
  assert.doesNotMatch(filename, /[\\/\r\n"]/u);
  const header = certificateDisposition(filename, true);
  assert.match(
    header,
    /^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''/u,
  );
  assert.equal(
    decodeURIComponent(header.split("filename*=UTF-8''")[1]),
    filename,
  );
  assert.match(certificateDisposition(filename, false), /^inline;/u);
});
