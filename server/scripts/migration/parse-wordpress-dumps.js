const os = require('os');
const path = require('path');

const { parseArgs, resolvePath } = require('./lib/args');
const { parseCsv } = require('./lib/csv');
const { parseSqlDump } = require('./lib/sql-dump');
const {
  buildAttachmentMap,
  buildCommentsMap,
  buildMetaMap,
  getPostLanguage,
  getStatus,
  isRetirementPost,
  parseDate,
  stripHtml,
  summarizeRecord,
  writeJson
} = require('./lib/wordpress');

const args = parseArgs();
const downloads = path.join(os.homedir(), 'Downloads');
const outputDir = resolvePath(
  args.output,
  path.join(__dirname, 'output')
);

const sourcePaths = {
  posts: resolvePath(args.posts, path.join(downloads, 'wp_posts-3.sql')),
  postmeta: resolvePath(args.postmeta, path.join(downloads, 'wp_postmeta-3.sql')),
  comments: resolvePath(args.comments, path.join(downloads, 'wp_comments-3.sql')),
  attachments: resolvePath(args.attachments, path.join(downloads, 'a.csv'))
};

function resolveImages(meta, attachmentsById) {
  const imageCandidates = [
    ['thumbnail', meta._thumbnail_id],
    ['main', meta.main_image],
    ['secondary', meta.second_image]
  ]
    .map(([role, value]) => ({
      role,
      id: Number(value || 0) || null
    }))
    .filter(candidate => candidate.id);

  return imageCandidates
    .map(candidate => {
      const resolvedAttachment = attachmentsById.get(candidate.id);

      if (!resolvedAttachment) {
        return null;
      }

      return {
        role: candidate.role,
        wordpressAttachmentId: resolvedAttachment.id,
        title: resolvedAttachment.title,
        mimeType: resolvedAttachment.mimeType,
        sourceUrl: resolvedAttachment.sourceUrl,
        attachedFile: resolvedAttachment.attachedFile,
        postParent: resolvedAttachment.postParent
      };
    })
    .filter(Boolean);
}

function buildRecord(post, meta, comments, attachmentsById) {
  const wordpressPostId = Number(post.ID);
  const imageReferences = [
    ['thumbnail', meta._thumbnail_id],
    ['main', meta.main_image],
    ['secondary', meta.second_image]
  ]
    .map(([role, value]) => ({
      role,
      wordpressAttachmentId: Number(value || 0) || null
    }))
    .filter(reference => reference.wordpressAttachmentId);
  const images = resolveImages(meta, attachmentsById);
  const primaryImage = images[0] || null;

  return {
    type: 'retirement',
    wordpressPostId,
    wordpressAuthorId: Number(post.post_author || 0) || null,
    postType: post.post_type,
    status: getStatus(post.post_status),
    wordpressStatus: post.post_status,
    title: post.post_title,
    slug: post.post_name,
    postDate: parseDate(post.post_date_gmt || post.post_date),
    modifiedAt: parseDate(post.post_modified_gmt || post.post_modified),
    guid: post.guid,
    contentHtml: post.post_content,
    contentText: stripHtml(post.post_content),
    excerpt: post.post_excerpt,
    messageLanguage: getPostLanguage(post),
    retirementDate: parseDate(meta.retirement_date),
    thumbnailId: primaryImage?.wordpressAttachmentId || null,
    image: primaryImage
      ? {
          wordpressAttachmentId: primaryImage.wordpressAttachmentId,
          title: primaryImage.title,
          mimeType: primaryImage.mimeType,
          sourceUrl: primaryImage.sourceUrl,
          attachedFile: primaryImage.attachedFile,
          postParent: primaryImage.postParent,
          role: primaryImage.role
        }
      : null,
    imageReferences,
    unresolvedImageReferences: imageReferences.filter(reference =>
      !attachmentsById.has(reference.wordpressAttachmentId)
    ),
    images,
    comments,
    meta,
    legacy: {
      source: 'wordpress',
      postId: wordpressPostId,
      postType: post.post_type,
      guid: post.guid,
      slug: post.post_name,
      authorId: Number(post.post_author || 0) || null
    }
  };
}

function main() {
  const posts = parseSqlDump(sourcePaths.posts);
  const postmeta = parseSqlDump(sourcePaths.postmeta);
  const comments = parseSqlDump(sourcePaths.comments);
  const attachments = parseCsv(sourcePaths.attachments);

  const metaByPost = buildMetaMap(postmeta);
  const commentsByPost = buildCommentsMap(comments);
  const attachmentsById = buildAttachmentMap(attachments);

  const records = posts
    .filter(post => (
      isRetirementPost(post, metaByPost.get(Number(post.ID)) || {})
    ))
    .map(post => {
      const postId = Number(post.ID);
      const meta = metaByPost.get(postId) || {};

      return buildRecord(
        post,
        meta,
        commentsByPost.get(postId) || [],
        attachmentsById
      );
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    sourcePaths,
    counts: {
      sourcePosts: posts.length,
      sourcePostmeta: postmeta.length,
      sourceComments: comments.length,
      sourceAttachments: attachments.length,
      migrationRecords: records.length,
      retirementRecords: records.filter(record => record.type === 'retirement').length,
      recordsWithImages: records.filter(record => record.image?.sourceUrl).length,
      unresolvedImageReferences:
        records.reduce((sum, record) => sum + record.unresolvedImageReferences.length, 0),
      commentsAttached: records.reduce((sum, record) => sum + record.comments.length, 0)
    }
  };

  const unresolvedImageReferences = records
    .flatMap(record => record.unresolvedImageReferences.map(reference => ({
      wordpressPostId: record.wordpressPostId,
      postType: record.postType,
      recordType: record.type,
      title: record.title,
      role: reference.role,
      wordpressAttachmentId: reference.wordpressAttachmentId
    })));

  const imageManifestByAttachment = new Map();

  records.forEach(record => {
    record.images.forEach(image => {
      if (!image.sourceUrl || imageManifestByAttachment.has(image.wordpressAttachmentId)) {
        return;
      }

      imageManifestByAttachment.set(image.wordpressAttachmentId, {
        wordpressPostId: record.wordpressPostId,
        wordpressAttachmentId: image.wordpressAttachmentId,
        sourceUrl: image.sourceUrl,
        attachedFile: image.attachedFile,
        mimeType: image.mimeType,
        title: image.title,
        role: image.role
      });
    });
  });

  const imageManifest = Array.from(imageManifestByAttachment.values());

  writeJson(path.join(outputDir, 'wordpress-migration-manifest.json'), records);
  writeJson(path.join(outputDir, 'wordpress-migration-summary.json'), summary);
  writeJson(path.join(outputDir, 'wordpress-migration-review.json'), records.map(summarizeRecord));
  writeJson(path.join(outputDir, 'wordpress-image-download-manifest.json'), imageManifest);
  writeJson(path.join(outputDir, 'wordpress-unresolved-image-references.json'), unresolvedImageReferences);

  console.log(JSON.stringify(summary, null, 2));
}

main();
