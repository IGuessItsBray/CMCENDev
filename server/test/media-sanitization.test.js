const assert = require('node:assert/strict');
const { test } = require('node:test');
const sharp = require('sharp');
const {
  sanitizeImageBuffer,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
} = require('../services/media-sanitization');

test('rejects bytes, dimensions and compressed pixel bombs before transformation', async () => {
  await assert.rejects(sanitizeImageBuffer(Buffer.alloc(MAX_IMAGE_BYTES + 1)), {
    status: 413,
  });
  for (const [width, height] of [
    [10001, 1],
    [6000, 5000],
  ]) {
    const png = await sharp({
      create: { width, height, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    assert.ok(png.length < MAX_IMAGE_BYTES);
    await assert.rejects(sanitizeImageBuffer(png), { status: 422 });
  }
  assert.equal(MAX_IMAGE_PIXELS, 24000000);
});

test('rejects vector and corrupt image data while stripping metadata from valid images', async () => {
  await assert.rejects(
    sanitizeImageBuffer(Buffer.from('<svg width="10" height="10"></svg>')),
    { status: 422 },
  );
  await assert.rejects(sanitizeImageBuffer(Buffer.from('not an image')), {
    status: 400,
  });
  const input = await sharp({
    create: { width: 20, height: 10, channels: 3, background: 'blue' },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const output = await sanitizeImageBuffer(input);
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(output.mimeType, 'image/webp');
  assert.equal(metadata.width, 20);
  assert.equal(metadata.height, 10);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});
