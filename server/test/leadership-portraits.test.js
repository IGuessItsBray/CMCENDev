const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');

test('public cards use width candidates with original and legacy fallbacks', async () => {
  const roster = new Element('div');
  const primary = '/media/portrait/original.webp';
  const legacy = '/assets/legacy.jpg';
  const document = {
    documentElement: { lang: 'en' },
    getElementById: () => roster,
    createElement: (tag) => Object.assign(new Element(tag), { classList: { add() {} } }),
    addEventListener() {},
  };
  const imageVariants = [
    { url: '/media/portrait/thumb.webp', width: 400 },
    { url: '/media/portrait/medium.webp', width: 900 },
    { url: '//invalid.example/image.webp', width: 2200 },
    null,
  ];
  const responsiveCard = { image: primary, imageVariants };
  const content = { en: { sections: [
    { cards: [{ ...responsiveCard, featured: true }, responsiveCard] },
    { cards: [responsiveCard, { image: legacy }] },
  ] } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/leadership.js'), 'utf8'),
    { document, console, fetch: async () => ({ ok: true, json: async () => content }) },
  );
  await new Promise(setImmediate);
  const [featured, senior, regular, unchanged] = roster.querySelectorAll('img');
  for (const responsive of [featured, senior, regular]) {
    assert.equal(responsive.src, primary);
    assert.equal(responsive.srcset, '/media/portrait/thumb.webp 400w, /media/portrait/medium.webp 900w');
  }
  for (const columnCard of [senior, regular]) {
    assert.match(columnCard.sizes, /^\(max-width: 650px\) calc\(100vw - 64px\), \(max-width: 900px\) calc\(\(100vw - 138px\) \/ 2\)/u);
  }
  assert.match(senior.sizes, /1200px\) calc\(\(100vw - 192px\) \/ 5\), 201\.6px$/u);
  assert.match(regular.sizes, /1200px\) calc\(\(100vw - 156px\) \/ 3\), 348px$/u);
  assert.match(featured.sizes, /^\(max-width: 404px\) calc\(100vw - 88px\).*312px$/u);
  assert.equal(unchanged.src, legacy);
  assert.equal(unchanged.srcset, undefined);
});

test('explicitly cleared biography does not fall back to bundled text', async () => {
  const roster = new Element('div');
  const document = {
    documentElement: { lang: 'en' },
    getElementById: () => roster,
    createElement: (tag) => Object.assign(new Element(tag), { classList: { add() {} } }),
    addEventListener() {},
  };
  const keyed = { image: '/assets/legacy.jpg', bioKey: 'example', name: 'Example' };
  const content = { en: {
    bios: { example: 'Bundled biography' },
    sections: [{ cards: [{ ...keyed, bio: '' }, keyed] }],
  } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/leadership.js'), 'utf8'),
    { document, console, fetch: async () => ({ ok: true, json: async () => content }) },
  );
  await new Promise(setImmediate);
  const cards = roster.querySelectorAll('article');
  assert.equal(cards[0].querySelector('button'), null);
  assert.ok(cards[1].querySelector('button'));
});
