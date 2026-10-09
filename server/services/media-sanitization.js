const sharp = require('sharp');

const SANITIZED_MEDIA_MIME_TYPE = 'image/webp';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24 * 1000 * 1000;
const MAX_IMAGE_DIMENSION = 10000;
const SUPPORTED_IMAGE_FORMATS = new Set([
  'jpeg',
  'png',
  'webp',
  'gif',
  'tiff',
  'heif',
  'avif',
]);

function createInvalidImageError(cause) {
  const error = new Error('The uploaded file is not a supported image');
  error.status = 400;
  error.cause = cause;
  return error;
}

/**
 * Re-encodes an image without calling Sharp's withMetadata(). This is the
 * storage boundary for uploaded media: EXIF, XMP, IPTC, ICC and container
 * metadata are intentionally not carried into the stored file.
 */
async function sanitizeImageBuffer(input) {
  if (!Buffer.isBuffer(input) || input.length > MAX_IMAGE_BYTES) {
    const error = new Error('Image exceeds the 10 MiB upload limit');
    error.status = 413;
    throw error;
  }
  try {
    const image = sharp(input, {
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    if (
      !SUPPORTED_IMAGE_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages || 1) > 1
    ) {
      const error = new Error(
        'Image must be a single-frame raster image within 24 megapixels and 10000 pixels per dimension',
      );
      error.status = 422;
      throw error;
    }
    const output = await image
      .rotate()
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: output.data,
      metadata: output.info,
      mimeType: SANITIZED_MEDIA_MIME_TYPE,
    };
  } catch (cause) {
    if (cause.status) throw cause;
    if (/pixel limit/iu.test(cause.message || '')) {
      const error = new Error('Image exceeds the 24 megapixel limit');
      error.status = 422;
      throw error;
    }
    throw createInvalidImageError(cause);
  }
}

module.exports = {
  SANITIZED_MEDIA_MIME_TYPE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_DIMENSION,
  sanitizeImageBuffer,
};
