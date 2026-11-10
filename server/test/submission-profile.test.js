const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');

const source = fs.readFileSync(path.join(__dirname, '../public/submission-profile.js'), 'utf8');
const translations = require('../data/translations.json');
const complete = { firstName: 'Alex', lastName: 'Smith', email: 'alex@example.test', rank: 'Captain', currentUnit: 'Unit' };

function harness({ user = {}, type = 'retirement', editing = false, search = '', language = 'en', fetchProfile = async () => user } = {}) {
  const win = new Element('window');
  win.location = { search };
  const doc = new Element('document');
  doc.createElement = (tag) => {
    const element = new Element(tag);
    element.focus = () => { element.focused = true; };
    return element;
  };
  let calls = 0;
  let refreshed;
  vm.runInNewContext(source, {
    window: win,
    document: doc,
    URLSearchParams,
    translate: (key, replacements = {}) => {
      assert.equal(typeof translations[language][key], 'string', `Missing ${language} translation: ${key}`);
      return translations[language][key].replace(/\{(\w+)\}/g, (_, name) => replacements[name] ?? '');
    },
    CMCENUtils: {
      async apiJson(url, options) {
        calls++;
        assert.equal(url, '/api/me');
        assert.equal(options.token, 'test-token');
        return fetchProfile();
      },
    },
  });
  const form = new Element('form');
  const draft = new Element('textarea');
  draft.value = 'Unsaved submission text';
  form.append(draft);
  let notice;
  form.before = (element) => { notice = element; };
  const api = win.CMCENSubmissionProfile;
  const controller = api.createNotice({
    form, type, user, getToken: () => 'test-token',
    isEditing: () => editing,
    onRefresh: (profile) => { refreshed = profile; },
  });
  return {
    api, controller, form, draft, notice, win, doc,
    get calls() { return calls; },
    get refreshed() { return refreshed; },
    setEditing(value) { editing = value; controller.render(); },
    async setLanguage(value) { language = value; await doc.fire('languagechange'); },
  };
}

test('new submission requirements match each API, without a staff exemption', () => {
  const { api } = harness();
  for (const role of ['subscriber', 'contributor', 'administrator', 'developer']) {
    assert.deepEqual(Array.from(api.getMissingFields({ role }, 'retirement')), ['firstName', 'lastName', 'email']);
    assert.deepEqual(Array.from(api.getMissingFields({ role }, 'event')), ['rank', 'firstName', 'lastName', 'email']);
    assert.deepEqual(Array.from(api.getMissingFields({ role }, 'lastPost')), ['rank', 'firstName', 'lastName', 'email']);
  }
  assert.equal(api.getMissingFields({ ...complete, rank: '' }, 'retirement').length, 0);
  assert.equal(api.getMissingFields({ ...complete, currentUnit: '' }, 'lastPost').length, 0);
  assert.equal(api.getMissingFields({ ...complete, currentUnit: '', company: 'Organization' }, 'retirement').length, 0);
  for (const type of ['retirement', 'event', 'lastPost']) {
    assert.equal(api.getMissingFields({ ...complete, currentUnit: '', company: '' }, type).length, 0);
  }
  assert.deepEqual(Array.from(api.getMissingFields({ ...complete, firstName: '  ', lastName: '', accountName: 'Display Name' }, 'retirement')), ['firstName', 'lastName']);
});

test('initial warning lists missing fields and opens contextual profile without replacing the form', async () => {
  const h = harness({ user: { ...complete, currentUnit: '', lastName: '' } });
  assert.equal(h.notice.hidden, false);
  assert.match(h.notice.querySelectorAll('p')[1].textContent, /Last name/);
  assert.doesNotMatch(h.notice.querySelectorAll('p')[1].textContent, /Current unit|Company/);
  const link = h.notice.querySelector('a');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener');
  assert.equal(link.href, '/dashboard?submission=retirement#accountDetailsTitle');
  assert.equal(h.calls, 0);
  assert.equal(await h.controller.check({ focus: true }), false);
  assert.equal(h.notice.focused, true);
  assert.equal(h.draft.value, 'Unsaved submission text');
});

test('returning to the form refreshes saved profile and clears the warning without losing text', async () => {
  const h = harness({ user: { ...complete, firstName: '' }, fetchProfile: async () => complete });
  await h.win.fire('focus');
  // An explicit check shares the refresh already started by the focus event.
  assert.equal(await h.controller.check(), true);
  assert.equal(h.calls, 1);
  assert.equal(h.notice.hidden, true);
  assert.equal(h.refreshed, complete);
  assert.equal(h.draft.value, 'Unsaved submission text');
});

test('preflight does not trust a previously complete profile', async () => {
  const h = harness({ user: complete, type: 'event', fetchProfile: async () => ({ ...complete, rank: '' }) });
  assert.equal(h.notice.hidden, true);
  assert.equal(await h.controller.check(), false);
  assert.equal(h.notice.hidden, false);
  assert.match(h.notice.querySelectorAll('p')[1].textContent, /Rank/);
});

test('failed checks block submission, keep form data and allow retry', async () => {
  let fail = true;
  const h = harness({ user: complete, fetchProfile: async () => {
    if (fail) throw new Error('Offline');
    return complete;
  } });
  assert.equal(await h.controller.check(), false);
  assert.equal(h.notice.hidden, false);
  assert.equal(h.notice.querySelector('button').disabled, false);
  assert.equal(h.draft.value, 'Unsaved submission text');
  fail = false;
  await h.notice.querySelector('button').fire('click');
  assert.equal(h.notice.hidden, true);
  assert.equal(h.calls, 2);
});

test('concurrent checks share one request and preserve its outcome', async () => {
  let resolve;
  const h = harness({ fetchProfile: () => new Promise((done) => { resolve = done; }) });
  const first = h.controller.check();
  const second = h.controller.check();
  assert.equal(h.calls, 1);
  assert.equal(h.notice.querySelector('button').disabled, true);
  resolve(complete);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.notice.querySelector('button').disabled, false);
});

test('editing existing content does not acquire a new profile requirement, but returning to create does', async () => {
  const h = harness({ editing: true });
  assert.equal(h.notice.hidden, true);
  assert.equal(await h.controller.check(), true);
  assert.equal(h.calls, 0);
  h.setEditing(false);
  assert.equal(h.notice.hidden, false);
  assert.equal(await h.controller.check(), false);
  assert.equal(h.calls, 1);
});

test('warnings and contextual profile guidance render in both languages', async () => {
  const h = harness({ search: '?submission=retirement' });
  const original = h.notice.querySelector('strong').textContent;
  await h.setLanguage('fr');
  assert.notEqual(h.notice.querySelector('strong').textContent, original);
  assert.equal(h.notice.querySelector('strong').textContent, translations.fr.submission_profile_complete);
  for (const language of ['en', 'fr']) {
    await h.setLanguage(language);
    const panel = h.api.createProfileGuidance({});
    assert.equal(panel.querySelectorAll('p').length, 2);
    assert.equal(panel.querySelectorAll('p')[0].textContent, translations[language].submission_profile_retirement);
    assert.equal(h.api.createProfileGuidance(complete).querySelectorAll('p')[1].textContent, translations[language].submission_profile_ready);
  }
  const generic = harness({ search: '?submission=__proto__' });
  assert.equal(generic.api.getContext(), null);
  assert.equal(generic.api.createProfileGuidance({}).querySelectorAll('p').length, 3);
});

test('all affected pages load profile guidance before their page controller', () => {
  for (const page of ['dashboard', 'submit-retirement', 'submit-event', 'submit-last-post']) {
    const html = fs.readFileSync(path.join(__dirname, `../public/${page}.html`), 'utf8');
    assert.ok(html.includes('/submission-profile.css'));
    const shared = html.indexOf('src="/submission-profile.js"');
    assert.ok(shared >= 0 && shared < html.indexOf(`src="/${page}.js"`));
  }
});

for (const [page, form, button, setup] of [
  ['submit-retirement', 'retirementSubmitForm', 'retirementSubmitButton', 'retirementProfileNotice'],
  ['submit-last-post', 'lastPostSubmitForm', 'lastPostSubmitButton', 'lastPostProfileNotice'],
  ['submit-event', 'eventForm', 'eventSubmitButton', 'eventProfileNotice'],
]) {
  test(`${page} stops before upload or POST when profile preflight fails`, async () => {
    const script = fs.readFileSync(path.join(__dirname, `../public/${page}.js`), 'utf8');
    const start = script.indexOf(`${form}.addEventListener("submit", async (event) => {`);
    const end = script.indexOf('\n});', start) + 4;
    let submit;
    let checking;
    const control = { disabled: false };
    let checkCalls = 0;
    let submissions = 0;
    const context = {
      [form]: { addEventListener(_event, handler) { submit = handler; }, checkValidity: () => true },
      [button]: control,
      [setup]: { check: () => { checkCalls++; return new Promise((resolve) => { checking = resolve; }); } },
      clearRetirementFormMessage() {}, clearFormMessage() {},
      buildRetirementMessageData: () => ({}), buildEventData: () => ({}),
      setRetirementSubmitting(value) { control.disabled = value; },
      setSubmitting(value) { control.disabled = value; context.isSubmitting = value; },
      CMCENUtils: { requireAuthToken: () => 'test-token' },
      isSubmitting: false,
      uploadRetirementPhoto() { submissions++; throw new Error('Unexpected upload'); },
      uploadLastPostImage() { submissions++; throw new Error('Unexpected upload'); },
      eventApiJson() { submissions++; throw new Error('Unexpected submission'); },
    };
    vm.runInNewContext(script.slice(start, end), context);
    const first = submit({ preventDefault() {} });
    await submit({ preventDefault() {} });
    assert.equal(checkCalls, 1, 'Repeated submit cannot start a second preflight');
    checking(false);
    await first;
    assert.equal(submissions, 0);
    assert.equal(control.disabled, false);
  });
}
