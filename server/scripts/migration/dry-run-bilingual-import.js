require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const axios = require('axios');
const path = require('path');
const { parseArgs, resolvePath } = require('./lib/args');
const { writeJson } = require('./lib/wordpress');
const { buildCandidates, getImageUrl, getPageContent } = require('./lib/bilingual-import');

const args = parseArgs();
const inputPath = resolvePath(args.input, path.join(__dirname, 'output', 'production-bilingual-source-inventory.json'));
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(args.manifest, path.join(outputDir, 'bilingual-import-dry-run-manifest.json'));
const checkpointPath = resolvePath(args.checkpoint, path.join(outputDir, 'bilingual-import-dry-run.checkpoint.json'));
const limit = args.limit ? Number(args.limit) : Infinity;
const delayMs = args['delay-ms'] ? Number(args['delay-ms']) : 350;
const headers = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (compatible; CMCENContentMigration/1.0; +https://cmcen-rcmce.ca/)'
};

if (args.apply) {
  throw new Error('This importer is dry-run only. Review its manifest before enabling any write path.');
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
}

async function fetchSource(source) {
  const response = await axios.get(source.url, { responseType: 'text', timeout: 30000, headers });
  const html = String(response.data || '');
  const message = getPageContent(html);
  const apiPostId = html.match(/wp-json\/wp\/v2\/posts\/(\d+)/iu)?.[1] || null;

  return {
    ...source,
    messageLength: message.length,
    message,
    imageUrl: getImageUrl(html, source.url),
    wordpressPostId: apiPostId ? Number(apiPostId) : null
  };
}

async function fetchComments(source) {
  let postId = source.wordpressPostId;
  if (!postId) {
    const slug = new URL(source.url).pathname.split('/').filter(Boolean).at(-1);
    const postResponse = await axios.get(
      `https://cmcen-rcmce.ca/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`,
      { responseType: 'json', timeout: 30000, headers }
    );
    postId = Array.isArray(postResponse.data) ? postResponse.data[0]?.id : null;
  }

  if (!postId) {
    return { postId: null, comments: [], issue: 'wordpress-post-not-found' };
  }

  const comments = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await axios.get(
      `https://cmcen-rcmce.ca/wp-json/wp/v2/comments?post=${postId}&per_page=100&status=approve&page=${page}`,
      { responseType: 'json', timeout: 30000, headers }
    );
    totalPages = Number(response.headers['x-wp-totalpages'] || 1);
    comments.push(...(Array.isArray(response.data) ? response.data : []));
    page += 1;
  }

  return {
    postId,
    comments: comments.map(comment => ({
      wordpressCommentId: comment.id,
      wordpressPostId: postId,
      sourceLanguage: source.language,
      sourceUrl: source.url,
      authorName: comment.author_name || 'WordPress Commenter',
      body: String(comment.content?.rendered || '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim(),
      publishedAt: comment.date_gmt || comment.date || null
    })).filter(comment => comment.body.length >= 2)
  };
}

function summarize(results) {
  return {
    candidates: results.length,
    bilingual: results.filter(result => !result.needsTranslation).length,
    needsTranslation: results.filter(result => result.needsTranslation).length,
    fetchFailures: results.filter(result => result.fetchError).length,
    identityReview: results.filter(result => result.issues.includes('identity-needs-review')).length,
    imageIssues: results.filter(result => result.imageIssues?.length).length,
    messageIssues: results.filter(result => result.messageIssues?.length).length,
    comments: results.reduce((sum, result) => sum + (result.comments?.length || 0), 0),
    commentIssues: results.filter(result => result.commentIssues?.length).length
  };
}

function writeCheckpoint(results, candidates) {
  writeJson(checkpointPath, {
    generatedAt: new Date().toISOString(),
    complete: results.length === candidates.length,
    sourceInventory: inputPath,
    candidateCount: candidates.length,
    results,
    summary: summarize(results)
  });
}

async function main() {
  const inventory = require(inputPath);
  if (!inventory.complete) {
    throw new Error('The source inventory is incomplete. Resume it before preparing an import.');
  }

  const candidates = buildCandidates(inventory).slice(0, limit);
  let results = [];
  if (args.resume) {
    const checkpoint = require(checkpointPath);
    if (checkpoint.sourceInventory !== inputPath || checkpoint.candidateCount !== candidates.length) {
      throw new Error('The import checkpoint does not match this inventory or candidate limit. Start a new checkpoint.');
    }
    results = checkpoint.results || [];
    if (results.length > candidates.length) {
      throw new Error('The import checkpoint has more results than this run allows. Start a new checkpoint.');
    }
    console.log(`Resuming from ${results.length}/${candidates.length} prepared candidates.`);
  }

  for (const [index, candidate] of candidates.entries()) {
    if (index < results.length) continue;
    const result = { ...candidate, sources: [] };
    try {
      for (const source of candidate.sources) {
        result.sources.push(await fetchSource(source));
        await pause();
      }

      result.messages = Object.fromEntries(result.sources.map(source => [source.language, source.message]));
      result.images = Object.fromEntries(result.sources.map(source => [source.language, source.imageUrl]));
      const commentResults = await Promise.all(result.sources.map(async source => {
        try {
          return await fetchComments(source);
        } catch (error) {
          const status = error.response?.status;
          return {
            postId: source.wordpressPostId || null,
            comments: [],
            issue: `comment-fetch-failed:${status || 'request'}`
          };
        }
      }));
      result.wordpressPostIds = Object.fromEntries(result.sources.map((source, sourceIndex) => [source.language, commentResults[sourceIndex].postId]));
      result.comments = [...new Map(
        commentResults.flatMap(commentResult => commentResult.comments)
          .map(comment => [comment.wordpressCommentId, comment])
      ).values()];
      result.commentIssues = commentResults.filter(commentResult => commentResult.issue).map(commentResult => commentResult.issue);
      result.imageIssues = result.sources
        .filter(source => !source.imageUrl)
        .map(source => `${source.language}-missing-image`);
      result.messageIssues = result.sources
        .filter(source => source.messageLength < 2)
        .map(source => `${source.language}-empty-message`);
      result.issues = [...result.issues, ...result.imageIssues, ...result.messageIssues, ...result.commentIssues];
    } catch (error) {
      result.issues = [...result.issues, 'source-fetch-failed'];
      result.fetchError = error.message || String(error);
    }
    results.push(result);
    writeCheckpoint(results, candidates);
    console.log(`[${index + 1}/${candidates.length}] Prepared ${candidate.contentType} candidate`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceInventory: inputPath,
    dryRun: true,
    complete: true,
    results,
    summary: summarize(results)
  };

  writeCheckpoint(results, candidates);
  writeJson(manifestPath, manifest);
  console.log(`Wrote dry-run import manifest: ${manifestPath}`);
  console.log(JSON.stringify(manifest.summary));
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
