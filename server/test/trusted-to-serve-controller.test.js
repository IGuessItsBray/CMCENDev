const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
function setup(
  api = async () => ({ blob: async () => ({ type: 'application/pdf' }) }),
  memberRetirement = false,
) {
  const root = new Element('div'),
    document = new Element('document'),
    calls = [],
    urls = [],
    revoked = [],
    downloads = [];
  document.body = new Element('body');
  document.createElement = (tag) => {
    const element = new Element(tag);
    element.click = () => downloads.push(element.download);
    element.remove = () => {};
    return element;
  };
  const window = {
    translate: (key) => key,
    CMCENRanks: require('../public/person-rank-options'),
  };
  let denied = 0,
    controller;
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/trusted-to-serve-controller.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      setTimeout: (fn) => fn(),
      URL: {
        createObjectURL: () => {
          const value = `blob:award-${urls.length}`;
          urls.push(value);
          return value;
        },
        revokeObjectURL: (url) => revoked.push(url),
      },
    },
  );
  controller = window.TrustedToServe.mount({
    memberRetirement,
    root,
    api: async (url, options) => {
      calls.push({ url, ...options });
      return api(url, options);
    },
    onDenied: () => {
      denied++;
      controller.dispose();
    },
  });
  const control = (key) => root.querySelector(`.trusted-award-${key}`);
  const fill = async () => {
    for (const [key, value] of Object.entries({
      firstName: 'Émilie',
      lastName: 'D’Amour',
      fullRankEn: 'Corporal',
      postNominals: '',
      rankEn: 'Corporal',
      rankFr: 'Caporale',
      presentationDate: '2026-11-13',
      frPronoun: 'elle',
      frRankGrammar: 'feminine',
    })) {
      const element = control(key);
      element.value = value;
      await element.fire(
        key.startsWith('fr') || key === 'fullRankEn' ? 'change' : 'input',
      );
    }
  };
  return {
    root,
    document,
    calls,
    urls,
    revoked,
    downloads,
    controller,
    control,
    fill,
    denied: () => denied,
    status: () => root.querySelector('p').textContent,
  };
}

async function reviewed(page) {
  page.control('reviewed').checked = true;
  await page.control('reviewed').fire('change');
}

test('manual families reuse explicit relationship options and download individual documents or a packet without preview', async () => {
  const page = setup(undefined, true);
  page.controller.setFamilyOptions({
    relationships: require('../config/certificate-requests')
      .CERTIFICATE_FAMILY_RELATIONSHIPS,
    wordings: require('../config/certificate-wording').FAMILY_WORDING_OPTIONS,
  });
  for (const [index, name, relation, inverse] of [
    [0, 'Camille Bélanger', 'wife', 'husband'],
    [1, 'Jo Tremblay', 'father', 'daughter'],
  ]) {
    await page.root.querySelector('.manual-family-add').fire('click');
    const field = (key) =>
      page.root
        .querySelectorAll('.certificate-manual-family')
        [index].querySelector('.manual-family-' + key);
    field('fullName').value = name;
    await field('fullName').fire('input');
    field('relationship').value = relation;
    await field('relationship').fire('change');
    field('memberRelationshipToRecipient').value = inverse;
    await field('memberRelationshipToRecipient').fire('change');
  }
  await reviewed(page);
  await page.root.querySelectorAll('.manual-family-download')[1].fire('click');
  assert.equal(page.calls[0].body.documentKind, 'family');
  assert.equal(page.calls[0].body.familyIndex, 1);
  assert.deepEqual(
    Array.from(page.calls[0].body.familyMembers, (f) => [
      f.fullName,
      f.memberRelationshipToRecipient,
    ]),
    [
      ['Camille Bélanger', 'husband'],
      ['Jo Tremblay', 'daughter'],
    ],
  );
  await page.root.querySelector('.manual-packet-download').fire('click');
  assert.equal(page.calls[1].body.documentKind, 'packet');
  await page.root.querySelector('.manual-family-remove').fire('click');
  assert.equal(page.control('reviewed').checked, false);
  assert.equal(
    page.root.querySelectorAll('.certificate-manual-family').length,
    1,
  );
  assert.equal(page.root.querySelector('iframe'), null);
  page.controller.dispose();
});

test('manual retirement downloads are private, independent and require renewed detail review after edits', async () => {
  const page = setup(undefined, true);
  for (const [key, value] of Object.entries({
    firstName: 'Émilie',
    lastName: 'D’Amour',
    postNominals: '',
    fullRankEn: 'Warrant Officer',
    rankLanguage: 'fr',
    ceBranchEnrollmentDate: '1984-02-29',
    releaseDate: '2026-08-01',
  })) {
    const field = page.control(key);
    field.value = value;
    await field.fire(field.tagName === 'SELECT' ? 'change' : 'input');
  }
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 0);
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(
    page.calls[0].url,
    '/api/certificate-requests/retirement.pdf?download=1',
  );
  assert.equal(page.calls[0].body.ceBranchEnrollmentDate, '1984-02-29');
  assert.equal(page.calls[0].body.postNominals, '');
  assert.equal(page.downloads[0], 'retirement-member-2026-08-01.pdf');
  assert.equal(page.root.querySelector('iframe'), null);
  page.control('lastName').value = 'Tremblay';
  await page.control('lastName').fire('input');
  assert.equal(page.control('reviewed').checked, false);
  page.controller.dispose();
});
test('award downloads preserve explicit choices across language changes without preview controls', async () => {
  const page = setup();
  await page.fill();
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 0);
  assert.equal(page.status(), 'trusted_award_review_required');
  assert.equal(page.control('preview'), null);
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(page.calls[0].parseJson, false);
  assert.equal(page.calls[0].method, 'POST');
  assert.equal(page.calls[0].body.frPronoun, 'elle');
  assert.match(page.calls[0].url, /download=1$/);
  assert.equal(page.downloads.length, 1);
  assert.equal(page.root.querySelector('iframe'), null);
  await page.document.fire('languagechange');
  assert.equal(page.control('firstName').value, 'Émilie');
  assert.equal(page.control('frRankGrammar').value, 'feminine');
  page.control('rankFr').value = 'Sergente';
  await page.control('rankFr').fire('input');
  assert.equal(page.control('reviewed').checked, false);
  page.controller.dispose();
  assert.deepEqual(page.revoked.sort(), page.urls.sort());
});
test('downloads guard repeated clicks, recover errors, abort on disposal and clear denied output', async () => {
  let resolve;
  const pending = new Promise((yes) => {
    resolve = yes;
  });
  const page = setup(() => pending);
  await page.fill();
  await reviewed(page);
  const first = page.control('download').fire('click');
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 1);
  assert.equal(page.controller.canNavigate(), false);
  await page.document.fire('languagechange');
  assert.equal(page.control('download').disabled, true);
  page.controller.dispose();
  assert.equal(page.calls[0].signal.aborted, true);
  resolve({ blob: async () => ({ type: 'application/pdf' }) });
  await first;
  assert.equal(page.urls.length, 0);
  let fail = true;
  const recovery = setup(() =>
    fail
      ? Promise.reject(
          Object.assign(new Error('Overflow'), {
            status: 422,
            data: { json: async () => ({ code: 'award_text_overflow' }) },
          }),
        )
      : Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) }),
  );
  await recovery.fill();
  await reviewed(recovery);
  await recovery.control('download').fire('click');
  assert.equal(recovery.status(), 'trusted_award_overflow');
  assert.equal(recovery.control('download').disabled, false);
  fail = false;
  await recovery.control('download').fire('click');
  assert.equal(recovery.status(), 'trusted_award_ready');
  const denied = setup(() =>
    Promise.reject(Object.assign(new Error('Denied'), { status: 403 })),
  );
  await denied.fill();
  await reviewed(denied);
  await denied.control('download').fire('click');
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
});
