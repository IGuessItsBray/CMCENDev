const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Element } = require('./helpers/dashboard-dom');
const source = fs.readFileSync(
  path.join(__dirname, '../public/dashboard-next-adopt.js'),
  'utf8',
);
function setup(api) {
  const ids = Object.fromEntries(
    [
      'adminAdopt',
      'adminAdoptTitle',
      'adminAdoptLink',
      'adoptAdminForm',
      'adoptAdminList',
      'adoptAdminFields',
      'adoptAdminInputs',
      'adoptAdminStatus',
      'adoptAdminRetry',
      'adoptAdminNew',
      'adoptAdminHeading',
      'adoptAdminDelete',
    ].map((id) => [id, new Element('div')]),
  );
  const form = ids.adoptAdminForm,
    inputs = ids.adoptAdminInputs,
    fields = ids.adoptAdminFields;
  const checkbox = new Element('input');
  checkbox.name = 'published';
  checkbox.checked = false;
  const label = new Element('label');
  label.lastChild = { textContent: '' };
  label.append(checkbox);
  const submit = new Element('button'),
    note = new Element('p'),
    link = new Element('a');
  fields.append(inputs, label, note, submit);
  form.append(fields);
  form.hidden = true;
  form.elements.namedItem = undefined;
  Object.defineProperty(form, 'elements', {
    get: () => ({
      namedItem: (name) =>
        [
          checkbox,
          ...inputs.querySelectorAll('input'),
          ...inputs.querySelectorAll('textarea'),
        ].find((element) => element.name === name),
    }),
  });
  form.reset = () => {
    for (const control of [
      ...inputs.querySelectorAll('input'),
      ...inputs.querySelectorAll('textarea'),
    ]) {
      control.value = '';
      control.files = [];
    }
    checkbox.checked = false;
  };
  form.reportValidity = () => true;
  form.querySelector = (selector) =>
    selector.startsWith('label:') ? label : submit;
  ids.adminAdopt.querySelector = () => link;
  const document = new Element('document');
  document.documentElement = { lang: 'en' };
  document.getElementById = (id) => ids[id];
  document.createElement = (tag) => {
    const node = new Element(tag);
    node.files = [];
    return node;
  };
  let prompts = 0;
  const window = {
    CMCENModal: {
      confirm: async () => {
        prompts++;
        return false;
      },
    },
  };
  vm.runInNewContext(source, { document, window, AbortController });
  const instance = window.DashboardNextAdopt.mount({
    api,
    permissions: {},
    onDenied: () => assert.fail('Unexpected denial'),
  });
  return { ids, form, document, instance, prompts: () => prompts };
}
test('dashboard adapter detects unsaved edits, guards in-flight save and updates the selected record', async () => {
  let resolveSave;
  const requests = [];
  const harness = setup(async (url, options) => {
    requests.push({ url, options });
    if (!options) return { displays: [] };
    return new Promise((resolve) => {
      resolveSave = resolve;
    });
  });
  await new Promise(setImmediate);
  const { ids, form, instance } = harness;
  assert.equal(instance.hasUnsavedChanges(), false);
  await ids.adoptAdminNew.fire('click');
  form.elements.namedItem('title.en').value = 'Radio display';
  form.elements.namedItem('title.fr').value = 'Exposition radio';
  assert.equal(instance.hasUnsavedChanges(), true);
  assert.equal(await instance.canLeave(), false);
  assert.equal(harness.prompts(), 1);
  const saving = form.fire('submit');
  await new Promise(setImmediate);
  assert.equal(instance.canNavigate(), false);
  assert.equal(instance.hasUnsavedChanges(), true);
  const sent = JSON.parse(requests[1].options.body);
  assert.equal(sent.published, false);
  assert.equal(sent.title.fr, 'Exposition radio');
  resolveSave({ display: { ...sent, _id: '1' } });
  await saving;
  assert.equal(instance.canNavigate(), true);
  assert.equal(instance.hasUnsavedChanges(), false);
  assert.equal(ids.adoptAdminList.children.length, 1);
  harness.document.documentElement.lang = 'fr';
  await harness.document.fire('languagechange');
  assert.match(ids.adoptAdminList.children[0].textContent, /Exposition radio/);
  instance.dispose();
});
