const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Format = require('../public/newsletter-format');
const { Element: Base } = require('./helpers/dashboard-dom');

const photo = 'https://media.example.test/photo.jpg';
function article(layout = 'newsletter', placement) {
  return {
    _id: '012345678901234567890123', layout, category: 'history-heritage',
    ...(placement ? { coverPlacement: placement } : {}),
    title: { en: 'English title', fr: 'Titre français' },
    content: { en: 'English body', fr: 'Contenu français' },
    imageUrl: photo, imageDisplayUrl: photo, publishedAt: '2023-05-14T12:00:00Z',
    newsletter: { language: 'en', headerCrest: false },
    newsletterBlocks: Object.fromEntries(['en', 'fr'].map(language => [language, [
      { type: 'heading', text: language === 'en' ? 'Day 1' : 'Jour 1' },
      { type: 'figure', image: { url: photo, alt: language }, caption: language },
    ]])),
  };
}

test('legacy placement preserves standard, newsletter, header and bilingual duplicate behavior', () => {
  assert.equal(Format.resolveCoverPlacement(article('standard')), 'header');
  const old = article();
  assert.equal(Format.resolveCoverPlacement(old), 'cards');
  old.newsletterBlocks.en = [];
  assert.equal(Format.resolveCoverPlacement(old), 'cards'); // French reuse still suppresses legacy cover.
  old.newsletterBlocks.fr = [];
  assert.equal(Format.resolveCoverPlacement(old), 'body');
  old.category = 'newsletter';
  assert.equal(Format.resolveCoverPlacement(old), 'cards');
  old.newsletter.headerCrest = true;
  assert.equal(Format.resolveCoverPlacement(old), 'header');
  assert(!Object.hasOwn(old, 'coverPlacement'));
});

class Element extends Base {
  get parentElement() { return this.parent; }
  append(...children) {
    for (const child of children) if (child.parent)
      child.parent.children = child.parent.children.filter(c => c !== child);
    super.append(...children);
  }
  prepend(...children) { this.append(...children); this.children = [...children, ...this.children.filter(c => !children.includes(c))]; }
}
async function render(record, language) {
  const nodes = new Map();
  const document = {
    documentElement: Object.assign(new Element('html'), { lang: language }),
    createElement: tag => new Element(tag),
    createTextNode: text => Object.assign(new Element('text'), { textContent: text }),
    getElementById: id => nodes.get(id) || null,
    addEventListener() {},
  };
  const node = (id, tag = 'div') => { const el = new Element(tag); nodes.set(id, el); return el; };
  const window = { NewsletterFormat: Format, ArticleImages: { link: image => image }, addEventListener() {} };
  const utils = { getStoredAuthToken: () => '', getCurrentLanguage: () => language, getLocalizedText: (v, l = language) => typeof v === 'string' ? v : v?.[l] || '', formatDate: () => '', apiJson: async () => ({ article: record }) };
  const context = { window, document, CMCENUtils: utils, location: { search: '?id=012345678901234567890123' }, URL, URLSearchParams, Intl };
  if (record.layout === 'newsletter') {
    for (const id of ['newsletterArticle', 'newsletterContext', 'newsletterContextText', 'newsletterPreviewBanner', 'newsletterPreviewText', 'newsletterStaffActions', 'newsletterStaffLabel', 'newsletterStaffEdit']) node(id);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/newsletter.js'), 'utf8'), context);
    await new Promise(resolve => setImmediate(resolve));
    const root = nodes.get('newsletterArticle');
    assert.equal(root.getAttribute('aria-busy'), 'false');
    return { root, images: root.querySelectorAll('img') };
  }
  const root = node('newsDetailContent'), hero = new Element('section'), heading = new Element('header'), figure = new Element('figure'), body = new Element('section');
  figure.append(node('newsDetailImage', 'img'));heading.append(node('newsDetailDate'), node('newsDetailTitle', 'h1'));hero.append(heading, figure);body.append(node('newsDetailText', 'p'));root.append(hero, body);
  for (const id of ['newsDetailMessage', 'newsStaffActions', 'newsStaffLabel', 'newsStaffEdit']) node(id);
  const source = fs.readFileSync(path.join(__dirname, '../public/news-story.js'), 'utf8').replace(/\nloadNewsStory\(\);\s*$/, '');
  vm.runInNewContext(source, context);context.renderNewsStory(record);
  return { root, hero, body, figure, images: root.querySelectorAll('img') };
}

test('both renderers honor all placements in English/French without changing inline figures', async () => {
  for (const layout of ['newsletter', 'standard']) for (const language of ['en', 'fr']) for (const placement of Format.coverPlacements) {
    const value = article(layout, placement), before = JSON.stringify(value);
    const result = await render(value, language);
    if (layout === 'newsletter') {
      assert.equal(result.images.length, placement === 'cards' ? 1 : 2);
      const headerImages = result.root.querySelectorAll('header').flatMap(h => h.querySelectorAll('img'));
      assert.equal(headerImages.length, placement === 'header' ? 1 : 0);
      const body = result.root.children[1].children[0];
      assert.equal(body.children[0].tagName, placement === 'body' ? 'FIGURE' : 'H2');
      assert.equal(result.images.at(-1).alt, language);
    } else {
      assert.equal(result.figure.hidden, placement === 'cards');
      assert.equal(result.figure.parentElement, placement === 'body' ? result.body : result.hero);
      assert.equal(result.images[0].alt, value.title[language]);
    }
    assert.equal(JSON.stringify(value), before);
  }
});

test('empty covers add no detail image; legacy render decisions remain unchanged', async () => {
  for (const layout of ['newsletter', 'standard']) for (const placement of Format.coverPlacements) {
    const value = { ...article(layout, placement), imageUrl: '', imageDisplayUrl: '' };
    const result = await render(value, 'fr');
    if (layout === 'newsletter') assert.equal(result.images.length, 1); // Authored body figure remains.
    else assert.equal(result.figure.hidden, true);
  }
  assert.equal((await render(article(), 'en')).images.length, 1);
  const header = article();header.newsletter.headerCrest = true;
  assert.equal((await render(header, 'fr')).images.length, 2);
  assert.equal((await render(article('standard'), 'fr')).figure.hidden, false);
});

test('French UI with an English-only body retains the opening cover and later reuse', async () => {
  const value = article('newsletter', 'body');
  value.title.fr = '';value.newsletterBlocks.fr = [];
  const result = await render(value, 'fr');
  assert.equal(result.root.querySelector('h1').textContent, value.title.en);
  assert.equal(result.images.length, 2);
  assert.equal(result.images.at(-1).alt, 'en');
});

function editorRequest(item, placement, editedBlocks) {
  const forms = ['en', 'fr'].map(language => ({ dataset: { language }, classList: { contains: () => false }, data: new Map([
    ['title', item.content.title[language]], ['newsletterBlocks', JSON.stringify(editedBlocks?.[language] || Format.blocksFor(item.content, language))],
  ]) }));
  forms.push({ dataset: {}, classList: { contains: n => n === 'content-workspace-record-form' }, data: new Map(placement === undefined ? [] : [['coverPlacement', placement]]) });
  const context = { window: { NewsletterFormat: Format }, URL, FormData: class { constructor(form) { this.data = form.data; } get(k) { return this.data.get(k) ?? null; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/content-workspace-editors.js'), 'utf8'), context);
  const editor = context.window.ContentWorkspaceEditors.create({ contentWorkspaceDetail: { querySelectorAll: () => forms } });
  return editor.getNewsArticleSaveRequest(item).body;
}
test('editor unrelated saves keep legacy placement absent and preserve standard layout', () => {
  for (const layout of ['standard', 'newsletter']) {
    const value = article(layout), item = { _id: value._id, content: value, status: 'draft' };
    const paired = Object.fromEntries(['en', 'fr'].map(l => [l, Format.blocksFor(value, l).map(b => ({ ...b, pairId: 'editor-added-id' }))]));
    const request = editorRequest(item, '', paired);
    assert(!Object.hasOwn(request, 'coverPlacement'));assert.equal(request.layout, layout);
    for (const placement of Format.coverPlacements) assert.equal(editorRequest(item, placement).coverPlacement, placement);
  }
  const content = article();delete content.coverPlacement;
  assert.equal(editorRequest({ _id: 'new', isNew: true, content }).coverPlacement, 'body');
});

test('cover placement choices and history labels are available in both languages', () => {
  const translations = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/translations.json')));
  for (const language of ['en', 'fr']) for (const key of ['article_cover_placement', 'article_cover_header', 'article_cover_body', 'article_cover_cards', 'article_cover_legacy']) assert.equal(typeof translations[language][key], 'string');
});
