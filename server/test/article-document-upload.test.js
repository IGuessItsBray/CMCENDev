const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');

function setup({
  confirm = async () => true,
  api = async () => ({
    name: '77 Line.pdf',
    url: 'https://example.test/documents/77.pdf',
  }),
} = {}) {
  const window = {
    NewsletterRenderer: { safeUrl: (value) => /^https:\/\//.test(value) },
  };
  const document = { createElement: (tag) => new Element(tag) };
  const context = {
    window,
    document,
    CMCENModal: { confirm },
    FormData: class {
      values = new Map();
      append(key, value) {
        this.values.set(key, value);
      }
      get(key) {
        return this.values.get(key);
      }
    },
    Option: function (text, value) {
      return Object.assign(new Element('option'), { textContent: text, value });
    },
    encodeURIComponent,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/article-editor.js'),
      'utf8',
    ),
    context,
  );
  const changes = [],
    busy = [],
    requests = [];
  const root = window.ArticleEditor.documentControl({
    api: async (...args) => {
      requests.push(args);
      return api(...args);
    },
    getText: (key) => key,
    onChange: (doc) => changes.push(doc),
    busy: (value) => busy.push(value),
  });
  const file = root.querySelector('input');
  file.files = [{ name: '77 Line.pdf', size: 100 }];
  const find = (key) =>
    root.querySelectorAll('button').find((el) => el.dataset.i18n === key);
  return { root, file, changes, busy, requests, find };
}

test('public confirmation is required before PDF upload and the resulting permanent link is inserted', async () => {
  let confirmation;
  const state = setup({
    confirm: async (message) => {
      confirmation = message;
      return true;
    },
  });
  await state.file.fire('change');
  assert.match(confirmation, /77 Line\.pdf/);
  assert.match(confirmation, /article_document_public_confirm/);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0][0], '/api/documents');
  assert.equal(state.requests[0][1].body.get('publicConfirmed'), 'true');
  assert.equal(state.changes[0].href, 'https://example.test/documents/77.pdf');
  assert.deepEqual(state.busy, [true, false]);
  assert.equal(state.file.value, '');
});

test('cancel, invalid files and a detached editor never upload or change the article', async () => {
  const cancelled = setup({ confirm: async () => false });
  await cancelled.file.fire('change');
  assert.equal(cancelled.requests.length, 0);
  assert.equal(cancelled.changes.length, 0);
  const invalid = setup();
  invalid.file.files = [{ name: 'file.exe', size: 100 }];
  await invalid.file.fire('change');
  assert.equal(invalid.requests.length, 0);
  assert.equal(invalid.changes.length, 0);
  let finish;
  const detached = setup({
    confirm: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = detached.file.fire('change');
  detached.root.isConnected = false;
  finish(true);
  await pending;
  assert.equal(detached.requests.length, 0);
  assert.deepEqual(detached.busy, [true, false]);
});

test('repeated input is ignored during upload and failures restore controls with localized errors', async () => {
  let finish;
  const state = setup({
    api: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = state.file.fire('change');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.find('article_upload_document').disabled, true);
  await state.file.fire('change');
  assert.equal(state.requests.length, 1);
  finish({ name: 'File.pdf', url: 'https://example.test/file.pdf' });
  await pending;
  assert.equal(state.changes.length, 1);
  assert.equal(state.find('article_upload_document').disabled, false);
  const failed = setup({
    api: async () => {
      throw Object.assign(new Error('server detail'), { status: 422 });
    },
  });
  await failed.file.fire('change');
  assert.equal(failed.changes.length, 0);
  assert.equal(
    failed.root.children.at(-1).textContent,
    'article_document_rejected',
  );
  assert.deepEqual(failed.busy, [true, false]);
});

test('staff can reuse uploaded PDFs and load subsequent pages without overwriting existing choices', async () => {
  const state = setup({
    api: async (url) => ({
      documents: [
        {
          name: url.includes('?') ? 'Older PDF' : 'Newest PDF',
          url: url.includes('?')
            ? 'https://example.test/old.pdf'
            : 'https://example.test/new.pdf',
        },
      ],
      nextCursor: url.includes('?') ? '' : 'abc',
    }),
  });
  await state.find('article_uploaded_documents').fire('click');
  const select = state.root.querySelector('select');
  assert.equal(select.children.length, 2);
  await state.find('article_more_documents').fire('click');
  assert.equal(select.children.length, 3);
  assert.equal(state.find('article_more_documents').hidden, true);
  select.value = select.children[2].value;
  select.selectedOptions = [select.children[2]];
  await select.fire('change');
  assert.equal(state.changes[0].href, 'https://example.test/old.pdf');
});

test('all new document upload controls and feedback have English and French translations', () => {
  const translations = require('../data/translations.json');
  for (const key of [
    'article_upload_document',
    'article_document_upload_help',
    'article_document_public_confirm',
    'article_document_invalid',
    'article_document_uploading',
    'article_document_rejected',
    'article_document_denied',
    'article_document_upload_error',
    'article_uploaded_documents',
    'article_more_documents',
    'article_documents_empty',
  ])
    for (const language of ['en', 'fr']) assert.ok(translations[language][key]);
});
