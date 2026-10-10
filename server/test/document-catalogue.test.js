const assert = require('node:assert/strict');
const { test } = require('node:test');
process.env.CDN_PUBLIC_BASE_URL = 'https://media.example.test';
const {
  cards,
  seedRecord,
  planMigration,
} = require('../services/document-migration');
const { toPublicDocument } = require('../services/document-catalogue');
const Document = require('../models/ArchiveDocument');
const {
  documentKey,
  referencesFor,
  linkValues,
} = require('../services/document-usage');

test('catalogue preview preserves every language field, stable key, link and unavailable placeholder', async () => {
  const plan = planMigration([]);
  assert.equal(plan.seedCards, 76);
  assert.equal(plan.additions, 8);
  assert.deepEqual(plan.counts, { insert: 84, adopt: 0, preserve: 0 });
  assert.equal(plan.conflicts.length, 0);
  for (const [order, card] of cards.entries()) {
    const record = seedRecord(card);
    await new Document(record).validate();
    assert.equal(record.sourceId, undefined);
    assert.equal(record.catalogueOrder, order);
    assert.equal(record.status, 'published');
    const actual = toPublicDocument(record);
    for (const field of ['id', 'organization', 'type', 'en', 'fr'])
      assert.deepEqual(actual[field], card[field]);
    assert.equal(actual.pageUrl, card.pageUrl || '');
    assert.equal(actual.fileKey, card.fileKey);
    assert.equal(
      actual.fileUrl,
      card.fileKey ? `https://media.example.test/${card.fileKey}` : undefined,
    );
  }
  const missing = toPublicDocument(
    seedRecord(cards.find((card) => !card.fileKey)),
  );
  assert.equal(missing.fileUrl, undefined);
  assert.ok(missing.pageUrl);
});

test('reruns preserve staff edits; collisions refuse overwrite; exact existing dynamic records retain identity', () => {
  const records = cards.map(seedRecord);
  records[0].title.en = 'Staff correction';
  records[0].status = 'draft';
  assert.deepEqual(planMigration(records).counts, {
    insert: 0,
    adopt: 0,
    preserve: 84,
  });
  const dynamic = seedRecord(cards[0]);
  delete dynamic.catalogueId;
  delete dynamic.legacy;
  dynamic.sourceId = 777;
  const plan = planMigration([dynamic]);
  assert.equal(plan.counts.adopt, 1);
  assert.deepEqual(plan.actions[0].fields.catalogueAliases, ['archive-777']);
  dynamic.title.en = 'Another document';
  assert.equal(planMigration([dynamic]).conflicts.length, 1);
  assert.ok(
    planMigration([
      seedRecord(cards[0]),
      { ...seedRecord(cards[0]), _id: 'another' },
    ]).conflicts.some((item) => item.reason === 'multiple destination matches'),
  );
});

test('only canonical or receipt-verified aliases resolve; relative fragments and repeated bilingual links count once', () => {
  const card = cards[0];
  const document = seedRecord(card);
  assert.equal(documentKey(`/${card.fileKey}#page=2`, document), card.fileKey);
  assert.equal(
    documentKey(
      `https://media.example.test/${card.fileKey}?download=1`,
      document,
    ),
    card.fileKey,
  );
  assert.equal(
    documentKey(`https://unrelated.example/${card.fileKey}`, document),
    '',
  );
  assert.equal(documentKey('//unrelated.example/file.pdf', document), '');
  assert.equal(documentKey('/documents/%ZZ.pdf', document), '');
  const groups = {
    newsArticle: [
      {
        _id: 'a',
        title: { en: 'Public' },
        status: 'published',
        newsletterBlocks: {
          en: [{ type: 'document', href: `/${card.fileKey}` }],
          fr: [
            {
              type: 'paragraph',
              children: [{ type: 'link', href: `/${card.fileKey}` }],
            },
          ],
        },
      },
    ],
  };
  assert.equal(referencesFor(document, groups).length, 1);
  assert.deepEqual(linkValues([{ type: 'button', url: '/documents/a.pdf' }]), [
    '/documents/a.pdf',
  ]);
});

test('usage filters restricted titles and drafts before counts, with valid authorized destinations', () => {
  const document = seedRecord(cards[0]);
  const link = `/${document.fileKey}`;
  const groups = {
    page: [
      {
        _id: 'public',
        slug: 'public',
        title: { en: 'Public' },
        status: 'published',
        blocks: [{ type: 'button', url: link }],
        access: { audience: 'public' },
      },
      {
        _id: 'private',
        slug: 'private',
        title: { en: 'Secret' },
        status: 'published',
        blocks: [{ type: 'button', url: link }],
        access: { audience: 'restricted', roles: ['developer'] },
      },
      {
        _id: 'draft',
        title: { en: 'Draft' },
        status: 'draft',
        blocks: [{ type: 'button', url: link }],
        access: { audience: 'public' },
      },
    ],
    newsArticle: [
      {
        _id: 'article',
        title: { en: 'Article draft' },
        status: 'draft',
        newsletterBlocks: { en: [{ type: 'document', href: link }] },
      },
    ],
  };
  assert.equal(referencesFor(document, groups).length, 1);
  const visible = referencesFor(document, groups, { role: 'editor' });
  assert.equal(visible.length, 3);
  assert.ok(!visible.some((item) => item.title === 'Secret'));
  assert.equal(
    visible.find((item) => item.id === 'draft').href,
    '/page?preview=draft',
  );
});
