const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SOURCE,
  isArchiveRecord,
  cleanChanges,
  cleanChecks,
} = require('../services/archive-staff-review');
const documentLibrary = require('../public/page-content/document-library.json');
const { getUserPermissions } = require('../config/permissions');

const provenance = {
  source: SOURCE,
  sourcePostIds: [123],
  originalStatus: 'publish',
};

test('only imported published-source records enter staff review', () => {
  assert.equal(
    isArchiveRecord({ legacy: provenance }, 'retirementMessage'),
    true,
  );
  assert.equal(
    isArchiveRecord(
      { legacy: { ...provenance, originalStatus: 'private' } },
      'page',
    ),
    false,
  );
  assert.equal(
    isArchiveRecord(
      { legacy: { source: SOURCE, sourcePostIds: [] } },
      'newsArticle',
    ),
    false,
  );
  assert.equal(
    isArchiveRecord(
      { legacy: provenance, migrationSource: 'https://example.test/post' },
      'newsArticle',
    ),
    true,
  );
  assert.equal(
    isArchiveRecord(
      {
        legacy: {
          source: SOURCE,
          wordpressCommentId: 7,
          originalApproval: '0',
        },
      },
      'comment',
    ),
    false,
  );
  assert.equal(
    isArchiveRecord(
      {
        legacy: {
          source: SOURCE,
          wordpressCommentId: 7,
          originalApproval: '0',
          importReview: { decision: 'preserve-as-draft' },
        },
      },
      'comment',
    ),
    true,
  );
});

test('archive permission remains separate from general publishing powers', () => {
  const permissions = getUserPermissions({
    role: 'subscriber',
    customRoles: [{ permissions: ['archive.verify'] }],
  });
  assert.equal(permissions.canVerifyArchive, true);
  assert.equal(permissions.canManageNews, false);
  assert.equal(permissions.canReviewAndPublish, false);
  assert.equal(permissions.canManagePages, false);
  assert.equal(permissions.canManageUsers, false);
});

test('staff changes are limited to public archive fields', () => {
  for (const [type, person, maxLength] of [['retirementMessage', 'retiree', 40], ['lastPost', 'deceased', 80]]) {
    const changes = { [`${person}.ranks.en`]: 'Captain', [`${person}.ranks.fr`]: 'Capitaine' };
    assert.deepEqual(cleanChanges(type, changes, documentLibrary), changes);
    assert.throws(() => cleanChanges(type, { [`${person}.ranks.fr`]: 'a'.repeat(maxLength + 1) }, documentLibrary));
  }
  assert.deepEqual(
    cleanChanges(
      'newsArticle',
      { 'title.fr': 'Nouveau titre' },
      documentLibrary,
    ),
    { 'title.fr': 'Nouveau titre' },
  );
  assert.throws(
    () => cleanChanges('newsArticle', { status: 'published' }, documentLibrary),
    /Unsupported field/,
  );
  assert.throws(
    () =>
      cleanChanges('page', { access: { audience: 'public' } }, documentLibrary),
    /Unsupported field/,
  );
  assert.throws(
    () =>
      cleanChanges(
        'archiveDocument',
        { fileKey: '../secret.pdf' },
        documentLibrary,
      ),
    /Invalid document media key/,
  );
  assert.throws(
    () =>
      cleanChanges(
        'event',
        { imagePath: 'javascript:alert(1)' },
        documentLibrary,
      ),
    /Invalid URL/,
  );
  assert.throws(
    () =>
      cleanChecks({
        source: true,
        translation: true,
        categorization: true,
        media: 'yes',
      }),
    /Complete/,
  );
});
