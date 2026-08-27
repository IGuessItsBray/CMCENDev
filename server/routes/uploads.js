const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { buildPublicMediaUrl } = require('../services/media-library');
const MediaAsset = require('../models/MediaAsset');
const {
  buildUploadContextFromBody,
  createMediaAssetRecord,
  sanitizeImageMetadata,
} = require('../services/media-assets');
const { sanitizeImageBuffer } = require('../services/media-sanitization');
const { writeAuditLog } = require('../services/audit-log');
const { decryptRetainedBytes, encryptRetainedBytes } = require('../services/account-encryption');
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
const MESSAGE_DISPLAY_ASPECT_RATIO = 4 / 3;
const MESSAGE_DISPLAY_MAX_WIDTH = 1200;
const NEWS_DISPLAY_ASPECT_RATIO = 16 / 9;
const NEWS_DISPLAY_MAX_WIDTH = 1600;

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

function buildEncryptedMediaUrl(uuid, variant) {
  const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/+$/u, '');
  const path = `/api/media/${encodeURIComponent(uuid)}/${encodeURIComponent(variant)}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function putObject({ key, body, contentType, encryptionUser }) {
  const ciphertext = await encryptRetainedBytes(encryptionUser, body);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: key,
      Body: ciphertext || body,
      ContentType: ciphertext ? 'application/vnd.cmcen.openbao-transit' : contentType,
    }),
  );
  return Boolean(ciphertext);
}

function toVariantResponse(variants, uuid = '') {
  return Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => [
      name,
      {
        key: variant.key,
        url: uuid ? buildEncryptedMediaUrl(uuid, name) : buildPublicMediaUrl(variant.key),
        width: variant.width,
        height: variant.height,
        size: variant.size,
        mimeType: variant.mimeType,
      },
    ]),
  );
}

function parseCropPosition(value) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) return 0.5;

  return Math.min(1, Math.max(0, parsed));
}

function getDisplayVariantConfig(input = {}) {
  if (
    ['retirementMessage', 'lastPostMessage'].includes(input.uploadSource) &&
    input.displayAspectRatio === '4:3'
  ) {
    return {
      aspectRatio: MESSAGE_DISPLAY_ASPECT_RATIO,
      maxWidth: MESSAGE_DISPLAY_MAX_WIDTH,
      filename: 'display-4x3.webp',
    };
  }

  if (
    input.uploadSource === 'newsArticle' &&
    input.displayAspectRatio === '16:9'
  ) {
    return {
      aspectRatio: NEWS_DISPLAY_ASPECT_RATIO,
      maxWidth: NEWS_DISPLAY_MAX_WIDTH,
      filename: 'display-16x9.webp',
    };
  }

  return null;
}

async function createDisplayVariant({ buffer, baseKey, cropPosition, config, encryptionUser, uuid }) {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Could not determine uploaded image dimensions');
  }

  const sourceAspectRatio = sourceWidth / sourceHeight;
  const cropWidth = Math.max(
    1,
    Math.round(
      sourceAspectRatio > config.aspectRatio
        ? sourceHeight * config.aspectRatio
        : sourceWidth,
    ),
  );
  const cropHeight = Math.max(
    1,
    Math.round(
      sourceAspectRatio > config.aspectRatio
        ? sourceHeight
        : sourceWidth / config.aspectRatio,
    ),
  );
  const left = Math.round((sourceWidth - cropWidth) * cropPosition.x);
  const top = Math.round((sourceHeight - cropHeight) * cropPosition.y);
  const rendered = await image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: config.maxWidth, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  const key = `${baseKey}/${config.filename}`;

  await putObject({
    key,
    body: rendered.data,
    contentType: 'image/webp',
    encryptionUser,
  });

  return {
    key,
    url: uuid ? buildEncryptedMediaUrl(uuid, 'display') : buildPublicMediaUrl(key),
    width: rendered.info.width,
    height: rendered.info.height,
    size: rendered.info.size,
    mimeType: 'image/webp',
  };
}

async function processImageUpload(file, cdnSlug = '', options = {}, encryptionUser = null) {
  const uuid = randomUUID();
  const baseKey = getImageBaseKey(cdnSlug);
  const sanitizedImage = await sanitizeImageBuffer(file.buffer);
  const originalKey = `${baseKey}/original.webp`;
  const metadata = sanitizedImage.metadata;
  const sourceWidth = metadata.width || 0;
  const variants = {};
  const cropPosition = {
    x: parseCropPosition(options.displayCropX),
    y: parseCropPosition(options.displayCropY),
  };

  await putObject({
    key: originalKey,
    body: sanitizedImage.buffer,
    contentType: sanitizedImage.mimeType,
    encryptionUser,
  });

  await Promise.all(
    IMAGE_VARIANTS.map(async (variant) => {
      const width = sourceWidth
        ? Math.min(sourceWidth, variant.width)
        : variant.width;
      const buffer = await sharp(sanitizedImage.buffer)
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
        encryptionUser,
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

  const displayConfig = getDisplayVariantConfig(options);
  const display = displayConfig
    ? await createDisplayVariant({
        buffer: sanitizedImage.buffer,
        baseKey,
        cropPosition,
        config: displayConfig,
        encryptionUser,
        uuid: encryptionUser ? uuid : '',
      })
    : null;

  return {
    uuid,
    key: originalKey,
    url: encryptionUser
      ? buildEncryptedMediaUrl(uuid, variants.large ? 'large' : variants.hero ? 'hero' : 'original')
      : buildPublicMediaUrl(variants.large?.key || variants.hero?.key || originalKey),
    original: {
      key: originalKey,
      url: encryptionUser ? buildEncryptedMediaUrl(uuid, 'original') : buildPublicMediaUrl(originalKey),
      width: metadata.width || null,
      height: metadata.height || null,
      size: sanitizedImage.buffer.length,
      mimeType: sanitizedImage.mimeType,
    },
    variants: toVariantResponse(variants, encryptionUser ? uuid : ''),
    ...(display ? { display } : {}),
    imageMetadata: sanitizeImageMetadata(metadata),
    cdnSlug,
    storageEncryption: encryptionUser
      ? { enabled: true, provider: 'openbao', keyName: process.env.OPENBAO_RETENTION_KEY || 'cmcen-retained-content', encryptedAt: new Date() }
      : { enabled: false },
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
      const uploadResult = await processImageUpload(
        req.file,
        cdnSlug,
        req.body,
        req.user.encryption?.dataEncryptedAt ? req.user : null,
      );
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

// GET /api/media/:uuid/:variant
// Serve a public media asset. Encrypted assets are decrypted only in memory;
// the corresponding MinIO object is never exposed as a public URL.
router.get('/media/:uuid/:variant', async (req, res) => {
  try {
    const asset = await MediaAsset.findOne({ uuid: req.params.uuid }).lean();
    if (!asset) return res.status(404).end();

    const variantName = String(req.params.variant || '');
    const variant = variantName === 'original'
      ? { key: asset.originalKey || asset.key, mimeType: asset.mimeType }
      : variantName === 'display'
        ? asset.display
        : asset.variants?.[variantName];
    if (!variant?.key) return res.status(404).end();

    if (asset.storageEncryption?.enabled !== true) {
      return res.redirect(302, buildPublicMediaUrl(variant.key));
    }

    const object = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: variant.key,
    }));
    const encryptedBytes = Buffer.from(await object.Body.transformToByteArray());
    const plaintext = await decryptRetainedBytes(encryptedBytes.toString('utf8'));
    res.set({
      'Content-Type': variant.mimeType || asset.mimeType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.send(plaintext);
  } catch (error) {
    console.error('Public encrypted media request failed:', error);
    return res.status(503).end();
  }
});

// POST /api/upload-url
// Direct uploads are intentionally disabled: they bypass server-side metadata removal.
router.post(
  '/upload-url',
  authMiddleware,
  requirePermission('canUploadMedia'),
  async (req, res) => {
    res.status(410).json({
      error: 'Direct uploads are disabled. Upload media through /api/upload.',
    });
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
