const path = require('path');
const sharp = require('sharp');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { downloadSourceImage } = require('./source-image');
const { buildPublicMediaUrl } = require('../../../services/media-library');
const { sanitizeImageMetadata } = require('../../../services/media-assets');
const { sanitizeImageBuffer } = require('../../../services/media-sanitization');
const MediaAsset = require('../../../models/MediaAsset');
const s3Client = require('../../../storage');
const { slugify } = require('./workbook-import');

const IMAGE_VARIANTS = Object.freeze([
  { name: 'thumb', width: 400 },
  { name: 'medium', width: 900 },
  { name: 'large', width: 1600 },
  { name: 'hero', width: 2200 },
]);
const NON_IMAGE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.zip',
  '.ppt',
  '.pptx',
]);

function isImageLikeUrl(value) {
  try {
    const extension = path.extname(new URL(value).pathname).toLowerCase();
    return !NON_IMAGE_EXTENSIONS.has(extension);
  } catch {
    return false;
  }
}

async function putObject({ key, body, contentType }) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function uploadOneMedia({ candidate, sourceUrl, index }) {
  const sourceImage = await downloadSourceImage(sourceUrl, {
    userAgent: 'CMCEN workbook migration',
    validateImage: (buffer) => sharp(buffer).rotate().raw().toBuffer(),
  });
  const sanitizedImage = await sanitizeImageBuffer(sourceImage.buffer);
  const buffer = sanitizedImage.buffer;
  const metadata = sanitizedImage.metadata;
  const title =
    candidate.titles.en ||
    candidate.titles.fr ||
    `Record ${candidate.recordId}`;
  const baseKey = [
    'legacy',
    'workbook-inventory',
    candidate.type,
    `${candidate.recordId}-${slugify(title)}`,
    `media-${index + 1}`,
  ].join('/');
  const originalKey = `${baseKey}/original.webp`;
  const variants = {};

  await putObject({
    key: originalKey,
    body: buffer,
    contentType: sanitizedImage.mimeType,
  });

  for (const variant of IMAGE_VARIANTS) {
    const width = metadata.width
      ? Math.min(metadata.width, variant.width)
      : variant.width;
    const variantBuffer = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const key = `${baseKey}/${variant.name}.webp`;

    await putObject({
      key,
      body: variantBuffer.data,
      contentType: 'image/webp',
    });

    variants[variant.name] = {
      key,
      url: buildPublicMediaUrl(key),
      width: variantBuffer.info.width,
      height: variantBuffer.info.height,
      size: variantBuffer.info.size,
      mimeType: 'image/webp',
    };
  }

  const assetDocument = {
    key: originalKey,
    url: buildPublicMediaUrl(variants.large?.key || originalKey),
    originalKey,
    originalUrl: buildPublicMediaUrl(originalKey),
    originalName:
      sourceImage.originalName || `record-${candidate.recordId}.webp`,
    displayName: title,
    mimeType: sanitizedImage.mimeType,
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: buffer.length,
    variants,
    display: variants.medium || variants.large || {},
    uploadContext: {
      type: 'migration',
      context: 'workbook-inventory',
      sourceId: String(candidate.recordId),
      sourceModel: 'WorkbookInventory',
      sourceField: 'media_links',
      sourceUrl,
      label: title,
      linkedAt: new Date(),
    },
    inferredName: title,
    fileMetadata: {
      originalName:
        sourceImage.originalName || `record-${candidate.recordId}.webp`,
      mimeType: sanitizedImage.mimeType,
      size: buffer.length,
      storageKey: originalKey,
      sourceUrl,
      usedFallback: sourceImage.usedFallback,
      fallbackReason: sourceImage.fallbackReason,
      fallbackSourceUrl: sourceImage.fallbackSourceUrl,
    },
    imageMetadata: sanitizeImageMetadata(metadata),
    uploadedBy: null,
  };
  const asset = await MediaAsset.findOneAndUpdate(
    { key: originalKey },
    { $set: assetDocument },
    { new: true, upsert: true, runValidators: true },
  );

  return asset.toObject();
}

async function uploadWorkbookMedia(candidate) {
  const imageLinks = candidate.mediaLinks.filter(isImageLikeUrl);
  const skipped = candidate.mediaLinks.filter((url) => !isImageLikeUrl(url));
  const assets = [];
  const failures = [];

  for (const [index, sourceUrl] of imageLinks.entries()) {
    try {
      assets.push(await uploadOneMedia({ candidate, sourceUrl, index }));
    } catch (error) {
      failures.push({
        sourceUrl,
        error: error.message || String(error),
      });
    }
  }

  return {
    assets,
    primaryAsset: assets[0] || null,
    skipped,
    failures,
  };
}

module.exports = {
  isImageLikeUrl,
  uploadWorkbookMedia,
};
