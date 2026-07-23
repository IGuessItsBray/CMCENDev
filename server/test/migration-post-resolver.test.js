const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  resolveCollectionWithFallback,
  resolveCollectionWithFinalFallback,
  resolvePostWithFallback
} = require('../scripts/migration/lib/post-resolver');

test('falls back to the legacy page when the WordPress REST lookup returns 403', async () => {
  const restFailure = new Error('Request failed with status code 403');
  restFailure.response = { status: 403 };
  const errors = [];
  const fallbackPost = { id: 123, title: 'Legacy Last Post' };

  const post = await resolvePostWithFallback({
    fetchRest: async () => {
      throw restFailure;
    },
    fetchPage: async () => fallbackPost,
    onRestError: error => errors.push(error)
  });

  assert.equal(post, fallbackPost);
  assert.deepEqual(errors, [restFailure]);
});

test('skips one legacy post when both REST and page lookups fail', async () => {
  const pageFailure = new Error('Legacy page is forbidden');
  const pageErrors = [];

  const post = await resolvePostWithFallback({
    fetchRest: async () => {
      throw new Error('REST unavailable');
    },
    fetchPage: async () => {
      throw pageFailure;
    },
    onPageError: error => pageErrors.push(error)
  });

  assert.equal(post, null);
  assert.deepEqual(pageErrors, [pageFailure]);
});

test('falls back to the category scan when the Last Post archive returns 403', async () => {
  const archiveFailure = new Error('Request failed with status code 403');
  archiveFailure.response = { status: 403 };
  const errors = [];
  const categoryPosts = [{ id: 456 }];

  const result = await resolveCollectionWithFallback({
    fetchPrimary: async () => {
      throw archiveFailure;
    },
    fetchFallback: async () => categoryPosts,
    onPrimaryError: error => errors.push(error)
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.items, categoryPosts);
  assert.deepEqual(errors, [archiveFailure]);
});

test('falls back to the category page scrape when archive and category REST fail', async () => {
  const archiveFailure = new Error('Request failed with status code 403');
  archiveFailure.response = { status: 403 };
  const categoryFailure = new Error('Request failed with status code 403');
  categoryFailure.response = { status: 403 };
  const primaryErrors = [];
  const fallbackErrors = [];
  const categoryPagePosts = [{ id: 789 }];

  const result = await resolveCollectionWithFinalFallback({
    fetchPrimary: async () => {
      throw archiveFailure;
    },
    fetchFallback: async () => {
      throw categoryFailure;
    },
    fetchFinalFallback: async () => categoryPagePosts,
    onPrimaryError: error => primaryErrors.push(error),
    onFallbackError: error => fallbackErrors.push(error)
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.usedFinalFallback, true);
  assert.equal(result.items, categoryPagePosts);
  assert.deepEqual(primaryErrors, [archiveFailure]);
  assert.deepEqual(fallbackErrors, [categoryFailure]);
});
