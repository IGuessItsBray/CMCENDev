const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element: Base } = require('./helpers/dashboard-dom');
const BodyContent = require('../public/body-content');
const NewsletterFormat = require('../public/newsletter-format');

class Element extends Base {
  constructor(tag) {
    super(tag);
    this.nodeType = tag === 'text' ? 3 : 1;
    this.classList = {
      contains: (name) => (this.className || '').split(' ').includes(name),
      toggle: (name, on) => { const classes = new Set((this.className || '').split(' ').filter(Boolean)); if (on) classes.add(name); else classes.delete(name); this.className = [...classes].join(' '); },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false),
    };
  }
  get childNodes() { return this.children; }
  get lastChild() { return this.children.at(-1); }
  get elements() { const nodes = super.elements; nodes.namedItem = (name) => nodes.find((n) => n.name === name); return nodes; }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  checkValidity() { return true; }
  set href(value) { this.setAttribute('href', value); }
  get href() { return this.getAttribute('href'); }
}

function setup(permissions = {}) {
  const document = {
    createElement: (tag) => Object.assign(new Element(tag), { ownerDocument: document }),
    createTextNode: (text) => Object.assign(new Element('text'), { textContent: text }),
  };
  const window = { BodyContent: { ...BodyContent, inline: (parent, nodes) => BodyContent.inline(parent, nodes, document) }, NewsletterFormat, NewsletterRenderer: require('../public/newsletter') };
  const context = { window, document, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 }, FormData: class {
    constructor(form) { this.values = form ? form.elements.filter((e) => e.name).map((e) => [e.name, e.value]) : []; }
    append(name, value) { this.values.push([name, value]); }
    entries() { return this.values.values(); }
    get(name) { return this.values.find(([key]) => key === name)?.[1] ?? null; }
  }, Event: class { constructor(type) { this.type = type; } }, Option: function (text, value) { return Object.assign(new Element('option'), { textContent: text, value }); }, crypto: require('node:crypto').webcrypto, structuredClone, URL, URLSearchParams, CMCENModal: { confirm: async () => true } };
  for (const name of ['message-editor', 'content-workspace-editors', 'content-workspace-actions']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../public/${name}.js`), 'utf8'), context);
  const editor = window.ContentWorkspaceEditors.create({
    setWorkspaceTranslatedText: (el, key, fallback) => { el.textContent = fallback; },
    getText: (key, fallback) => fallback || key,
    contentWorkspaceState: { editorDrafts: new Map(), user: { permissions } },
    contentWorkspaceDetail: new Element('div'),
  });
  return { editor, window, document, context };
}

test('public rendering uses semantic nodes, named anchors, original image access and PDF links', () => {
  const { document } = setup();
  const blocks = [{ type: 'paragraph', align: 'center', children: [{ type: 'underline', children: ['Details'] }, { type: 'link', href: 'https://example.test', children: ['Named'] }] }, { type: 'paragraph', children: [{ type: 'link', href: 'https://media.example.test/original.png', children: ['Memorial card'] }] }, { type: 'paragraph', children: [{ type: 'link', href: 'https://media.example.test/obit.pdf', children: ['Obituary PDF'] }] }];
  const text = BodyContent.plainText(blocks);
  const el = document.createElement('div'); el.ownerDocument = document;
  assert.equal(BodyContent.render(el, { formattedBody: { en: { version: 1, text, blocks } } }, 'en', text, () => assert.fail('unexpected fallback')), true);
  assert.equal(el.children[0].className, 'body-align-center');
  assert.equal(el.children[0].children[0].tagName, 'U');
  assert.equal(el.querySelectorAll('a').length, 3);
  assert.equal(el.querySelectorAll('img').length, 0);
  assert.equal(el.querySelectorAll('a')[1].href, 'https://media.example.test/original.png');
  assert.equal(el.querySelectorAll('iframe').length, 0);
  let fallback;
  assert.equal(BodyContent.render(el, { formattedBody: { en: { version: 1, text, blocks } } }, 'en', 'New staff text', (_, value) => { fallback = value; }), false);
  assert.equal(fallback, 'New staff text');
});

test('legacy notices and events keep original plain staff editors with no body block payload or insertion controls', () => {
  for (const type of ['event', 'lastPost', 'retirementMessage']) {
    const { editor } = setup();
    const field = type === 'event' ? 'description' : 'messages';
    const blocks = [{ type: 'paragraph', children: [{ type: 'underline', children: ['English'] }] }];
    const item = { _id: 'record', type, content: { [field]: { en: 'English', fr: 'French' }, formattedBody: { en: { version: 1, text: 'English', blocks } } } };
    const form = editor.createLanguageEditor(item, 'en');
    assert(form.querySelectorAll('textarea').some((el) => el.name === (type === 'event' ? 'description' : 'message')));
    assert.equal(form.elements.some((el) => el.name === 'bodyBlocks'), false);
    assert.equal(form.querySelectorAll('button').some((el) => /article_add|article_upload|article_choose|body_color|body_alignment/.test(el.dataset.i18n || '')), false);
    const request = editor.getContentLanguageSaveRequest(item, form);
    assert.equal(request.body.blocks, undefined); assert.equal(request.body.formattedBody, undefined);
  }
});

test('staff notices have one formatted field per language and preserve unaffected paragraphs and translation', async () => {
  for (const type of ['lastPost', 'retirementMessage']) {
    const { editor, document } = setup({ canReviewAndPublish: true });
    const blocks = [{ type: 'paragraph', children: ['English'] }, { type: 'paragraph', align: 'center', children: [{ type: 'underline', children: ['Details'] }] }];
    const text = BodyContent.plainText(blocks);
    const item = { _id: 'record', type, content: { messages: { en: text, fr: 'French' }, formattedBody: { en: { version: 1, text, blocks } } } };
    const forms = ['en', 'fr'].map((language) => editor.createLanguageEditor(item, language));
    const fields = forms[0].querySelectorAll('div').filter((el) => el.contentEditable === 'true');
    assert.equal(fields.length, 1);
    assert.equal(forms[0].querySelectorAll('button').some((el) => /add_block|remove_block|move_|upload|choose_image|choose_document/.test(el.dataset.i18n || '')), false);
    assert.equal(editor.isContentWorkspaceFormDirty(forms[0]), false);
    fields[0].children[0].replaceChildren(document.createTextNode('Changed English'));
    await fields[0].fire('input');
    const saved = editor.getContentLanguageSaveRequest(item, forms[0]);
    assert.equal(saved.body.message, 'Changed English\n\nDetails');
    assert.equal(saved.body.blocks[1].align, 'center'); assert.equal(saved.body.blocks[1].children[0].type, 'underline');
    assert.equal(editor.isContentWorkspaceFormDirty(forms[1]), false);
    assert.equal(editor.getContentLanguageSaveRequest(item, forms[1]).body.message, 'French');
  }
  const { editor } = setup({ canReviewAndPublish: true });
  const event = editor.createLanguageEditor({ _id: 'event', type: 'event', content: { description: { en: 'Event' } } }, 'en');
  assert.equal(event.querySelectorAll('div').some((el) => el.contentEditable === 'true'), false);
});

test('slim field preserves combined link/underline/color and canonicalizes theme colors without media controls', () => {
  const { window, document } = setup(); const root = document.createElement('div'), paragraph = document.createElement('p');
  const link = document.createElement('a'); link.href = 'https://example.test'; link.style.color = 'rgb(165, 35, 35)'; link.style.textDecoration = 'underline'; link.append(document.createTextNode('Named'));
  paragraph.append(link); root.append(paragraph); window.MessageEditor.canonicalizeBodyInline(root);
  const nodes = JSON.parse(JSON.stringify(window.MessageEditor.readMessage(root)));
  assert.equal(nodes[0].children[0].type, 'link'); assert.equal(nodes[0].children[0].children[0].type, 'underline');
  assert.equal(nodes[0].children[0].children[0].children[0].color, 'red');
  assert.equal(link.style.color, ''); assert.equal(link.className, 'body-color-red'); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
});

test('actual workspace save action sends only dirty language and retains unsaved copy on API failure', async () => {
  for (const type of ['lastPost', 'retirementMessage']) {
    const { editor, window, document } = setup({ canReviewAndPublish: true });
    const field = type === 'event' ? 'description' : 'messages';
    const item = { _id: 'record', type, content: { [field]: { en: 'English', fr: 'French' } } };
    const forms = ['en', 'fr'].map((language) => editor.createLanguageEditor(item, language));
    const rich = forms[0].querySelectorAll('div').find((el) => el.contentEditable === 'true');
    rich.children[0].replaceChildren(document.createTextNode('Changed English')); await rich.fire('input');
    const calls = [], state = { editorDrafts: new Map() }; let fail = true, reloaded = 0;
    const actions = window.ContentWorkspaceActions.create({
      contentWorkspaceState: state, getContentWorkspaceSaveForms: () => forms,
      isContentWorkspaceFormDirty: editor.isContentWorkspaceFormDirty,
      captureEditorDrafts: () => state.editorDrafts.set('record:en', 'unsaved'),
      getEditorDraftKey: editor.getEditorDraftKey,
      getContentLanguageSaveRequest: editor.getContentLanguageSaveRequest,
      contentWorkspaceApiJson: async (url, request) => { calls.push({ url, request }); if (fail) throw new Error('Synthetic failure'); return {}; },
      setWorkspaceTranslatedText: (el, key, fallback) => { el.textContent = fallback; },
      getText: (key, fallback) => fallback, updateContentWorkspaceSaveAction: () => {},
      setWorkspaceMessage: () => {}, showWorkspaceSuccess: () => {},
      loadContentWorkspace: async () => { reloaded++; },
    });
    const save = document.createElement('button');
    assert.equal(await actions.saveContentWorkspaceChanges(item, save), false);
    assert.equal(state.editorDrafts.get('record:en'), 'unsaved'); assert.equal(reloaded, 0);
    assert.equal(state.isActing, 0); assert.equal(save.getAttribute('aria-busy'), null);
    fail = false;
    assert.equal(await actions.saveContentWorkspaceChanges(item, save), true);
    assert.equal(calls.length, 2); assert.equal(calls[1].request.method, 'PATCH');
    assert.equal(calls[1].request.body.language, 'en');
    assert.equal(BodyContent.plainText(calls[1].request.body.blocks), 'Changed English');
    assert.equal(state.editorDrafts.size, 0); assert.equal(reloaded, 1);
    state.isUploading = 1;
    assert.equal(await actions.saveContentWorkspaceChanges(item, save), false); assert.equal(calls.length, 2);
    // Rebuilding after a discarded unsaved draft uses stored bilingual content.
    const restored = editor.createLanguageEditor(item, 'en');
    assert.equal(editor.getContentLanguageSaveRequest(item, restored).body.language, 'en');
    assert.equal(BodyContent.plainText(editor.getContentLanguageSaveRequest(item, restored).body.blocks), 'English');
  }
});


test('canceling the real link modal leaves copy clean; insertion gives named safe anchor consistent navigation attributes', async () => {
  const { editor, window, document, context } = setup({ canReviewAndPublish: true });
  const item = { _id: 'record', type: 'lastPost', content: { messages: { en: 'English', fr: 'French' } } };
  const forms = ['en', 'fr'].map((language) => editor.createLanguageEditor(item, language));
  const input = forms[0].querySelectorAll('div').find((el) => el.contentEditable === 'true');
  const linkButton = forms[0].querySelectorAll('button').find((el) => el.dataset.i18nAriaLabel === 'article_link');
  window.getSelection = () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} });
  context.CMCENModal.form = async () => null;
  await linkButton.fire('click');
  assert.equal(editor.isContentWorkspaceFormDirty(forms[0]), false);
  document.createRange = () => ({ selectNodeContents() {}, collapse() {}, deleteContents() {}, insertNode: (anchor) => input.append(anchor), setStartAfter() {} });
  context.CMCENModal.form = async () => ({ href: 'https://example.test/donate', text: 'Donate' });
  await linkButton.fire('click');
  const anchor = input.querySelector('a');
  assert.equal(anchor.href, 'https://example.test/donate'); assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener noreferrer');
  // This DOM boundary stores textContent separately; browsers create a text node.
  anchor.append(document.createTextNode(anchor.textContent)); await input.fire('input');
  const request = editor.getContentLanguageSaveRequest(item, forms[0]);
  assert.equal(request.body.blocks[1].children[0].children[0], 'Donate');
  assert.equal(editor.isContentWorkspaceFormDirty(forms[1]), false);
});
