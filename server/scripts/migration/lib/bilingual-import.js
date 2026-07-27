const { cleanString, stripHtml } = require('./wordpress');

const RANKS = Object.freeze([
  'CHIEF WARRANT OFFICER',
  'MASTER WARRANT OFFICER',
  'WARRANT OFFICER',
  'LIEUTENANT COLONEL',
  'LIEUTENANT-COLONEL',
  'BRIGADIER-GENERAL',
  'BRIGADIER GENERAL',
  'PETTY OFFICER 1ST CLASS',
  'CHIEF PETTY OFFICER 2ND CLASS',
  'MASTER CORPORAL',
  'LIEUTENANT',
  'COLONEL',
  'MAJOR',
  'CAPTAIN',
  'SERGEANT',
  'CORPORAL',
  'PRIVATE',
  'CWO',
  'MWO',
  'WO',
  'PO1',
  'PO2',
  'MCPL',
  'CPL',
  'SGT',
  'LT',
  'LTCOL',
  'LCOL',
  'BGEN',
  'MGEN',
  'LGEN',
  'GEN',
  'CIVILIAN',
  'MR.',
  'MR',
  'MS.',
  'MS',
]);

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&#038;/gu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;/giu, '-');
}

function getPageContent(html) {
  const source = String(html || '');
  const match = source.match(
    /<(?:div|section)\b[^>]*\bclass=["'][^"']*(?:entry-content|et_pb_post_content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/iu,
  );
  return cleanString(stripHtml(decodeHtml(match?.[1] || ''))).slice(0, 20000);
}

function getImageUrl(html, pageUrl) {
  const content = String(html || '');
  const match = content.match(
    /<(?:img)\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/iu,
  );

  if (!match || match[1].startsWith('data:')) {
    return '';
  }

  try {
    return new URL(decodeHtml(match[1]), pageUrl).href;
  } catch {
    return '';
  }
}

function parseSubject(title, contentType) {
  const cleanTitle = cleanString(decodeHtml(title))
    .replace(
      /^(?:last\s+post|in\s+memoriam|retirement(?:\s+announcement)?|dernier(?:s)?\s+appel(?:s)?|retraite|annonce\s+de\s+retraite)\s*[-:–]?\s*/iu,
      '',
    )
    .replace(/\s*\|\s*RCMCE\s*$/iu, '')
    .trim();
  const upperTitle = cleanTitle.toUpperCase();
  const rank =
    RANKS.find((value) =>
      new RegExp(`^${value.replace(/[.]/gu, '\\$&')}(?=\\s|,)`, 'iu').test(
        upperTitle,
      ),
    ) || '';
  const withoutRank = (rank ? cleanTitle.slice(rank.length) : cleanTitle)
    .replace(/^[\s,.-]+/u, '')
    .replace(/\s*(?:[-–])\s*\d[\d,\sA-Z.-]*$/iu, '')
    .replace(
      /,\s*(?:CD|MMM|OMM|MB|SMV|MSM|CISM|RCCS|RCN|CD1|CD2)(?:\s*,.*)?$/iu,
      '',
    )
    .replace(/[“”"]/gu, '')
    .trim();
  const names = withoutRank.split(/\s+/u).filter(Boolean);

  return {
    rank:
      rank || (contentType === 'last-post' ? 'Rank not provided' : 'Unknown'),
    firstName: names.length > 1 ? names[names.length - 2] : '',
    lastName: names.length ? names[names.length - 1] : '',
    confidence: rank && names.length > 1 ? 'title' : 'manual-review',
  };
}

function buildImportCandidate(record) {
  const sources = record.fr ? [record.en, record.fr] : [record.en];
  const sourceUrls = Object.fromEntries(
    sources.map((source) => [source.language, source.url]),
  );
  const identity = parseSubject(record.en.title, record.contentType);

  return {
    contentType: record.contentType,
    pairing: record.pairing || 'unpaired',
    needsTranslation: !record.fr,
    sourceUrls,
    identity,
    sources: sources.map((source) => ({
      language: source.language,
      url: source.url,
      title: source.title,
    })),
    issues:
      identity.confidence === 'manual-review' ? ['identity-needs-review'] : [],
  };
}

function buildCandidates(inventory) {
  const pairs = (inventory.pairs || []).map((pair) =>
    buildImportCandidate(pair),
  );
  const unpaired = (inventory.unpaired || [])
    .filter((entry) => entry.language === 'en' && !entry.fetchError)
    .map((entry) =>
      buildImportCandidate({ contentType: entry.contentType, en: entry }),
    );

  return [...pairs, ...unpaired];
}

module.exports = {
  buildCandidates,
  decodeHtml,
  getImageUrl,
  getPageContent,
  parseSubject,
};
