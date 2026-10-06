const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { getCommentContextLinks, getCommentStaffLink } = require('../config/comment-targets');

test('staff parent navigation uses supported previews and workspace access without inventing public links', () => {
  for (const [parentType, route] of [['retirement', '/retirement-message'], ['lastPost', '/last-post-message']]) {
    for (const status of ['draft', 'pending', 'hidden', 'rejected', 'published']) {
      const comment = { parentType, parentId: { _id: 'parent&id', status } };
      const link = getCommentStaffLink(comment);
      assert.deepEqual(link, ['draft', 'pending'].includes(status)
        ? { url: `${route}?id=parent%26id&preview=1`, kind: 'preview' }
        : ['hidden', 'rejected'].includes(status)
          ? { url: '/content-workspace?id=parent%26id', kind: 'workspace' } : null);
    }
    assert.equal(getCommentStaffLink({ parentType, parentId: null }), null);
    assert.equal(getCommentStaffLink({ parentType, parentId: 'not-populated' }), null);
  }
  assert.equal(getCommentStaffLink({ parentType: 'unsupported', parentId: { _id: 'id', status: 'draft' } }), null);
});

test('comment context resolves its stored original parent and published local target', () => {
  const en = 'https://cmcen-rcmce.ca/old-parent/';
  const fr = 'https://cmcen-rcmce.ca/fr/ancien-parent/';
  for (const [parentType, publicPath] of [
    ['retirement', '/retirement-message'],
    ['lastPost', '/last-post-message'],
  ]) {
    const comment = {
      parentType,
      legacy: { postId: 12 },
      parentId: {
        _id: 'parent&id',
        status: 'published',
        legacy: {
          sourceUrls: [en, fr],
          sourceRecords: [
            { sourceId: 12, language: 'en', url: en },
            { sourceId: 13, language: 'fr', url: fr },
          ],
        },
      },
    };
    assert.deepEqual(getCommentContextLinks(comment), {
      archiveSourceLinks: [{ url: en, language: 'en' }],
      publicUrl: `${publicPath}?id=parent%26id`,
    });
    for (const status of ['draft', 'pending', 'rejected', 'hidden']) {
      comment.parentId.status = status;
      const links = getCommentContextLinks(comment);
      assert.equal(links.publicUrl, '');
      assert.equal(links.archiveSourceLinks[0].url, en);
    }
  }
});

test('missing, unsupported, or unsafe source references never create guessed links', () => {
  assert.deepEqual(
    getCommentContextLinks({
      parentType: 'lastPost',
      parentId: null,
      legacy: { sourceUrl: 'https://cmcen-rcmce.ca/historical-comment/' },
    }),
    {
      archiveSourceLinks: [
        { url: 'https://cmcen-rcmce.ca/historical-comment/', language: '' },
      ],
      publicUrl: '',
    },
  );
  for (const comment of [
    { parentType: 'retirement', parentId: null },
    { parentType: 'lastPost', parentId: 'unpopulated-id' },
    {
      parentType: 'newsArticle',
      parentId: { _id: 'article', status: 'published' },
    },
  ])
    assert.deepEqual(getCommentContextLinks(comment), {
      archiveSourceLinks: [],
      publicUrl: '',
    });
  for (const url of [
    'javascript:alert(1)',
    'https://evil.test/post/',
    'https://private@cmcen-rcmce.ca/post/',
  ]) {
    const links = getCommentContextLinks({
      parentType: 'retirement',
      legacy: { postId: 12 },
      parentId: {
        _id: 'parent',
        status: 'draft',
        legacy: { sourceRecords: [{ sourceId: 12, url }] },
      },
    });
    assert.deepEqual(links, { archiveSourceLinks: [], publicUrl: '' });
  }
  assert.deepEqual(
    getCommentContextLinks({
      parentType: 'retirement',
      parentId: { _id: 'parent', status: 'published' },
    }),
    {
      archiveSourceLinks: [],
      publicUrl: '/retirement-message?id=parent',
    },
  );
});

test('review context renders explicit parent links even while the comment remains a draft', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../public/content-workspace-controller.js'),
    'utf8',
  );
  const fn = source.slice(
    source.indexOf('function createArchiveSourceDetails'),
    source.indexOf('function renderContentWorkspaceDetail'),
  );
  const createElement = (tag) => ({
    tag,
    children: [],
    dataset: {},
    append(...children) {
      this.children.push(...children);
    },
  });
  const create = vm.runInNewContext(`${fn}; createArchiveSourceDetails`, {
    document: { createElement },
    getText: (key, fallback) => fallback,
    setWorkspaceTranslatedText: (element, key, fallback) => {
      element.textContent = fallback;
    },
    canReviewContentWorkspace: () => true,
  });
  const legacyUrl = 'https://cmcen-rcmce.ca/old-parent/';
  const section = create({
    type: 'comment',
    status: 'draft',
    publicationDate: { isArchive: true },
    archiveSourceLinks: [{ url: legacyUrl, language: 'en' }],
    content: {
      parentTitle: '<img onerror=bad()>',
      publicUrl: '/retirement-message?id=parent',
    },
  });
  const links = section.children.filter((child) => child.tag === 'a');
  assert.equal(section.children[1].textContent, '<img onerror=bad()>');
  assert.equal(links[0].href, legacyUrl);
  assert.equal(links[0].textContent, 'View original legacy parent article');
  assert.equal(links[1].href, '/retirement-message?id=parent');
  assert.equal(links[1].textContent, 'View published parent on this site');
  assert.equal(links[1].rel, 'noopener noreferrer');
  const draft = create({
    type: 'comment', status: 'published',
    archiveSourceLinks: [{ url: legacyUrl, language: 'en' }],
    content: { publicUrl: '', staffParentLink: { url: '/retirement-message?id=parent&preview=1', kind: 'preview' } },
  });
  const draftLinks = draft.children.filter((child) => child.tag === 'a');
  assert.equal(draftLinks.length, 2);
  assert.equal(draftLinks[0].href, legacyUrl);
  assert.equal(draftLinks[1].href, '/retirement-message?id=parent&preview=1');
  assert.equal(draftLinks[1].textContent, 'Preview unpublished parent on this site');
  const denied = vm.runInNewContext(`${fn}; createArchiveSourceDetails`, {
    document: { createElement },
    getText: (key, fallback) => fallback,
    setWorkspaceTranslatedText: (element, key, fallback) => { element.textContent = fallback; },
    canReviewContentWorkspace: () => false,
  });
  const deniedSection = denied({ type: 'comment', content: { staffParentLink: { url: '/content-workspace?id=parent', kind: 'workspace' } } });
  assert.equal(deniedSection.children.filter((child) => child.tag === 'a').length, 0);
});
