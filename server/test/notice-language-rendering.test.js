const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const BodyContent = require('../public/body-content');

function setup(script, initialLanguage = 'fr') {
  const elements = new Map(), handlers = new Map(), storage = new Map([['lang', initialLanguage]]);
  let document;
  class Node {
    constructor(tag = '', text = '') {
      this.tag = tag; this.text = text; this.children = []; this.style = {}; this.dataset = {};
      this.classList = { add() {}, remove() {} }; this.ownerDocument = document;
    }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    addEventListener() {}
    querySelector() { return new Node(); }
  }
  document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Node()); return elements.get(id); },
    querySelector: () => new Node(), querySelectorAll: () => [], documentElement: {},
    createElement: tag => new Node(tag), createTextNode: text => new Node('', text),
    createDocumentFragment: () => new Node('fragment'),
    addEventListener(event, handler) { handlers.set(event, handler); },
  };
  const window = { location: { search: '', origin: 'https://example.test', pathname: '/' }, addEventListener() {} };
  const context = { window, document, URL, URLSearchParams, HTMLImageElement: class {}, Intl,
    fetch: async () => ({ ok: false }), MutationObserver: class { observe() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    BodyContent, translate: (key, values = {}) => `${storage.get('lang')}:${key}:${values.name || ''}`,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/app-utils.js'), 'utf8'), context);
  context.CMCENUtils = window.CMCENUtils;
  context.CMCENUtils.setDetailReturnLink = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/' + script), 'utf8')
    .replace(/\nload(?:RetirementMessage|LastPost)\(\);\s*$/, ''), context);
  return { context, elements, setLanguage(language) { storage.set('lang', language); handlers.get('languagechange')(); } };
}

function record() {
  const messages = { en: 'Read the memorial', fr: 'Consultez la nécrologie' };
  return { _id: 'example', messages, message: messages.en,
    retiree: { rank: 'MWO', ranks: { en: 'Master warrant officer', fr: 'Adjudant-chef' }, firstName: 'Alex', lastName: 'Example', postNominals: '', tradeRole: 'Shared source specialty', tradeRoles: { en: '00385, SIG TECH', fr: '00385, TECH SIG' } },
    deceased: { fullRank: 'Capt', ranks: { en: 'Captain', fr: 'Capitaine' }, firstName: 'Alex', surname: 'Example' },
    photoUrl: 'https://example.test/original.png', imageUrl: 'https://example.test/original.png',
    formattedBody: Object.fromEntries(Object.entries(messages).map(([language, text]) => [language, { version: 1, text, blocks: [{ type: 'paragraph', children: [{ type: 'link', href: 'https://example.test/NamedMemorial', children: [text] }] }] }])),
  };
}
function anchors(node) { return [ ...(node.tag === 'a' ? [node] : []), ...node.children.flatMap(anchors) ]; }

for (const [script, render, textId, imageId] of [
  ['retirement-message.js', 'renderRetirementMessage', 'retirementDetailText', 'retirementDetailPhoto'],
  ['last-post-message.js', 'renderLastPost', 'lastPostDetailText', 'lastPostDetailImage'],
]) {
  test(`${script}: initial French and repeated switches preserve named links, source rank and image alt`, () => {
    const ui = setup(script), content = record(), saved = JSON.stringify(content);
    assert.equal(ui.context.window.currentLang, undefined);
    ui.context[render](content);
    assert.equal(ui.elements.get(textId).textContent, content.messages.fr);
    assert.equal(anchors(ui.elements.get(textId))[0].href, 'https://example.test/NamedMemorial');
    assert(ui.elements.get(imageId).children[0].alt.startsWith('fr:'));
    for (const language of ['fr', 'en', 'fr', 'en']) {
      ui.setLanguage(language);
      const text = ui.elements.get(textId), links = anchors(text);
      assert.equal(text.textContent, content.messages[language]);
      assert.equal(links.length, 1); assert.equal(links[0].href, 'https://example.test/NamedMemorial');
      assert(ui.elements.get(imageId).children[0].alt.startsWith(language + ':'));
      if (script.startsWith('retirement')) {
        assert.equal(ui.elements.get('retirementDetailMosid').textContent, content.retiree.tradeRoles[language]);
        assert(ui.elements.get('retirementDetailTitle').textContent.includes(content.retiree.ranks[language]));
      }
    }
    assert.equal(JSON.stringify(content), saved, 'Rendering must preserve saved staff/source data');
  });
}

test('retirement specialty and placeholder use active language with optional translations absent', () => {
  const ui = setup('retirement-message.js'), content = record();
  delete content.retiree.tradeRoles;
  ui.context.renderRetirementMessage(content);
  assert.equal(ui.elements.get('retirementDetailMosid').textContent, 'Shared source specialty');
  content.retiree.tradeRole = '';
  ui.setLanguage('en'); assert.equal(ui.elements.get('retirementDetailMosid').textContent, 'en:retirement_mosid_pending:');
  ui.setLanguage('fr'); assert.equal(ui.elements.get('retirementDetailMosid').textContent, 'fr:retirement_mosid_pending:');
  content.retiree.tradeRole = 'Shared'; content.retiree.tradeRoles = { fr: '' };
  ui.setLanguage('fr'); assert.equal(ui.elements.get('retirementDetailMosid').textContent, 'Shared');
});
