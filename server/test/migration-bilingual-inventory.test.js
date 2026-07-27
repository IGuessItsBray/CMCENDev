const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  deriveFrenchLastPostUrl,
  extractLinks,
  getAlternateLinks,
  getContentType,
  isContentDetailUrl,
  getLanguageFromUrl,
  normalizeSubject,
  pairEntries,
} = require('../scripts/migration/lib/bilingual-inventory');

test('derives the documented French Last Post URL from its English source', () => {
  assert.equal(
    deriveFrenchLastPostUrl(
      'https://cmcen-rcmce.ca/lp/last-post-martin-lavigne/',
    ),
    'https://cmcen-rcmce.ca/fr/lp/derniers-appels-martin-lavigne/',
  );
});

test('keeps only absolute content links when extracting an archive', () => {
  const links = extractLinks(
    [
      '<a href="/lp/last-post-martin-lavigne/">Martin</a>',
      '<a href="https://cmcen-rcmce.ca/fr/lp/derniers-appels-martin-lavigne/">Martin FR</a>',
    ].join(''),
    'https://cmcen-rcmce.ca/last-post-years-archive/',
  );

  assert.deepEqual(links, [
    'https://cmcen-rcmce.ca/lp/last-post-martin-lavigne/',
    'https://cmcen-rcmce.ca/fr/lp/derniers-appels-martin-lavigne/',
  ]);
  assert.equal(getContentType(links[0]), 'last-post');
  assert.equal(getLanguageFromUrl(links[1]), 'fr');
});

test('pairs documented Last Post translations without subject guessing', () => {
  const result = pairEntries([
    {
      url: 'https://cmcen-rcmce.ca/lp/last-post-martin-lavigne/',
      contentType: 'last-post',
      language: 'en',
      title: 'Last Post - Martin Lavigne',
      subject: 'Last Post - Martin Lavigne',
      alternateUrls: {},
    },
    {
      url: 'https://cmcen-rcmce.ca/fr/lp/derniers-appels-martin-lavigne/',
      contentType: 'last-post',
      language: 'fr',
      title: 'Derniers appels - Martin Lavigne',
      subject: 'Derniers appels - Martin Lavigne',
      alternateUrls: {},
    },
  ]);

  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].pairing, 'derived-last-post-url');
  assert.equal(result.unpaired.length, 0);
  assert.equal(
    normalizeSubject('Derniers appels - Martin Lavigne'),
    'martin lavigne',
  );
});

test('reads an authoritative French translation from the live-site WPML switcher', () => {
  const alternates = getAlternateLinks(
    '<li class="wpml-ls-item-fr"><a href="/fr/lp/derniers-appels-martin-lavigne/">Francais</a></li>',
    'https://cmcen-rcmce.ca/lp/last-post-martin-lavigne/',
  );

  assert.equal(
    alternates.fr,
    'https://cmcen-rcmce.ca/fr/lp/derniers-appels-martin-lavigne/',
  );
  assert.equal(
    isContentDetailUrl('https://cmcen-rcmce.ca/retirements/'),
    false,
  );
  assert.equal(
    isContentDetailUrl(
      'https://cmcen-rcmce.ca/retirement-warrant-officer-jason-st-pierre/',
    ),
    true,
  );
});
