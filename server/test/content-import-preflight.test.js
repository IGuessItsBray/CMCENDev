const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inspectBatch,
  hash,
} = require('../scripts/migration/lib/content-preflight');

class ValidModel {
  constructor(values) {
    this.values = values;
  }
  async validate() {}
  get(field) {
    return field.split('.').reduce((value, key) => value?.[key], this.values);
  }
}
const models = { RetirementMessage: ValidModel, Comment: ValidModel };
function fixture() {
  const source = {
    id: 10,
    status: 'publish',
    language: 'en',
    authorId: 20,
    originalBody: 'Source text',
    convertedText: 'Source text',
    bodySha256: hash('Source text'),
  };
  return {
    items: [
      {
        key: 'test',
        kind: 'retirement',
        sources: [source],
        document: {
          createdBy: 'a'.repeat(24),
          status: 'draft',
          messageLanguage: 'en',
          message: 'Source text',
          messages: { en: 'Source text' },
          legacy: { source: 'https://cmcen-rcmce.ca', sourcePostIds: [10] },
        },
        comments: [],
        mediaInventoryComplete: true,
        mediaUrls: [],
        destinationEvidence: {
          destinationMatches: [],
          unmappedAuthorIds: [],
          unmappedRegisteredCommenterIds: [],
        },
        authorMappings: [{ sourceUserId: 20, userId: 'a'.repeat(24) }],
        languageReview: {
          reviewedBy: 'reviewer',
          sourceFingerprint: hash(JSON.stringify([[10, source.bodySha256]])),
        },
      },
    ],
  };
}
test('preflight preserves input and accepts complete evidence', async () => {
  const input = fixture();
  const before = JSON.stringify(input);
  assert.equal((await inspectBatch(input, { models })).safeToApply, true);
  assert.equal(JSON.stringify(input), before);
});
test('formatted source copy is bound to exact normalized blocks and plain text', async () => {
  const input = fixture();
  const source = input.items[0].sources[0];
  source.convertedBlocks = [{ type: 'paragraph', children: [{ type: 'strong', children: ['Source text'] }] }];
  input.items[0].document.formattedBody = { en: { version: 1, text: source.convertedText, blocks: structuredClone(source.convertedBlocks) } };
  assert.equal((await inspectBatch(input, { models })).safeToApply, true);
  input.items[0].document.formattedBody.en.blocks[0].children = ['Source text'];
  assert.equal((await inspectBatch(input, { models })).safeToApply, false);
});
test('source drafts, private content, pending submission state and scheduled publication are blocked', async () => {
  for (const mutate of [
    (i) => {
      i.sources[0].status = 'draft';
    },
    (i) => {
      i.sources[0].status = 'private';
    },
    (i) => {
      i.sources[0].passwordProtected = true;
    },
    (i) => {
      i.document.status = 'pending';
    },
    (i) => {
      i.document.scheduledPublishAt = '2030-01-01';
    },
    (i) => {
      i.document.legacy.sourcePostIds = [];
    },
    (i) => {
      i.document.messages.en = 'Truncated';
    },
    (i) => {
      i.authorMappings = [];
    },
    (i) => {
      i.document.createdBy = 'b'.repeat(24);
    },
    (i) => {
      i.languageReview = null;
    },
    (i) => {
      i.sources[0].originalBody = 'Changed source';
    },
  ]) {
    const input = fixture();
    mutate(input.items[0]);
    assert.equal((await inspectBatch(input, { models })).safeToApply, false);
  }
});
test('media availability alone is insufficient without verified destination bytes', async () => {
  const input = fixture();
  input.items[0].mediaUrls = ['https://cmcen-rcmce.ca/image.jpg'];
  assert.equal(
    (
      await inspectBatch(input, {
        models,
        mediaEvidence: [
          { sourceUrl: input.items[0].mediaUrls[0], sourceVerified: true },
        ],
      })
    ).safeToApply,
    false,
  );
});
test('missing parents, provenance and guessed guest ownership are blocked', async () => {
  const input = fixture();
  input.items[0].comments = [
    {
      sourceCommentId: 1,
      sourcePostId: 10,
      sourceParentId: 99,
      sourceUserId: 0,
      sourceApproval: '1',
      convertedText: 'Comment',
      document: { status: 'pending', body: 'Comment', author: 'a'.repeat(24) },
    },
  ];
  const report = await inspectBatch(input, { models });
  for (const code of [
    'comment-not-migration-draft',
    'unresolved-comment-parent',
    'missing-comment-provenance',
    'guest-assigned-account',
  ])
    assert.ok(report.results[0].issues.some((i) => i.code === code));
});
test('registered commenters require the exact source user-ID mapping', async () => {
  const input = fixture();
  input.items[0].comments = [
    {
      sourceCommentId: 1,
      sourcePostId: 10,
      sourceParentId: 0,
      sourceUserId: 20,
      sourceApproval: '1',
      convertedText: 'Comment',
      document: {
        status: 'draft',
        body: 'Comment',
        author: 'a'.repeat(24),
        parentType: 'retirement',
        legacy: {
          source: 'https://cmcen-rcmce.ca',
          wordpressCommentId: 1,
          postId: 10,
          parentCommentId: 0,
          authorUserId: 20,
          originalApproval: '1',
        },
      },
    },
  ];
  assert.equal((await inspectBatch(input, { models })).safeToApply, true);
  input.items[0].comments[0].document.author = 'b'.repeat(24);
  const wrong = await inspectBatch(input, { models });
  assert.ok(
    wrong.results[0].issues.some(
      (issue) => issue.code === 'comment-author-not-mapped',
    ),
  );
  input.items[0].comments[0].document.author = null;
  const missing = await inspectBatch(input, { models });
  assert.ok(
    missing.results[0].issues.some(
      (issue) => issue.code === 'comment-author-not-mapped',
    ),
  );
});
test('model errors are reported without exposing field values', async () => {
  class InvalidModel extends ValidModel {
    async validate() {
      throw Object.assign(new Error('private value'), {
        errors: { body: { kind: 'maxlength', value: 'private value' } },
      });
    }
  }
  const report = await inspectBatch(fixture(), {
    models: { ...models, RetirementMessage: InvalidModel },
  });
  assert.equal(report.safeToApply, false);
  assert.ok(!JSON.stringify(report).includes('private value'));
});

test('unapproved comments need an explicit preservation decision and remain drafts', async () => {
  const input = fixture();
  const item = input.items[0];
  item.document._id = 'b'.repeat(24);
  const comment = {
    sourceCommentId: 42,
    sourcePostId: 10,
    sourceParentId: 0,
    sourceUserId: 0,
    sourceApproval: '0',
    convertedText: 'Congratulations.',
    document: {
      parentType: 'retirement',
      parentId: item.document._id,
      status: 'draft',
      body: 'Congratulations.',
      legacy: {
        source: 'https://cmcen-rcmce.ca',
        wordpressCommentId: 42,
        postId: 10,
        parentCommentId: 0,
        authorUserId: 0,
        originalApproval: '0',
      },
    },
  };
  item.comments = [comment];
  assert.equal((await inspectBatch(input, { models })).safeToApply, false);
  comment.importReview = {
    decision: 'preserve-as-draft',
    reviewedBy: 'operator',
    reason: 'Preserve this historical congratulations for review',
  };
  assert.equal((await inspectBatch(input, { models })).safeToApply, true);
  comment.document.status = 'published';
  assert.equal((await inspectBatch(input, { models })).safeToApply, false);
});
