const { cleanString, stripHtml } = require('./wordpress');

const WORDPRESS_BASE_URL = 'https://cmcen-rcmce.ca';

function normalizeUrl(value) {
  try {
    const url = new URL(value, WORDPRESS_BASE_URL);
    url.hash = '';
    url.search = '';
    return url.href;
  } catch {
    return '';
  }
}

function getPathParts(value) {
  const url = normalizeUrl(value);

  if (!url) {
    return [];
  }

  return new URL(url).pathname.split('/').filter(Boolean);
}

function getContentType(value) {
  const parts = getPathParts(value);

  if (parts[0] === 'lp' || (parts[0] === 'fr' && parts[1] === 'lp')) {
    return 'last-post';
  }

  if (
    /^retirement-/iu.test(parts[0] || '') ||
    (parts[0] === 'fr' && /^(retraite-|annonce-de-retraite)/iu.test(parts[1] || ''))
  ) {
    return 'retirement';
  }

  return '';
}

function isContentDetailUrl(value) {
  const parts = getPathParts(value);
  const contentType = getContentType(value);

  if (contentType === 'last-post') {
    return (parts[0] === 'lp' && Boolean(parts[1])) ||
      (parts[0] === 'fr' && parts[1] === 'lp' && Boolean(parts[2]));
  }

  if (contentType === 'retirement') {
    if (parts[0] === 'fr') {
      return /^(retraite-|annonce-de-retraite)/iu.test(parts[1] || '');
    }

    return parts.length === 1 && /^retirement-/iu.test(parts[0] || '');
  }

  return false;
}

function getLanguageFromUrl(value) {
  return getPathParts(value)[0] === 'fr' ? 'fr' : 'en';
}

function isArchiveUrl(value) {
  const pathname = new URL(normalizeUrl(value) || WORDPRESS_BASE_URL).pathname;

  return /retirements-list|liste-des-departs-a-la-retraite|last-post-years-archive|dernier-appel-archives-des-annees/iu.test(pathname);
}

function getSlug(value) {
  const parts = getPathParts(value);
  return parts.at(-1) || '';
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const pattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/giu;
  let match = pattern.exec(String(html || ''));

  while (match) {
    const link = normalizeUrl(new URL(match[1], baseUrl || WORDPRESS_BASE_URL).href);

    if (link) {
      links.add(link);
    }

    match = pattern.exec(String(html || ''));
  }

  return [...links];
}

function getAlternateLinks(html, baseUrl) {
  const alternates = {};
  const source = String(html || '');
  const patterns = [
    /<(?:link|a)\b[^>]*\bhreflang=["'](en|fr)(?:-[^"']*)?["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
    /<li\b[^>]*\bwpml-ls-item-(en|fr)\b[^>]*>[\s\S]*?<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/giu
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(source);

    while (match) {
      alternates[match[1].toLowerCase()] = normalizeUrl(
        new URL(match[2], baseUrl || WORDPRESS_BASE_URL).href
      );
      match = pattern.exec(source);
    }
  }

  return alternates;
}

function getPageTitle(html) {
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return title ? stripHtml(title[1]).replace(/\s+[|–-]\s+CMCEN.*$/iu, '').trim() : '';
}

function normalizeSubject(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/<[^>]+>/gu, ' ')
    .replace(/^(last\s+post|in\s+memoriam|retirement(?:\s+announcement)?|dernier(?:s)?\s+appel(?:s)?|depart(?:s)?\s+a\s+la\s+retraite|retraite|annonce\s+de\s+retraite)\s*[-:–]?\s*/iu, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function deriveFrenchLastPostUrl(englishUrl) {
  const slug = getSlug(englishUrl);

  if (!slug) {
    return '';
  }

  const frenchSlug = slug.replace(/^last-post-/iu, 'derniers-appels-');
  return `${WORDPRESS_BASE_URL}/fr/lp/${frenchSlug}/`;
}

function getPairKey(entry) {
  if (entry.alternateUrls?.en && entry.alternateUrls?.fr) {
    return `alternate:${entry.alternateUrls.en}:${entry.alternateUrls.fr}`;
  }

  return `${entry.contentType}:${normalizeSubject(entry.subject || entry.title)}`;
}

function pairEntries(entries) {
  const byUrl = new Map(entries.map(entry => [entry.url, entry]));
  const paired = new Set();
  const pairs = [];

  for (const entry of entries.filter(item => item.language === 'en')) {
    const alternateUrl = entry.alternateUrls?.fr ||
      (entry.contentType === 'last-post' ? deriveFrenchLastPostUrl(entry.url) : '');
    const french = byUrl.get(alternateUrl);

    if (french && french.contentType === entry.contentType) {
      paired.add(entry.url);
      paired.add(french.url);
      pairs.push({
        contentType: entry.contentType,
        en: entry,
        fr: french,
        pairing: entry.alternateUrls?.fr ? 'alternate-link' : 'derived-last-post-url',
        needsManualReview: false
      });
    }
  }

  const unmatched = entries.filter(entry => !paired.has(entry.url));
  const bySubject = new Map();
  unmatched.forEach(entry => {
    const key = getPairKey(entry);
    if (!key || key.endsWith(':')) {
      return;
    }

    const candidates = bySubject.get(key) || [];
    candidates.push(entry);
    bySubject.set(key, candidates);
  });

  for (const candidates of bySubject.values()) {
    const english = candidates.filter(entry => entry.language === 'en');
    const french = candidates.filter(entry => entry.language === 'fr');

    if (english.length === 1 && french.length === 1) {
      paired.add(english[0].url);
      paired.add(french[0].url);
      pairs.push({
        contentType: english[0].contentType,
        en: english[0],
        fr: french[0],
        pairing: 'normalized-subject',
        needsManualReview: false
      });
    }
  }

  return {
    pairs,
    unpaired: entries
      .filter(entry => !paired.has(entry.url))
      .map(entry => ({ ...entry, needsManualReview: true }))
  };
}

module.exports = {
  WORDPRESS_BASE_URL,
  deriveFrenchLastPostUrl,
  extractLinks,
  getAlternateLinks,
  getContentType,
  getLanguageFromUrl,
  getPageTitle,
  getSlug,
  isContentDetailUrl,
  isArchiveUrl,
  normalizeSubject,
  normalizeUrl,
  pairEntries
};
