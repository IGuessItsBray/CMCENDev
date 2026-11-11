const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPdfDownloadFilename } = require('./helpers/app-utils')();
const response = (header) => ({
  headers: new Headers(header ? { 'Content-Disposition': header } : {}),
});

test('certificate PDF requests use the browser time zone for previews and downloads, with a safe local default', () => {
  const load = require('./helpers/app-utils');
  for (const timeZone of ['America/Toronto', 'Pacific/Auckland', 'Asia/Tokyo']) {
    const utils = load({
      Intl: {
        DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }),
      },
    });
    for (const download of [false, true]) {
      const query = new URLSearchParams(utils.getCertificatePdfQuery(download));
      assert.equal(query.get('timeZone'), timeZone);
      assert.equal(query.get('download'), download ? '1' : null);
    }
  }
  for (const DateTimeFormat of [
    () => {
      throw new Error('No Intl time zone support');
    },
    () => ({ resolvedOptions: () => ({}) }),
  ]) {
    assert.equal(
      new URLSearchParams(
        load({ Intl: { DateTimeFormat } }).getCertificatePdfQuery(),
      ).get('timeZone'),
      'America/Toronto',
    );
  }
});

test('PDF downloads prefer UTF-8 names and preserve branch ampersand and French characters', () => {
  const name = '20261110-UU-1000-C&E-FR-Caporale_Bélanger_CD.pdf';
  assert.equal(
    getPdfDownloadFilename(
      response(
        `attachment; filename="ascii.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      ),
    ),
    name,
  );
  const ascii = '20261110-UU-1000-C&E_Corporal_Calayag.pdf';
  assert.equal(
    getPdfDownloadFilename(response(`attachment; filename="${ascii}"`)),
    ascii,
  );
  assert.equal(
    getPdfDownloadFilename(response(`inline; filename=${ascii}`)),
    ascii,
  );
});

test('missing, malformed or unsafe headers use a safe PDF fallback', () => {
  for (const header of [
    undefined,
    'attachment',
    'garbage',
    'attachment; filename="unfinished.pdf',
    'attachment; filename="../secret.pdf"',
    'attachment; filename="folder/secret.pdf"',
    'attachment; filename="folder\\secret.pdf"',
    'attachment; filename="C:\\\\secret.pdf"',
    'attachment; filename="file.html"',
    'attachment; filename="a.pdf"; filename="b.pdf"',
    "attachment; filename*=UTF-8''bad%ZZ.pdf",
    "attachment; filename*=UTF-8''bad%0A.pdf",
    "attachment; filename*=UTF-8''%2Fsecret.pdf",
    "attachment; filename*=UTF-8''%5Csecret.pdf",
    "attachment; filename*=UTF-8''%E2%80%AEevil.pdf",
    "attachment; filename*=UTF-8''zero%E2%80%8Ewidth.pdf",
    "attachment; filename*=UTF-8''zero%E2%81%A0width.pdf",
    "attachment; filename*=ISO-8859-1''name.pdf",
  ])
    assert.equal(
      getPdfDownloadFilename(response(header), 'fallback.pdf'),
      'fallback.pdf',
      header,
    );
  assert.equal(getPdfDownloadFilename({}, '../bad.pdf'), 'certificate.pdf');
});
