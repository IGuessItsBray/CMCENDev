require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env')
});

const path = require('path');

const axios = require('axios');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { parseArgs, resolvePath } = require('./lib/args');
const {
  assertPublicMediaBaseUrl,
  configurePublicMediaBaseUrl
} = require('./lib/public-media');
const { downloadSourceImage } = require('./lib/source-image');
const {
  LEGACY_SUBMITTER_RANK,
  normalizeDeceasedRank
} = require('./lib/legacy-rank');
const {
  cleanString,
  parseDate,
  stripHtml,
  writeJson
} = require('./lib/wordpress');
const LastPostMessage = require('../../models/LastPostMessage');
const LastPostComment = require('../../models/LastPostComment');
const MediaAsset = require('../../models/MediaAsset');
const User = require('../../models/User');
const { buildPublicMediaUrl } = require('../../services/media-library');
const { sanitizeImageMetadata } = require('../../services/media-assets');
const s3Client = require('../../storage');

const WORDPRESS_BASE_URL = 'https://cmcen-rcmce.ca';
const LAST_POST_ARCHIVE_URL = `${WORDPRESS_BASE_URL}/last-post-years-archive/`;
const DEFAULT_CATEGORY_SLUG = 'lp-category';
const CATEGORY_SLUG_FALLBACKS = Object.freeze([
  'lp-category',
  'last-post'
]);
const WORDPRESS_PAGE_SIZE = 100;
const IMAGE_VARIANTS = Object.freeze([
  { name: 'thumb', width: 400 },
  { name: 'medium', width: 900 },
  { name: 'large', width: 1600 },
  { name: 'hero', width: 2200 }
]);
const KNOWN_RANKS = Object.freeze([
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
  'CIVILIAN',
  'MR.',
  'MR',
  'MS.',
  'MS'
]);

const args = parseArgs();
const publicMediaBaseUrl = configurePublicMediaBaseUrl(args);
const apply = Boolean(args.apply);
const limit = args.limit ? Number(args.limit) : Infinity;
const categorySlug = String(args.category || DEFAULT_CATEGORY_SLUG);
const contentMode = ['all', 'last-posts', 'comments'].includes(String(args.content || 'all'))
  ? String(args.content || 'all')
  : 'all';
const shouldImportLastPosts = contentMode === 'all' || contentMode === 'last-posts';
const shouldImportComments = contentMode === 'all' || contentMode === 'comments';
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'current-last-post-scrape-manifest.json')
);

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&#038;/gu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&#8211;|&ndash;/giu, '-')
    .replace(/&#8212;|&mdash;/giu, '-')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/giu, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/giu, "'");
}

function slugify(value) {
  return cleanString(decodeHtml(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120) || 'last-post';
}

function getCleanExtension(value, fallback = 'jpg') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '') || fallback;
}

function getExtensionFromUrl(url, contentType = '') {
  try {
    const extension = path.extname(new URL(url).pathname).replace('.', '');

    if (extension) {
      return getCleanExtension(extension, 'jpg');
    }
  } catch {
    // Fall through to the content type.
  }

  return getCleanExtension(contentType.split('/').pop(), 'jpg');
}

function getPostTitle(post) {
  return cleanString(decodeHtml(post?.title?.rendered));
}

function getStableNumericId(value) {
  let hash = 0;

  String(value || '').split('').forEach(character => {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  });

  return Math.abs(hash) + 900000000;
}

function getPostSlugFromLink(value) {
  try {
    const url = new URL(decodeHtml(value), WORDPRESS_BASE_URL);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'lp' || !parts[1]) {
      return '';
    }

    return parts[1];
  } catch {
    return '';
  }
}

function getEmbeddedImageUrl(post) {
  if (post?.sourceImageUrl) {
    return normalizeMediaUrl(post.sourceImageUrl);
  }

  return normalizeMediaUrl(post?._embedded?.['wp:featuredmedia']?.[0]?.source_url);
}

function getFirstContentImageUrl(post) {
  const contentHtml = String(post?.content?.rendered || '');
  const match = contentHtml.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/iu);

  return match ? normalizeMediaUrl(match[1]) : '';
}

function getImageUrl(post) {
  return getEmbeddedImageUrl(post) || getFirstContentImageUrl(post);
}

function normalizeMediaUrl(value, fallback = '') {
  const rawUrl = cleanString(decodeHtml(value));

  if (!rawUrl || rawUrl.startsWith('data:')) {
    return fallback;
  }

  try {
    return new URL(rawUrl, WORDPRESS_BASE_URL).href;
  } catch {
    return fallback;
  }
}

function getLanguage(post) {
  const title = getPostTitle(post);
  const content = stripHtml(decodeHtml(post?.content?.rendered));

  return /[ÉÈÊÀÂÇÙÛÎÔœàâçéèêëîïôùûüÿ]/u.test(`${title} ${content}`)
    ? 'fr'
    : 'en';
}

function getCommentBody(comment) {
  return stripHtml(decodeHtml(comment?.content?.rendered || comment?.content || ''));
}

function getCommentStatus(comment) {
  if (comment?.status === 'approved' || comment?.status === 'approve') {
    return 'published';
  }

  return 'pending';
}

function getWordPressCommentAuthorName(comment) {
  return cleanString(decodeHtml(comment?.author_name || comment?.authorName || 'WordPress commenter'));
}

function normalizeLastPostDate(value) {
  const cleanValue = cleanString(decodeHtml(value))
    .replace(/\s+/gu, ' ')
    .trim();

  if (!cleanValue) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-Z]+)?$/u.test(cleanValue)) {
    return cleanValue;
  }

  const humanDateMatch = cleanValue.match(
    /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/u
  );

  if (humanDateMatch) {
    const [, dayValue, monthValue, yearValue] = humanDateMatch;
    const parsed = new Date(`${monthValue} ${dayValue}, ${yearValue.length === 2 ? `20${yearValue}` : yearValue}`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return cleanValue;
}

function getPublishedAt(post) {
  const normalizedDate = normalizeLastPostDate(post.date_gmt || post.date);
  const parsedDate = parseDate(normalizedDate);

  if (!parsedDate || Number.isNaN(new Date(parsedDate).getTime())) {
    console.log(`No valid published date found for Last Post ${post.id}; leaving publishedAt empty`);
    return null;
  }

  return parsedDate;
}

function parseDeceased(title) {
  const cleanTitle = title
    .replace(/^LAST\s+POST\s*[-–:]?\s*/iu, '')
    .replace(/^IN\s+MEMORIAM\s*[-–:]?\s*/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const postNominalsMatch = cleanTitle.match(
    /,\s*([A-Z][A-Z. -]*(?:,\s*[A-Z][A-Z. -]*)*)\s*$/u
  );
  const nameTitle = postNominalsMatch
    ? cleanTitle.slice(0, postNominalsMatch.index).trim()
    : cleanTitle;
  const rank = KNOWN_RANKS.find(value =>
    nameTitle.toUpperCase().startsWith(`${value} `) ||
    nameTitle.toUpperCase() === value
  ) || '';
  const nameOnly = (rank ? nameTitle.slice(rank.length) : nameTitle)
    .replace(/[“"][^”"]+[”"]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const parts = nameOnly.split(/\s+/u).filter(Boolean);

  return {
    fullRank: normalizeDeceasedRank(rank),
    firstName: parts.length >= 2 ? parts[parts.length - 2].replace(/[",]/gu, '') : '',
    surname: parts.length >= 1 ? parts[parts.length - 1].replace(/[",]/gu, '') : '',
    postNominal: postNominalsMatch
      ? postNominalsMatch[1].split(',').map(value => value.trim()).filter(Boolean).join(', ')
      : ''
  };
}

function toPostDocument(post, mediaResult) {
  const title = getPostTitle(post);
  const message = stripHtml(decodeHtml(post.content?.rendered)) || title;
  const language = getLanguage(post);
  const publishedAt = getPublishedAt(post);

  return {
    title: title || `Legacy Last Post ${post.id}`,
    slug: post.slug || slugify(title),
    messageLanguage: language,
    messages: {
      [language]: message
    },
    imageUrl: mediaResult?.asset?.url || getImageUrl(post),
    photoUrl: mediaResult?.asset?.url || getImageUrl(post),
    deceased: parseDeceased(title),
    submitter: {
      rank: LEGACY_SUBMITTER_RANK,
      firstName: 'Live Site',
      lastName: 'Import',
      email: 'legacy-import@cmcen.local'
    },
    status: post.status === 'publish' ? 'published' : 'pending',
    publishedAt: post.status === 'publish' ? publishedAt : null,
    legacy: {
      source: 'cmcen-live-site',
      postId: post.id,
      wordpressPostId: post.id,
      postType: post.type || 'post',
      guid: post.guid?.rendered || '',
      slug: post.slug || '',
      authorId: post.author || null,
      importedAt: new Date(),
      raw: {
        url: post.link || '',
        title,
        sourceImageUrl: mediaResult?.sourceUrl || getImageUrl(post),
        mediaAssetKey: mediaResult?.asset?.key || '',
        scrapedFrom: LAST_POST_ARCHIVE_URL
      }
    }
  };
}

async function fetchJsonResponse(url) {
  const response = await axios.get(url, {
    responseType: 'json',
    timeout: 30000,
    headers: {
      'User-Agent': 'CMCEN migration script'
    }
  });

  return response;
}

async function fetchJson(url) {
  return (await fetchJsonResponse(url)).data;
}

async function fetchText(url, { allowNotFound = false } = {}) {
  const response = await axios.get(url, {
    responseType: 'text',
    timeout: 30000,
    validateStatus: status => status < 400 || (allowNotFound && status === 404),
    headers: {
      'User-Agent': 'CMCEN migration script'
    }
  });

  if (response.status === 404) {
    return '';
  }

  return String(response.data || '');
}

function getTotalPages(response) {
  const totalPages = Number(response.headers?.['x-wp-totalpages'] || 1);

  return Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1;
}

async function getCategoryId() {
  const categorySlugs = Array.from(new Set([
    categorySlug,
    ...CATEGORY_SLUG_FALLBACKS
  ].filter(Boolean)));

  for (const slug of categorySlugs) {
    console.log(`Looking up WordPress category "${slug}"`);
    const categories = await fetchJson(
      `${WORDPRESS_BASE_URL}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}`
    );
    const category = Array.isArray(categories) ? categories[0] : null;

    if (category?.id) {
      if (slug !== categorySlug) {
        console.log(`Using fallback WordPress category "${slug}" for Last Post notices`);
      }

      return category.id;
    }
  }

  throw new Error(`Could not find a WordPress Last Post category. Tried: ${categorySlugs.join(', ')}.`);
}

function getArchivePageLinks(html) {
  return Array.from(String(html || '').matchAll(/href=["']([^"']+)["']/giu))
    .map(match => decodeHtml(match[1]))
    .filter(value => /\/last-post\/page\/\d+\/?/iu.test(value))
    .map(value => {
      try {
        return new URL(value, WORDPRESS_BASE_URL).href;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function getLastPostSlugs(html) {
  return Array.from(String(html || '').matchAll(/href=["']([^"']*\/lp\/[^"']+)["']/giu))
    .map(match => getPostSlugFromLink(match[1]))
    .filter(Boolean);
}

async function fetchPostBySlug(slug) {
  console.log(`Resolving Last Post slug through WordPress REST: ${slug}`);
  const posts = await fetchJson(
    `${WORDPRESS_BASE_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`
  );
  const post = Array.isArray(posts) ? posts[0] : null;

  if (!post?.id) {
    console.log(`REST post not found for ${slug}; scraping the /lp/ page HTML`);

    try {
      return await fetchPostFromPage(slug);
    } catch (error) {
      console.log(`Skipping Last Post slug ${slug}: ${error.message || 'page scrape failed'}`);
      return null;
    }
  }

  return post;
}

function extractFirstMatch(html, pattern) {
  const match = String(html || '').match(pattern);

  return match ? decodeHtml(match[1]) : '';
}

function extractLastPostHtmlContent(html) {
  const sourceHtml = String(html || '');
  const bodyMatch = sourceHtml.match(
    /<div\b[^>]*class=["'][^"']*\bet_pb_cpt_text_0\b[^"']*["'][^>]*>([\s\S]*?)(?=<div class=["']et_pb_section et_pb_section_4\b|<div class=["']et_pb_button_module_wrapper\b)/iu
  );

  if (!bodyMatch) {
    return '';
  }

  return bodyMatch[1]
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/^\s*["']?\s*>\s*/u, '');
}

function extractLastPostImageUrl(html) {
  return normalizeMediaUrl(
    extractFirstMatch(
      html,
      /et_pb_acf_single_item_0[\s\S]*?(?:data-src|src)=["']([^"']+)["']/iu
    )
  );
}

async function fetchPostFromPage(slug) {
  const url = `${WORDPRESS_BASE_URL}/lp/${encodeURIComponent(slug)}/`;
  const html = await fetchText(url, { allowNotFound: true });

  if (!html) {
    console.log(`Skipping Last Post slug ${slug}: /lp/ page returned 404`);
    return null;
  }

  const title = cleanString(
    extractFirstMatch(html, /<h1[^>]*class=["'][^"']*cpt_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/iu)
      .replace(/<[^>]+>/gu, '')
  ) || cleanString(
    extractFirstMatch(html, /<title>([\s\S]*?)<\/title>/iu)
      .replace(/\s*\|\s*CMCEN\s*$/iu, '')
      .replace(/<[^>]+>/gu, '')
  );
  const publishedLabel = normalizeLastPostDate(
    cleanString(
      extractFirstMatch(html, /<span class=["']published["'][^>]*>([\s\S]*?)<\/span>/iu)
        .replace(/<[^>]+>/gu, ' ')
    )
  );
  const contentHtml = extractLastPostHtmlContent(html);
  const imageUrl = extractLastPostImageUrl(html);
  const wordpressPostId = Number(
    extractFirstMatch(html, /\bpostid-(\d+)\b/iu)
  ) || getStableNumericId(slug);

  if (/^404\s+not\s+found$/iu.test(title)) {
    console.log(`Skipping Last Post slug ${slug}: /lp/ page is a 404 page`);
    return null;
  }

  return {
    id: wordpressPostId,
    date: publishedLabel,
    date_gmt: publishedLabel,
    guid: {
      rendered: url
    },
    slug,
    status: 'publish',
    type: 'lp',
    link: url,
    title: {
      rendered: title || slug
    },
    content: {
      rendered: contentHtml || title || slug
    },
    author: null,
    featured_media: 0,
    sourceImageUrl: imageUrl
  };
}

async function getLatestPostsFromArchive() {
  const queue = [LAST_POST_ARCHIVE_URL];
  const seenPages = new Set();
  const seenSlugs = new Set();
  const posts = [];

  while (queue.length && posts.length < limit) {
    const pageUrl = queue.shift();

    if (seenPages.has(pageUrl)) {
      continue;
    }

    seenPages.add(pageUrl);
    console.log(`Scanning Last Post archive page: ${pageUrl}`);

    const html = await fetchText(pageUrl);
    const slugs = getLastPostSlugs(html);
    const totalToCollect = Number.isFinite(limit)
      ? Math.min(seenSlugs.size + slugs.filter(slug => !seenSlugs.has(slug)).length, limit)
      : seenSlugs.size + slugs.filter(slug => !seenSlugs.has(slug)).length;
    console.log(`Found ${slugs.length} Last Post links on archive page`);

    for (const slug of slugs) {
      if (seenSlugs.has(slug) || posts.length >= limit) {
        continue;
      }

      seenSlugs.add(slug);
      const post = await fetchPostBySlug(slug);

      if (post) {
        posts.push(post);
        console.log(`[${posts.length}/${totalToCollect}] Collected Last Post ${post.id}: ${getPostTitle(post)}`);
      }
    }

    getArchivePageLinks(html).forEach(link => {
      if (!seenPages.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    });
  }

  return posts;
}

async function getLatestPosts(categoryId) {
  const posts = [];
  let page = 1;
  let totalPages = 1;

  console.log(`Fetching WordPress Last Post notices for category ${categoryId}`);

  while (page <= totalPages && posts.length < limit) {
    const perPage = Number.isFinite(limit)
      ? Math.min(WORDPRESS_PAGE_SIZE, limit - posts.length)
      : WORDPRESS_PAGE_SIZE;
    const response = await fetchJsonResponse(
      `${WORDPRESS_BASE_URL}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&categories=${categoryId}&_embed=1`
    );
    const pagePosts = Array.isArray(response.data) ? response.data : [];

    totalPages = getTotalPages(response);
    posts.push(...pagePosts);
    console.log(`Fetched Last Post page ${page}/${totalPages} (${posts.length} collected)`);

    if (pagePosts.length === 0) {
      break;
    }

    page += 1;
  }

  return Number.isFinite(limit) ? posts.slice(0, limit) : posts;
}

async function getPostComments(post) {
  const postId = post.id;
  const comments = [];
  let page = 1;
  let totalPages = 1;

  console.log(`Fetching approved comments for WordPress Last Post ${postId}`);

  while (page <= totalPages) {
    let response;

    try {
      response = await fetchJsonResponse(
        `${WORDPRESS_BASE_URL}/wp-json/wp/v2/comments?post=${postId}&per_page=${WORDPRESS_PAGE_SIZE}&page=${page}&status=approve`
      );
    } catch (error) {
      const status = error.response?.status;

      if (status === 401 || status === 403 || status === 404) {
        post.commentFetchError = `WordPress comments REST endpoint returned ${status}`;
        console.log(`Skipping Last Post comments for ${postId}: ${post.commentFetchError}`);
        return comments;
      }

      throw error;
    }

    const pageComments = Array.isArray(response.data) ? response.data : [];

    totalPages = getTotalPages(response);
    comments.push(...pageComments);
    console.log(`Fetched Last Post comment page ${page}/${totalPages} for post ${postId} (${comments.length} collected)`);

    if (pageComments.length === 0) {
      break;
    }

    page += 1;
  }

  return comments;
}

async function getLatestLastPostPosts() {
  const archivePosts = await getLatestPostsFromArchive();

  if (archivePosts.length) {
    return {
      posts: Number.isFinite(limit) ? archivePosts.slice(0, limit) : archivePosts,
      sourceType: 'archive-links',
      categoryId: null
    };
  }

  console.log('No /lp/ links found on the Last Post archive; falling back to category scan');
  const categoryId = await getCategoryId();

  return {
    posts: await getLatestPosts(categoryId),
    sourceType: 'category',
    categoryId
  };
}

async function getLegacyImportUser() {
  return User.findOneAndUpdate(
    { username: 'LegacyImport' },
    {
      $setOnInsert: {
        accountType: 'ghost',
        username: 'LegacyImport',
        email: 'legacy-import@cmcen.local',
        password: randomUUID(),
        accountName: 'Legacy Import',
        firstName: 'Legacy',
        lastName: 'Import',
        preferredLanguage: 'en',
        role: 'subscriber',
        isEmailVerified: true,
        consent: {
          privacyAccepted: true,
          privacyAcceptedAt: new Date(),
          caslAccepted: false,
          caslAcceptedAt: null
        }
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
}

async function getWordPressCommentAuthor(comment) {
  const authorName = getWordPressCommentAuthorName(comment);
  const username = `wp-comment-${slugify(authorName)}`.slice(0, 80);

  return User.findOneAndUpdate(
    { username },
    {
      $setOnInsert: {
        accountType: 'ghost',
        username,
        email: `${username}@cmcen.local`,
        password: randomUUID(),
        accountName: authorName,
        firstName: authorName.split(/\s+/u)[0] || authorName,
        lastName: authorName.split(/\s+/u).slice(1).join(' ') || 'Commenter',
        preferredLanguage: 'en',
        role: 'subscriber',
        isEmailVerified: true,
        consent: {
          privacyAccepted: true,
          privacyAcceptedAt: new Date(),
          caslAccepted: false,
          caslAcceptedAt: null
        }
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
}

function summarizeComments(comments) {
  return comments.map(comment => ({
    wordpressCommentId: comment.id,
    authorName: getWordPressCommentAuthorName(comment),
    status: getCommentStatus(comment),
    publishedAt: parseDate(comment.date_gmt || comment.date),
    bodyLength: getCommentBody(comment).length
  }));
}

async function importComments({ comments, lastPostMessage, legacyImportUser }) {
  const importedComments = [];

  for (const comment of comments) {
    const body = getCommentBody(comment);

    if (body.length < 2) {
      console.log(`Skipping Last Post comment ${comment.id}: empty body`);
      continue;
    }

    const author = await getWordPressCommentAuthor(comment);
    const publishedAt = parseDate(comment.date_gmt || comment.date);
    const status = getCommentStatus(comment);
    const document = {
      lastPostMessage: lastPostMessage._id,
      author: author._id,
      body,
      status,
      reviewedBy: legacyImportUser?._id || null,
      reviewedAt: status === 'published' ? publishedAt || new Date() : null,
      publishedBy: status === 'published' ? legacyImportUser?._id || null : null,
      publishedAt: status === 'published' ? publishedAt || null : null,
      legacy: {
        source: 'cmcen-live-site',
        wordpressPostId: lastPostMessage.legacy?.postId || lastPostMessage.legacy?.wordpressPostId,
        wordpressCommentId: comment.id,
        parentCommentId: comment.parent || null,
        authorName: getWordPressCommentAuthorName(comment),
        authorUrl: comment.author_url || '',
        importedAt: new Date()
      }
    };
    const importedComment = await LastPostComment.findOneAndUpdate(
      {
        'legacy.source': 'cmcen-live-site',
        'legacy.wordpressCommentId': comment.id
      },
      { $set: document },
      { new: true, upsert: true, runValidators: true }
    );

    importedComments.push(importedComment);
    console.log(`Upserted Last Post comment ${comment.id}`);
  }

  return importedComments;
}

async function putObject({ key, body, contentType }) {
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.MINIO_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
}

async function uploadImageForPost(post) {
  const sourceUrl = getImageUrl(post);
  const sourceImage = await downloadSourceImage(sourceUrl, {
    validateImage: buffer => sharp(buffer).rotate().raw().toBuffer()
  });

  if (sourceImage.usedFallback) {
    console.log(`Source image ${sourceImage.fallbackReason} for Last Post ${post.id}; using jimmy-crest.webp`);
  } else {
    console.log(`Downloaded source image for Last Post ${post.id}: ${sourceUrl}`);
  }

  const buffer = sourceImage.buffer;
  const contentType = sourceImage.contentType;
  const extension = sourceImage.usedFallback
    ? 'webp'
    : getExtensionFromUrl(sourceUrl, contentType);
  const baseKey = `legacy/current-site/last-post/${post.id}-${slugify(post.slug || getPostTitle(post))}`;
  const originalKey = `${baseKey}/original.${extension}`;
  const metadata = await sharp(buffer).metadata();
  const variants = {};

  console.log(`Uploading original image for Last Post ${post.id}`);
  await putObject({
    key: originalKey,
    body: buffer,
    contentType
  });

  await Promise.all(IMAGE_VARIANTS.map(async variant => {
    const width = metadata.width ? Math.min(metadata.width, variant.width) : variant.width;
    const variantBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width,
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const key = `${baseKey}/${variant.name}.webp`;

    await putObject({
      key,
      body: variantBuffer.data,
      contentType: 'image/webp'
    });

    variants[variant.name] = {
      key,
      url: buildPublicMediaUrl(key),
      width: variantBuffer.info.width,
      height: variantBuffer.info.height,
      size: variantBuffer.info.size,
      mimeType: 'image/webp'
    };
    console.log(`Uploaded ${variant.name} image variant for Last Post ${post.id}`);
  }));

  const title = getPostTitle(post);
  const assetDocument = {
    key: originalKey,
    url: buildPublicMediaUrl(variants.large?.key || variants.hero?.key || originalKey),
    originalKey,
    originalUrl: buildPublicMediaUrl(originalKey),
    originalName: sourceImage.originalName || `${slugify(title)}.${extension}`,
    displayName: title || `Last Post ${post.id}`,
    mimeType: contentType,
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: buffer.length,
    variants,
    uploadContext: {
      type: 'migration',
      context: 'last-post',
      sourceId: String(post.id),
      sourceModel: 'WordPressPost',
      sourceField: 'imageUrl',
      sourceUrl: post.link || sourceUrl,
      label: title || `Last Post ${post.id}`,
      linkedAt: new Date()
    },
    inferredName: title || `Last Post ${post.id}`,
    fileMetadata: {
      originalName: sourceImage.originalName || `${slugify(title)}.${extension}`,
      mimeType: contentType,
      size: buffer.length,
      storageKey: originalKey,
      sourceUrl,
      usedFallback: sourceImage.usedFallback,
      fallbackReason: sourceImage.fallbackReason,
      fallbackAsset: sourceImage.usedFallback ? 'jimmy-crest' : '',
      fallbackSourceUrl: sourceImage.fallbackSourceUrl
    },
    imageMetadata: sanitizeImageMetadata(metadata),
    uploadedBy: null
  };
  const asset = await MediaAsset.findOneAndUpdate(
    { key: originalKey },
    { $set: assetDocument },
    { new: true, upsert: true, runValidators: true }
  );

  console.log(`Upserted media asset for Last Post ${post.id}: ${originalKey}`);

  return {
    sourceUrl,
    asset: asset.toObject()
  };
}

function summarize(post, document, mediaResult) {
  const language = document.messageLanguage;
  const message = document.messages?.[language] || document.messages?.en || document.messages?.fr || '';

  return {
    wordpressPostId: post.id,
    title: document.title,
    url: post.link || '',
    status: document.status,
    publishedAt: document.publishedAt,
    deceased: document.deceased,
    messageLength: message.length,
    sourceImageUrl: mediaResult?.sourceUrl || getImageUrl(post),
    mediaAssetKey: mediaResult?.asset?.key || '',
    imageUrl: document.imageUrl,
    imported: apply
  };
}

async function main() {
  if (apply && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  if (apply && shouldImportLastPosts && !process.env.MINIO_BUCKET_NAME) {
    throw new Error('MINIO_BUCKET_NAME is not configured.');
  }

  if (apply && shouldImportLastPosts) {
    assertPublicMediaBaseUrl(publicMediaBaseUrl);
    console.log(`Public media base URL: ${publicMediaBaseUrl}`);
  }

  const {
    posts,
    sourceType,
    categoryId
  } = await getLatestLastPostPosts();
  const results = [];
  let legacyImportUser = null;

  console.log(`Collected ${posts.length} Last Post notices`);

  if (apply) {
    console.log('Connecting to MongoDB');
    await mongoose.connect(process.env.MONGO_URI);
    legacyImportUser = await getLegacyImportUser();
    console.log('Legacy import user is ready');
  }

  for (const [index, post] of posts.entries()) {
    const progressLabel = `${index + 1}/${posts.length}`;
    let mediaResult = null;
    let lastPostMessage = null;
    let stage = 'fetch-comments';

    try {
    console.log(`[${progressLabel}] Processing WordPress Last Post message ${post.id}: ${getPostTitle(post)}`);
    const comments = await getPostComments(post);

    if (apply && shouldImportLastPosts) {
      stage = 'upload-image';
      mediaResult = await uploadImageForPost(post);
    }

    stage = 'build-message';
    const document = toPostDocument(post, mediaResult);
    const language = document.messageLanguage;
    const message = document.messages?.[language] || '';

    if (message.length < 2) {
      results.push({
        wordpressPostId: post.id,
        title: document.title,
        imported: false,
        error: 'Message is shorter than the LastPostMessage minimum length.'
      });
      console.log(`[${progressLabel}] Skipping Last Post message ${post.id}: message too short`);
      continue;
    }

    if (apply && shouldImportLastPosts) {
      stage = 'upsert-message';
      console.log(`[${progressLabel}] Upserting Last Post message for WordPress post ${post.id}`);
      lastPostMessage = await LastPostMessage.findOneAndUpdate(
        {
          'legacy.source': 'cmcen-live-site',
          'legacy.postId': post.id
        },
        { $set: document },
        { new: true, upsert: true, runValidators: true }
      );
    } else if (apply && shouldImportComments) {
      console.log(`[${progressLabel}] Finding migrated Last Post message for WordPress post ${post.id}`);
      lastPostMessage = await LastPostMessage.findOne({
        'legacy.source': 'cmcen-live-site',
        'legacy.postId': post.id
      });
    }

    const summary = summarize(post, document, mediaResult);
    summary.comments = summarizeComments(comments);
    summary.commentFetchError = post.commentFetchError || '';

    if (apply && shouldImportComments) {
      if (!lastPostMessage) {
        summary.error = 'Last Post message must be migrated before importing comments.';
        results.push(summary);
        console.log(`[${progressLabel}] Skipping comments for Last Post ${post.id}: migrated message not found`);
        continue;
      }

      stage = 'import-comments';
      const importedComments = await importComments({
        comments,
        lastPostMessage,
        legacyImportUser
      });
      summary.commentsImported = importedComments.length;
    }

    results.push(summary);

    if (shouldImportLastPosts) {
      console.log(`[${progressLabel}] ${apply ? 'Imported' : 'Would import'} Last Post message ${post.id}: ${document.title}`);
    }

    if (shouldImportComments) {
      console.log(`[${progressLabel}] ${apply ? 'Imported' : 'Would import'} ${summary.comments.length} Last Post comments for ${post.id}`);
    }
    } catch (error) {
      const errorMessage = error?.message || String(error);
      results.push({
        wordpressPostId: post.id,
        title: getPostTitle(post),
        imported: Boolean(lastPostMessage),
        skipped: true,
        failedStage: stage,
        error: errorMessage
      });
      console.error(`[${progressLabel}] Skipping Last Post message ${post.id} after ${stage} failed: ${errorMessage}`);
    }
  }

  if (apply) {
    console.log('Disconnecting from MongoDB');
    await mongoose.disconnect();
  }

  console.log(`Writing manifest: ${manifestPath}`);
  writeJson(manifestPath, {
    source: LAST_POST_ARCHIVE_URL,
    sourceType,
    categoryId,
    limit: Number.isFinite(limit) ? limit : 'all',
    contentMode,
    apply,
    scrapedAt: new Date().toISOString(),
    results
  });

  console.log(`${apply ? 'Imported' : 'Would import'} ${shouldImportLastPosts ? results.filter(result => !result.error).length : 0} Last Post messages.`);
  console.log(`${apply ? 'Imported' : 'Would import'} ${shouldImportComments ? results.reduce((sum, result) => sum + (result.comments?.length || 0), 0) : 0} Last Post comments.`);
  console.log(`Wrote manifest: ${manifestPath}`);
}

main().catch(async error => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.error(error.message || error);
  process.exit(1);
});
