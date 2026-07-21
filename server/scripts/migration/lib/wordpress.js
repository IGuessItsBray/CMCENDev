const fs = require('fs');
const path = require('path');

function cleanString(value) {
  return String(value || '').trim();
}

function stripHtml(value) {
  return cleanString(value)
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&#038;/gu, '&')
    .replace(/\s+/gu, ' ');
}

function parseDate(value) {
  const cleanValue = cleanString(value);

  if (!cleanValue || cleanValue === '0000-00-00 00:00:00') {
    return null;
  }

  if (/^\d{8}$/u.test(cleanValue)) {
    return `${cleanValue.slice(0, 4)}-${cleanValue.slice(4, 6)}-${cleanValue.slice(6, 8)}`;
  }

  return cleanValue.replace(' ', 'T');
}

function isRetirementPost(post, meta = {}) {
  const title = cleanString(post.post_title).toLowerCase();
  const slug = cleanString(post.post_name).toLowerCase();
  const postType = cleanString(post.post_type);

  return (
    postType === 'post' &&
    (
      title.includes('retirement') ||
      title.includes('retire') ||
      slug.includes('retirement') ||
      slug.includes('retire') ||
      Boolean(meta.retirement_date)
    )
  );
}

function getStatus(wordpressStatus) {
  const status = cleanString(wordpressStatus);

  if (status === 'publish') {
    return 'published';
  }

  if (['draft', 'pending', 'private'].includes(status)) {
    return status;
  }

  return 'draft';
}

function getPostLanguage(post) {
  const title = cleanString(post.post_title);

  if (/[ÉÈÊÀÂÇÙÛÎÔœ]/u.test(title)) {
    return 'fr';
  }

  return 'en';
}

function getAttachmentUrl(attachment) {
  if (!attachment) {
    return '';
  }

  if (attachment.guid) {
    return attachment.guid;
  }

  if (attachment.attached_file) {
    return `https://cmcen-rcmce.ca/wp-content/uploads/${attachment.attached_file}`;
  }

  return '';
}

function buildMetaMap(rows) {
  const byPost = new Map();

  rows.forEach(row => {
    const postId = Number(row.post_id);

    if (!byPost.has(postId)) {
      byPost.set(postId, {});
    }

    byPost.get(postId)[row.meta_key] = row.meta_value;
  });

  return byPost;
}

function buildCommentsMap(rows) {
  const byPost = new Map();

  rows.forEach(row => {
    const postId = Number(row.comment_post_ID);

    if (!byPost.has(postId)) {
      byPost.set(postId, []);
    }

    byPost.get(postId).push({
      commentId: Number(row.comment_ID),
      authorName: cleanString(row.comment_author),
      authorEmail: cleanString(row.comment_author_email).toLowerCase(),
      body: cleanString(row.comment_content),
      status: cleanString(row.comment_approved),
      publishedAt: parseDate(row.comment_date_gmt || row.comment_date)
    });
  });

  return byPost;
}

function buildAttachmentMap(rows) {
  const attachments = new Map();

  rows.forEach(row => {
    attachments.set(Number(row.ID), {
      id: Number(row.ID),
      title: cleanString(row.post_title),
      mimeType: cleanString(row.post_mime_type),
      guid: cleanString(row.guid),
      postParent: Number(row.post_parent || 0),
      attachedFile: cleanString(row.attached_file),
      sourceUrl: getAttachmentUrl({
        guid: cleanString(row.guid),
        attached_file: cleanString(row.attached_file)
      })
    });
  });

  return attachments;
}

function summarizeRecord(record) {
  return {
    type: record.type,
    wordpressPostId: record.wordpressPostId,
    title: record.title,
    status: record.status,
    postDate: record.postDate,
    retirementDate: record.retirementDate || '',
    thumbnailId: record.thumbnailId || null,
    imageSourceUrl: record.image?.sourceUrl || '',
    commentCount: record.comments.length
  };
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, {
    recursive: true
  });
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`
  );
}

module.exports = {
  buildAttachmentMap,
  buildCommentsMap,
  buildMetaMap,
  cleanString,
  ensureDirectory,
  getPostLanguage,
  getStatus,
  isRetirementPost,
  parseDate,
  stripHtml,
  summarizeRecord,
  writeJson
};
