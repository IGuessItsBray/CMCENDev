const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function element(tag) {
  return {
    tag,
    children: [],
    textContent: '',
    append(...children) {
      this.children.push(...children);
    },
    addEventListener() {},
  };
}

function renderer(language = 'en') {
  const translations = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/translations.json'), 'utf8'),
  )[language];
  const context = {
    URLSearchParams,
    document: {
      getElementById: () => element('div'),
      querySelector: () => element('a'),
      createElement: element,
      addEventListener() {},
    },
    CMCENUtils: { setDetailReturnLink() {}, formatDate: (value) => value },
    translate: (key, values = {}) =>
      (translations[key] || key).replace(
        /\{(\w+)\}/g,
        (match, name) => values[name] ?? match,
      ),
    window: { location: { search: '' } },
  };
  const source = fs.readFileSync(
    path.join(__dirname, '../public/retirement-message.js'),
    'utf8',
  );
  vm.runInNewContext(
    source.replace(/\nloadRetirementMessage\(\);\s*$/, ''),
    context,
  );
  return context;
}

test('public comments render preserved guest names and sent dates as text', () => {
  const context = renderer();
  const name = '<img src=x onerror=alert(1)> Guest';
  const comment = {
    author: null,
    legacy: { authorName: name, isGuest: true },
    createdAt: '2020-01-02T03:04:05.000Z',
    publishedAt: '2026-10-05T12:00:00.000Z',
    body: '<script>untrusted()</script>',
  };
  const article = context.createCommentElement(comment);
  const [author, date] = article.children[0].children;
  assert.equal(author.textContent, `${name} (Guest)`);
  assert.equal(author.children.length, 0);
  assert.equal(date.textContent, comment.createdAt);
  assert.equal(date.dateTime, comment.createdAt);
  assert.equal(article.children[1].textContent, comment.body);
  assert.equal(renderer('fr').formatCommentAuthor(comment), `${name} (Invité)`);
});

test('mapped authors retain current names and email fallbacks are never displayed', () => {
  const context = renderer();
  assert.equal(
    context.formatCommentAuthor({
      author: {
        firstName: 'Current',
        lastName: 'Member',
        accountName: 'Account',
      },
      legacy: { authorName: 'Legacy Guest' },
    }),
    'Current Member',
  );
  assert.equal(
    context.formatCommentAuthor({ author: { accountName: 'Account' } }),
    'Account',
  );
  assert.equal(
    context.formatCommentAuthor({ author: { username: 'public-handle' } }),
    'public-handle',
  );
  for (const comment of [
    { author: null },
    { author: null, legacy: { authorName: '  ' } },
    {
      author: {
        username: 'private@example.test',
        email: 'private@example.test',
      },
    },
    { author: null, legacy: { authorName: 'private@example.test' } },
  ])
    assert.equal(context.formatCommentAuthor(comment), 'Unknown user');
});

test('sent dates fall back only when creation date is missing or invalid', () => {
  const context = renderer();
  const publishedAt = '2026-10-05T12:00:00.000Z';
  for (const createdAt of [null, undefined, '', 'not-a-date'])
    assert.equal(
      context.getCommentSentDate({ createdAt, publishedAt }),
      publishedAt,
    );
  assert.equal(
    context.getCommentSentDate({
      createdAt: 'not-a-date',
      publishedAt: 'invalid',
    }),
    '',
  );
  assert.equal(context.getCommentSentDate({}), '');
});

test('public API keeps guest attribution and does not revive deleted registered authors', async () => {
  const routes = new Map();
  const comments = [
    {
      author: null,
      legacy: {
        authorName: 'Guest',
        authorUserId: 0,
        authorEmail: 'private@example.test',
      },
    },
    {
      author: null,
      legacy: { authorName: 'Deleted Member', authorUserId: 123 },
    },
    {
      author: { _id: 'mapped' },
      legacy: { authorName: 'Original Member', authorUserId: 456 },
    },
    { author: null },
  ];
  let selected;
  const query = {
    select(value) {
      selected = value;
      return this;
    },
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    async lean() {
      return comments;
    },
  };
  const router = {
    get(route, ...handlers) {
      routes.set(route, handlers.at(-1));
    },
    patch() {},
    post() {},
  };
  const context = {
    module: { exports: {} },
    console,
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '../models/Comment') return { find: () => query };
      if (name === '../models/RetirementMessage')
        return {
          findOne: () => ({
            select() {
              return this;
            },
            async lean() {
              return { _id: 'parent' };
            },
          }),
        };
      if (name === '../config/comment-targets')
        return { getCommentTarget: () => ({ model: 'RetirementMessage' }) };
      if (name === '../middleware/auth')
        return { authMiddleware() {}, requirePermission: () => () => {} };
      return {};
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../routes/comments.js'), 'utf8'),
    context,
  );
  let response;
  await routes.get('/on/:parentType/:parentId')(
    { params: { parentType: 'retirement', parentId: 'parent' } },
    {
      json(value) {
        response = value;
      },
      status() {
        throw new Error('Unexpected error response');
      },
    },
  );
  assert.ok(selected.includes('legacy.authorUserId'));
  assert.equal(response.comments[0].legacy.authorName, 'Guest');
  assert.equal(response.comments[1].legacy.authorName, '');
  assert.equal(response.comments[2].legacy.authorName, 'Original Member');
  for (const comment of response.comments.filter((item) => item.legacy))
    assert.deepEqual(Object.keys(comment.legacy), ['authorName', 'isGuest']);
  assert.equal(response.comments[0].legacy.isGuest, true);
  assert.equal(response.comments[1].legacy.isGuest, false);
  assert.equal(
    renderer().formatCommentAuthor(response.comments[0]),
    'Guest (Guest)',
  );
  assert.equal(
    renderer().formatCommentAuthor(response.comments[1]),
    'Unknown user',
  );
});
