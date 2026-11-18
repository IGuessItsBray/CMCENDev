const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const request = (status = 'pending') => ({
  _id: 'request/1',
  certificateType: 'retirement',
  status,
  member: { fullName: 'Sample member' },
  familyMembers: [
    {
      fullName: 'Sample family',
      relationship: 'other',
      relationshipOther: 'Step-parent',
      memberRelationshipToRecipient: 'husband',
    },
  ],
});

const trustedRequest = () => ({
  ...request(),
  certificateType: 'trusted_to_serve',
  familyMembers: [],
  trustedToServe: {
    firstName: 'Sample',
    lastName: 'Member',
    fullRankEn: 'Corporal',
    postNominals: '',
    presentationDate: '2026-12-01',
    frPronoun: 'elle',
  },
});

test('hidden queue preserves generators, family options, retry and language lifecycle without cards', async () => {
  const mounted = [],
    options = [],
    disposed = [];
  let fail = true;
  const factory = (kind) => ({
    mount({ root }) {
      root.textContent = kind;
      mounted.push(kind);
      return {
        setFamilyOptions(value) {
          options.push(value);
        },
        dispose() {
          disposed.push(kind);
        },
      };
    },
  });
  const page = setup({
    showSubmittedRequests: false,
    manualGenerator: factory('retirement'),
    awardGenerator: factory('award'),
    api: () => {
      if (fail) throw new Error('Options unavailable');
    },
  });
  await page.controller.ready;
  assert.deepEqual(mounted, ['retirement', 'award']);
  assert.equal(
    page.root.querySelector('.certificate-requests-list').hidden,
    true,
  );
  assert.equal(page.root.querySelector('.certificate-request-card'), null);
  assert.equal(
    page.root.querySelector('.certificate-requests-toolbar').hidden,
    false,
  );
  assert.equal(page.refresh().textContent, 'admin_next_retry');
  fail = false;
  await page.refresh().fire('click');
  assert.equal(options[0].wordings[0].key, 'husband');
  assert.equal(
    page.root.querySelector('.certificate-requests-toolbar').hidden,
    true,
  );
  await page.document.fire('languagechange');
  assert.equal(
    page.root.querySelector('.certificate-requests-list').hidden,
    true,
  );
  assert.equal(page.root.querySelector('.certificate-request-card'), null);
  assert.equal(
    page.calls.filter(
      (call) => call.url === '/api/certificate-requests?status=actionable',
    ).length,
    2,
  );
  page.controller.dispose();
  assert.deepEqual(disposed.sort(), ['award', 'retirement']);
});

test('queued PDF downloads preserve server UTF-8 and ASCII certificate names', async () => {
  for (const [item, name, utf8] of [
    [trustedRequest(), '20261110-UU-1000-C&E_Corporal_Calayag.pdf', false],
    [request(), '20261110-UU-1000-C&E-FR-Caporale_Bélanger_CD.pdf', true],
  ]) {
    const page = setup({
      requests: [item],
      api: (url) =>
        url.includes('.pdf')
          ? Promise.resolve({
              headers: new Headers({
                'Content-Disposition': utf8
                  ? `attachment; filename="fallback.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`
                  : `attachment; filename="${name}"`,
              }),
              blob: async () => ({ type: 'application/pdf' }),
            })
          : undefined,
    });
    await page.controller.ready;
    await page.download().fire('click');
    assert.equal(page.downloads[0].download, name);
    assert.equal(page.urls.length, page.revoked.length);
    page.controller.dispose();
  }
});

test('Trusted to Serve queue downloads the saved award after staff review without advancing status', async () => {
  const item = trustedRequest();
  const page = setup({
    requests: [item],
    api: (url) =>
      url.includes('trusted-to-serve.pdf')
        ? Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  assert.equal(page.download().textContent, 'certificate_fulfillment_download');
  const labels = page.root
    .querySelectorAll('span')
    .map((element) => element.textContent);
  assert.ok(labels.includes('trusted_award_frPronoun'));
  assert.ok(labels.includes('trusted_award_awardRole'));
  assert.ok(!labels.includes('certificate_request_trade_role'));
  assert.ok(!labels.includes('certificate_release_date'));
  assert.equal(page.root.querySelector('.certificate-family-documents'), null);
  await page.download().fire('click');
  const call = page.calls.at(-1);
  assert.equal(
    call.url,
    '/api/certificate-requests/request%2F1/trusted-to-serve.pdf?timeZone=America%2FToronto&download=1',
  );
  assert.equal(call.method, 'POST');
  assert.equal(call.body.reviewed, true);
  assert.equal(Object.keys(call.body).length, 1);
  assert.equal(item.status, 'pending');
  assert.match(page.downloads[0].download, /^trusted-to-serve-/);
  assert.equal(page.urls.length, page.revoked.length);
  page.controller.dispose();
});

test('Trusted to Serve review cancellation, duplicate clicks and disposal do not generate certificates', async () => {
  const cancelled = setup({
    requests: [trustedRequest()],
    confirm: async () => false,
  });
  await cancelled.controller.ready;
  await cancelled.download().fire('click');
  assert.equal(cancelled.calls.length, 1);
  const pending = deferred();
  let confirms = 0;
  const page = setup({
    requests: [trustedRequest()],
    confirm: () => {
      confirms++;
      return pending.promise;
    },
  });
  await page.controller.ready;
  const action = page.download().fire('click');
  await page.download().fire('click');
  await page.document.fire('languagechange');
  assert.equal(confirms, 1);
  assert.equal(page.download().disabled, true);
  assert.equal(page.controller.canNavigate(), false);
  page.controller.dispose();
  pending.resolve(true);
  await action;
  assert.equal(page.calls.length, 1);
  assert.equal(page.downloads.length, 0);
});

function setup({
  requests = [request()],
  api: override,
  confirm = async () => true,
  form = async (_, { fields }) => ({
    certificateDate: fields[0].defaultValue || '2026-01-01',
  }),
  permissions = {},
  requestForm,
  showRequestForm = true,
  showSubmittedRequests = true,
  manualGenerator,
  awardGenerator,
} = {}) {
  const root = new Element('div'),
    document = new Element('document');
  document.createElement = (tag) => new Element(tag);
  document.getElementById = () => root;
  const calls = [];
  let denied = 0;
  const urls = [],
    revoked = [],
    downloads = [];
  document.body = new Element('body');
  document.createElement = (tag) => {
    const element = new Element(tag);
    element.click = () =>
      downloads.push({ href: element.href, download: element.download });
    element.remove = () => {};
    return element;
  };
  const window = {
    ManualRetirementCertificate: manualGenerator,
    TrustedToServe: awardGenerator,
    TrustedToServeRequest: requestForm,
    translate: (key, values) => key + (values ? JSON.stringify(values) : ''),
    CMCENUtils: {
      ...require('./helpers/app-utils')({
        Intl: {
          DateTimeFormat: () => ({
            resolvedOptions: () => ({ timeZone: 'America/Toronto' }),
          }),
        },
      }),
      getCurrentLocale: () => 'en',
      formatDate: (value, { locale, ...options }) =>
        new Intl.DateTimeFormat(locale, {
          timeZone: 'Pacific/Auckland',
          ...options,
        }).format(new Date(value)),
      formatTitleCaseValue: (value, fallback) => value || fallback,
    },
    CMCENModal: { confirm, form },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/certificate-requests-controller.js'),
      'utf8',
    ),
    {
      window,
      document,
      AbortController,
      setTimeout: (fn) => fn(),
      URL: {
        createObjectURL: () => {
          const url = `blob:certificate-${urls.length}`;
          urls.push(url);
          return url;
        },
        revokeObjectURL: (url) => revoked.push(url),
      },
    },
  );
  const controller = window.CertificateRequests.mount({
    permissions,
    showRequestForm,
    showSubmittedRequests,
    api: async (url, options) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      if (options.method === 'PATCH') {
        const { field, checked, expectedRevision } = options.body;
        const status =
          field === 'printed'
            ? checked
              ? 'ready_to_mail'
              : 'pending'
            : checked
              ? 'mailed'
              : 'ready_to_mail';
        const fulfillmentRevision = expectedRevision + 1;
        requests[0] = { ...requests[0], status, fulfillmentRevision };
        return {
          certificateRequest: {
            id: requests[0]._id,
            status,
            fulfillmentRevision,
          },
        };
      }
      return {
        familyWordingOptions: [
          { key: 'husband', en: "your husband's", fr: 'de votre mari' },
        ],
        certificateRequests: requests,
      };
    },
    onDenied: () => {
      denied++;
      controller.dispose();
    },
  });
  const toggle = (field = 'printed') =>
    root
      .querySelectorAll('input')
      .find((input) => input.dataset.fulfillmentField === field) || null;
  const refresh = () =>
    root.querySelector('.certificate-requests-toolbar').querySelector('button');
  const status = () =>
    root.querySelector('.certificate-requests-toolbar').querySelector('p')
      .textContent;
  return {
    root,
    document,
    controller,
    calls,
    action: toggle,
    toggle,
    change(field, checked) {
      const input = toggle(field);
      input.checked = checked;
      return input.fire('change');
    },
    refresh,
    status,
    denied: () => denied,
    urls,
    revoked,
    downloads,

    download: () => root.querySelector('.certificate-packet-download'),
  };
}

test('staff request entry respects submit permission, refreshes the queue and isolates revoked submission access', async () => {
  let mounted = 0,
    disposed = 0,
    options;
  const requestForm = {
    mount(value) {
      mounted++;
      options = value;
      return {
        canNavigate: () => true,
        hasUnsavedChanges: () => true,
        dispose: () => {
          disposed++;
        },
      };
    },
  };
  const denied = setup({ requestForm });
  await denied.controller.ready;
  assert.equal(mounted, 0);
  const hidden = setup({
    requestForm,
    permissions: { canSubmitCertificateRequests: true },
    showRequestForm: false,
  });
  await hidden.controller.ready;
  assert.equal(mounted, 0);
  const page = setup({
    requestForm,
    permissions: { canSubmitCertificateRequests: true },
  });
  await page.controller.ready;
  assert.equal(mounted, 1);
  assert.equal(page.controller.hasUnsavedChanges(), true);
  assert.equal(page.controller.canNavigate(), true);
  await options.onSubmitted();
  assert.equal(page.calls.length, 2);
  options.onDenied();
  assert.equal(disposed, 1);
  assert.equal(page.denied(), 0);
  assert.ok(page.action());
  page.controller.dispose();
  assert.equal(disposed, 2);
});

test('packet download uses authenticated binary API, guards repeated clicks and never advances fulfillment', async () => {
  const pending = deferred();
  const page = setup({
    api: (url) => (url.includes('packet.pdf') ? pending.promise : undefined),
  });
  await page.controller.ready;
  const first = page.download().fire('click');
  await page.download().fire('click');
  await page.download().fire('click');
  await page.document.fire('languagechange');
  assert.equal(page.calls.length, 2);
  assert.equal(
    page.calls[1].url,
    '/api/certificate-requests/request%2F1/packet.pdf?timeZone=America%2FToronto&download=1',
  );
  assert.equal(page.calls[1].parseJson, false);
  assert.equal(page.download().disabled, true);
  assert.equal(page.controller.canNavigate(), false);
  pending.resolve({ blob: async () => ({ type: 'application/pdf' }) });
  await first;
  assert.equal(page.root.querySelector('iframe'), null);
  assert.equal(page.controller.canNavigate(), true);
  await page.download().fire('click');
  assert.match(
    page.calls.at(-1).url,
    /packet\.pdf\?timeZone=America%2FToronto&download=1$/,
  );
  assert.equal(page.downloads.length, 2);
  assert.equal(
    page.calls.some((call) => call.method === 'PATCH'),
    false,
  );
  page.controller.dispose();
  assert.deepEqual(page.revoked.sort(), page.urls.sort());
});

test('member generation errors recover and missing-font errors have an actionable message', async () => {
  let failed = true;
  const page = setup({
    api: (url) => {
      if (!url.includes('packet.pdf')) return undefined;
      return failed
        ? Promise.reject(
            Object.assign(new Error('Missing fonts'), {
              status: 503,
              data: {
                json: async () => ({ code: 'certificate_fonts_unavailable' }),
              },
            }),
          )
        : Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) });
    },
  });
  await page.controller.ready;
  await page.download().fire('click');
  assert.equal(page.status(), 'certificate_member_fonts_unavailable');
  assert.equal(page.download().disabled, false);
  failed = false;
  await page.download().fire('click');
  assert.equal(page.status(), 'certificate_document_generated');
  assert.equal(page.root.querySelector('iframe'), null);
});

test('denied and disposed document requests cannot retain private downloads or late results', async () => {
  const denied = setup({
    api: (url) =>
      url.includes('packet.pdf')
        ? Promise.reject(Object.assign(new Error('Denied'), { status: 403 }))
        : undefined,
  });
  await denied.controller.ready;
  await denied.download().fire('click');
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
  const pending = deferred();
  const page = setup({
    api: (url) => (url.includes('packet.pdf') ? pending.promise : undefined),
  });
  await page.controller.ready;
  const request = page.download().fire('click');
  page.controller.dispose();
  assert.equal(page.calls.at(-1).signal.aborted, true);
  pending.resolve({ blob: async () => ({ type: 'application/pdf' }) });
  await request;
  assert.equal(page.urls.length, 0);
  assert.equal(page.root.children.length, 0);
});

test('load failures are retryable and malformed results are not treated as an empty queue', async () => {
  let valid = false;
  const page = setup({
    api: () => (valid ? { certificateRequests: [request()] } : {}),
  });
  await page.controller.ready;
  assert.equal(page.action(), null);
  assert.equal(page.status(), 'certificate_requests_load_error');
  valid = true;
  await page.refresh().fire('click');
  assert.ok(page.action());
});

test('a status conflict reconciles the queue before allowing the next action', async () => {
  let updated = false;
  const page = setup({
    api: (url, options) => {
      if (options.method === 'PATCH') {
        updated = true;
        return Promise.reject(
          Object.assign(new Error('conflict'), { status: 409 }),
        );
      }
      return {
        certificateRequests: [request(updated ? 'ready_to_mail' : 'pending')],
      };
    },
  });
  await page.controller.ready;
  await page.change('printed', true);
  assert.equal(page.toggle('printed').checked, true);
  assert.equal(page.status(), 'certificate_fulfillment_stale');
});

test('failed reconciliation clears stale actions until a successful retry', async () => {
  let reads = 0;
  const page = setup({
    api: (url, options) => {
      if (options.method) return {};
      if (++reads === 2) return Promise.reject(new Error('offline'));
      return {
        certificateRequests: [request(reads > 1 ? 'ready_to_mail' : 'pending')],
      };
    },
  });
  await page.controller.ready;
  await page.change('printed', true);
  assert.equal(page.action(), null);
  assert.equal(page.status(), 'certificate_requests_load_error');
  await page.refresh().fire('click');
  assert.equal(page.toggle('printed').checked, true);
});

test('read and write permission denials dispose the private worklist', async () => {
  for (const write of [false, true]) {
    const page = setup({
      api: (url, options) => {
        if (!write || options.method)
          return Promise.reject(
            Object.assign(new Error('denied'), { status: 403 }),
          );
      },
    });
    await page.controller.ready;
    if (write) await page.change('printed', true);
    assert.equal(page.denied(), 1);
    assert.equal(page.root.children.length, 0);
  }
});

test('disposal aborts an active status request and ignores its late response', async () => {
  const pending = deferred();
  const page = setup({
    api: (url, options) => (options.method ? pending.promise : undefined),
  });
  await page.controller.ready;
  const action = page.change('printed', true);
  await flush();
  assert.equal(page.controller.canNavigate(), false);
  const call = page.calls.find((entry) => entry.method);
  page.controller.dispose();
  assert.equal(call.signal.aborted, true);
  pending.resolve({});
  await action;
  assert.equal(page.calls.length, 2);
  assert.equal(page.root.children.length, 0);
});

test('certificate calendar dates remain on the requested day across time zones', async () => {
  const record = request();
  record.member.neededByDate = '2026-10-20T12:00:00.000Z';
  const page = setup({ requests: [record] });
  await page.controller.ready;
  assert.ok(
    page.root
      .querySelectorAll('strong')
      .some((element) => element.textContent === 'Oct 20, 2026'),
  );
});

test('completed requests remain visible with one download and the complete packet count', async () => {
  const page = setup({
    requests: [
      { ...request('mailed'), certificateCount: 3 },
      { ...trustedRequest(), _id: 'request/2' },
    ],
  });
  await page.controller.ready;
  assert.equal(page.calls[0].url, '/api/certificate-requests?status=all');
  assert.equal(
    page.root.querySelectorAll('.certificate-request-card').length,
    2,
  );
  assert.equal(
    page.root.querySelectorAll('.certificate-packet-download').length,
    2,
  );
  assert.equal(page.root.querySelector('.certificate-family-download'), null);
  const counts = page.root
    .querySelectorAll('.certificate-fulfillment-count')
    .map((item) => item.textContent);
  assert.ok(counts[0].includes('"count":3'));
  assert.ok(counts[1].includes('"count":1'));
  assert.equal(page.toggle('printed').checked, true);
  assert.equal(page.toggle('printed').disabled, true);
  assert.equal(page.toggle('mailed').checked, true);
  page.controller.dispose();
});

test('confirmation saves both forward and reverse actions without removing the row', async () => {
  const page = setup();
  await page.controller.ready;
  assert.equal(page.toggle('mailed').disabled, true);
  await page.change('printed', true);
  assert.equal(page.toggle('printed').checked, true);
  assert.equal(page.toggle('mailed').disabled, false);
  await page.change('mailed', true);
  assert.equal(page.toggle('printed').disabled, true);
  assert.equal(page.toggle('mailed').checked, true);
  await page.change('mailed', false);
  assert.equal(page.toggle('printed').checked, true);
  assert.equal(page.toggle('mailed').checked, false);
  await page.change('printed', false);
  assert.equal(page.toggle('printed').checked, false);
  assert.equal(page.toggle('mailed').disabled, true);
  const writes = page.calls.filter((call) => call.method === 'PATCH');
  assert.ok(
    writes.every(
      (call) =>
        call.url === '/api/certificate-requests/request%2F1/fulfillment',
    ),
  );
  assert.deepEqual(
    writes.map((call) => Object.values(call.body)),
    [
      ['printed', true, 'pending', 0],
      ['mailed', true, 'ready_to_mail', 1],
      ['mailed', false, 'mailed', 2],
      ['printed', false, 'ready_to_mail', 3],
    ],
  );
  page.controller.dispose();
});

test('cancelled checks and unchecks immediately restore the prior value without a write', async () => {
  for (const [status, field, checked] of [
    ['pending', 'printed', true],
    ['printed', 'mailed', true],
    ['printed', 'printed', false],
    ['mailed', 'mailed', false],
  ]) {
    const pending = deferred();
    let confirmations = 0;
    const page = setup({
      requests: [request(status)],
      confirm: () => {
        confirmations++;
        return pending.promise;
      },
    });
    await page.controller.ready;
    const change = page.change(field, checked);
    assert.equal(page.toggle(field).checked, !checked);
    await page.change(field, checked);
    await page.document.fire('languagechange');
    assert.equal(confirmations, 1);
    assert.equal(page.toggle(field).disabled, true);
    pending.resolve(false);
    await change;
    assert.equal(page.toggle(field).checked, !checked);
    assert.equal(page.calls.length, 1);
    page.controller.dispose();
  }
});

test('the regular retirement packet downloads without a prompt or date override', async () => {
  const page = setup({
    confirm: async () => assert.fail('regular download opened a confirmation'),
    form: async () => assert.fail('regular download opened a date prompt'),
    api: (url) =>
      url.includes('packet.pdf')
        ? Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  await page.download().fire('click');
  const call = page.calls.at(-1);
  assert.match(call.url, /packet\.pdf/);
  assert.equal(call.method, 'POST');
  assert.deepEqual(Object.keys(call.body), []);
  assert.equal(page.downloads.length, 1);
  assert.equal(page.toggle('printed').checked, false);
  page.controller.dispose();
});

test('the separate family date correction affects only its PDF, can be cancelled, and keeps saved wording', async () => {
  const item = request();
  item.member.releaseDate = '2026-08-01T00:00:00.000Z';
  item.member.dwdDate = '2026-09-12T00:00:00.000Z';
  let cancelled = true;
  let prompts = 0;
  const page = setup({
    requests: [item],
    form: async (message, options) => {
      prompts++;
      assert.match(message, /Sample family: your husband's/);
      assert.equal(options.fields[0].defaultValue, '2026-09-12');
      return cancelled ? null : { certificateDate: '2026-09-17' };
    },
    api: (url) =>
      url.includes('packet.pdf')
        ? Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  const correction = page.root.querySelector(
    '.certificate-fulfillment-correct-date',
  );
  assert.equal(correction.parent.tagName, 'DETAILS');
  await correction.fire('click');
  assert.equal(page.calls.length, 1);
  cancelled = false;
  await correction.fire('click');
  assert.equal(page.calls.at(-1).method, 'POST');
  assert.equal(page.calls.at(-1).body.certificateDate, '2026-09-17');
  assert.equal(item.member.dwdDate, '2026-09-12T00:00:00.000Z');
  assert.equal(item.status, 'pending');
  await page.download().fire('click');
  assert.deepEqual(Object.keys(page.calls.at(-1).body), []);
  assert.equal(page.downloads.length, 2);
  assert.equal(prompts, 2);
  assert.equal(
    page.calls.some((call) => call.method === 'PATCH'),
    false,
  );
  page.controller.dispose();
});

test('invalid saved dates still report server validation errors when downloading directly', async () => {
  const page = setup({
    api: (url) =>
      url.includes('packet.pdf')
        ? Promise.reject(
            Object.assign(new Error('Invalid date'), {
              status: 422,
              data: {
                json: async () => ({ code: 'certificate_data_invalid' }),
              },
            }),
          )
        : undefined,
  });
  await page.controller.ready;
  await page.download().fire('click');
  assert.equal(page.status(), 'certificate_member_data_invalid');
  assert.equal(page.downloads.length, 0);
  assert.equal(page.toggle('printed').checked, false);
  page.controller.dispose();
});

test('missing saved family wording blocks generation without changing status', async () => {
  const item = request();
  item.familyMembers[0].memberRelationshipToRecipient = 'unspecified';
  const page = setup({ requests: [item] });
  await page.controller.ready;
  await page.download().fire('click');
  assert.equal(page.status(), 'certificate_family_wording_required');
  assert.equal(page.calls.length, 1);
  assert.equal(page.download().disabled, false);
  page.controller.dispose();
});
