const assert = require('node:assert/strict');
const test = require('node:test');
process.env.CDN_PUBLIC_BASE_URL = 'https://media.example.test';
const {
  publicReferenceMap,
  publicDocumentReferences,
} = require('../services/public-document-references');
const { receipts } = require('../services/document-usage');
const card = require('../public/page-content/document-library.json')
  .documents[0];
const document = { ...card, availability: 'available' };
const block = { type: 'document', href: `/${card.fileKey}` };

test('the batch loader queries each published-content collection once for the entire catalogue', async (t) => {
  const calls = [];
  for (const name of [
    'NewsArticle',
    'Page',
    'Event',
    'RetirementMessage',
    'LastPostMessage',
    'ProfessionalAward',
  ]) {
    t.mock.method(require(`../models/${name}`), 'find', (filter) => {
      calls.push({ name, filter });
      return {
        select() {
          return this;
        },
        async lean() {
          return [];
        },
      };
    });
  }
  await publicDocumentReferences(
    Array.from({ length: 87 }, (_, index) => ({
      fileKey: `documents/test-${index}.pdf`,
    })),
  );
  assert.equal(calls.length, 6);
  for (const { name, filter } of calls)
    assert.deepEqual(
      filter,
      name === 'ProfessionalAward'
        ? { published: true }
        : { status: 'published' },
    );
});

test('public references exclude drafts and all nonpublic audiences before counting, with localized fallback', () => {
  const groups = {
    page: [
      {
        _id: 'public',
        title: { en: 'Public', fr: 'Publique' },
        slug: 'public',
        status: 'published',
        blocks: [block, block],
        access: { audience: 'public' },
      },
      ...['authenticated', 'restricted'].map((audience) => ({
        _id: audience,
        title: { en: 'Secret' },
        slug: audience,
        status: 'published',
        blocks: [block],
        access: { audience },
      })),
      {
        _id: 'draft',
        title: { en: 'Draft secret' },
        slug: 'draft',
        status: 'draft',
        blocks: [block],
      },
    ],
    newsArticle: [
      {
        _id: 'article',
        title: { fr: 'Article français' },
        status: 'published',
        newsletterBlocks: { en: [block], fr: [block] },
      },
      {
        _id: 'draft-article',
        status: 'draft',
        content: { en: `/${card.fileKey}` },
      },
      {
        _id: 'provenance',
        title: { en: 'Historical only' },
        status: 'published',
        legacy: { originalBody: `/${card.fileKey}` },
      },
    ],
  };
  const result = publicReferenceMap([document], groups).get(card.fileKey);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    href: '/pages/public',
    title: { en: 'Public', fr: 'Publique' },
  });
  assert.deepEqual(result[1].title, {
    en: 'Article français',
    fr: 'Article français',
  });
  assert.doesNotMatch(JSON.stringify(result), /Secret|draft|Historical/);
});

test('Awards match exact verified legacy aliases, deduplicate by referring page and omit unpublished resources', () => {
  const receipt = receipts.find((r) =>
    r.storageKey.includes('heritage-awards-instruction'),
  );
  const doc = { fileKey: receipt.storageKey };
  const links = [
    { url: receipt.sourceUrls[0] },
    { url: `/${receipt.storageKey}#page=2` },
  ];
  const staticReference = {
    values: [`/${doc.fileKey}`],
    reference: {
      status: 'published',
      href: '/awards',
      title: { en: 'Awards', fr: 'Prix' },
    },
  };
  const refs = publicReferenceMap(
    [doc],
    {},
    [staticReference],
    [
      { published: true, links },
      { published: true, links },
      { published: false, links },
    ],
  ).get(doc.fileKey);
  assert.deepEqual(refs, [
    { href: '/awards', title: { en: 'Awards', fr: 'Prix' } },
  ]);
  assert.equal(
    publicReferenceMap([doc], {}, [], [{ published: false, links }]).size,
    0,
  );
  assert.equal(
    publicReferenceMap([{ ...doc, availability: 'unavailable' }], {}, [
      staticReference,
    ]).size,
    0,
  );
  assert.equal(publicReferenceMap([{}], {}, [staticReference]).size, 0);
  assert.equal(
    publicReferenceMap(
      [doc],
      {},
      [],
      [
        {
          published: true,
          links: [{ url: `https://untrusted.test/${doc.fileKey}` }],
        },
      ],
    ).size,
    0,
  );
});
