const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function publish({
  type = 'comment',
  original = '2010-02-03T10:00:00Z',
  choice = 'original',
  archived = true,
} = {}) {
  const buttons = [],
    prompts = [],
    requests = [];
  const document = {
    createElement() {
      const node = {
        children: [],
        dataset: {},
        addEventListener(name, handler) {
          this[name] = handler;
        },
        append(...children) {
          this.children.push(...children);
        },
        get childElementCount() {
          return this.children.length;
        },
      };
      buttons.push(node);
      return node;
    },
  };
  const context = {
    window: {},
    document,
    CMCENModal: {
      confirm: async () => true,
      choose: async (message, options) => {
        prompts.push(options);
        return options.choices.some((c) => c.value === 'schedule')
          ? 'now'
          : choice;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/content-workspace-actions.js'),
      'utf8',
    ),
    context,
  );
  const actions = context.window.ContentWorkspaceActions.create({
    canManageContentWorkspaceNews: () => true,
    canReviewContentWorkspace: () => true,
    contentWorkspaceReviewRoutes: { [type]: (id) => `/review/${id}` },
    contentWorkspaceScheduledPublicationTypes: new Set([
      'event',
      'retirementMessage',
      'lastPost',
      'newsArticle',
    ]),
    contentWorkspaceRoutes: {},
    setWorkspaceTranslatedText: (node, key) => {
      node.key = key;
    },
    hasUnsavedContentWorkspaceChanges: () => false,
    getText: (_key, fallback) => fallback,
    contentWorkspaceApiJson: async (url, options) => {
      requests.push({ url, ...options });
    },
    contentWorkspaceState: { editorDrafts: new Map() },
    getEditorDraftKey: () => '',
    showWorkspaceSuccess: () => {},
    loadContentWorkspace: async () => {},
    setWorkspaceMessage: (message) => {
      throw Error(message);
    },
    getContentWorkspaceLocale: () => 'en-CA',
  });
  actions.createContentWorkspaceBottomActions({
    _id: 'test',
    type,
    status: 'draft',
    publicationDate: { isArchive: archived, originalPublishedAt: original },
  });
  buttons.find((button) => button.key === 'content_workspace_publish').click();
  await new Promise((resolve) => setImmediate(resolve));
  return { prompts, requests };
}
test('all workspace archive types send the selected original date mode', async () => {
  for (const type of [
    'comment',
    'event',
    'retirementMessage',
    'lastPost',
    'newsArticle',
  ]) {
    const { requests, prompts } = await publish({ type });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.publicationDateChoice, 'original');
    assert.equal(prompts.at(-1).choices[0].value, 'original');
  }
});
test('cancellation does not publish; missing originals only offer now; new content skips date dialog', async () => {
  assert.equal((await publish({ choice: null })).requests.length, 0);
  const missing = await publish({ original: null, choice: 'now' });
  assert.equal(missing.prompts[0].choices.length, 1);
  assert.equal(missing.requests[0].body.publicationDateChoice, 'now');
  const normal = await publish({ archived: false });
  assert.equal(normal.prompts.length, 0);
  assert.equal(normal.requests[0].body.publicationDateChoice, undefined);
});
