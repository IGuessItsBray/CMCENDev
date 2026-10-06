const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function workspace() {
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
        setAttribute() {},
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
        return null;
      },
      form: async () => ({ scheduledPublishAt: '2099-06-05T12:00:00.000Z' }),
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
    contentWorkspaceReviewRoutes: Object.fromEntries(
      ['comment', 'event', 'retirementMessage', 'lastPost', 'newsArticle'].map(
        (type) => [type, (id) => `/review/${id}`],
      ),
    ),
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
  function render({
    id = 'test',
    type = 'comment',
    original = '2010-02-03T10:00:00Z',
    archived = true,
  } = {}) {
    buttons.length = 0;
    actions.createContentWorkspaceBottomActions({
      _id: id,
      type,
      status: 'draft',
      publicationDate: { isArchive: archived, originalPublishedAt: original },
    });
    return {
      dropdown: buttons.find(
        (node) => node.className === 'content-workspace-publication-choice',
      ),
      button: buttons.find((button) => button.key === 'content_workspace_publish'),
    };
  }
  return { render, prompts, requests };
}

async function publish({ choice, ...record } = {}) {
  const { render, prompts, requests } = workspace();
  const { dropdown, button } = render(record);
  if (dropdown && choice !== undefined) {
    dropdown.value = choice;
    dropdown.change();
  }
  button.click();
  await new Promise((resolve) => setImmediate(resolve));
  return { dropdown, prompts, requests };
}
test('all workspace archive types send the selected original date mode', async () => {
  for (const type of [
    'comment',
    'event',
    'retirementMessage',
    'lastPost',
    'newsArticle',
  ]) {
    const { requests, dropdown } = await publish({ type, choice: 'original' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.publicationDateChoice, 'original');
    assert.equal(dropdown.children[1].value, 'original');
  }
});
test('valid imported originals default to original without a user selection', async () => {
  for (const type of ['comment', 'event', 'retirementMessage', 'lastPost', 'newsArticle']) {
    const { dropdown, requests } = await publish({ type });
    assert.equal(dropdown.value, 'original');
    assert.equal(requests[0].body.publicationDateChoice, 'original');
  }
});
test('missing, invalid, and future originals default to now', async () => {
  for (const original of [null, '', 'invalid', '2099-01-01T00:00:00Z', 123]) {
    const { dropdown, requests } = await publish({ type: 'newsArticle', original });
    assert.equal(dropdown.value, 'now');
    assert.deepEqual(Array.from(dropdown.children, (option) => option.value), ['now', 'schedule']);
    assert.equal(requests[0].body.publicationDateChoice, 'now');
  }
  const normal = await publish({ type: 'newsArticle', archived: false });
  assert.equal(normal.dropdown.value, 'now');
  assert.equal(normal.requests[0].body.publicationDateChoice, undefined);
});
test('explicit selections survive rerenders and record switches without leaking', () => {
  const { render } = workspace();
  const first = render({ id: 'first', type: 'newsArticle' });
  first.dropdown.value = 'now';
  first.dropdown.change();
  assert.equal(render({ id: 'first', type: 'newsArticle' }).dropdown.value, 'now');
  const second = render({ id: 'second', type: 'newsArticle' });
  assert.equal(second.dropdown.value, 'original');
  second.dropdown.value = 'schedule';
  second.dropdown.change();
  assert.equal(render({ id: 'first', type: 'newsArticle' }).dropdown.value, 'now');
  assert.equal(render({ id: 'second', type: 'newsArticle' }).dropdown.value, 'schedule');
  assert.equal(render({ id: 'first', type: 'lastPost' }).dropdown.value, 'original');
  assert.equal(render({ id: 'fresh', original: null }).dropdown.value, 'now');
});
test('an explicit original choice falls back when the original becomes unavailable', () => {
  const { render } = workspace();
  const first = render();
  first.dropdown.value = 'original';
  first.dropdown.change();
  assert.equal(render({ original: null }).dropdown.value, 'now');
});
test('explicit now overrides the valid original default in the publication request', async () => {
  const { dropdown, requests } = await publish({ type: 'newsArticle', choice: 'now' });
  assert.equal(dropdown.value, 'now');
  assert.equal(requests[0].body.publicationDateChoice, 'now');
  assert.equal(requests[0].body.scheduledPublishAt, undefined);
});
test('cancellation does not publish; missing originals offer current or scheduled date; new content skips date dialog', async () => {
  assert.equal((await publish({ choice: null })).requests.length, 0);
  const missing = await publish({ type: 'retirementMessage', original: null, choice: 'now' });
  assert.deepEqual(
    Array.from(missing.dropdown.children, (entry) => entry.value),
    ['now', 'schedule'],
  );
  assert.equal(missing.requests[0].body.publicationDateChoice, 'now');
  const normal = await publish({ archived: false });
  assert.equal(normal.prompts.length, 0);
  assert.equal(normal.dropdown, undefined);
  assert.equal(normal.requests[0].body.publicationDateChoice, undefined);
});
test('scheduled archive content sends its future go-live date with the current date choice', async () => {
  const { requests } = await publish({ choice: 'schedule', type: 'retirementMessage' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.publicationDateChoice, 'now');
  assert.equal(requests[0].body.scheduledPublishAt, '2099-06-05T12:00:00.000Z');
});
