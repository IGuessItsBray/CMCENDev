const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const {
  buildPublicMediaUrl,
  getCdnBaseUrl,
} = require('../services/media-library');
const MediaAsset = require('../models/MediaAsset');
const {
  buildUploadContextFromBody,
  createDirectUploadMediaAssetRecord,
  createMediaAssetRecord,
  sanitizeImageMetadata,
} = require('../services/media-assets');
const { writeAuditLog } = require('../services/audit-log');
const s3Client = require('../storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const IMAGE_VARIANTS = Object.freeze([
  { name: 'thumb', width: 400 },
  { name: 'medium', width: 900 },
  { name: 'large', width: 1600 },
  { name: 'hero', width: 2200 },
]);
const CDN_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CDN_SLUG_LENGTH = 80;

function getPublicUploadEndpoint() {
  if (process.env.MINIO_PUBLIC_ENDPOINT) {
    return process.env.MINIO_PUBLIC_ENDPOINT;
  }

  try {
    return new URL(getCdnBaseUrl()).origin;
  } catch {
    return process.env.MINIO_ENDPOINT;
  }
}

function createPublicUploadClient() {
  return new S3Client({
    region: 'us-east-1',
    endpoint: getPublicUploadEndpoint(),
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

function getCleanExtension(value, fallback = 'bin') {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || fallback
  );
}

function getOriginalExtension(file) {
  const originalName = String(file?.originalname || '');
  const rawExtension = originalName.includes('.')
    ? originalName.split('.').pop()
    : String(file?.mimetype || '')
        .split('/')
        .pop();

  return getCleanExtension(rawExtension, 'bin');
}

function cleanCdnSlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase();

  if (!slug) return '';

  if (slug.length > MAX_CDN_SLUG_LENGTH || !CDN_SLUG_PATTERN.test(slug)) {
    const error = new Error(
      'CDN slug must use lowercase letters, numbers, and single hyphens only',
    );
    error.status = 400;
    throw error;
  }

  return slug;
}

function getImageBaseKey(cdnSlug = '') {
  return cdnSlug ? `images/${cdnSlug}` : `images/${randomUUID()}`;
}

async function assertCdnSlugAvailable(cdnSlug) {
  if (!cdnSlug) return;

  const existingAsset = await MediaAsset.exists({ cdnSlug });

  if (existingAsset) {
    const error = new Error('That CDN slug is already in use');
    error.status = 409;
    throw error;
  }

  const listed = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Prefix: `images/${cdnSlug}/`,
      MaxKeys: 1,
    }),
  );

  if (listed.Contents?.length) {
    const error = new Error('That CDN slug is already in use');
    error.status = 409;
    throw error;
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

function toVariantResponse(variants) {
  return Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => [
      name,
      {
        key: variant.key,
        url: buildPublicMediaUrl(variant.key),
        width: variant.width,
        height: variant.height,
        size: variant.size,
        mimeType: variant.mimeType,
      },
    ]),
  );
}

async function processImageUpload(file, cdnSlug = '') {
  const baseKey = getImageBaseKey(cdnSlug);
  const originalKey = `${baseKey}/original.${getOriginalExtension(file)}`;
  const metadata = await sharp(file.buffer).metadata();
  const sourceWidth = metadata.width || 0;
  const variants = {};

  await putObject({
    key: originalKey,
    body: file.buffer,
    contentType: file.mimetype,
  });

  await Promise.all(
    IMAGE_VARIANTS.map(async (variant) => {
      const width = sourceWidth
        ? Math.min(sourceWidth, variant.width)
        : variant.width;
      const buffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width,
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const key = `${baseKey}/${variant.name}.webp`;

      await putObject({
        key,
        body: buffer.data,
        contentType: 'image/webp',
      });

      variants[variant.name] = {
        key,
        width: buffer.info.width,
        height: buffer.info.height,
        size: buffer.info.size,
        mimeType: 'image/webp',
      };
    }),
  );

  return {
    key: originalKey,
    url: buildPublicMediaUrl(
      variants.large?.key || variants.hero?.key || originalKey,
    ),
    original: {
      key: originalKey,
      url: buildPublicMediaUrl(originalKey),
      width: metadata.width || null,
      height: metadata.height || null,
      size: file.size,
      mimeType: file.mimetype,
    },
    variants: toVariantResponse(variants),
    imageMetadata: sanitizeImageMetadata(metadata),
    cdnSlug,
  };
}

// POST /api/upload
// Upload an authenticated user's image to object storage.
router.post(
  '/upload',
  authMiddleware,
  requirePermission('canUploadMedia'),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const cdnSlug = cleanCdnSlug(req.body?.cdnSlug);
      await assertCdnSlugAvailable(cdnSlug);
      const uploadResult = await processImageUpload(req.file, cdnSlug);
      const mediaAsset = await createMediaAssetRecord({
        uploadResult,
        file: req.file,
        user: req.user,
        uploadContext: buildUploadContextFromBody(req.body),
        imageMetadata: uploadResult.imageMetadata,
      });

      await writeAuditLog({
        req,
        action: 'media.uploaded',
        actor: req.user,
        targetType: 'media',
        target: mediaAsset._id,
        targetSnapshot: {
          title: mediaAsset.displayName,
          key: mediaAsset.key,
        },
        metadata: {
          cdnSlug: mediaAsset.cdnSlug,
          uploadSource: mediaAsset.uploadContext?.type || 'unknown',
        },
      });

      res.status(201).json({
        message: 'Upload successful',
        ...uploadResult,
        mediaAsset: {
          _id: mediaAsset._id,
          uuid: mediaAsset.uuid,
        },
      });
    } catch (err) {
      if (!err.status || err.status >= 500) {
        console.error('Upload Error:', err);
      }
      res.status(err.status || 500).json({
        error: err.status ? err.message : 'Could not upload file',
      });
    }
  },
);

// POST /api/upload-url
// Create a short-lived signed URL so browsers can upload directly to object storage.
router.post(
  '/upload-url',
  authMiddleware,
  requirePermission('canUploadMedia'),
  async (req, res) => {
    try {
      const originalName = String(req.body?.filename || 'image').trim();
      const contentType = String(
        req.body?.contentType || 'application/octet-stream',
      ).trim();
      const rawExtension = originalName.includes('.')
        ? originalName.split('.').pop()
        : contentType.split('/').pop() || 'bin';
      const fileExtension = getCleanExtension(rawExtension, 'bin');
      const fileKey = `${randomUUID()}.${fileExtension}`;
      const mediaAsset = await createDirectUploadMediaAssetRecord({
        key: fileKey,
        originalName,
        contentType,
        size: req.body?.size,
        user: req.user,
        uploadContext: buildUploadContextFromBody(req.body),
      });

      const command = new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: fileKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(
        createPublicUploadClient(),
        command,
        {
          expiresIn: 900,
        },
      );

      res.status(201).json({
        key: fileKey,
        url: buildPublicMediaUrl(fileKey),
        uploadUrl,
        mediaAsset: {
          _id: mediaAsset._id,
          uuid: mediaAsset.uuid,
        },
        headers: {
          'Content-Type': contentType,
        },
      });
    } catch (err) {
      console.error('Upload URL Error:', err);
      res.status(500).json({ error: 'Could not prepare upload' });
    }
  },
);

// GET /api/image/:key
// Generate a short-lived signed URL for an object-storage image.
router.get(
  '/image/:key',
  authMiddleware,
  requirePermission('canViewMediaLibrary'),
  async (req, res) => {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: req.params.key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 900,
      });

      res.json({ url: signedUrl });
    } catch (err) {
      res.status(500).json({ error: 'Could not generate secure link' });
    }
  },
);

module.exports = router;
