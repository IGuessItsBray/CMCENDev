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
  assert.equal(page.download().textContent, 'trusted_request_download');
  const labels = page.root
    .querySelectorAll('span')
    .map((element) => element.textContent);
  assert.ok(labels.includes('trusted_award_frPronoun'));
  assert.ok(!labels.includes('certificate_request_trade_role'));
  assert.ok(!labels.includes('certificate_release_date'));
  assert.equal(page.root.querySelector('.certificate-family-documents'), null);
  await page.download().fire('click');
  const call = page.calls.at(-1);
  assert.equal(
    call.url,
    '/api/certificate-requests/request%2F1/trusted-to-serve.pdf?download=1',
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

test('Trusted to Serve uses the existing single-recipient print and mail lifecycle', async () => {
  const page = setup({
    requests: [trustedRequest()],
    checklist: async () => ['member'],
  });
  await page.controller.ready;
  await page.action().fire('click');
  assert.deepEqual(
    Array.from(
      page.calls.find((call) => call.method === 'PATCH').body
        .printedCertificateKeys,
    ),
    ['member'],
  );
  await page.action().fire('click');
  assert.equal(page.action(), null);
  assert.equal(page.status(), 'certificate_requests_mail_success');
});

test('family controls default to the saved DWD ceremony date without changing member dates or status', async () => {
  const item = request();
  item.member.releaseDate = '2026-08-01T00:00:00.000Z';
  item.member.dwdDate = '2026-09-12T00:00:00.000Z';
  const page = setup({
    requests: [item],
    api: (url) =>
      url.includes('/family/')
        ? Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  assert.equal(
    page.root.querySelector('.certificate-family-date').value,
    '2026-09-12',
  );
  await page.root.querySelector('.certificate-family-download').fire('click');
  assert.equal(page.calls.at(-1).body.certificateDate, '2026-09-12');
  assert.equal(item.member.releaseDate, '2026-08-01T00:00:00.000Z');
  assert.equal(item.status, 'pending');
  assert.equal(
    page.calls.some((call) => call.method === 'PATCH'),
    false,
  );
  page.controller.dispose();
});
function setup({
  requests = [request()],
  api: override,
  confirm = async () => true,
  checklist = async () => ['member', 'family:0'],
  permissions = {},
  requestForm,
  showRequestForm = true,
} = {}) {
  const root = new Element('div'),
    document = new Element('document');
  document.createElement = (tag) => new Element(tag);
  document.getElementById = () => root;
  const calls = [],
    checklists = [];
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
    TrustedToServeRequest: requestForm,
    translate: (key, values) => key + (values ? JSON.stringify(values) : ''),
    CMCENUtils: {
      getCurrentLocale: () => 'en',
      formatDate: (value, { locale, ...options }) =>
        new Intl.DateTimeFormat(locale, {
          timeZone: 'Pacific/Auckland',
          ...options,
        }).format(new Date(value)),
      formatTitleCaseValue: (value, fallback) => value || fallback,
    },
    CMCENModal: {
      confirm,
      confirmChecklist: (message, options) => {
        checklists.push(options);
        return checklist();
      },
    },
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
    api: async (url, options) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      if (options.method === 'PATCH') {
        requests[0] = { ...requests[0], status: options.body.status };
        return { certificateRequest: { status: options.body.status } };
      }
      return {
        familyWordingOptions: [
          { key: 'husband', en: "your husband's", fr: 'de votre mari' },
        ],
        certificateRequests: requests.filter(
          (record) => record.status !== 'mailed',
        ),
      };
    },
    onDenied: () => {
      denied++;
      controller.dispose();
    },
  });
  const action = () => root.querySelector('.certificate-request-print-button');
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
    checklists,
    action,
    refresh,
    status,
    denied: () => denied,
    urls,
    revoked,
    downloads,

    download: () => root.querySelector('.certificate-member-download'),
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

test('family and packet actions use saved answers immediately and isolate downloads per request', async () => {
  const page = setup({
    requests: [request(), { ...request(), _id: 'request/2' }],
    api: (url) =>
      /family\/|packet\.pdf/.test(url)
        ? Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  assert.equal(page.root.querySelector('.certificate-family-wording'), null);
  await page.document.fire('languagechange');
  const date = page.root.querySelector('.certificate-family-date');
  date.value = '2026-08-01';
  await date.fire('change');
  await page.root.querySelector('.certificate-family-download').fire('click');
  assert.equal(page.calls.at(-1).method, 'POST');
  assert.equal(page.calls.at(-1).body.wording, undefined);
  assert.equal(page.calls.at(-1).body.certificateDate, '2026-08-01');
  assert.match(
    page.calls.at(-1).url,
    /request%2F1\/family\/0\.pdf\?download=1$/,
  );
  assert.equal(page.root.querySelector('iframe'), null);
  const changed = page.root.querySelector('.certificate-family-date');
  changed.value = '2026-08-02';
  await changed.fire('change');
  assert.equal(page.root.querySelector('iframe'), null);
  assert.equal(page.revoked.length, 1);
  await page.root.querySelector('.certificate-packet-download').fire('click');
  assert.equal(page.calls.at(-1).body.familyWordings, undefined);
  assert.match(page.calls.at(-1).url, /packet\.pdf\?download=1$/);
  assert.equal(
    page.calls.some((call) => call.method === 'PATCH'),
    false,
  );
});

test('family duplicate clicks, denied requests and recoverable errors clean up correctly', async () => {
  const pending = deferred();
  let fail = true;
  const page = setup({
    api: (url) =>
      url.includes('/family/')
        ? fail
          ? pending.promise
          : Promise.resolve({ blob: async () => ({ type: 'application/pdf' }) })
        : undefined,
  });
  await page.controller.ready;
  const active = page.root
    .querySelector('.certificate-family-download')
    .fire('click');
  await page.root.querySelector('.certificate-family-download').fire('click');
  await page.root.querySelector('.certificate-packet-download').fire('click');
  assert.equal(page.calls.length, 2);
  assert.equal(
    page.root.querySelector('.certificate-family-date').disabled,
    true,
  );
  pending.reject(
    Object.assign(new Error('Needs review'), {
      status: 422,
      data: { json: async () => ({ code: 'certificate_wording_required' }) },
    }),
  );
  await active;
  assert.equal(page.status(), 'certificate_family_wording_required');
  assert.equal(
    page.root.querySelector('.certificate-family-date').disabled,
    false,
  );
  fail = false;
  await page.root.querySelector('.certificate-family-download').fire('click');
  assert.equal(page.status(), 'certificate_document_generated');
  page.controller.dispose();
  assert.deepEqual(page.revoked, page.urls);
});

test('member download uses authenticated binary API, guards repeated clicks and never advances fulfillment', async () => {
  const pending = deferred();
  const page = setup({
    api: (url) => (url.includes('member.pdf') ? pending.promise : undefined),
  });
  await page.controller.ready;
  const first = page.download().fire('click');
  await page.download().fire('click');
  await page.download().fire('click');
  await page.document.fire('languagechange');
  assert.equal(page.calls.length, 2);
  assert.equal(
    page.calls[1].url,
    '/api/certificate-requests/request%2F1/member.pdf?download=1',
  );
  assert.equal(page.calls[1].parseJson, false);
  assert.equal(page.download().disabled, true);
  assert.equal(page.controller.canNavigate(), false);
  pending.resolve({ blob: async () => ({ type: 'application/pdf' }) });
  await first;
  assert.equal(page.root.querySelector('iframe'), null);
  assert.equal(page.controller.canNavigate(), true);
  await page.download().fire('click');
  assert.match(page.calls.at(-1).url, /member\.pdf\?download=1$/);
  assert.equal(page.downloads.length, 2);
  assert.equal(
    page.calls.some((call) => call.method === 'PATCH'),
    false,
  );
  assert.equal(page.checklists.length, 0);
  page.controller.dispose();
  assert.deepEqual(page.revoked.sort(), page.urls.sort());
});

test('member generation errors recover and missing-font errors have an actionable message', async () => {
  let failed = true;
  const page = setup({
    api: (url) => {
      if (!url.includes('member.pdf')) return undefined;
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
  assert.equal(page.status(), 'certificate_member_generated');
  assert.equal(page.root.querySelector('iframe'), null);
});

test('denied and disposed document requests cannot retain private downloads or late results', async () => {
  const denied = setup({
    api: (url) =>
      url.includes('member.pdf')
        ? Promise.reject(Object.assign(new Error('Denied'), { status: 403 }))
        : undefined,
  });
  await denied.controller.ready;
  await denied.download().fire('click');
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
  const pending = deferred();
  const page = setup({
    api: (url) => (url.includes('member.pdf') ? pending.promise : undefined),
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

test('printing confirms every recipient, then mailing completes and removes the request', async () => {
  const page = setup();
  await page.controller.ready;
  await page.action().fire('click');
  const print = page.calls.find((call) => call.method === 'PATCH');
  assert.equal(print.url, '/api/certificate-requests/request%2F1/status');
  assert.equal(print.body.status, 'ready_to_mail');
  assert.deepEqual(Array.from(print.body.printedCertificateKeys), [
    'member',
    'family:0',
  ]);
  assert.deepEqual(
    Array.from(page.checklists[0].checklist, (item) => item.value),
    ['member', 'family:0'],
  );
  assert.match(
    page.checklists[0].checklist[1].label,
    /certificate_member_relationship_husband/,
  );
  assert.equal(page.action().textContent, 'certificate_requests_mark_mailed');
  await page.action().fire('click');
  const mailed = page.calls.filter((call) => call.method === 'PATCH').at(-1);
  assert.equal(mailed.body.status, 'mailed');
  assert.equal(mailed.body.printedCertificateKeys, undefined);
  assert.equal(page.action(), null);
  assert.equal(page.status(), 'certificate_requests_mail_success');
});

test('partial, cancelled, or unexpected print checklist values cannot advance fulfillment', async () => {
  for (const keys of [
    null,
    [],
    ['member'],
    ['member', 'family:1'],
    ['member', 'family:0', 'unknown'],
  ]) {
    const page = setup({ checklist: async () => keys });
    await page.controller.ready;
    await page.action().fire('click');
    assert.equal(page.calls.length, 1);
    assert.equal(page.controller.canNavigate(), true);
  }
});

test('legacy printed requests use mailing confirmation and cancelled mailing does not mutate', async () => {
  const page = setup({
    requests: [request('printed')],
    confirm: async () => false,
  });
  await page.controller.ready;
  assert.equal(page.action().textContent, 'certificate_requests_mark_mailed');
  await page.action().fire('click');
  assert.equal(page.calls.length, 1);
  assert.equal(page.checklists.length, 0);
});

test('confirmation guards duplicate clicks and language changes preserve the busy state', async () => {
  const pending = deferred();
  const page = setup({ checklist: () => pending.promise });
  await page.controller.ready;
  const action = page.action().fire('click');
  await page.action().fire('click');
  await page.document.fire('languagechange');
  assert.equal(page.checklists.length, 1);
  assert.equal(page.action().disabled, true);
  assert.equal(page.controller.canNavigate(), false);
  assert.equal(page.controller.hasUnsavedChanges(), true);
  page.controller.dispose();
  pending.resolve(['member', 'family:0']);
  await action;
  assert.equal(page.calls.length, 1);
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
  await page.action().fire('click');
  assert.equal(page.action().textContent, 'certificate_requests_mark_mailed');
  assert.equal(page.status(), 'certificate_requests_print_error');
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
  await page.action().fire('click');
  assert.equal(page.action(), null);
  assert.equal(page.status(), 'certificate_requests_load_error');
  await page.refresh().fire('click');
  assert.equal(page.action().textContent, 'certificate_requests_mark_mailed');
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
    if (write) await page.action().fire('click');
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
  const action = page.action().fire('click');
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
