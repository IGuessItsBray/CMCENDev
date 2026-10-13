const assert = require('node:assert/strict');
const test = require('node:test');
const { safeUrl, inline, groupSmallFigures } = require('../public/newsletter');

test('small figure runs preserve order, captions, dimensions and text boundaries', () => {
  const figure = (width, height, caption = '') => ({ type: 'figure', image: { width, height }, caption });
  const a = figure(85, 106, 'A long caption remains with its image');
  const b = figure(150, 75, 'Explicit dimensions');
  const text = { type: 'paragraph', children: ['Between images'] };
  const c = figure(300, 300);
  const large = figure(1200, 800);
  const tall = figure(300, 900);
  const d = figure(202, 300);
  const e = figure(137, 111);
  const blocks = [a, b, text, c, large, tall, d, e];
  const before = JSON.stringify(blocks);
  const result = groupSmallFigures(blocks);
  assert.deepEqual(result, [[a, b], text, c, large, tall, [d, e]]);
  assert.deepEqual(result.flat(), blocks);
  assert.equal(result[0][0], a);
  assert.equal(JSON.stringify(blocks), before);
});

test('unknown or invalid dimensions and non-image blocks break figure runs', () => {
  const small = { type: 'figure', image: { width: 100, height: 100 } };
  const separators = [
    { type: 'figure' },
    { type: 'figure', image: { variants: { large: { width: 100, height: 100 } } } },
    ...[0, -1, NaN, Infinity, '100', 1.5, 50001].map((width) => ({ type: 'figure', image: { width, height: 100 } })),
    { type: 'figure', image: { width: 100 } },
    { type: 'heading', text: 'Heading' },
    { type: 'list', items: [] },
    { type: 'document', href: '/documents/example.pdf' },
  ];
  for (const separator of separators)
    assert.deepEqual(groupSmallFigures([small, separator, small]), [small, separator, small]);
  assert.deepEqual(groupSmallFigures([]), []);
});

test('newsletter links allow document paths and web/email links but reject executable or ambiguous URLs', () => {
  for (const url of [
    '/documents/example.pdf',
    'https://example.org/article',
    'mailto:editor@example.org',
  ])
    assert.equal(safeUrl(url), url);
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,bad',
    '//example.org',
    '/\\example.org',
    'java\nscript:alert(1)',
    null,
  ])
    assert.equal(safeUrl(url), '');
});

test('newsletter inline content preserves text and formatting without interpreting markup', () => {
  const doc = {
    createTextNode: (text) => ({ text }),
    createElement: (tag) => ({
      tag,
      children: [],
      append(...children) {
        this.children.push(...children);
      },
    }),
  };
  const parent = doc.createElement('p');
  inline(
    parent,
    [
      '<img onerror=alert(1)>',
      { type: 'strong', children: ['Important'] },
      {
        type: 'link',
        href: 'javascript:alert(1)',
        children: ['Readable unsafe link label'],
      },
      { type: 'link', href: '/documents/example.pdf', children: ['Download'] },
      { type: 'br' },
    ],
    doc,
  );
  assert.equal(parent.children[0].text, '<img onerror=alert(1)>');
  assert.equal(parent.children[1].tag, 'strong');
  assert.equal(parent.children[1].children[0].text, 'Important');
  assert.equal(parent.children[2].text, 'Readable unsafe link label');
  assert.equal(parent.children[3].href, '/documents/example.pdf');
  assert.equal(parent.children[4].tag, 'br');
});
