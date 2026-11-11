const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
test('student is the default and instructor selection reaches manual PDFs and public requests with renewed review', async () => {
  for (const requestMode of [false, true]) {
    const page = setup(undefined, false, requestMode);
    assert.equal(page.control('awardRole').value, 'student');
    assert.deepEqual(
      page.control('awardRole').children.map((option) => option.value),
      ['student', 'instructor'],
    );
    await page.fill();
    await reviewed(page);
    page.control('awardRole').value = 'instructor';
    await page.control('awardRole').fire('change');
    assert.equal(page.control('reviewed').checked, false);
    await page.control('download').fire('click');
    assert.equal(page.calls.length, 0);
    await page.document.fire('languagechange');
    assert.equal(page.control('awardRole').value, 'instructor');
    await reviewed(page);
    await page.control('download').fire('click');
    const payload = requestMode ? page.calls[0].body.award : page.calls[0].body;
    assert.equal(payload.awardRole, 'instructor');
    page.controller.dispose();
  }
  const retirement = setup(undefined, true, true);
  assert.equal(retirement.control('awardRole'), null);
  retirement.controller.dispose();
});

test('an uncertain instructor request locks the role and retries the same snapshot', async () => {
  let attempt = 0;
  const page = setup(async () => {
    if (++attempt === 1) throw new Error('Network');
    return { certificateRequest: { id: 'r1', status: 'pending' } };
  }, false, true);
  await page.fill();
  page.control('awardRole').value = 'instructor';
  await page.control('awardRole').fire('change');
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(page.control('awardRole').disabled, true);
  await page.document.fire('languagechange');
  assert.equal(page.control('awardRole').value, 'instructor');
  assert.equal(page.control('awardRole').disabled, true);
  await page.control('download').fire('click');
  assert.deepEqual(page.calls[0].body, page.calls[1].body);
  assert.equal(page.calls[1].body.award.awardRole, 'instructor');
  page.controller.dispose();
});

test('manual PDF downloads honor server filenames for award and French retirement certificates', async () => {
  for (const [retirement, name, header] of [
    [false, '20261110-UU-1000-C&E_Corporal_Calayag.pdf', 'ascii'],
    [true, '20261110-UU-1000-C&E-FR-Caporale_Bélanger_CD.pdf', 'utf8'],
  ]) {
    const page = setup(
      async () => ({
        headers: new Headers({
          'Content-Disposition':
            header === 'ascii'
              ? `attachment; filename="${name}"`
              : `attachment; filename="fallback.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        }),
        blob: async () => ({ type: 'application/pdf' }),
      }),
      retirement,
    );
    if (!retirement) await page.fill();
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.downloads[0], name);
    assert.equal(page.urls.length, page.revoked.length);
    page.controller.dispose();
  }
});
test('expired submission sessions retain the same request for retry after new-tab sign-in', async () => {
  let expired = true;
  const page = setup(
    async () => {
      if (expired) throw Object.assign(new Error('Expired'), { status: 401 });
      return { certificateRequest: { id: 'r1', status: 'pending' } };
    },
    false,
    true,
  );
  await page.fill();
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(page.status(), 'trusted_request_session_expired');
  assert.equal(page.root.querySelector('a').target, '_blank');
  expired = false;
  await page.control('download').fire('click');
  assert.equal(page.calls[0].body.requestId, page.calls[1].body.requestId);
  page.controller.dispose();
});
test('requests retain idempotent snapshots through retries and language changes', async () => {
  let attempt = 0;
  const page = setup(
    async () => {
      if (++attempt === 1) throw new Error('Network');
      return { certificateRequest: { id: 'r1', status: 'pending' } };
    },
    false,
    true,
  );
  await page.fill();
  await reviewed(page);
  assert.equal(page.controller.canNavigate(), true);
  assert.equal(page.controller.hasUnsavedChanges(), true);
  await page.control('download').fire('click');
  assert.equal(page.calls[0].url, '/api/certificate-requests/trusted-to-serve');
  assert.equal(page.calls[0].body.award.firstName, 'Émilie');
  assert.equal(page.calls[0].body.award.reviewed, true);
  assert.equal(page.calls[0].body.mailingAddress.country, '');
  await page.document.fire('languagechange');
  assert.equal(page.control('firstName').disabled, true);
  await page.control('download').fire('click');
  assert.equal(page.calls[0].body.requestId, page.calls[1].body.requestId);
  assert.equal(page.controller.hasUnsavedChanges(), false);
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 2);
  page.control('firstName').value = 'Alex';
  await page.control('firstName').fire('input');
  assert.equal(page.control('reviewed').checked, false);
  await reviewed(page);
  await page.control('download').fire('click');
  assert.notEqual(page.calls[0].body.requestId, page.calls[2].body.requestId);
  page.controller.dispose();
  assert.equal(page.controller.hasUnsavedChanges(), false);
});
test('request validation allows corrections; pending requests guard double clicks and abort', async () => {
  let fail = true,
    resolve;
  const page = setup(
    () =>
      fail
        ? Promise.reject(
            Object.assign(new Error('Invalid'), {
              status: 422,
              data: { code: 'certificate_request_invalid' },
            }),
          )
        : new Promise((yes) => {
            resolve = yes;
          }),
    false,
    true,
  );
  await page.fill();
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(page.status(), 'trusted_request_invalid');
  assert.equal(page.control('firstName').disabled, false);
  fail = false;
  const pending = page.control('download').fire('click');
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 2);
  page.controller.dispose();
  assert.equal(page.calls[1].signal.aborted, true);
  resolve({ certificateRequest: { id: 'r1', status: 'pending' } });
  await pending;
  assert.equal(page.root.children.length, 0);
});
test('retirement request submits structured member data without PDF actions', async () => {
  const page = setup(
    async () => ({ certificateRequest: { id: 'r1', status: 'pending' } }),
    true,
    true,
  );
  page.controller.setFamilyOptions({
    relationships: [],
    wordings: require('../config/certificate-wording').FAMILY_WORDING_OPTIONS,
  });
  await page.root.querySelector('.manual-family-add').fire('click');
  assert.equal(page.root.querySelector('.manual-family-download'), null);
  await reviewed(page);
  await page.control('download').fire('click');
  assert.equal(page.calls[0].url, '/api/certificate-requests/retirement');
  assert.equal(page.calls[0].body.retirement.familyMembers.length, 1);
  assert.equal(page.calls[0].body.dwdParadeRequested, false);
  assert.equal(page.calls[0].body.award, undefined);
  page.controller.dispose();
});

for (const retirement of [false, true]) {
  const kind = retirement ? 'retirement' : 'trusted-to-serve';
  test(`${kind} requests require the custom needed-by date and preserve it across language changes`, async () => {
    const page = setup(
      async () => ({ certificateRequest: { id: 'r1', status: 'pending' } }),
      retirement,
      true,
      true,
    );
    const first = page.picker('neededByDate');
    assert.equal(first.options.dateName, 'neededByDate');
    assert.equal(first.options.includeTime, false);
    assert.equal(first.trigger.type, 'button');
    assert.equal(
      first.trigger.getAttribute('aria-label'),
      'trusted_request_neededByDate',
    );
    assert.equal(first.trigger.parent.parent.htmlFor, first.trigger.id);
    assert.equal(
      page.root
        .querySelectorAll('input')
        .some((input) => input.type === 'date'),
      false,
    );

    await reviewed(page);
    await page.root.querySelector('form').fire('submit');
    assert.equal(page.calls.length, 0);
    assert.equal(page.document.activeElement, first.trigger);
    assert.equal(first.trigger.getAttribute('aria-invalid'), 'true');
    const error = first.picker.parent
      .querySelectorAll('span')
      .find(
        (span) => span.id === first.trigger.getAttribute('aria-describedby'),
      );
    assert.equal(error.hidden, false);
    assert.equal(error.textContent, 'validation_field_required');

    first.picker.setValue({ date: '2026-11-20', emit: true });
    assert.equal(page.control('reviewed').checked, false);
    assert.equal(first.trigger.getAttribute('aria-invalid'), null);
    assert.equal(error.hidden, true);
    assert.equal(page.controller.hasUnsavedChanges(), true);
    page.window.translate = (key) => `fr:${key}`;
    await page.document.fire('languagechange');
    const translated = page.picker('neededByDate');
    assert.equal(first.destroyed, 1);
    assert.equal(translated.picker.getValue().date, '2026-11-20');
    assert.equal(
      translated.trigger.getAttribute('aria-label'),
      'fr:trusted_request_neededByDate',
    );
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.calls[0].url, `/api/certificate-requests/${kind}`);
    assert.equal(page.calls[0].body.neededByDate, '2026-11-20');
    assert.equal(page.control('download').disabled, true);
    assert.equal(translated.trigger.disabled, false);

    translated.picker.setValue({ date: '', emit: true });
    assert.equal(page.control('reviewed').checked, false);
    assert.equal(page.control('download').disabled, false);
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.calls.length, 1);
    translated.picker.setValue({ date: '2026-11-21', emit: true });
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.calls[1].body.neededByDate, '2026-11-21');
    assert.notEqual(page.calls[0].body.requestId, page.calls[1].body.requestId);
    page.controller.dispose();
    assert.ok(page.pickers.every((picker) => picker.destroyed === 1));
  });

  test(`${kind} needed-by picker locks its open calendar and preserves an uncertain submission for retry`, async () => {
    let reject,
      attempt = 0;
    const page = setup(
      () =>
        ++attempt === 1
          ? new Promise((_, no) => {
              reject = no;
            })
          : Promise.resolve({
              certificateRequest: { id: 'r1', status: 'pending' },
            }),
      retirement,
      true,
      true,
    );
    const first = page.picker('neededByDate');
    first.picker.setValue({ date: '2026-11-20', emit: true });
    // The shared picker moves its open popover out of the form into body.
    first.picker.children = first.picker.children.filter(
      (child) => child !== first.popover,
    );
    page.document.body.append(first.popover);
    await reviewed(page);
    const pending = page.control('download').fire('click');
    assert.equal(first.trigger.disabled, true);
    assert.ok(first.popover.elements.every((control) => control.disabled));
    first.picker.setValue({ date: '2026-12-01', emit: true });
    assert.equal(first.picker.getValue().date, '2026-11-20');
    assert.equal(page.calls[0].body.neededByDate, '2026-11-20');
    await page.control('download').fire('click');
    assert.equal(page.calls.length, 1);
    reject(new Error('Network'));
    await pending;
    assert.equal(first.trigger.disabled, true);
    assert.equal(page.control('download').disabled, false);
    await page.document.fire('languagechange');
    const retry = page.picker('neededByDate');
    assert.equal(first.destroyed, 1);
    assert.equal(retry.trigger.disabled, true);
    assert.equal(retry.picker.getValue().date, '2026-11-20');
    await page.control('download').fire('click');
    assert.deepEqual(page.calls[1].body, page.calls[0].body);
    assert.equal(retry.trigger.disabled, false);
    assert.ok(retry.popover.elements.every((control) => !control.disabled));
    page.controller.dispose();
    assert.ok(page.pickers.every((picker) => picker.destroyed === 1));
  });

  test(`${kind} needed-by field retains required native fallback when the custom picker is unavailable`, async () => {
    const page = setup(
      async () => ({ certificateRequest: { id: 'r1', status: 'pending' } }),
      retirement,
      true,
    );
    const needed = page.root.querySelector('.trusted-request-neededByDate');
    assert.equal(needed.type, 'date');
    assert.equal(needed.required, true);
    assert.equal(needed.name, 'neededByDate');
    page.root.querySelector('form').reportValidity = () =>
      Boolean(needed.value);
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.calls.length, 0);
    needed.value = '2026-11-20';
    await needed.fire('input');
    await reviewed(page);
    await page.control('download').fire('click');
    assert.equal(page.calls[0].body.neededByDate, '2026-11-20');
    page.controller.dispose();
  });
}

function setup(
  api = async () => ({ blob: async () => ({ type: 'application/pdf' }) }),
  memberRetirement = false,
  requestMode = false,
  customPicker = false,
) {
  const root = new Element('div'),
    document = new Element('document'),
    calls = [],
    urls = [],
    revoked = [],
    downloads = [],
    pickers = [];
  document.body = new Element('body');
  document.createElement = (tag) => {
    const element = new Element(tag);
    element.click = () => downloads.push(element.download);
    element.remove = () => {};
    element.focus = () => {
      document.activeElement = element;
    };
    return element;
  };
  const window = {
    CMCENUtils: require('./helpers/app-utils')({
      Intl: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'America/Toronto' }),
        }),
      },
    }),
    crypto: require('node:crypto'),
    translate: (key) => key,
    CMCENRanks: require('../public/person-rank-options'),
    CMCENAwardRanks: require('../public/trusted-to-serve-ranks'),
  };
  if (customPicker)
    window.CMCENDateTimePicker = {
      create(options) {
        const picker = document.createElement('div'),
          trigger = document.createElement('button'),
          popover = document.createElement('div'),
          input = document.createElement('input');
        trigger.type = 'button';
        trigger.className = 'cmcen-date-time-trigger';
        trigger.setAttribute('aria-label', options.label);
        popover.className = 'cmcen-date-time-popover';
        popover.append(
          ...['button', 'input', 'select'].map((tag) =>
            document.createElement(tag),
          ),
        );
        input.type = 'hidden';
        input.name = options.dateName || `${options.name}Date`;
        input.value = options.date;
        picker.append(input, trigger, popover);
        const record = { options, picker, trigger, popover, destroyed: 0 };
        picker.setValue = ({ date, emit = false }) => {
          input.value = date;
          if (emit) options.onInput({ date });
        };
        picker.getValue = () => ({ date: input.value });
        picker.destroy = () => {
          record.destroyed++;
        };
        pickers.push(record);
        return picker;
      },
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
    requestMode,
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
      presentationDate: '2026-11-13',
      frPronoun: 'elle',
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
    window,
    calls,
    urls,
    revoked,
    downloads,
    controller,
    control,
    fill,
    pickers,
    picker: (name) =>
      pickers.findLast(
        (entry) => entry.options.name === name && !entry.destroyed,
      ),
    denied: () => denied,
    status: () => root.querySelector('p').textContent,
  };
}

async function reviewed(page) {
  page.control('reviewed').checked = true;
  await page.control('reviewed').fire('change');
}

test('award rank is a bilingual dropdown with explicit French forms and no article/text-rank controls', async () => {
  const page = setup();
  const rank = page.control('fullRankEn');
  assert.equal(rank.tagName, 'SELECT');
  assert.equal(rank.required, true);
  assert.equal(
    rank.getAttribute('aria-describedby'),
    'trusted-award-rank-hint',
  );
  const corporal = rank.children.find((option) => option.value === 'Corporal');
  assert.match(corporal.textContent, /Corporal \(Cpl\) \/ Caporal \(Cpl\)/u);
  rank.value = 'Corporal';
  await rank.fire('change');
  const form = page.control('frPronoun');
  assert.equal(form.value, ''); // No gender default or inference from name.
  assert.match(
    form.children.find((option) => option.value === 'elle').textContent,
    /Caporale/u,
  );
  rank.value = 'Aviator';
  await rank.fire('change');
  assert.match(
    form.children.find((option) => option.value === 'elle').textContent,
    /Aviatrice/u,
  );
  assert.equal(page.control('rankEn'), null);
  assert.equal(page.control('rankFr'), null);
  assert.equal(page.control('frRankGrammar'), null);
  await page.fill();
  await reviewed(page);
  await page.control('download').fire('click');
  const result =
    require('../services/trusted-to-serve-documents').getTrustedToServeData(
      page.calls[0].body,
    );
  assert.equal(result.dedicationFr, 'Décerné à la Cpl D’Amour');
  page.controller.dispose();
});

test('manual families reuse explicit relationship options and download individual documents or a packet without preview', async () => {
  const page = setup(undefined, true);
  page.controller.setFamilyOptions({
    relationships: require('../config/certificate-requests')
      .CERTIFICATE_FAMILY_RELATIONSHIPS,
    wordings: require('../config/certificate-wording').FAMILY_WORDING_OPTIONS,
  });
  for (const [index, name, inverse] of [
    [0, 'Camille Bélanger', 'husband'],
    [1, 'Jo Tremblay', 'granddaughter'],
  ]) {
    await page.root.querySelector('.manual-family-add').fire('click');
    const field = (key) =>
      page.root
        .querySelectorAll('.certificate-manual-family')
        [index].querySelector('.manual-family-' + key);
    field('fullName').value = name;
    await field('fullName').fire('input');
    assert.equal(field('relationship'), null);
    field('memberRelationshipToRecipient').value = inverse;
    await field('memberRelationshipToRecipient').fire('change');
  }
  await reviewed(page);
  await page.root.querySelectorAll('.manual-family-download')[1].fire('click');
  assert.equal(
    page.calls[0].url,
    '/api/certificate-requests/retirement.pdf?timeZone=America%2FToronto&download=1',
  );
  assert.equal(page.calls[0].body.documentKind, 'family');
  assert.equal(page.calls[0].body.familyIndex, 1);
  assert.deepEqual(
    Array.from(page.calls[0].body.familyMembers, (f) => [
      f.fullName,
      f.memberRelationshipToRecipient,
    ]),
    [
      ['Camille Bélanger', 'husband'],
      ['Jo Tremblay', 'granddaughter'],
    ],
  );
  await page.root.querySelector('.manual-packet-download').fire('click');
  assert.equal(page.calls[1].body.documentKind, 'packet');
  assert.equal(page.calls[1].url, page.calls[0].url);
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
    '/api/certificate-requests/retirement.pdf?timeZone=America%2FToronto&download=1',
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
  assert.equal(
    page.calls[0].url,
    '/api/certificate-requests/trusted-to-serve.pdf?timeZone=America%2FToronto&download=1',
  );
  assert.equal(page.downloads.length, 1);
  assert.equal(page.root.querySelector('iframe'), null);
  await page.document.fire('languagechange');
  assert.equal(page.control('firstName').value, 'Émilie');
  assert.equal(page.control('frPronoun').value, 'elle');
  assert.equal(page.control('rankFr'), null);
  assert.equal(page.control('rankEn'), null);
  assert.equal(page.control('frRankGrammar'), null);
  assert.equal(page.calls[0].body.rankFr, undefined);
  page.control('fullRankEn').value = 'Sergeant';
  await page.control('fullRankEn').fire('change');
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
