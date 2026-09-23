const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const NewsArticle = require('../models/NewsArticle');
const RetirementMessage = require('../models/RetirementMessage');
const searchRouter = require('../routes/search');

const publicSearchScript = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'search.js'),
  'utf8',
);
const searchRoute = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'search.js'),
  'utf8',
);

function createQuery(results = []) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean() {
      return Promise.resolve(results);
    },
  };
}

async function runSearch(query, language = 'en', modelResults = new Map()) {
  const models = [Event, LastPostMessage, RetirementMessage];
  const originalFindMethods = models.map((model) => model.find);
  const originalNewsAggregate = NewsArticle.aggregate;
  const routeHandler = searchRouter.stack.find(
    (layer) => layer.route?.path === '/' && layer.route.methods.get,
  ).route.stack[0].handle;
  let responseBody;

  models.forEach((model) => {
    model.find = () => createQuery(modelResults.get(model) || []);
  });
  NewsArticle.aggregate = async () => modelResults.get(NewsArticle) || [];

  try {
    await routeHandler(
      { query: { q: query, lang: language } },
      {
        json(body) {
          responseBody = body;
        },
        status() {
          return this;
        },
      },
    );
  } finally {
    models.forEach((model, index) => {
      model.find = originalFindMethods[index];
    });
    NewsArticle.aggregate = originalNewsAggregate;
  }

  return responseBody;
}

test('caches static page content instead of reading it for every search', () => {
  assert.match(searchRoute, /let staticPageCorpusPromise;/u);
  assert.match(searchRoute, /function getStaticPageCorpus\(\)/u);
  assert.match(
    searchRoute,
    /if \(staticPageCorpusPromise\) \{\s+return staticPageCorpusPromise;/u,
  );
  assert.match(
    searchRoute,
    /staticPageCorpusPromise = Promise\.all\(\s+STATIC_PAGES\.map/u,
  );
  assert.match(
    searchRoute,
    /async function searchStaticPages[\s\S]+await getStaticPageCorpus\(\)/u,
  );
});

test('ignores stale browser search responses', () => {
  assert.match(publicSearchScript, /let searchRequestSequence = 0;/u);
  assert.match(
    publicSearchScript,
    /const requestId = \+\+searchRequestSequence;/u,
  );
  assert.match(
    publicSearchScript,
    /if \(requestId !== searchRequestSequence\) \{\s+return;\s+\}\s+renderResults\(data\);/u,
  );
  assert.match(
    publicSearchScript,
    /catch \(error\) \{\s+if \(requestId !== searchRequestSequence\) \{\s+return;/u,
  );
});

test('ranks destination pages ahead of similarly named content', async () => {
  const retirementResults = await runSearch(
    'retirement',
    'en',
    new Map([
      [
        RetirementMessage,
        [
          {
            _id: 'retirement-1',
            retiree: { firstName: 'Alex', lastName: 'Roy' },
            messages: { en: 'Retirement wishes for Alex.' },
            publishedAt: new Date('2026-09-01'),
          },
        ],
      ],
    ]),
  );
  const lastPostResults = await runSearch(
    'last post',
    'en',
    new Map([
      [
        LastPostMessage,
        [
          {
            _id: 'last-post-1',
            title: 'Last Post: Alex Roy',
            messages: { en: 'Remembering Alex.' },
            publishedAt: new Date('2026-09-01'),
          },
        ],
      ],
    ]),
  );

  assert.equal(retirementResults.results[0]?.url, '/retirements');
  assert.equal(lastPostResults.results[0]?.url, '/last-post');
});

test('ranks French destination-page titles first', async () => {
  const retirementResults = await runSearch(
    'retraite',
    'fr',
    new Map([
      [
        RetirementMessage,
        [
          {
            _id: 'retirement-1',
            retiree: { firstName: 'Alex', lastName: 'Roy' },
            messages: { fr: 'Bonne retraite, Alex.' },
            publishedAt: new Date('2026-09-01'),
          },
        ],
      ],
    ]),
  );
  const lastPostResults = await runSearch('dernier appel', 'fr');

  assert.equal(retirementResults.results[0]?.url, '/retirements');
  assert.equal(lastPostResults.results[0]?.url, '/last-post');
});

test('requires every search term to match a static page', async () => {
  const results = await runSearch('retirement term-that-does-not-exist');

  assert.deepEqual(results.results, []);
});

test('localizes retirement message results to the selected language', async () => {
  const results = await runSearch(
    'sapeur',
    'fr',
    new Map([
      [
        RetirementMessage,
        [
          {
            _id: 'retirement-1',
            retiree: {
              rank: 'Cpl',
              firstName: 'Alex',
              lastName: 'Roy',
              tradeRole: 'Sapeur de combat',
            },
            messages: {
              en: 'Thank you for your service.',
              fr: 'Merci pour votre service.',
            },
          },
        ],
      ],
    ]),
  );
  const retirementResult = results.results.find(
    (result) => result.sourceId === 'retirement-1',
  );

  assert.equal(retirementResult.title, 'Message de retraite pour Cpl Alex Roy');
  assert.equal(retirementResult.summary, 'Merci pour votre service.');
});

test('preserves article URLs, historical dates and localized search text', async () => {
  const articles = [
    {
      _id: 'story-1',
      layout: 'standard',
      title: { en: 'Signal news', fr: 'Actualités des transmissions' },
      content: { en: 'Current update.', fr: 'Nouvelles récentes.' },
      displayDate: new Date('2026-09-01'),
    },
    {
      _id: 'newsletter-1',
      layout: 'newsletter',
      title: { fr: 'Bulletin des transmissions' },
      content: { fr: 'Le bulletin historique.' },
      publishedAt: new Date('2026-09-01'),
      displayDate: new Date('1985-09-01'),
    },
  ];
  const response = await runSearch(
    'transmissions',
    'fr',
    new Map([[NewsArticle, articles]]),
  );
  for (const article of articles) {
    const result = response.results.find(
      (item) => item.sourceId === article._id,
    );
    assert.ok(result);
    assert.equal(result.title, article.title.fr);
    assert.equal(result.summary, article.content.fr);
    assert.equal(result.date, article.displayDate);
    const page = article.layout === 'newsletter' ? 'newsletter' : 'news-story';
    assert.equal(result.url, `/${page}?id=${article._id}`);
  }
});
