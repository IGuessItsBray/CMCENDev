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
  remove() {
    this.parent.children = this.parent.children.filter((node) => node !== this);
    this.isConnected = false;
  }
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
  for (const name of ['person-rank-options', 'message-editor', 'content-workspace-editors', 'content-workspace-actions']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../public/${name}.js`), 'utf8'), context);
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
    assert.equal(saved.body.blocks[1].align, type === 'lastPost' ? 'center' : 'left'); assert.equal(saved.body.blocks[1].children[0].type, 'underline');
    assert.equal(editor.isContentWorkspaceFormDirty(forms[1]), false);
    assert.equal(editor.getContentLanguageSaveRequest(item, forms[1]).body.message, 'French');
  }
  const { editor } = setup({ canReviewAndPublish: true });
  const event = editor.createLanguageEditor({ _id: 'event', type: 'event', content: { description: { en: 'Event' } } }, 'en');
  assert.equal(event.querySelectorAll('div').some((el) => el.contentEditable === 'true'), false);
});

test('notice layout is fixed for both languages, rich/plain and conflicting legacy paragraph styles without changing stored copy', () => {
  const { document } = setup();
  for (const type of ['lastPost', 'retirementMessage']) for (const language of ['en', 'fr']) for (const rich of [false, true]) {
    const text = language === 'en' ? 'Mixed case service' : 'Détails du service';
    const blocks = [{ type: 'paragraph', align: 'right', children: [text] }];
    const content = rich ? { formattedBody: { [language]: { version: 1, text, blocks } } } : {};
    const original = JSON.stringify(content), element = document.createElement('div');
    BodyContent.render(element, content, language, text, (el, value) => el.append(document.createTextNode(value)), type);
    assert.equal(element.style.textAlign, type === 'lastPost' ? 'center' : 'left');
    assert.equal(element.style.textTransform, type === 'retirementMessage' ? 'uppercase' : 'none');
    if (rich) assert.equal(element.children[0].style.textAlign, element.style.textAlign);
    assert.equal(JSON.stringify(content), original, 'layout cannot uppercase or rewrite source data');
  }
  const event = document.createElement('div'), blocks = [{ type: 'paragraph', align: 'right', children: ['Event'] }];
  BodyContent.render(event, { formattedBody: { en: { version: 1, text: 'Event', blocks } } }, 'en', 'Event', () => {});
  assert.equal(event.children[0].className, 'body-align-right'); assert.equal(event.style.textTransform, undefined);
});

test('actual underline command becomes a dirty language-only save and re-renders with fixed notice layout', async () => {
  for (const type of ['lastPost', 'retirementMessage']) for (const language of ['en', 'fr']) for (const rich of [false, true]) {
    const { editor, window, document } = setup({ canReviewAndPublish: true });
    const messages = { en: 'Mixed case service', fr: 'Détails du service' };
    const blocks = [{ type: 'paragraph', align: 'right', children: [messages[language]] }];
    const item = { _id: 'record', type, content: { messages, ...(rich ? { formattedBody: { [language]: { version: 1, text: messages[language], blocks } } } : {}) } };
    const original = JSON.stringify(item);
    const forms = ['en', 'fr'].map((lang) => editor.createLanguageEditor(item, lang));
    const form = forms.find((f) => f.dataset.language === language);
    const input = form.querySelectorAll('div').find((el) => el.contentEditable === 'true');
    assert.equal(input.style.textAlign, 'left');
    assert.equal(input.children[0].style.textAlign, 'left');
    assert.equal(JSON.stringify(item), original, 'editing layout cannot rewrite source data');
    const buttons = form.querySelectorAll('button');
    assert.equal(buttons.length, 4);
    assert.equal(buttons.some((button) => /body_align|body_color/.test(button.dataset.i18n || '')), false);
    for (const button of buttons) { assert(button.getAttribute('aria-label')); assert(button.title); assert.equal(button.children[0].getAttribute('aria-hidden'), 'true'); }
    assert.equal(buttons.find((button) => button.dataset.i18nAriaLabel === 'body_underline').children[0].tagName, 'U');
    assert.equal(editor.isContentWorkspaceFormDirty(form), false);
    document.execCommand = (command) => {
      assert.equal(command, 'underline');
      const paragraph = input.children[0], underline = document.createElement('u');
      underline.append(...paragraph.children); paragraph.replaceChildren(underline);
    };
    await form.querySelectorAll('button').find((button) => button.dataset.i18nAriaLabel === 'body_underline').fire('click');
    assert.equal(editor.isContentWorkspaceFormDirty(form), true, 'formatting-only edit enables save');
    assert.equal(form.querySelectorAll('button').find((button) => button.dataset.i18nAriaLabel === 'body_underline').getAttribute('aria-pressed'), 'true');
    const requests = [], state = { editorDrafts: new Map() };
    const actions = window.ContentWorkspaceActions.create({
      contentWorkspaceState: state, getContentWorkspaceSaveForms: () => forms,
      isContentWorkspaceFormDirty: editor.isContentWorkspaceFormDirty, captureEditorDrafts: () => {},
      getEditorDraftKey: editor.getEditorDraftKey, getContentLanguageSaveRequest: editor.getContentLanguageSaveRequest,
      contentWorkspaceApiJson: async (url, request) => { requests.push(request); return {}; },
      setWorkspaceTranslatedText: (el, key, fallback) => { el.textContent = fallback; }, getText: (key, fallback) => fallback,
      updateContentWorkspaceSaveAction: () => {}, setWorkspaceMessage: () => {}, showWorkspaceSuccess: () => {}, loadContentWorkspace: async () => {},
    });
    assert.equal(await actions.saveContentWorkspaceChanges(item, document.createElement('button')), true);
    assert.equal(requests.length, 1); const saved = requests[0].body;
    assert.equal(saved.language, language); assert.equal(saved.message, messages[language]);
    assert.equal(saved.blocks[0].children[0].type, 'underline');
    assert.equal(saved.blocks[0].align, type === 'lastPost' ? 'center' : 'left');
    const preview = document.createElement('div');
    BodyContent.render(preview, { formattedBody: { [language]: { version: 1, text: saved.message, blocks: saved.blocks } } }, language, saved.message, () => assert.fail('unexpected fallback'), type);
    assert.equal(preview.children[0].style.textAlign, type === 'lastPost' ? 'center' : 'left');
    assert.equal(preview.style.textTransform, input.style.textTransform);
    assert.equal(preview.children[0].children[0].tagName, 'U');
  }
});

test('slim field unwraps old color while preserving underline and safe links', () => {
  const { window, document } = setup(); const root = document.createElement('div'), paragraph = document.createElement('p');
  const link = document.createElement('a'); link.href = 'https://example.test'; link.style.color = 'rgb(165, 35, 35)'; link.style.textDecoration = 'underline'; link.append(document.createTextNode('Named'));
  paragraph.append(link); root.append(paragraph); window.MessageEditor.canonicalizeBodyInline(root);
  const nodes = JSON.parse(JSON.stringify(window.MessageEditor.readMessage(root)));
  assert.equal(nodes[0].children[0].type, 'link'); assert.equal(nodes[0].children[0].children[0].type, 'underline');
  assert.equal(nodes[0].children[0].children[0].children[0], 'Named');
  assert.equal(link.style.color, ''); assert.equal(link.className, ''); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
});

test('old notice colors unwrap to normal theme while nested bold/underline/link and exact targets survive', () => {
  const { document } = setup();
  const blocks = [{ type: 'paragraph', children: [{ type: 'color', color: 'red', children: [{ type: 'strong', children: [{ type: 'underline', children: [{ type: 'link', href: 'https://example.test/CasePath', children: ['Détails'] }] }] }] }] }];
  const text = BodyContent.plainText(blocks), original = JSON.stringify(blocks);
  for (const type of ['lastPost', 'retirementMessage']) for (const language of ['en', 'fr']) {
    const element = document.createElement('div');
    BodyContent.render(element, { formattedBody: { [language]: { version: 1, text, blocks } } }, language, text, () => {}, type);
    assert.equal(element.querySelectorAll('span').length, 0); assert.equal(element.querySelector('strong').tagName, 'STRONG');
    assert.equal(element.querySelector('u').tagName, 'U'); assert.equal(element.querySelector('a').href, 'https://example.test/CasePath');
    assert.equal(JSON.stringify(blocks), original);
  }
  const event = document.createElement('div');
  BodyContent.render(event, { formattedBody: { en: { version: 1, text, blocks } } }, 'en', text, () => {});
  assert.equal(event.querySelector('span').className, 'body-color-red', 'Event colors remain unchanged');
});

test('four symbolic controls have bilingual accessible names and track native formatting selection state', async () => {
  const translations = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/translations.json'), 'utf8'));
  for (const language of ['en', 'fr']) {
    const { window, document } = setup();
    const active = new Set(['underline']); document.queryCommandState = (command) => active.has(command);
    const field = window.MessageEditor.create({ blocks: BodyContent.fromText('Text'), noticeType: 'lastPost', onChange() {}, getText: (key) => translations[language][key] });
    const buttons = field.querySelectorAll('button'), input = field.querySelectorAll('div').find((el) => el.contentEditable === 'true');
    assert.equal(buttons.length, 4);
    for (const key of ['article_bold', 'article_italic', 'body_underline', 'article_link']) {
      const control = buttons.find((button) => button.dataset.i18nAriaLabel === key);
      assert.equal(control.getAttribute('aria-label'), translations[language][key]); assert.equal(control.title, translations[language][key]);
    }
    await input.fire('mouseup');
    assert.equal(buttons.find((button) => button.dataset.i18nAriaLabel === 'body_underline').getAttribute('aria-pressed'), 'true');
    active.clear(); active.add('bold'); await input.fire('keyup');
    assert.equal(buttons.find((button) => button.dataset.i18nAriaLabel === 'article_bold').getAttribute('aria-pressed'), 'true');
    assert.equal(buttons.find((button) => button.dataset.i18nAriaLabel === 'body_underline').getAttribute('aria-pressed'), 'false');
    await input.fire('blur');
    for (const button of buttons.filter((button) => button.dataset.i18nAriaLabel !== 'article_link')) assert.equal(button.getAttribute('aria-pressed'), 'false');
  }
});

test('actual public notice page renderers select their fixed styles for EN/FR plain and rich messages', () => {
  for (const type of ['lastPost', 'retirementMessage']) for (const language of ['en', 'fr']) for (const rich of [false, true]) {
    const { context, document } = setup(); const elements = new Map();
    document.getElementById = (id) => { if (!elements.has(id)) elements.set(id, document.createElement('div')); return elements.get(id); };
    document.querySelector = () => document.createElement('div'); document.addEventListener = () => {};
    context.window.location = { search: '' }; context.window.currentLang = language;
    context.translate = (key) => key;
    context.CMCENUtils = { setDetailReturnLink() {}, getCurrentLanguage: () => language, getLastPostName: () => 'Name', getLocalizedText: (messages) => messages[language], setLinkifiedText: (el, value) => el.append(document.createTextNode(value)) };
    context.BodyContent = BodyContent;
    const name = type === 'lastPost' ? 'last-post-message' : 'retirement-message';
    const code = fs.readFileSync(path.join(__dirname, `../public/${name}.js`), 'utf8').replace(/\nload(?:LastPost|RetirementMessage)\(\);\s*$/, '');
    vm.runInNewContext(code, context); context.renderImage = () => {};
    const messages = { en: 'Mixed case service', fr: 'Détails du service' }, text = messages[language];
    const blocks = [{ type: 'paragraph', align: 'right', children: [{ type: 'underline', children: [text] }] }];
    const record = { messages, ...(rich ? { formattedBody: { [language]: { version: 1, text, blocks } } } : {}) };
    if (type === 'lastPost') context.renderLastPost(record); else context.setRetirementMessageText(record);
    const element = elements.get(type === 'lastPost' ? 'lastPostDetailText' : 'retirementDetailText');
    assert.equal(element.style.textAlign, type === 'lastPost' ? 'center' : 'left');
    assert.equal(element.style.textTransform, type === 'lastPost' ? 'none' : 'uppercase');
    if (rich) { assert.equal(element.children[0].style.textAlign, element.style.textAlign); assert.equal(element.querySelector('u').tagName, 'U'); }
    assert.equal(record.messages[language], text);
  }
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


test('canceling the real link modal leaves copy clean; insertion gives editable named safe anchor consistent navigation attributes', async () => {
  const { editor, window, document, context } = setup({ canReviewAndPublish: true });
  const item = { _id: 'record', type: 'lastPost', content: { messages: { en: 'English', fr: 'French' } } };
  const forms = ['en', 'fr'].map((language) => editor.createLanguageEditor(item, language));
  const input = forms[0].querySelectorAll('div').find((el) => el.contentEditable === 'true');
  const linkButton = forms[0].querySelectorAll('button').find((el) => el.dataset.i18nAriaLabel === 'article_link');
  window.getSelection = () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} });
  context.CMCENModal.form = async () => null;
  await linkButton.fire('click');
  assert.equal(editor.isContentWorkspaceFormDirty(forms[0]), false);
  document.createRange = () => ({ selectNodeContents() {}, collapse() {}, deleteContents() {}, insertNode: (anchor) => {
    // This DOM boundary stores textContent separately; browsers create a text node.
    anchor.append(document.createTextNode(anchor.textContent));
    input.append(anchor);
  }, setStartAfter() {} });
  context.CMCENModal.form = async () => ({ href: 'https://example.test/donate', text: 'Donate' });
  await linkButton.fire('click');
  const anchor = input.querySelector('a');
  assert.equal(anchor.href, 'https://example.test/donate'); assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener noreferrer');
  assert.notEqual(anchor.contentEditable, 'false');
  await input.fire('input');
  const request = editor.getContentLanguageSaveRequest(item, forms[0]);
  assert.equal(request.body.blocks[1].children[0].children[0], 'Donate');
  assert.equal(editor.isContentWorkspaceFormDirty(forms[1]), false);
});

test('notice link labels inherit editing, suppress navigation and preserve target and inline formatting after text edits', async () => {
  const { editor, document } = setup({ canReviewAndPublish: true });
  const href = 'mailto:DND.Example@example.test';
  const blocks = [{ type: 'paragraph', children: [{ type: 'link', href, children: [{ type: 'strong', children: ['DND contact'] }] }] }];
  const item = { _id: 'record', type: 'lastPost', content: { messages: { en: 'DND contact' }, formattedBody: { en: { version: 1, text: 'DND contact', blocks } } } };
  const form = editor.createLanguageEditor(item, 'en');
  const input = form.querySelectorAll('div').find((node) => node.contentEditable === 'true');
  const anchor = input.querySelector('a');
  assert.notEqual(anchor.contentEditable, 'false');
  let prevented = false;
  await input.fire('click', { target: anchor.children[0], preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true, 'clicking nested link text must not navigate');
  assert.equal(editor.isContentWorkspaceFormDirty(form), false);
  const label = anchor.children[0];
  label.replaceChildren(document.createTextNode('DND revised contact'));
  await input.fire('input');
  const saved = editor.getContentLanguageSaveRequest(item, form).body;
  assert.equal(saved.message, 'DND revised contact');
  assert.equal(saved.blocks[0].children[0].href, href);
  assert.equal(saved.blocks[0].children[0].children[0].type, 'strong');
  assert.equal(saved.blocks[0].children[0].children[0].children[0], 'DND revised contact');
  label.replaceChildren(document.createTextNode('DND revised contac'));
  await input.fire('input');
  assert.equal(editor.getContentLanguageSaveRequest(item, form).body.blocks[0].children[0].href, href);
  assert.equal(editor.getContentLanguageSaveRequest(item, form).body.message, 'DND revised contac');
  label.replaceChildren(document.createTextNode(''));
  await input.fire('input');
  assert.equal(input.querySelector('a'), null, 'deleting all label text cleans up the empty link');
});

test('partial and full link selections survive toolbar mousedown and cancelled link dialog without dirtying copy', async () => {
  for (const selected of ['contact', 'DND contact']) {
    const { editor, window, context } = setup({ canReviewAndPublish: true });
    const blocks = [{ type: 'paragraph', children: [{ type: 'link', href: 'mailto:dnd@example.test', children: ['DND contact'] }] }];
    const item = { _id: 'record', type: 'lastPost', content: { messages: { en: 'DND contact' }, formattedBody: { en: { version: 1, text: 'DND contact', blocks } } } };
    const form = editor.createLanguageEditor(item, 'en');
    const input = form.querySelectorAll('div').find((node) => node.contentEditable === 'true');
    const text = input.querySelector('a').children[0];
    input.contains = (node) => node === text;
    const range = { toString: () => selected };
    const selection = { rangeCount: 1, anchorNode: text, getRangeAt: () => ({ cloneRange: () => range }), removeAllRanges() { this.restored = null; }, addRange(value) { this.restored = value; } };
    window.getSelection = () => selection;
    context.CMCENModal.form = async (title, options) => {
      assert.equal(options.fields[1].defaultValue, selected);
      selection.removeAllRanges(); // The modal moves focus/selection away from the field.
      return null;
    };
    for (const control of form.querySelectorAll('button')) {
      let prevented = false;
      await control.fire('mousedown', { preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true);
    }
    await form.querySelectorAll('button').find((node) => node.dataset.i18nAriaLabel === 'article_link').fire('click');
    assert.equal(selection.restored, range);
    assert.equal(editor.isContentWorkspaceFormDirty(form), false);
    assert.equal(editor.getContentLanguageSaveRequest(item, form).body.message, 'DND contact');
  }
});
