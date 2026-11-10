const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../public/content-workspace-controller.js'),
  'utf8',
);

function element(tagName) {
  return {
    tagName,
    children: [],
    dataset: {},
    attributes: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    get childElementCount() { return this.children.length; },
  };
}

function loadFunction(name, next, context) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${next}(`, start);
  return vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);
}

test('submission controls and source links share the header; history stays after the content', () => {
  for (const type of ['event', 'retirementMessage', 'lastPost', 'newsArticle', 'comment']) {
    const detail = element('section');
    const controls = element('section');
    const preview = element('a');
    const original = element('div');
    let created = 0;
    let updated = 0;
    const context = {
      document: { createElement: element },
      disposed: false,
      detailHeaderObserver: { disconnect() {}, observe() {} },
      disposeEditors() {},
      contentWorkspaceDetail: detail,
      contentWorkspaceState: { isLoading: false },
      workspaceUrl: new URL('https://example.invalid/admin?area=content'),
      getSelectedContentWorkspaceItem: () => ({ type }),
      getItemTitle: () => 'Sample submission',
      createStatusBadge: () => element('span'),
      getContentWorkspaceDisplayStatus: () => 'pending',
      createDetailInfo: () => element('p'),
      createPublicContentLink: () => preview,
      createArchiveSourceDetails: () => original,
      canEditContentWorkspacePublicCopy: () => false,
      createReadOnlyComment: () => [element('p')],
      createReadOnlyCopy: () => element('section'),
      canEditContentWorkspaceRecord: () => true,
      createContentWorkspaceRecordEditor: () => element('form'),
      createContentWorkspaceSubmissionDetails: () => null,
      createRejectionReason: () => null,
      createContentWorkspaceRsvpPanel: () => null,
      createScheduledPublicationStatus: () => null,
      canViewContentWorkspaceHistory: () => true,
      setWorkspaceTranslatedText() {},
      createContentWorkspaceActionBar(item, options) {
        assert.equal(item.type, type);
        assert.equal(options.canSave, true);
        assert.ok(detail.children.some((node) => node.tagName === 'form'));
        created++;
        return controls;
      },
      updateContentWorkspaceSaveAction() { updated++; },
    };
    loadFunction('renderContentWorkspaceDetail', 'hasUnsavedContentWorkspaceChanges', context)();
    const header = detail.children[0];
    assert.equal(header.tagName, 'header');
    assert.equal(header.children.at(-1), controls);
    const links = header.children.find((node) => node.children.includes(preview));
    assert.ok(links.children.includes(original));
    assert.equal(detail.children.at(-1).className, 'content-workspace-history');
    assert.equal(created, 1);
    assert.equal(updated, 1);
  }
});

test('compact source keeps dates and every legacy link without changing source data', () => {
  const item = {
    type: 'lastPost',
    publicationDate: { isArchive: true, originalPublishedAt: '2010-01-02T12:00:00Z' },
    archiveSourceIds: ['legacy-123'],
    archiveSourceLinks: [
      { language: 'en', url: 'https://example.invalid/en' },
      { language: 'fr', url: 'https://example.invalid/fr' },
    ],
  };
  const original = JSON.stringify(item);
  const create = loadFunction('createArchiveSourceDetails', 'renderContentWorkspaceDetail', {
    document: { createElement: element },
    getText: (_key, fallback) => fallback,
  });
  const details = create(item);
  assert.equal(details.attributes.role, 'group');
  assert.ok(details.attributes['aria-label']);
  const date = details.children.find((node) => node.tagName === 'time');
  assert.equal(date.dateTime, item.publicationDate.originalPublishedAt);
  assert.equal(date.textContent, '2010-01-02');
  const links = details.children.filter((node) => node.tagName === 'a');
  assert.deepEqual(links.map((node) => node.href), item.archiveSourceLinks.map((link) => link.url));
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
  assert.equal(details.children.length, 3);
  assert.equal(JSON.stringify(item), original);
  assert.equal(create({ type: 'event' }), null);
});
