const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = {
  URLSearchParams,
  BodyContent: require('../public/body-content'),
  document: {
    getElementById: () => ({ style: {}, addEventListener() {}, classList: { remove() {} } }),
    querySelector: () => ({}),
    addEventListener() {},
  },
  CMCENUtils: { setDetailReturnLink() {}, getCurrentLanguage: () => 'en' },
  window: { location: { search: '' } },
};
vm.runInNewContext(
  fs
    .readFileSync(
      path.join(__dirname, '../public/retirement-message.js'),
      'utf8',
    )
    .replace(/\nloadRetirementMessage\(\);\s*$/, ''),
  context,
);
const format = context.formatRetirementMessageText;

test('published Czarnowske and Gaudet French time excerpts remain exact', () => {
  // Public staging messages retrieved 2026-10-06; spacing/case is authored.
  for (const text of [
    '5. UNE CÉRÉMONIE DE DÉPART AVEC DIGNITÉ AURA LIEU LE 7 AOÛT 2026 À 13 H 30. NOUS VOUS PRIONS DE NE PAS PORTER D’UNIFORME MILITAIRE, MAIS UNIQUEMENT DES VÊTEMENTS CIVILS.',
    "2026 AU CHUCK'S ROADHOUSE BAR & GRILL, 2376 PRINCESS STREET, KINGSTON, ON, À 11 h 30. SI VOUS SOUHAITEZ Y PARTICIPER, VEUILLEZ CONTACTER L'ADJUDANT JOHN WILNEFF",
  ])
    assert.equal(format(text), text);
});

test('times, decimals, dates, URLs and numbers in prose are not paragraph markers', () => {
  for (const text of [
    'Rendez-vous à 13H30. Venez.',
    'Rendez-vous à 13h30. Venez.',
    'Rendez-vous à 13 h 30. Venez.',
    'Rendez-vous à 13 H 30. Venez.',
    'Rendez-vous à 13\u00a0H\u00a030. Venez.',
    'Rendez-vous à 13\u202fh\u202f30. Venez.',
    'Value 13.30. Date 07.08.2026. See https://example.org/30. End.',
    'WO 2. Member30. Unit 30. Cost 3.14. Version v2.3.',
    'EAST IN SUPPORT OF TASK FORCE AFGHANISTAN ROTO 6. WHILE SERVING AT 9 WING GANDER, MWO YOUNG WAS PROMOTED TO MCPL',
  ])
    assert.equal(format(text), text);
});

test('genuine inline numbered paragraphs still unfold across French whitespace', () => {
  for (const gap of [' ', '\t', '\u00a0', '\u202f']) {
    const text = `1. First.${gap}2.${gap}Deuxième!${gap}3.${gap}Third?${gap}10.${gap}Final.`;
    assert.equal(
      format(text),
      `1. First.\n\n2.${gap}Deuxième!\n\n3.${gap}Third?\n\n10.${gap}Final.`,
    );
  }
  assert.equal(
    format('1. À 13 H 30. Venez. 2. Suite.'),
    '1. À 13 H 30. Venez.\n\n2. Suite.',
  );
});

test('authored paragraphs, indentation and line breaks remain intact', () => {
  const text = ' 1. First.\n 2. Second.\n\n\t3. Third.\nWrapped line.';
  assert.equal(format(text), text);
  assert.equal(format(text.replace(/\n/g, '\r\n')), text);
  assert.equal(format(text.replace(/\n/g, '\r')), text);
  assert.equal(format(''), '');
});

test('retirement renderer passes localized formatted text to the shared linkifier', () => {
  const messages = {
    en: '1. First. 2. Email member@example.org.',
    fr: '1. À 13 H 30. Venez. 2. Voir https://example.org/30.',
  };
  for (const language of ['en', 'fr']) {
    context.CMCENUtils.getCurrentLanguage = () => language;
    context.CMCENUtils.getLocalizedText = (value) => value[language];
    context.CMCENUtils.setLinkifiedText = (element, text) => {
      assert.equal(text, format(messages[language]));
      assert.equal(element.style.textAlign, 'left');
      assert.equal(element.style.textTransform, 'uppercase');
    };
    context.setRetirementMessageText({ messages });
    assert.deepEqual(messages, {
      en: '1. First. 2. Email member@example.org.',
      fr: '1. À 13 H 30. Venez. 2. Voir https://example.org/30.',
    });
  }
});
