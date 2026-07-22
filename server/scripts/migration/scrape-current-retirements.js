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
  cleanString,
  parseDate,
  stripHtml,
  writeJson
} = require('./lib/wordpress');
const MediaAsset = require('../../models/MediaAsset');
const RetirementComment = require('../../models/RetirementComment');
const RetirementMessage = require('../../models/RetirementMessage');
const User = require('../../models/User');
const { buildPublicMediaUrl } = require('../../services/media-library');
const { sanitizeImageMetadata } = require('../../services/media-assets');
const s3Client = require('../../storage');

const WORDPRESS_BASE_URL = 'https://cmcen-rcmce.ca';
const RETIREMENT_LIST_URL = `${WORDPRESS_BASE_URL}/retirements/retirements-list/`;
const DEFAULT_CATEGORY_SLUG = 'retirements';
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
const MONTHS = Object.freeze({
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
});

const args = parseArgs();
const apply = Boolean(args.apply);
const limit = args.limit ? Number(args.limit) : Infinity;
const categorySlug = String(args.category || DEFAULT_CATEGORY_SLUG);
const contentMode = ['all', 'retirements', 'comments'].includes(String(args.content || 'all'))
  ? String(args.content || 'all')
  : 'all';
const shouldImportRetirements = contentMode === 'all' || contentMode === 'retirements';
const shouldImportComments = contentMode === 'all' || contentMode === 'comments';
const postScanLabel = contentMode === 'comments'
  ? 'retirement parent post'
  : 'retirement post';
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'current-retirement-scrape-manifest.json')
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
    .slice(0, 120) || 'retirement-message';
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

function getEmbeddedImageUrl(post) {
  return post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
}

function getFirstContentImageUrl(post) {
  const contentHtml = String(post?.content?.rendered || '');
  const match = contentHtml.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/iu);

  return match ? decodeHtml(match[1]) : '';
}

function getImageUrl(post) {
  return getEmbeddedImageUrl(post) || getFirstContentImageUrl(post);
}

function getPostSlugFromLink(value) {
  try {
    const url = new URL(decodeHtml(value), WORDPRESS_BASE_URL);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length !== 1 || parts[0] === 'retirements') {
      return '';
    }

    if (!parts[0].toLowerCase().includes('retirement')) {
      return '';
    }

    return parts[0];
  } catch {
    return '';
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
  return stripHtml(decodeHtml(comment?.content?.rendered))
    .slice(0, 2000);
}

function getCommentStatus(comment) {
  return comment?.status === 'approved' ? 'published' : 'pending';
}

function getWordPressCommentAuthorName(comment) {
  return cleanString(decodeHtml(comment?.author_name)) || 'WordPress Commenter';
}

function parseRetirementDate(content) {
  const cleanContent = cleanString(content);
  const datePattern = String.raw`((?:\d{1,2}\s+[A-Z]{3,9}|[A-Z]{3,9}\s+\d{1,2}),?\s+\d{4})`;
  const patterns = [
    new RegExp(String.raw`\b(?:shall\s+retire|will\s+retire|retires?|retired|release|departing)[^.]{0,160}?\b(?:on|effective|as of)\s+${datePattern}`, 'iu'),
    new RegExp(String.raw`\b(?:retirement|retirement\s+date|date\s+of\s+retirement)\s*[:\-]\s*${datePattern}`, 'iu'),
    new RegExp(String.raw`\b(?:on|effective|as of)\s+${datePattern}[^.]{0,80}?\b(?:retire|retirement|release)`, 'iu')
  ];
  const match = patterns
    .map(pattern => cleanContent.match(pattern))
    .find(Boolean);

  if (!match) {
    return null;
  }

  return parseArticleDate(match[1]);
}

function parseArticleDate(value) {
  const cleanValue = cleanString(value)
    .replace(/,/gu, '')
    .replace(/\s+/gu, ' ');
  const dayFirst = cleanValue.match(/^(\d{1,2})\s+([A-Z]{3,9})\s+(\d{4})$/iu);
  const monthFirst = cleanValue.match(/^([A-Z]{3,9})\s+(\d{1,2})\s+(\d{4})$/iu);
  const parts = dayFirst
    ? {
      day: Number(dayFirst[1]),
      month: MONTHS[dayFirst[2].toLowerCase()],
      year: Number(dayFirst[3])
    }
    : monthFirst
      ? {
        day: Number(monthFirst[2]),
        month: MONTHS[monthFirst[1].toLowerCase()],
        year: Number(monthFirst[3])
      }
      : null;

  if (!parts || parts.month === undefined) {
    return null;
  }

  return new Date(Date.UTC(parts.year, parts.month, parts.day));
}

function parseRetiree(title, content) {
  const cleanTitle = title
    .replace(/^RETIREMENT\s+(ANNOUNCEMENT\s+)?[-–:]?\s*/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const withoutTrade = cleanTitle.split(/\s+[-–]\s+\d{3,}/u)[0];
  const postNominalsMatch = withoutTrade.match(
    /,\s*([A-Z][A-Z. -]*(?:,\s*[A-Z][A-Z. -]*)*)\s*$/u
  );
  const nameTitle = postNominalsMatch
    ? withoutTrade.slice(0, postNominalsMatch.index).trim()
    : withoutTrade;
  const rank = KNOWN_RANKS.find(value =>
    nameTitle.toUpperCase().startsWith(`${value} `) ||
    nameTitle.toUpperCase() === value
  ) || '';
  const nameOnly = (rank ? nameTitle.slice(rank.length) : nameTitle)
    .replace(/[“"][^”"]+[”"]/gu, '')
    .replace(/\b[A-Z]\.\s+(?=[A-Z][A-Z'-]+$)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const parts = nameOnly.split(/\s+/u).filter(Boolean);
  const tradeRole = cleanTitle.match(/\d{3,}\s*,\s*(.+)$/u)?.[1]?.trim() || '';

  return {
    rank: rank || parts.slice(0, Math.min(3, Math.max(parts.length - 2, 1))).join(' ') || 'Unknown',
    firstName: parts.length >= 2 ? parts[parts.length - 2].replace(/[",]/gu, '') : 'Unknown',
    lastName: parts.length >= 1 ? parts[parts.length - 1].replace(/[",]/gu, '') : 'Unknown',
    postNominals: postNominalsMatch
      ? postNominalsMatch[1].split(',').map(value => value.trim()).filter(Boolean).join(', ')
      : '',
    tradeRole,
    retirementDate: parseRetirementDate(content)
  };
}

function toPostDocument(post, mediaResult, legacyImportUser = null) {
  const title = getPostTitle(post);
  const message = stripHtml(decodeHtml(post.content?.rendered));
  const language = getLanguage(post);
  const publishedAt = parseDate(post.date_gmt || post.date);
  const legacyImportUserId = legacyImportUser?._id || null;

  return {
    retiree: parseRetiree(title, message),
    message,
    messageLanguage: language,
    messages: {
      [language]: message
    },
    photoUrl: mediaResult?.asset?.url || '',
    submitter: {
      firstName: 'Live Site',
      lastName: 'Import',
      relationship: 'other',
      email: 'legacy-import@cmcen.local',
      unit: 'CMCEN'
    },
    publicationConsent: {
      confirmed: true,
      confirmedAt: publishedAt || new Date()
    },
    memberReviewConfirmation: {
      confirmed: true,
      confirmedAt: publishedAt || new Date()
    },
    status: post.status === 'publish' ? 'published' : 'pending',
    createdBy: legacyImportUserId,
    updatedBy: legacyImportUserId,
    reviewedBy: legacyImportUserId,
    reviewedAt: publishedAt || null,
    publishedBy: legacyImportUserId,
    publishedAt: publishedAt || null,
    legacy: {
      source: 'cmcen-live-site',
      wordpressPostId: post.id,
      slug: post.slug,
      url: post.link,
      title,
      importedAt: new Date(),
      sourceImageUrl: mediaResult?.sourceUrl || getImageUrl(post),
      mediaAssetKey: mediaResult?.asset?.key || '',
      scrapedFrom: RETIREMENT_LIST_URL
    }
  };
}

async function fetchJsonResponse(url) {
  const response = await axios.get(url, {
    responseType: 'json',
    timeout: 30000,
    headers: {
      'User-Agent': 'CMCEN migration test script'
    }
  });

  return response;
}

async function fetchJson(url) {
  return (await fetchJsonResponse(url)).data;
}

async function fetchText(url) {
  const response = await axios.get(url, {
    responseType: 'text',
    timeout: 30000,
    headers: {
      'User-Agent': 'CMCEN migration test script'
    }
  });

  return String(response.data || '');
}

function getTotalPages(response) {
  const totalPages = Number(response.headers?.['x-wp-totalpages'] || 1);

  return Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1;
}

async function getCategoryId() {
  console.log(`Looking up WordPress category "${categorySlug}"`);
  const categories = await fetchJson(
    `${WORDPRESS_BASE_URL}/wp-json/wp/v2/categories?slug=${encodeURIComponent(categorySlug)}`
  );
  const category = Array.isArray(categories) ? categories[0] : null;

  if (!category?.id) {
    throw new Error(`Could not find WordPress category "${categorySlug}".`);
  }

  return category.id;
}

async function getLatestPosts(categoryId) {
  const posts = [];
  let page = 1;
  let totalPages = 1;

  console.log(contentMode === 'comments'
    ? `Scanning retirement posts in category ${categoryId} so comments can be fetched by parent post`
    : `Fetching WordPress retirement posts for category ${categoryId}`);

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
    console.log(`Fetched ${postScanLabel} page ${page}/${totalPages} (${posts.length} collected)`);

    if (pagePosts.length === 0) {
      break;
    }

    page += 1;
  }

  return Number.isFinite(limit) ? posts.slice(0, limit) : posts;
}

function getRetirementListSlugs(html) {
  const slugs = new Set();
  const linkPattern = /<a\b[^>]*class=["'][^"']*ninja_table_permalink[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/giu;
  let match = linkPattern.exec(html);

  while (match) {
    const slug = getPostSlugFromLink(match[1]);

    if (slug) {
      slugs.add(slug);
    }

    match = linkPattern.exec(html);
  }

  return [...slugs];
}

async function fetchPostBySlug(slug) {
  const posts = await fetchJson(
    `${WORDPRESS_BASE_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`
  );
  const post = Array.isArray(posts) ? posts[0] : null;

  if (!post?.id) {
    console.log(`Skipping retirement slug ${slug}: WordPress REST post not found`);
    return null;
  }

  return post;
}

async function getLatestPostsFromRetirementList() {
  const html = await fetchText(RETIREMENT_LIST_URL);
  const slugs = getRetirementListSlugs(html);
  const posts = [];

  console.log(`Found ${slugs.length} retirement links on retirement list page`);

  for (const slug of slugs) {
    if (posts.length >= limit) {
      break;
    }

    const post = await fetchPostBySlug(slug);

    if (post) {
      posts.push(post);
      console.log(`Collected retirement ${post.id}: ${getPostTitle(post)}`);
    }
  }

  return posts;
}

async function getRetirementPosts() {
  const listPosts = await getLatestPostsFromRetirementList();

  if (listPosts.length) {
    return {
      posts: Number.isFinite(limit) ? listPosts.slice(0, limit) : listPosts,
      sourceType: 'retirements-list',
      categoryId: null
    };
  }

  console.log('No retirement links found on the list page; falling back to category scan');
  const categoryId = await getCategoryId();

  return {
    posts: await getLatestPosts(categoryId),
    sourceType: 'category',
    categoryId
  };
}

async function getPostComments(postId) {
  const comments = [];
  let page = 1;
  let totalPages = 1;

  console.log(`Fetching approved comments for WordPress post ${postId}`);

  while (page <= totalPages) {
    const response = await fetchJsonResponse(
      `${WORDPRESS_BASE_URL}/wp-json/wp/v2/comments?post=${postId}&per_page=${WORDPRESS_PAGE_SIZE}&page=${page}&status=approve`
    );
    const pageComments = Array.isArray(response.data) ? response.data : [];

    totalPages = getTotalPages(response);
    comments.push(...pageComments);
    console.log(`Fetched comment page ${page}/${totalPages} for post ${postId} (${comments.length} collected)`);

    if (pageComments.length === 0) {
      break;
    }

    page += 1;
  }

  return comments;
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
        customRoles: [],
        contentAreas: []
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
}

async function getWordPressCommentAuthor(comment) {
  const authorName = getWordPressCommentAuthorName(comment);
  const username = `wp-comment-${slugify(authorName)}`;
  const [firstName, ...lastNameParts] = authorName.split(/\s+/u).filter(Boolean);

  return User.findOneAndUpdate(
    { username },
    {
      $setOnInsert: {
        accountType: 'ghost',
        username,
        email: `${username}@cmcen.local`,
        password: randomUUID(),
        accountName: authorName,
        firstName: firstName || 'WordPress',
        lastName: lastNameParts.join(' ') || 'Commenter',
        preferredLanguage: 'en',
        role: 'subscriber',
        customRoles: [],
        contentAreas: []
      }
    },
    { new: true, upsert: true, runValidators: true }
  );
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

  if (!sourceUrl) {
    console.log(`No source image found for post ${post.id}`);
    return null;
  }

  console.log(`Downloading source image for post ${post.id}: ${sourceUrl}`);
  const response = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'CMCEN migration test script'
    }
  });
  const buffer = Buffer.from(response.data);
  const contentType = response.headers['content-type'] || 'image/jpeg';
  const extension = getExtensionFromUrl(sourceUrl, contentType);
  const baseKey = `legacy/current-site/retirements/${post.id}-${slugify(post.slug || getPostTitle(post))}`;
  const originalKey = `${baseKey}/original.${extension}`;
  const metadata = await sharp(buffer).metadata();
  const variants = {};

  console.log(`Uploading original image for post ${post.id}`);
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
    console.log(`Uploaded ${variant.name} image variant for post ${post.id}`);
  }));

  const title = getPostTitle(post);
  const assetDocument = {
    key: originalKey,
    url: buildPublicMediaUrl(variants.large?.key || variants.hero?.key || originalKey),
    originalKey,
    originalUrl: buildPublicMediaUrl(originalKey),
    originalName: path.basename(new URL(sourceUrl).pathname) || `${slugify(title)}.${extension}`,
    displayName: title || `Retirement ${post.id}`,
    mimeType: contentType,
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: buffer.length,
    variants,
    uploadContext: {
      type: 'migration',
      context: 'retirement-message',
      sourceId: String(post.id),
      sourceModel: 'WordPressPost',
      sourceField: 'photoUrl',
      sourceUrl: post.link || sourceUrl,
      label: title || `Retirement ${post.id}`,
      linkedAt: new Date()
    },
    inferredName: title || `Retirement ${post.id}`,
    fileMetadata: {
      originalName: path.basename(new URL(sourceUrl).pathname) || `${slugify(title)}.${extension}`,
      mimeType: contentType,
      size: buffer.length,
      storageKey: originalKey,
      sourceUrl
    },
    imageMetadata: sanitizeImageMetadata(metadata),
    uploadedBy: null
  };

  const asset = await MediaAsset.findOneAndUpdate(
    { key: originalKey },
    { $set: assetDocument },
    { new: true, upsert: true, runValidators: true }
  );
  console.log(`Upserted media asset for post ${post.id}: ${originalKey}`);

  return {
    sourceUrl,
    asset: asset.toObject()
  };
}

function summarize(post, document, mediaResult) {
  return {
    wordpressPostId: post.id,
    title: document.legacy.title,
    url: post.link,
    status: document.status,
    publishedAt: document.publishedAt,
    retiree: document.retiree,
    messageLength: document.message.length,
    sourceImageUrl: mediaResult?.sourceUrl || getImageUrl(post),
    mediaAssetKey: mediaResult?.asset?.key || '',
    photoUrl: document.photoUrl,
    imported: apply && shouldImportRetirements,
    commentsImported: 0,
    comments: []
  };
}

function summarizeComments(comments) {
  return comments.map(comment => ({
    wordpressCommentId: comment.id,
    authorName: cleanString(decodeHtml(comment.author_name)),
    body: getCommentBody(comment),
    status: getCommentStatus(comment),
    publishedAt: parseDate(comment.date_gmt || comment.date),
    url: comment.link || ''
  }));
}

async function importComments({ comments, retirementMessage }) {
  const importedComments = [];

  for (const comment of comments) {
    console.log(`Processing WordPress comment ${comment.id} for post ${comment.post}`);
    const body = getCommentBody(comment);

    if (body.length < 2) {
      console.log(`Skipping comment ${comment.id}: body too short`);
      continue;
    }

    const author = await getWordPressCommentAuthor(comment);
    const status = getCommentStatus(comment);
    const publishedAt = parseDate(comment.date_gmt || comment.date);
    const document = {
      retirementMessage: retirementMessage._id,
      author: author._id,
      body,
      status,
      reviewedBy: status === 'published' ? author._id : null,
      reviewedAt: status === 'published' ? publishedAt : null,
      publishedBy: status === 'published' ? author._id : null,
      publishedAt: status === 'published' ? publishedAt : null,
      rejectionReason: '',
      legacy: {
        source: 'cmcen-live-site',
        wordpressCommentId: comment.id,
        wordpressPostId: comment.post,
        authorName: getWordPressCommentAuthorName(comment),
        authorUrl: comment.author_url || '',
        url: comment.link || '',
        importedAt: new Date()
      }
    };
    const importedComment = await RetirementComment.findOneAndUpdate(
      {
        'legacy.source': 'cmcen-live-site',
        'legacy.wordpressCommentId': comment.id
      },
      { $set: document },
      { new: true, upsert: true, runValidators: true }
    );

    importedComments.push(importedComment);
    console.log(`Imported comment ${comment.id}`);
  }

  return importedComments;
}

async function main() {
  if (apply && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  if (apply && shouldImportRetirements && !process.env.MINIO_BUCKET_NAME) {
    throw new Error('MINIO_BUCKET_NAME is not configured.');
  }

  const {
    posts,
    sourceType,
    categoryId
  } = await getRetirementPosts();
  const results = [];
  let legacyImportUser = null;

  console.log(contentMode === 'comments'
    ? `Collected ${posts.length} retirement parent posts to scan for approved comments`
    : `Collected ${posts.length} retirement posts for ${contentMode} mode`);

  if (apply) {
    console.log('Connecting to MongoDB');
    await mongoose.connect(process.env.MONGO_URI);
    legacyImportUser = await getLegacyImportUser();
    console.log('Legacy import user is ready');
  }

  for (const post of posts) {
    let mediaResult = null;
    let retirementMessage = null;
    console.log(contentMode === 'comments'
      ? `Scanning comments for retirement parent post ${post.id}: ${getPostTitle(post)}`
      : `Processing WordPress retirement post ${post.id}: ${getPostTitle(post)}`);
    const comments = await getPostComments(post.id);

    if (apply && shouldImportRetirements) {
      mediaResult = await uploadImageForPost(post);
    }

    const document = toPostDocument(post, mediaResult, legacyImportUser);

    if (document.message.length < 100) {
      results.push({
        wordpressPostId: post.id,
        title: document.legacy.title,
        imported: false,
        error: 'Message is shorter than the RetirementMessage minimum length.'
      });
      console.log(`Skipping ${post.id}: message too short`);
      continue;
    }

    if (apply && shouldImportRetirements) {
      console.log(`Upserting retirement message for WordPress post ${post.id}`);
      retirementMessage = await RetirementMessage.findOneAndUpdate(
        {
          'legacy.source': 'cmcen-live-site',
          'legacy.wordpressPostId': post.id
        },
        { $set: document },
        { new: true, upsert: true, runValidators: true }
      );
    } else if (apply && shouldImportComments) {
      console.log(`Finding migrated retirement message for WordPress post ${post.id}`);
      retirementMessage = await RetirementMessage.findOne({
        'legacy.source': 'cmcen-live-site',
        'legacy.wordpressPostId': post.id
      });
    }

    const summary = summarize(post, document, mediaResult);
    summary.comments = summarizeComments(comments);

    if (apply && shouldImportComments) {
      if (!retirementMessage) {
        summary.error = 'Retirement message must be migrated before importing comments.';
        results.push(summary);
        console.log(`Skipping comments for ${post.id}: retirement message not found`);
        continue;
      }

      const importedComments = await importComments({
        comments,
        retirementMessage
      });
      summary.commentsImported = importedComments.length;
    }

    results.push(summary);
    if (shouldImportRetirements) {
      console.log(`${apply ? 'Imported' : 'Would import'} ${post.id}: ${document.legacy.title}`);
    }

    if (shouldImportComments) {
      console.log(`${apply ? 'Imported' : 'Would import'} ${summary.comments.length} comments for ${post.id}`);
    }
  }

  if (apply) {
    console.log('Disconnecting from MongoDB');
    await mongoose.disconnect();
  }

  console.log(`Writing manifest: ${manifestPath}`);
  writeJson(manifestPath, {
    source: RETIREMENT_LIST_URL,
    sourceType,
    categoryId,
    limit: Number.isFinite(limit) ? limit : 'all',
    contentMode,
    apply,
    scrapedAt: new Date().toISOString(),
    results
  });

  console.log(`${apply ? 'Imported' : 'Would import'} ${shouldImportRetirements ? results.filter(result => !result.error).length : 0} retirement messages.`);
  console.log(`${apply ? 'Imported' : 'Would import'} ${shouldImportComments ? results.reduce((sum, result) => sum + result.comments.length, 0) : 0} retirement comments.`);
  console.log(`Wrote manifest: ${manifestPath}`);
}

main().catch(async error => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.error(error);
  process.exit(1);
});
