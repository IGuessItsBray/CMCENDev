const assert = require('node:assert/strict');
const path = require('node:path');
const sharp = require('sharp');
const { bytesDigest } = require('./content-import');

async function inspectImage(buffer) {
  assert(
    Buffer.isBuffer(buffer) &&
      buffer.length &&
      buffer.length <= 25 * 1024 * 1024,
  );
  const image = sharp(buffer, {
    limitInputPixels: 100000000,
    failOn: 'warning',
  });
  const info = await image.metadata();
  assert(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff'].includes(info.format));
  assert(info.width && info.height && (info.pages || 1) === 1);
  const signature = await image
    .rotate()
    .resize(32, 32, { fit: 'fill' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer();
  const sideways = [5, 6, 7, 8].includes(info.orientation);
  return {
    width: sideways ? info.height : info.width,
    height: sideways ? info.width : info.height,
    rawWidth: info.width,
    rawHeight: info.height,
    orientation: info.orientation,
    format: info.format,
    sha256: bytesDigest(buffer),
    bytes: buffer.length,
    signature,
  };
}
const publicInfo = ({ signature, ...info }) => info;

function originalImageUrl(metadata) {
  const name = metadata.media_details?.original_image;
  if (
    typeof name !== 'string' ||
    path.posix.basename(name) !== name ||
    name.includes('\\')
  )
    return undefined;
  try {
    return new URL(name, metadata.source_url).href;
  } catch {
    return undefined;
  }
}

// Pure selection policy; fetching is injected. Never rewrites guessed suffixes,
// generates enlarged images, changes a frozen manifest or touches live storage.
async function chooseWordPressImage({
  sourceUrl,
  knownBuffer,
  metadata,
  expectedMediaId,
  fetchImage,
}) {
  const known = await inspectImage(knownBuffer);
  const result = {
    buffer: knownBuffer,
    choice: {
      sourceUrl,
      knownSource: publicInfo(known),
      selectedSourceUrl: sourceUrl,
      selected: publicInfo(known),
      upgraded: false,
      issues: [],
    },
  };
  if (!metadata) {
    result.choice.issues.push('metadata-unavailable');
    return result;
  }
  const source = new URL(sourceUrl);
  const acceptable = (url) => {
    try {
      const u = new URL(url);
      return (
        u.protocol === 'https:' &&
        u.origin === source.origin &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  };
  const sizes = Object.values(metadata.media_details?.sizes || {});
  const declared = [
    {
      url: metadata.source_url,
      width: metadata.media_details?.width,
      height: metadata.media_details?.height,
    },
    ...sizes.map((s) => ({
      url: s.source_url,
      width: s.width,
      height: s.height,
    })),
  ];
  if (
    !Number.isSafeInteger(metadata.id) ||
    metadata.id <= 0 ||
    (expectedMediaId && metadata.id !== expectedMediaId) ||
    (!declared.some((r) => r.url === sourceUrl) &&
      originalImageUrl(metadata) !== sourceUrl)
  ) {
    result.choice.issues.push('attachment-identity-or-source-mismatch');
    return result;
  }
  result.choice.wordpressMediaId = metadata.id;
  let originalUrl;
  const original = metadata.media_details?.original_image;
  if (
    typeof original === 'string' &&
    path.posix.basename(original) === original &&
    !original.includes('\\')
  ) {
    try {
      originalUrl = new URL(original, metadata.source_url).href;
    } catch {
      result.choice.issues.push('invalid-original-metadata');
    }
  }
  const candidates = [
    ...(originalUrl
      ? [{ url: originalUrl, reason: 'wordpress-original-image' }]
      : []),
    ...declared
      .sort(
        (a, b) =>
          (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
      )
      .map((r) => ({ ...r, reason: 'largest-declared-rendition' })),
  ];
  const seen = new Set([sourceUrl]);
  let best = known;
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    if (
      candidate.width &&
      candidate.height &&
      candidate.width * candidate.height <= best.width * best.height * 1.1
    )
      continue;
    if (!acceptable(candidate.url)) {
      result.choice.issues.push('unapproved-candidate-origin');
      continue;
    }
    try {
      const buffer = await fetchImage(candidate.url);
      const actual = await inspectImage(buffer);
      if (
        (candidate.width && actual.rawWidth !== candidate.width) ||
        (candidate.height && actual.rawHeight !== candidate.height)
      )
        throw Error('declared-dimensions-differ');
      let error = 0;
      for (let i = 0; i < known.signature.length; i++)
        error += Math.abs(known.signature[i] - actual.signature[i]);
      const pixelDifference = error / known.signature.length / 255;
      if (pixelDifference > 0.06) throw Error('appearance-or-crop-differs');
      if (actual.width * actual.height <= best.width * best.height * 1.1)
        continue;
      result.buffer = buffer;
      best = actual;
      result.choice = {
        ...result.choice,
        selectedSourceUrl: candidate.url,
        selected: publicInfo(actual),
        upgraded: true,
        reason: candidate.reason,
        pixelDifference,
      };
      if (candidate.reason === 'wordpress-original-image') break;
    } catch (e) {
      result.choice.issues.push(`${candidate.url}: ${e.message}`);
    }
  }
  return result;
}

module.exports = { chooseWordPressImage, inspectImage, originalImageUrl };
