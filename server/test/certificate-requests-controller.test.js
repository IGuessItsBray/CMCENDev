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
  status,
  member: { fullName: 'Sample member' },
  familyMembers: [
    {
      fullName: 'Sample family',
      relationship: 'other',
      relationshipOther: 'Step-parent',
    },
  ],
});
function setup({
  requests = [request()],
  api: override,
  confirm = async () => true,
  checklist = async () => ['member', 'family:0'],
} = {}) {
  const root = new Element('div'),
    document = new Element('document');
  document.createElement = (tag) => new Element(tag);
  document.getElementById = () => root;
  const calls = [],
    checklists = [];
  let denied = 0;
  const window = {
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
    { window, document, AbortController },
  );
  const controller = window.CertificateRequests.mount({
    api: async (url, options) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      if (options.method === 'PATCH') {
        requests[0] = { ...requests[0], status: options.body.status };
        return { certificateRequest: { status: options.body.status } };
      }
      return {
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
  };
}

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
  assert.match(page.checklists[0].checklist[1].label, /Step-parent/);
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
