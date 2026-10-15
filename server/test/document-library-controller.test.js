const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const labels = require('../public/page-content/document-library.json');
const flush = () => new Promise(setImmediate);

async function setup(hash = '') {
  const controls = Object.fromEntries(
    [
      'documentLibrary',
      'documentSearch',
      'documentOrganization',
      'documentType',
      'documentResultCount',
      'documentLibraryMore',
    ].map((id) => [id, new Element('div')]),
  );
  controls.documentOrganization.value = controls.documentType.value = 'all';
  const document = new Element('document');
  document.documentElement = { lang: 'en' };
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) =>
    controls[id] || find(controls.documentLibrary, id);
  function find(root, id) {
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = find(child, id);
      if (found) return found;
    }
    return null;
  }
  let scrolled = '';
  const originalCreate = document.createElement;
  document.createElement = (tag) => {
    const element = originalCreate(tag);
    element.scrollIntoView = () => {
      scrolled = element.id;
    };
    return element;
  };
  const window = new Element('window');
  for (const element of [...Object.values(controls), document, window]) {
    const fire = element.fire.bind(element);
    element.fire = async (...args) => {
      await fire(...args);
      await flush();
    };
  }
  const location = { hash };
  let requests = 0;
  const documents = Array.from({ length: 60 }, (_, index) => ({
    id: `doc-${index}`,
    pageUrl: 'https://legacy.example.test/private',
    ...(index === 0
      ? {
          htmlVersionUrl: '/about-family#charterContent',
          references: [
            {
              href: '/pages/public',
              title: { en: 'Public source', fr: 'Source publique' },
            },
          ],
        }
      : {}),
    aliases: index === 59 ? ['archive-123'] : [],
    organization: index >= 30 ? 'branch' : 'family',
    type: 'charter',
    en: {
      title: `Document ${index}`,
      description: index === 59 ? 'Needle' : '',
      dateLabel: '2020',
    },
    fr: { title: `Document ${index}`, description: '', dateLabel: '2020' },
  }));
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/document-library.js'),
      'utf8',
    ),
    {
      document,
      window,
      location,
      console,
      fetch: async () => {
        requests++;
        return { ok: true, json: async () => ({ ...labels, documents }) };
      },
    },
  );
  await flush();
  return {
    controls,
    document,
    window,
    location,
    requests: () => requests,
    scrolled: () => scrolled,
  };
}

test('Load more reveals batches and keeps the full result count without refetching', async () => {
  const { controls: c, requests } = await setup();
  assert.equal(c.documentLibrary.children.length, 24);
  assert.equal(c.documentResultCount.textContent, '24 of 60 documents');
  assert.equal(c.documentLibraryMore.hidden, false);
  await c.documentLibraryMore.fire('click');
  assert.equal(c.documentLibrary.children.length, 48);
  await c.documentLibraryMore.fire('click');
  assert.equal(c.documentLibrary.children.length, 60);
  assert.equal(c.documentLibraryMore.hidden, true);
  assert.equal(requests(), 1);
});

test('search and filters find unloaded documents and reset the visible batch', async () => {
  const { controls: c } = await setup();
  c.documentSearch.value = 'Needle';
  await c.documentSearch.fire('input');
  assert.equal(c.documentLibrary.children.length, 1);
  assert.equal(c.documentLibrary.children[0].id, 'doc-59');
  assert.equal(c.documentLibraryMore.hidden, true);
  c.documentSearch.value = '';
  c.documentOrganization.value = 'branch';
  await c.documentOrganization.fire('change');
  assert.equal(c.documentLibrary.children.length, 24);
  assert.equal(c.documentLibrary.children[0].id, 'doc-30');
  await c.documentLibraryMore.fire('click');
  assert.equal(c.documentLibrary.children.length, 30);
  c.documentOrganization.value = 'all';
  await c.documentOrganization.fire('change');
  assert.equal(c.documentLibrary.children.length, 24);
});

test('direct document and alias anchors reveal later cards', async () => {
  for (const hash of ['#doc-59', '#archive-123']) {
    const state = await setup(hash);
    assert.equal(state.controls.documentLibrary.children.length, 60);
    assert.equal(state.scrolled(), hash.slice(1));
  }
  const state = await setup('#%broken');
  assert.equal(state.controls.documentLibrary.children.length, 24);
});

test('hash changes reveal a target hidden by filters and language changes retain loaded cards', async () => {
  const { controls: c, document, window, location, scrolled } = await setup();
  c.documentSearch.value = 'No match';
  await c.documentSearch.fire('input');
  assert.equal(c.documentLibraryMore.hidden, true);
  location.hash = '#doc-59';
  await window.fire('hashchange');
  assert.equal(c.documentSearch.value, '');
  assert.equal(c.documentLibrary.children.length, 60);
  assert.equal(scrolled(), 'doc-59');
  document.documentElement.lang = 'fr';
  await document.fire('languagechange');
  assert.equal(c.documentLibrary.children.length, 60);
  assert.equal(c.documentLibraryMore.textContent, 'Afficher plus');
  assert.equal(c.documentResultCount.textContent, '60 sur 60 documents');
});

test('cards show localized references and only an explicitly supplied HTML rendition', async () => {
  const { controls: c, document } = await setup();
  const first = c.documentLibrary.children[0];
  assert.equal(
    first.querySelector('summary').textContent,
    'Referenced on 1 page',
  );
  assert.equal(
    first.querySelectorAll('a').find((a) => a.href === '/pages/public')
      .textContent,
    'Public source',
  );
  assert.equal(
    first
      .querySelectorAll('a')
      .find((a) => a.href === '/about-family#charterContent').textContent,
    'Read HTML version',
  );
  assert.ok(
    c.documentLibrary
      .querySelectorAll('a')
      .every((a) => !a.href.startsWith('https://legacy')),
  );
  assert.equal(c.documentLibrary.children[1].querySelector('details'), null);
  document.documentElement.lang = 'fr';
  await document.fire('languagechange');
  assert.equal(
    c.documentLibrary.children[0]
      .querySelectorAll('a')
      .find((a) => a.href === '/pages/public').textContent,
    'Source publique',
  );
});
