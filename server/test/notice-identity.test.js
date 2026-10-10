const assert = require('node:assert/strict');
const test = require('node:test');
const { parseNoticeTitleSuffix, prepareRetirementIdentity } = require('../scripts/migration/lib/notice-identity');
const { cleanTradeRoles } = require('../services/person-specialties');
const RetirementMessage = require('../models/RetirementMessage');

test('title suffixes separate optional nominals from MOSID/role without a name-specific rule', () => {
  for (const dash of ['-', '–', '—']) {
    for (const [suffix, nominals] of [['', ''], [', CD', 'CD'], [', OMM, CD', 'OMM, CD']]) {
      const title = `RETIREMENT ${dash} CAPTAIN ALEX O’NEIL${suffix} ${dash} 00341, SIGS`;
      assert.deepEqual(parseNoticeTitleSuffix(title, 'ALEX O’NEIL'), { postNominals: nominals, tradeRole: '00341, SIGS' });
    }
  }
  assert.deepEqual(parseNoticeTitleSuffix('RETIREMENT - MWO ALEX EXAMPLE - 00384-01, LINE TECH', 'ALEX EXAMPLE'), { postNominals: '', tradeRole: '00384-01, LINE TECH' });
  assert.deepEqual(parseNoticeTitleSuffix('RETIREMENT - MR. ALEX EXAMPLE', 'ALEX EXAMPLE'), { postNominals: '', tradeRole: '' });
  assert.deepEqual(parseNoticeTitleSuffix('RETIREMENT - CAPTAIN ALEX EXAMPLE, CD', 'ALEX EXAMPLE'), { postNominals: 'CD', tradeRole: '' });
  for (const title of ['RETIREMENT - CAPTAIN ALEX EXAMPLE, 00341, SIGS', 'RETIREMENT - CAPTAIN ALEX EXAMPLE - UNKNOWN ROLE']) {
    assert.throws(() => parseNoticeTitleSuffix(title, 'ALEX EXAMPLE'), /requires review/);
  }
  assert.throws(() => parseNoticeTitleSuffix('RETIREMENT - CAPTAIN ALIX EXAMPLE, CD', 'ALEX EXAMPLE'), /mismatch requires review/);
  assert.throws(() => parseNoticeTitleSuffix('RETIREMENT - CAPTAIN ALEX EXAMPLETON, CD', 'ALEX EXAMPLE'), /boundary mismatch requires review/);
});

test('preparation retains reviewed name/rank discrepancies and exact authored bilingual specialties', () => {
  const retiree = { firstName: 'ALEX', lastName: 'EXAMPLE', rank: 'MWO', ranks: { en: 'MASTER WARRANT OFFICER', fr: 'ADJUDANT-CHEF' } };
  const sources = [
    { language: 'en', title: 'RETIREMENT - MASTER WARRANT OFFICER ALEX EXAMPLE, CD - 00385, SIG TECH' },
    { language: 'fr', title: 'RETRAITE - ADJUDANT-CHEF ALIX EXAMPLE, CD - 00385, TECH SIG' },
  ];
  const original = JSON.stringify({ retiree, sources });
  const result = prepareRetirementIdentity(retiree, sources);
  assert.equal(result.firstName, 'ALEX');
  assert.deepEqual(result.ranks, retiree.ranks);
  assert.equal(result.postNominals, 'CD');
  assert.equal(result.tradeRole, '00385, SIG TECH');
  assert.deepEqual(result.tradeRoles, { en: '00385, SIG TECH', fr: '00385, TECH SIG' });
  assert.equal(JSON.stringify({ retiree, sources }), original);
  assert.deepEqual(prepareRetirementIdentity(retiree, [sources[0]]).tradeRoles, { en: '00385, SIG TECH' });
  assert.throws(() => prepareRetirementIdentity(retiree, [sources[0], sources[0]]), /unique/);
});

test('optional specialty model preserves old frozen shapes and validates authored text', async () => {
  const old = new RetirementMessage({ retiree: { tradeRole: 'Shared source value' } });
  assert.equal(old.toObject().retiree.tradeRoles, undefined);
  const fresh = new RetirementMessage({ retiree: { tradeRole: 'Shared', tradeRoles: { en: ' English ', fr: ' Français ' } } });
  assert.deepEqual(fresh.toObject().retiree.tradeRoles, { en: 'English', fr: 'Français' });
  assert.deepEqual(cleanTradeRoles({ fr: ' Texte ' }), { fr: 'Texte' });
  assert.deepEqual(cleanTradeRoles({ fr: '' }), { fr: '' });
  for (const value of [null, [], 'role', { fr: {} }, { en: 'a'.repeat(121) }]) assert.throws(() => cleanTradeRoles(value), /tradeRoles/);
});
