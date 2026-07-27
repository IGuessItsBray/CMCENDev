require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env'),
});

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseArgs, resolvePath } = require('./lib/args');
const { writeJson } = require('./lib/wordpress');
const {
  WORDPRESS_BASE_URL,
  extractLinks,
  getAlternateLinks,
  getContentType,
  getLanguageFromUrl,
  getPageTitle,
  isArchiveUrl,
  isContentDetailUrl,
  normalizeUrl,
  pairEntries,
} = require('./lib/bilingual-inventory');

const SOURCES = Object.freeze([
  {
    contentType: 'retirement',
    language: 'en',
    url: `${WORDPRESS_BASE_URL}/retirements/retirements-list/`,
  },
  {
    contentType: 'retirement',
    language: 'fr',
    url: `${WORDPRESS_BASE_URL}/fr/departs-a-la-retraite/liste-des-departs-a-la-retraite/`,
  },
  {
    contentType: 'last-post',
    language: 'en',
    url: `${WORDPRESS_BASE_URL}/last-post-years-archive/`,
  },
  {
    contentType: 'last-post',
    language: 'fr',
    url: `${WORDPRESS_BASE_URL}/fr/dernier-appel-archives-des-annees/`,
  },
]);
const HEADERS = Object.freeze({
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-CA,en;q=0.9,fr-CA;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (compatible; CMCENContentMigration/1.0; +https://cmcen-rcmce.ca/)',
});
const args = parseArgs();
const content = new Set(
  String(args.content || 'all')
    .split(',')
    .map((value) => value.trim()),
);
const limit = args.limit ? Number(args.limit) : Infinity;
const batchSize = args['batch-size'] ? Number(args['batch-size']) : Infinity;
const delayMs = args['delay-ms'] ? Number(args['delay-ms']) : 350;
const retries = args.retries ? Number(args.retries) : 3;
const checkpointEvery = args['checkpoint-every']
  ? Number(args['checkpoint-every'])
  : 10;
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'bilingual-source-inventory.json'),
);
const checkpointPath = resolvePath(
  args.checkpoint,
  path.join(outputDir, 'bilingual-source-inventory.checkpoint.json'),
);

function acceptsContent(contentType) {
  return (
    content.has('all') ||
    content.has(contentType) ||
    content.has(`${contentType}s`)
  );
}

function pause(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, milliseconds)),
  );
}

function isRetryable(error) {
  const status = Number(error.response?.status || 0);
  return !status || status === 408 || status === 429 || status >= 500;
}

async function fetchText(url) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await axios.get(url, {
        responseType: 'text',
        timeout: 30000,
        headers: HEADERS,
      });
      return String(response.data || '');
    } catch (error) {
      if (attempt === retries || !isRetryable(error)) {
        throw error;
      }

      const retryAfter = Number(error.response?.headers?.['retry-after'] || 0);
      const backoffMs =
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(15000, 1000 * 2 ** attempt);
      console.log(`Retrying ${url} after ${backoffMs}ms`);
      await pause(backoffMs);
    }
  }

  return '';
}

async function getDetailEntry(url, expectedType) {
  const html = await fetchText(url);
  const alternates = getAlternateLinks(html, url);
  const normalizedUrl = normalizeUrl(url);

  return {
    url: normalizedUrl,
    contentType: expectedType,
    language: getLanguageFromUrl(normalizedUrl),
    title: getPageTitle(html),
    subject: getPageTitle(html),
    alternateUrls: alternates,
    source: 'archive-link',
  };
}

function makeManifest(entries, enabledSources, complete = false) {
  const uniqueEntries = [
    ...new Map(entries.map((entry) => [entry.url, entry])).values(),
  ];
  const { pairs, unpaired } = pairEntries(uniqueEntries);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    complete,
    sources: enabledSources,
    limit: Number.isFinite(limit) ? limit : 'all',
    batchSize: Number.isFinite(batchSize) ? batchSize : 'all',
    entries: uniqueEntries,
    pairs,
    unpaired,
    summary: {
      entries: uniqueEntries.length,
      pairs: pairs.length,
      pairedEntries: pairs.length * 2,
      unpairedEntries: unpaired.length,
      byContentType: Object.fromEntries(
        ['retirement', 'last-post'].map((type) => [
          type,
          {
            entries: uniqueEntries.filter((entry) => entry.contentType === type)
              .length,
            pairs: pairs.filter((pair) => pair.contentType === type).length,
            unpaired: unpaired.filter((entry) => entry.contentType === type)
              .length,
          },
        ]),
      ),
    },
  };
}

function loadCheckpoint() {
  if (!args.resume || !fs.existsSync(checkpointPath)) {
    return [];
  }

  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  return Array.isArray(checkpoint.entries) ? checkpoint.entries : [];
}

async function collectSource(source, existingEntries, onCheckpoint) {
  console.log(
    `Collecting ${source.language.toUpperCase()} ${source.contentType} archive`,
  );
  const archiveHtml = await fetchText(source.url);
  const links = extractLinks(archiveHtml, source.url)
    .filter((link) => !isArchiveUrl(link))
    .filter((link) => getContentType(link) === source.contentType)
    .filter((link) => isContentDetailUrl(link))
    .filter((link) => getLanguageFromUrl(link) === source.language);
  const processedUrls = new Set(
    existingEntries
      .filter((entry) => !entry.fetchError)
      .map((entry) => entry.url),
  );
  const sourceLinks = [...new Set(links)]
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .filter((link) => !processedUrls.has(link));
  const uniqueLinks = sourceLinks.slice(
    0,
    Number.isFinite(batchSize) ? batchSize : undefined,
  );
  const entries = [];
  let checkpointedEntryCount = 0;

  console.log(
    `Found ${links.length} ${source.language.toUpperCase()} ${source.contentType} detail links; ${uniqueLinks.length} queued this run`,
  );
  for (const [index, link] of uniqueLinks.entries()) {
    try {
      const entry = await getDetailEntry(link, source.contentType);
      entries.push(entry);

      // The French Last Post archive is incomplete. A source page's WPML link
      // is authoritative, so include it even when the French archive omits it.
      if (source.language === 'en' && entry.alternateUrls.fr) {
        const translated = await getDetailEntry(
          entry.alternateUrls.fr,
          source.contentType,
        );
        translated.source = 'alternate-link';
        entries.push(translated);
      }
      console.log(`[${index + 1}/${uniqueLinks.length}] Collected ${link}`);
    } catch (error) {
      entries.push({
        url: normalizeUrl(link),
        contentType: source.contentType,
        language: source.language,
        title: '',
        subject: '',
        alternateUrls: {},
        source: 'archive-link',
        needsManualReview: true,
        fetchError: error.message || String(error),
      });
      console.log(
        `[${index + 1}/${uniqueLinks.length}] Could not read ${link}`,
      );
    }

    if (
      (index + 1) % checkpointEvery === 0 ||
      index + 1 === uniqueLinks.length
    ) {
      await onCheckpoint(entries.slice(checkpointedEntryCount));
      checkpointedEntryCount = entries.length;
    }

    if (delayMs > 0 && index + 1 < uniqueLinks.length) {
      await pause(delayMs);
    }
  }

  return {
    entries,
    hasRemaining: sourceLinks.length > uniqueLinks.length,
  };
}

async function main() {
  const enabledSources = SOURCES.filter((source) =>
    acceptsContent(source.contentType),
  );
  const entries = loadCheckpoint();
  const writeCheckpoint = () => {
    writeJson(checkpointPath, makeManifest(entries, enabledSources, false));
    console.log(
      `Checkpointed ${entries.length} source entries: ${checkpointPath}`,
    );
  };

  let hasRemaining = false;

  for (const source of enabledSources) {
    const collected = await collectSource(
      source,
      entries,
      async (batchEntries) => {
        entries.push(...batchEntries);
        writeCheckpoint();
      },
    );
    hasRemaining = hasRemaining || collected.hasRemaining;
  }

  const manifest = makeManifest(entries, enabledSources, !hasRemaining);

  writeJson(manifestPath, manifest);
  writeJson(checkpointPath, manifest);
  console.log(
    `Wrote ${manifest.complete ? 'complete' : 'partial'} bilingual source inventory: ${manifestPath}`,
  );
  if (!manifest.complete) {
    console.log(`Resume with --resume --checkpoint=${checkpointPath}`);
  }
  console.log(
    `Paired ${manifest.summary.pairs} bilingual records; ${manifest.summary.unpairedEntries} need review.`,
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
