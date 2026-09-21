const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function setup(
  override,
  subscribers = [
    {
      id: 'one',
      name: 'Member',
      email: 'member@example.test',
      weeklyBrief: true,
      newsAnnouncements: true,
      newsAnnouncementsConsentedAt: '2026-09-01',
    },
  ],
) {
  const root = new Element('div'),
    exportButton = new Element('button');
  const document = new Element('document');
  document.body = new Element('body');
  document.append(document.body);
  document.body.append(root, exportButton);
  let downloads = 0,
    denied = false,
    confirmation = async () => true;
  const calls = [],
    confirmations = [],
    revoked = [],
    timers = [];
  document.createElement = (tag) => {
    const el = new Element(tag);
    if (tag === 'a') {
      el.click = () => {
        downloads++;
      };
      el.remove = () => {};
    }
    return el;
  };
  document.getElementById = (id) =>
    id === 'adminSubscriptionsBody' ? root : exportButton;
  const utils = {
    getCurrentLocale: () => 'en-CA',
    showToast() {},
    focusInvalidField() {},
  };
  const window = {
    translate: (key, values) => key + (values ? JSON.stringify(values) : ''),
    CMCENUtils: utils,
    CMCENModal: {
      confirm: (text) => {
        confirmations.push(text);
        return confirmation();
      },
    },
  };
  const context = {
    window,
    document,
    CMCENUtils: utils,
    AbortController,
    Intl,
    URL: {
      createObjectURL: () => 'blob:fixture',
      revokeObjectURL: (url) => revoked.push(url),
    },
    setTimeout: (fn) => timers.push(fn),
  };
  for (const file of ['shared-forms.js', 'dashboard-next-subscriptions.js'])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'),
      context,
    );
  const mounted = window.DashboardNextSubscriptions.mount({
    api: async (url, options = {}) => {
      calls.push({ url, ...options });
      const result = override?.(url, options);
      if (result !== undefined) return result;
      if (options.parseJson === false) return { blob: async () => ({}) };
      if (options.method === 'POST')
        return {
          blast: { sentAt: '2026-09-21', sentCount: 1, failedCount: 0 },
        };
      return {
        subscribers,
        newsletters: [
          {
            _id: 'history',
            type: 'newsBlast',
            subject: 'Earlier',
            sentAt: '2026-09-20',
            sentCount: 1,
            failedCount: 0,
            recipientCount: 1,
          },
        ],
      };
    },
    onDenied: () => {
      denied = true;
    },
  });
  await flush();
  const input = (name) =>
    root.querySelectorAll('input').find((el) => el.name === name);
  return {
    root,
    document,
    mounted,
    calls,
    confirmations,
    revoked,
    exportButton,
    denied: () => denied,
    downloads: () => downloads,
    confirm: (fn) => {
      confirmation = fn;
    },
    form: () => root.querySelector('form'),
    subject: () => input('subject'),
    message: () => root.querySelector('textarea'),
    send: () => root.querySelector('.admin-users-save'),
    refresh: () => root.querySelector('button'),
    feedback: () => root.querySelector('form').querySelector('p'),
    draft: () => {
      input('subject').value = ' Announcement ';
      root.querySelector('textarea').value = ' Message ';
    },
    runTimers: () => timers.forEach((fn) => fn()),
  };
}

test('confirmation freezes one payload and sending blocks duplicate submissions', async () => {
  const confirmation = deferred(),
    delivery = deferred();
  const page = await setup((url, options) =>
    options.method === 'POST' ? delivery.promise : undefined,
  );
  page.draft();
  page.confirm(() => confirmation.promise);
  const sending = page.form().fire('submit');
  await page.form().fire('submit');
  assert.equal(page.confirmations.length, 1);
  assert.equal(page.mounted.canNavigate(), false);
  assert.equal(page.form().querySelector('fieldset').disabled, true);
  confirmation.resolve(true);
  await flush();
  await page.form().fire('submit');
  const posts = page.calls.filter((call) => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(posts[0].body)), {
    subject: 'Announcement',
    body: 'Message',
  });
  assert.equal(posts[0].timeoutMs, null);
  delivery.resolve({
    blast: { sentAt: '2026-09-21', sentCount: 1, failedCount: 0 },
  });
  await sending;
  assert.equal(page.mounted.hasUnsavedChanges(), false);
});

test('cancelled and disposed confirmations never send mail', async () => {
  const page = await setup();
  page.draft();
  page.confirm(async () => false);
  await page.form().fire('submit');
  assert.equal(page.calls.length, 1);
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  const pending = deferred();
  page.confirm(() => pending.promise);
  const request = page.form().fire('submit');
  page.mounted.dispose();
  pending.resolve(true);
  await request;
  assert.equal(page.calls.length, 1);
});

test('disabled delivery preserves the draft and reports no send', async () => {
  const page = await setup((url, options) =>
    options.method === 'POST' ? { skipped: true } : undefined,
  );
  page.draft();
  await page.form().fire('submit');
  assert.equal(page.subject().value, ' Announcement ');
  assert.equal(page.feedback().textContent, 'admin_next_subscriptions_skipped');
  assert.equal(page.calls.length, 2);
});

test('partial delivery reports both counts and refreshes history without retrying failures', async () => {
  const page = await setup((url, options) =>
    options.method === 'POST'
      ? { blast: { sentAt: '2026-09-21', sentCount: 2, failedCount: 1 } }
      : undefined,
  );
  page.draft();
  await page.form().fire('submit');
  assert.match(page.feedback().textContent, /"sent":2,"failed":1/);
  assert.equal(page.subject().value, '');
  assert.equal(page.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(page.calls.filter((call) => !call.method).length, 2);
});

test('uncertain delivery preserves text and requires an explicit duplicate-risk confirmation before another attempt', async () => {
  const page = await setup((url, options) => {
    if (options.method === 'POST') throw new Error('Connection lost');
  });
  page.draft();
  await page.form().fire('submit');
  assert.equal(page.subject().value, ' Announcement ');
  assert.equal(
    page.feedback().textContent,
    'admin_next_subscriptions_uncertain',
  );
  assert.equal(page.calls.filter((call) => call.method === 'POST').length, 1);
  page.confirm(async () => false);
  await page.form().fire('submit');
  assert.match(
    page.confirmations.at(-1),
    /^admin_next_subscriptions_confirm_uncertain/,
  );
  assert.equal(page.calls.filter((call) => call.method === 'POST').length, 1);
});

test('a completed delivery with all recipients failed retains the unsent draft', async () => {
  const page = await setup((url, options) =>
    options.method === 'POST'
      ? { blast: { sentAt: '2026-09-21', sentCount: 0, failedCount: 2 } }
      : undefined,
  );
  page.draft();
  await page.form().fire('submit');
  assert.equal(page.subject().value, ' Announcement ');
  assert.equal(page.message().value, ' Message ');
  assert.equal(page.mounted.hasUnsavedChanges(), true);
  assert.match(page.feedback().textContent, /"sent":0,"failed":2/);
});

test('refresh and language changes retain the form, draft, and selected delivery', async () => {
  const page = await setup();
  page.draft();
  const form = page.form();
  await page.refresh().fire('click');
  await page.document.fire('languagechange');
  assert.equal(page.form(), form);
  assert.equal(page.subject().value, ' Announcement ');
  assert.equal(page.root.querySelector('select').value, 'history');
  assert.equal(page.mounted.hasUnsavedChanges(), true);
});

test('no current consent and whitespace-only content cannot initiate a send', async () => {
  for (const subscribers of [
    [],
    [{ newsAnnouncements: false, weeklyBrief: true }],
    [{ newsAnnouncements: true, newsAnnouncementsConsentedAt: null }],
  ]) {
    const page = await setup(undefined, subscribers);
    page.draft();
    assert.equal(page.send().disabled, true);
    await page.form().fire('submit');
    assert.equal(page.confirmations.length, 0);
  }
  const page = await setup();
  page.subject().value = ' ';
  page.message().value = ' ';
  await page.form().fire('submit');
  assert.equal(page.confirmations.length, 0);
});

test('CSV export uses authenticated area API and revokes the download URL', async () => {
  const page = await setup();
  await page.exportButton.fire('click');
  assert.equal(page.calls.at(-1).url, '/api/admin/subscriptions/export.csv');
  assert.equal(page.calls.at(-1).parseJson, false);
  assert.equal(page.downloads(), 1);
  page.runTimers();
  assert.deepEqual(page.revoked, ['blob:fixture']);
});

test('disposed requests cannot download or clear drafts and forbidden requests revoke the area', async () => {
  const pending = deferred();
  const page = await setup((url, options) =>
    options.parseJson === false ? pending.promise : undefined,
  );
  const exporting = page.exportButton.fire('click');
  page.mounted.dispose();
  assert.equal(page.calls.at(-1).signal.aborted, true);
  pending.resolve({ blob: async () => ({}) });
  await exporting;
  assert.equal(page.downloads(), 0);
  const denied = await setup(() => {
    throw Object.assign(new Error('Denied'), { status: 403 });
  });
  assert.equal(denied.denied(), true);
});
