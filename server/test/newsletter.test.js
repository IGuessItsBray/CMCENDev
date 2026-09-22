const assert = require('node:assert/strict');
const test = require('node:test');
const { safeUrl, inline } = require('../public/newsletter');

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
