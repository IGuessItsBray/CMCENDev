const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function setup({
  isNew = false,
  contentDirty = false,
  failReview = false,
} = {}) {
  const context = {
    window: {},
    FormData: class {
      constructor(form) {
        this.form = form;
      }
      entries() {
        return this.form.entries[Symbol.iterator]();
      }
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/content-workspace-actions.js'),
      'utf8',
    ),
    context,
  );
  const review = {
    dataset: { language: 'review' },
    entries: [['reviewNote', 'Keep this draft']],
    classList: { contains: (name) => name === 'content-workspace-review-form' },
    checkValidity: () => true,
    elements: {
      namedItem: (name) =>
        name === 'needsReview'
          ? { checked: false }
          : name === 'reviewNote'
            ? { value: 'Keep this draft' }
            : null,
    },
  };
  const content = {
    dataset: { language: 'en' },
    entries: [],
    classList: { contains: () => false },
    checkValidity: () => true,
    elements: { namedItem: () => null },
  };
  const forms = contentDirty ? [review, content] : [review];
  const state = { editorDrafts: new Map() };
  const requests = [];
  let reloaded = false;
  const item = { type: 'newsArticle', _id: isNew ? 'new' : 'existing', isNew };
  const actions = context.window.ContentWorkspaceActions.create({
    contentWorkspaceState: state,
    getContentWorkspaceSaveForms: () => forms,
    isContentWorkspaceFormDirty: () => true,
    getEditorDraftKey: (record, language) => `${record._id}:${language}`,
    captureEditorDrafts: () =>
      state.editorDrafts.set(`${item._id}:review`, {
        needsReview: '',
        reviewNote: 'Keep this draft',
      }),
    getNewsArticleSaveRequest: () => ({
      path: '/article',
      method: isNew ? 'POST' : 'PATCH',
      body: {},
    }),
    contentWorkspaceApiJson: async (url, options) => {
      requests.push({ url, ...options });
      if (url.endsWith('/review') && failReview)
        throw new Error('Review failed');
      return isNew && url === '/article' ? { article: { _id: 'created' } } : {};
    },
    onArticleCreated: () => {},
    loadContentWorkspace: async () => {
      reloaded = true;
    },
    getText: (_, fallback) => fallback,
    setWorkspaceMessage: () => {},
    updateContentWorkspaceSaveAction: () => {},
    setWorkspaceTranslatedText: () => {},
    showWorkspaceSuccess: () => {},
  });
  return {
    actions,
    item,
    state,
    requests,
    reloaded: () => reloaded,
    button: { setAttribute: () => {}, removeAttribute: () => {} },
  };
}

test('a review-only edit creates a new article before saving its record review', async () => {
  const fixture = setup({ isNew: true });
  assert.equal(
    await fixture.actions.saveContentWorkspaceChanges(
      fixture.item,
      fixture.button,
    ),
    true,
  );
  assert.deepEqual(
    fixture.requests.map((request) => request.url),
    ['/article', '/api/admin/content/newsArticle/created/review'],
  );
  assert.equal(fixture.requests[1].body.needsReview, false);
});

test('review-only saves never request article publication or content mutation', async () => {
  const fixture = setup();
  await fixture.actions.saveContentWorkspaceChanges(
    fixture.item,
    fixture.button,
  );
  assert.deepEqual(
    fixture.requests.map((request) => request.url),
    ['/api/admin/content/newsArticle/existing/review'],
  );
});

test('partial content success retains the unsaved shared review draft after reload', async () => {
  const fixture = setup({ contentDirty: true, failReview: true });
  assert.equal(
    await fixture.actions.saveContentWorkspaceChanges(
      fixture.item,
      fixture.button,
    ),
    false,
  );
  assert.equal(fixture.reloaded(), true);
  assert.deepEqual(fixture.state.editorDrafts.get('existing:review'), {
    needsReview: '',
    reviewNote: 'Keep this draft',
  });
});
