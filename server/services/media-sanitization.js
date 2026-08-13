const sharp = require('sharp');

const SANITIZED_MEDIA_MIME_TYPE = 'image/webp';

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
  try {
    const image = sharp(input, { failOn: 'warning' }).rotate();
    const output = await image
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: output.data,
      metadata: output.info,
      mimeType: SANITIZED_MEDIA_MIME_TYPE,
    };
  } catch (cause) {
    throw createInvalidImageError(cause);
  }
}

module.exports = {
  SANITIZED_MEDIA_MIME_TYPE,
  sanitizeImageBuffer,
};
