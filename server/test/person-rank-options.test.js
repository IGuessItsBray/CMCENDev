const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Ranks = require('../public/person-rank-options');
const { cleanRanks } = require('../services/person-ranks');
const { Element: Base } = require('./helpers/dashboard-dom');

function editorFields() {
  class Element extends Base {
    constructor(tag) { super(tag); delete this.selectedValue; this.classList = { add() {} }; }
    get value() {
      if (this.tagName === 'SELECT' && this.selectedValue === undefined)
        return this.children.find(child => child.selected)?.value || '';
      return this.selectedValue || '';
    }
    set value(value) { this.selectedValue = value; }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  }
  const source = fs.readFileSync(path.join(__dirname, '../public/content-workspace-editors.js'), 'utf8');
  const controls = source.slice(source.indexOf('function createWorkspaceEditorField'), source.indexOf('function getEventDetailsFields'));
  const fields = source.slice(source.indexOf('function createPersonRankFields'), source.indexOf('function getNewsArticleDetailsFields'));
  const start = source.indexOf('function getContentWorkspaceRecordPayload');
  const payload = source.slice(start, source.indexOf('\n    function ', start + 1));
  return vm.runInNewContext(controls + fields + payload +
    '; ({ getRetirementDetailsFields, getLastPostDetailsFields, getContentWorkspaceRecordPayload })', {
    window: { CMCENRanks: Ranks },
    document: { createElement: tag => new Element(tag) },
    Event: class { constructor(type) { this.type = type; } },
    setWorkspaceTranslatedText: (el, key, text) => { el.textContent = text; },
    createWorkspaceDateTimeField: () => new Element('label'),
    getWorkspaceIsoDate: value => value || '',
  });
}
const plain = value => JSON.parse(JSON.stringify(value));

test('one catalogue provides unique bidirectional pairs and validates selection tokens', () => {
  for (const rank of Ranks.catalogue) {
    assert.equal(Ranks.resolve(rank.en, 'en').id, rank.id);
    assert.equal(Ranks.resolve(rank.fr, 'fr').id, rank.id);
    assert.deepEqual(cleanRanks({ en: rank.en, fr: rank.fr, catalogueId: rank.id }), { en: rank.en, fr: rank.fr });
  }
  for (const value of [
    { en: 'Captain', fr: 'Adjudant', catalogueId: 'captain' },
    { en: 'Captain', fr: 'Capitaine', catalogueId: 'unknown' },
    { en: 'Capt', fr: 'Capitaine', catalogueId: 'captain' },
  ]) assert.throws(() => cleanRanks(value), /catalogue pair/);
  assert.deepEqual(cleanRanks({ en: 'Historical rank', fr: 'Grade historique' }), { en: 'Historical rank', fr: 'Grade historique' });
  assert.equal(Ranks.resolve('CAPT', 'en').id, 'captain');
  for (const value of ['Capt (N)', 'Capt (Ret)', 'Colonelle', 'Signaller', 'LS (RETIRED)'])
    assert.equal(Ranks.resolve(value, 'en'), null);
  assert.equal(Ranks.resolve('Sub-Lieutenant', 'en').fr, 'Enseigne de vaisseau de 1re classe');
  assert.equal(Ranks.resolve('Acting Sub-Lieutenant', 'en').fr, 'Enseigne de vaisseau de 2e classe');
});

for (const [type, person, legacy, prefix, method] of [
  ['retirementMessage', 'retiree', 'rank', 'retireeRank', 'getRetirementDetailsFields'],
  ['lastPost', 'deceased', 'fullRank', 'deceasedRank', 'getLastPostDetailsFields'],
]) {
  test(type + ': exactly two staff dropdowns synchronize either selection and preserve legacy saves', () => {
    const api = editorFields();
    const item = { type, content: { [person]: { [legacy]: 'Capt', ranks: { en: 'Captain', fr: 'Capitaine' } } } };
    const fields = api[method](item);
    const selects = fields.flatMap(field => field.querySelectorAll('select'));
    assert.equal(selects.length, 2);
    assert.deepEqual(plain(selects.map(select => select.name)), [prefix + 'En', prefix + 'Fr']);
    const [en, fr] = selects;
    const payload = () => api.getContentWorkspaceRecordPayload(item,
      new Map(selects.map(select => [select.name, select.value])))[person];
    assert.equal(payload()[legacy], 'Capt', 'opening/saving must preserve certificate rank wording');
    en.value = 'Warrant Officer'; en.dispatchEvent({ type: 'change' });
    assert.equal(fr.value, 'Adjudant');
    assert.deepEqual(plain(payload().ranks), { en: 'Warrant Officer', fr: 'Adjudant', catalogueId: 'warrant_officer' });
    assert.equal(payload()[legacy], 'Warrant Officer');
    fr.value = 'Adjudant-maître'; fr.dispatchEvent({ type: 'change' });
    assert.equal(en.value, 'Master Warrant Officer');
    assert.equal(payload().ranks.catalogueId, 'master_warrant_officer');
    fr.value = ''; fr.dispatchEvent({ type: 'change' });
    assert.equal(en.value, '');
    assert.deepEqual(plain(payload().ranks), { en: '', fr: '' });
  });

  test(type + ': EN-only, mismatched bilingual and custom historical records initialize without coercion', () => {
    const api = editorFields();
    for (const original of [
      { [legacy]: 'Capt' },
      { [legacy]: 'Capt', ranks: { en: 'Captain' } },
      { [legacy]: 'Legacy source', ranks: { en: 'Captain', fr: 'Adjudant' } },
      { [legacy]: 'MWO (RET)', ranks: { en: 'MASTER WARRANT OFFICER (RET)', fr: 'ADJUDANT-CHEF (RET)' } },
      { [legacy]: 'Civilian historian' },
    ]) {
      const savedOriginal = JSON.stringify(original);
      const item = { type, content: { [person]: original } };
      const fields = api[method](item), selects = fields.flatMap(field => field.querySelectorAll('select'));
      const [en, fr] = selects;
      assert.equal(en.value, original.ranks?.en || original[legacy]);
      assert.equal(fr.value, original.ranks?.fr || (original[legacy] === 'Capt' ? 'Capitaine' : ''));
      assert(en.children.some(option => option.value === en.value));
      const result = api.getContentWorkspaceRecordPayload(item, new Map(selects.map(select => [select.name, select.value])))[person];
      assert.equal(result[legacy], original[legacy]);
      if (original.ranks) assert.deepEqual(plain(result.ranks),
        original.ranks.fr === undefined ? { ...original.ranks, fr: 'Capitaine' } : original.ranks);
      if (original[legacy] === 'Civilian historian') assert.equal(result.ranks, undefined);
      assert.equal(JSON.stringify(original), savedOriginal);
      if (original.ranks?.en.includes('(RET)')) {
        en.value = 'Captain'; en.dispatchEvent({ type: 'change' });
        en.value = original.ranks.en; en.dispatchEvent({ type: 'change' });
        assert.equal(fr.value, original.ranks.fr, 'restoring a retained custom option restores its exact counterpart');
      }
    }
  });
}
