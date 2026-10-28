const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { test } = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
function setup(
  api = async () => ({ blob: async () => ({ type: 'application/pdf' }) }),
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
  const window = { translate: (key) => key };
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
      fullName: 'Émilie D’Amour',
      rankEn: 'Corporal',
      rankFr: 'Caporale',
      presentationDate: '2026-11-13',
      frPronoun: 'elle',
      frRankGrammar: 'feminine',
    })) {
      const element = control(key);
      element.value = value;
      await element.fire(key.startsWith('fr') ? 'change' : 'input');
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
test('award previews use a private binary POST, preserve explicit choices on language changes, and require renewed review after edits', async () => {
  const page = setup();
  await page.fill();
  await page.control('download').fire('click');
  assert.equal(page.calls.length, 0);
  assert.equal(page.status(), 'trusted_award_review_required');
  await page.control('preview').fire('click');
  assert.equal(page.calls[0].parseJson, false);
  assert.equal(page.calls[0].method, 'POST');
  assert.equal(page.calls[0].body.frPronoun, 'elle');
  assert.equal(page.root.querySelector('iframe').src, 'blob:award-0');
  assert.equal(page.root.querySelector('a').href, 'blob:award-0');
  assert.equal(page.root.querySelector('a').target, '_blank');
  assert.equal(page.root.querySelector('a').rel, 'noopener');
  await page.document.fire('languagechange');
  assert.equal(page.control('fullName').value, 'Émilie D’Amour');
  assert.equal(page.control('frRankGrammar').value, 'feminine');
  page.control('reviewed').checked = true;
  await page.control('reviewed').fire('change');
  await page.control('download').fire('click');
  assert.equal(page.calls.at(-1).body.reviewed, true);
  assert.match(page.calls.at(-1).url, /download=1$/);
  assert.equal(page.downloads.length, 1);
  page.control('rankFr').value = 'Sergente';
  await page.control('rankFr').fire('input');
  assert.equal(page.control('reviewed').checked, false);
  assert.equal(page.root.querySelector('iframe'), null);
  page.controller.dispose();
  assert.deepEqual(page.revoked.sort(), page.urls.sort());
});
test('award duplicate clicks are guarded; errors recover; disposal rejects late results and denied access clears private output', async () => {
  let resolve;
  const pending = new Promise((yes) => (resolve = yes));
  const page = setup(() => pending);
  await page.fill();
  const first = page.control('preview').fire('click');
  await page.control('preview').fire('click');
  assert.equal(page.calls.length, 1);
  assert.equal(page.controller.canNavigate(), false);
  await page.document.fire('languagechange');
  assert.equal(page.control('preview').disabled, true);
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
  await recovery.control('preview').fire('click');
  assert.equal(recovery.status(), 'trusted_award_overflow');
  assert.equal(recovery.control('preview').disabled, false);
  fail = false;
  await recovery.control('preview').fire('click');
  assert.equal(recovery.status(), 'trusted_award_ready');
  const denied = setup(() =>
    Promise.reject(Object.assign(new Error('Denied'), { status: 403 })),
  );
  await denied.fill();
  await denied.control('preview').fire('click');
  assert.equal(denied.denied(), 1);
  assert.equal(denied.root.children.length, 0);
});
