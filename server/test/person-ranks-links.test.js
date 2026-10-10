const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { cleanRanks, getPersonRank } = require('../services/person-ranks');

function setup() {
  class Node {
    constructor(tag = '', text = '') {
      this.tag = tag;
      this.text = text;
      this.children = [];
    }
    append(...nodes) {
      for (const node of nodes)
        this.children.push(
          ...(node.tag === 'fragment' ? node.children : [node]),
        );
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    set textContent(value) {
      this.text = value;
      this.children = [];
    }
    get textContent() {
      return this.text + this.children.map((node) => node.textContent).join('');
    }
  }
  const document = {
    addEventListener() {},
    querySelectorAll: () => [],
    documentElement: {},
    createDocumentFragment: () => new Node('fragment'),
    createTextNode: (text) => new Node('', text),
    createElement: (tag) => new Node(tag),
  };
  const window = {
    currentLang: 'en',
    addEventListener() {},
    location: { origin: 'https://cmcen.test' },
  };
  const context = {
    window,
    document,
    URL,
    HTMLImageElement: class {},
    fetch: async () => ({ ok: false }),
    MutationObserver: class {
      observe() {}
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/app-utils.js'), 'utf8'),
    context,
  );
  return { window, utils: window.CMCENUtils, element: new Node('p') };
}

test('both person titles switch authored ranks and retain original-rank fallbacks', () => {
  const { window, utils } = setup();
  const ranks = { en: 'Captain', fr: 'Capitaine' };
  const retiree = {
    rank: 'Capt',
    ranks,
    firstName: 'Alex',
    lastName: 'Example',
    postNominals: 'CD',
  };
  const lastPost = {
    deceased: {
      fullRank: 'Capt',
      ranks,
      firstName: 'Alex',
      surname: 'Example',
      postNominal: 'CD',
    },
    displayName: 'Old title',
  };
  for (const language of ['en', 'fr', 'en']) {
    window.currentLang = language;
    assert.equal(
      utils.getRetireeNameParts(retiree).name,
      `${ranks[language]} Alex Example`,
    );
    assert.equal(
      utils.getLastPostName(lastPost),
      `${ranks[language]} Alex Example, CD`,
    );
    assert.equal(
      utils.getPersonRank(retiree),
      getPersonRank(retiree, 'rank', language),
    );
  }
  window.currentLang = 'fr';
  assert.equal(
    utils.getPersonRank({ rank: 'Imported source rank' }),
    'Imported source rank',
  );
  assert.equal(
    utils.getPersonRank({ rank: 'Capt', ranks: { en: 'Captain', fr: '' } }),
    'Capt',
  );
  assert.equal(utils.getPersonRank({ ranks: { en: 'Captain' } }), 'Captain');
});

test('rank validation trims authored strings and rejects malformed or oversized translations', () => {
  assert.deepEqual(cleanRanks({ en: ' Captain ', fr: ' Capitaine ' }, 40), {
    en: 'Captain',
    fr: 'Capitaine',
  });
  for (const value of [
    null,
    [],
    'Captain',
    { fr: {} },
    { fr: null },
    { en: 'a'.repeat(41) },
  ]) {
    assert.throws(() => cleanRanks(value, 40), /English\/French text object/);
  }
  assert.deepEqual(cleanRanks({ fr: '' }), { en: '', fr: '' });
});

test('staff detail editors round-trip both authored rank languages', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../public/content-workspace-editors.js'),
    'utf8',
  );
  const fields = source.slice(
    source.indexOf('function getRetirementDetailsFields'),
    source.indexOf('function getNewsArticleDetailsFields'),
  );
  const start = source.indexOf('function getContentWorkspaceRecordPayload');
  const end = source.indexOf('\n    function ', start + 1);
  const payload = source.slice(start, end);
  const api = vm.runInNewContext(
    `${fields}\n${payload}; ({ getRetirementDetailsFields, getLastPostDetailsFields, getContentWorkspaceRecordPayload })`,
    {
      createWorkspaceEditorField: (value) => value,
      createWorkspaceDateTimeField: (value) => value,
      getWorkspaceIsoDate: (value) => value || '',
      window: { CMCENRanks: require('../public/person-rank-options') },
      createPersonRankFields: (person, legacy, prefix) =>
        Object.entries(require('../public/person-rank-options').initialValues(person, legacy))
          .map(([language, value]) => ({ field: prefix + (language === 'en' ? 'En' : 'Fr'), value })),
    },
  );
  for (const [type, person, fieldsFunction] of [
    ['retirementMessage', 'retiree', 'getRetirementDetailsFields'],
    ['lastPost', 'deceased', 'getLastPostDetailsFields'],
  ]) {
    const ranks = { en: 'Captain', fr: 'Capitaine' };
    const item = {
      type,
      content: {
        [person]: { rank: 'Capt', fullRank: 'Capt', ranks, firstName: 'Alex' },
      },
    };
    if (person === 'retiree') item.content.retiree.tradeRoles = { en: '00385, SIG TECH', fr: '00385, TECH SIG' };
    const values = new Map(
      api[fieldsFunction](item).map(({ field, value }) => [field, value]),
    );
    const saved = api.getContentWorkspaceRecordPayload(item, values);
    assert.deepEqual(JSON.parse(JSON.stringify(saved[person].ranks)), ranks);
    if (person === 'retiree') {
      assert.deepEqual(JSON.parse(JSON.stringify(saved.retiree.tradeRoles)), item.content.retiree.tradeRoles);
      values.set('retireeTradeRoleFr', 'Staff specialty');
      assert.equal(api.getContentWorkspaceRecordPayload(item, values).retiree.tradeRoles.fr, 'Staff specialty');
    }
    values.set(`${person}RankFr`, 'Grade vérifié');
    assert.equal(
      api.getContentWorkspaceRecordPayload(item, values)[person].ranks.fr,
      'Grade vérifié',
    );
    values.set(`${person}RankFr`, '');
    assert.equal(
      api.getContentWorkspaceRecordPayload(item, values)[person].ranks.fr,
      '',
    );
  }
});

test('shared retirement and Last Post plain-text renderer links URLs and email while preserving punctuation', () => {
  const { utils, element } = setup();
  const body =
    'Visit (https://example.test/a(b)), www.example.test. Email staff@example.test; mailto:help@example.test!';
  utils.setLinkifiedText(element, body);
  assert.equal(element.textContent, body);
  const links = element.children.filter((node) => node.tag === 'a');
  assert.deepEqual(
    links.map((node) => node.href),
    [
      'https://example.test/a(b)',
      'https://www.example.test/',
      'mailto:staff@example.test',
      'mailto:help@example.test',
    ],
  );
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[2].target, undefined);
  utils.setLinkifiedText(element, body);
  assert.equal(element.children.filter((node) => node.tag === 'a').length, 4);
});

test('submitted markup, existing anchors, unsafe protocols and credentials stay inert', () => {
  const { utils, element } = setup();
  const body =
    '<a href="https://example.test">https://example.test</a> <img src=x onerror=alert(1)> javascript:https://evil.test data:text/html,https://evil.test ftp://evil.test https://user:pass@example.test <script>alert(1)</script> " &';
  utils.setLinkifiedText(element, body);
  assert.equal(element.textContent, body);
  assert.deepEqual(
    element.children.filter((node) => node.tag),
    [],
  );
});

test('email URL punctuation is encoded rather than becoming mail headers or fragments', () => {
  const { utils, element } = setup();
  const body = 'staff+notice@example.test staff%0a@example.test';
  utils.setLinkifiedText(element, body);
  assert.equal(element.textContent, body);
  const links = element.children.filter((node) => node.tag === 'a');
  assert.deepEqual(links.map((node) => node.href), ['mailto:staff%2Bnotice@example.test', 'mailto:staff%250a@example.test']);
});
