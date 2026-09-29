const assert = require('node:assert/strict');
const test = require('node:test');
const {
  imageUrls,
  plainText,
  displayDate,
  blocksFor,
  categoryOf,
} = require('../public/newsletter-format');
const { normalizeBlocks } = require('../services/newsletter-content');
const { pairBlocks } = require('../public/newsletter-format');

test('bilingual pairing preserves both legacy sequences and stable translation positions', () => {
  const en = [
    { type: 'heading', text: 'Title' },
    { type: 'paragraph', children: ['English'] },
    {
      type: 'figure',
      image: { url: 'https://example.com/a.png' },
      caption: 'Photo',
    },
  ];
  const fr = [
    { type: 'paragraph', children: ['Français'] },
    { type: 'document', href: '/document.pdf', label: 'Document' },
  ];
  const paired = pairBlocks(en, fr);
  assert.deepEqual(
    paired.filter((row) => row.en).map((row) => row.en),
    en,
  );
  assert.deepEqual(
    paired.filter((row) => row.fr).map((row) => row.fr),
    fr,
  );
  assert.equal(paired.find((row) => row.en?.type === 'paragraph').fr, fr[0]);
  const withIds = [
    { type: 'paragraph', children: ['First'], pairId: 'first' },
    { type: 'paragraph', children: ['Second'], pairId: 'second' },
  ];
  const partial = [
    { type: 'paragraph', children: ['Deuxième'], pairId: 'second' },
  ];
  assert.deepEqual(pairBlocks(withIds, partial), [
    { en: withIds[0], fr: null },
    { en: withIds[1], fr: partial[0] },
  ]);
  assert.deepEqual(normalizeBlocks(withIds), withIds);
  assert.throws(() =>
    normalizeBlocks([{ ...withIds[0], pairId: '<invalid>' }]),
  );
});
test('legacy text converts without losing line breaks, languages or literal markup', () => {
  const article = {
    layout: 'standard',
    content: {
      en: 'First\nSecond\n\n<script>literal</script>',
      fr: 'Texte\nfrançais',
    },
  };
  for (const language of ['en', 'fr'])
    assert.equal(
      plainText(normalizeBlocks(blocksFor(article, language))),
      article.content[language],
    );
  assert.equal(categoryOf(article), 'news');
  assert.equal(categoryOf({ layout: 'newsletter' }), 'newsletter');
  assert.equal(
    categoryOf({ layout: 'newsletter', category: 'unit-updates' }),
    'unit-updates',
  );
  const emptyTranslation = {
    layout: 'newsletter',
    newsletterBlocks: { en: [], fr: [] },
    content: { en: 'stale text' },
  };
  assert.deepEqual(blocksFor(emptyTranslation, 'en'), []);
});
test('structured body text preserves block order, line breaks and repeated links', () => {
  const link = {
    type: 'link',
    href: 'https://example.org/issue.pdf',
    children: ['Issue'],
  };
  const blocks = normalizeBlocks([
    { type: 'heading', text: 'Heading' },
    {
      type: 'paragraph',
      children: ['First', { type: 'br' }, { type: 'em', children: ['Second'] }],
    },
    { type: 'list', items: [[link], [link]] },
    { type: 'document', label: 'Attachment', href: link.href },
  ]);
  assert.equal(
    plainText(blocks),
    'Heading\n\nFirst\nSecond\n\nIssue\nIssue\n\nAttachment',
  );
});
test('structured bodies retain caption, formatting, variants and safe links', () => {
  const blocks = [
    {
      type: 'paragraph',
      children: [
        'Text <script>alert(1)</script>',
        {
          type: 'strong',
          children: [
            {
              type: 'link',
              href: 'https://example.org/file_(1).pdf',
              children: ['Document'],
            },
          ],
        },
      ],
    },
    {
      type: 'figure',
      caption: 'Credit',
      image: {
        url: 'https://example.org/large.png',
        alt: 'Photo',
        width: 980,
        height: 654,
        variants: {
          thumb: { url: 'https://example.org/thumb.png', width: 400 },
        },
      },
    },
  ];
  assert.deepEqual(normalizeBlocks(blocks), blocks);
  assert.deepEqual(
    imageUrls({
      layout: 'newsletter',
      newsletterBlocks: { en: blocks, fr: blocks },
    }),
    ['https://example.org/large.png', 'https://example.org/thumb.png'],
  );
  assert.equal(
    plainText(blocks),
    'Text <script>alert(1)</script>Document\n\nCredit',
  );
  for (const invalid of [
    [
      {
        type: 'paragraph',
        children: [
          { type: 'link', href: 'javascript:alert(1)', children: ['Bad'] },
        ],
      },
    ],
    [{ type: 'figure', image: { url: 'http://example.org/image.png' } }],
    [{ type: 'document', href: 'data:text/html,bad', label: 'Bad' }],
    [{ type: 'html', html: '<script>bad</script>' }],
    [{ type: 'list', items: 'bad' }],
    [{ type: 'paragraph', children: ['x'.repeat(20001)] }],
    Array.from({ length: 201 }, () => ({ type: 'heading', text: 'Heading' })),
  ])
    assert.throws(() => normalizeBlocks(invalid));
  assert.equal(
    displayDate({
      publishedAt: '2026-09-22',
      newsletter: { archived: true, date: '1985-09-01' },
    }),
    '1985-09-01T12:00:00.000Z',
  );
  assert.equal(
    displayDate({
      publishedAt: '2026-09-22',
      newsletter: { archived: false, date: '1985-09-01' },
    }),
    '2026-09-22',
  );
  assert.equal(
    displayDate({
      publishedAt: '2026-09-29',
      publicationDateChoice: 'now',
      newsletter: { archived: true, date: '1985-09-01' },
    }),
    '2026-09-29',
  );
});
