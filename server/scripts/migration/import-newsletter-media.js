require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
  quiet: true,
});
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
// Explicit migration-only override; never changes the application's .env.
if (process.argv.includes('--use-root-credentials')) {
  if (!process.env.MINIO_ROOT_USER || !process.env.MINIO_ROOT_PASSWORD) {
    throw new Error('MinIO root credentials are not configured');
  }
  process.env.MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER;
  process.env.MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD;
}
const s3 = require('../../storage');
const MediaAsset = require('../../models/MediaAsset');
const { sanitizeImageBuffer } = require('../../services/media-sanitization');
const {
  buildPublicMediaUrl,
  getCdnBaseUrl,
} = require('../../services/media-library');
const { assertPublicMediaBaseUrl } = require('./lib/public-media');
const { downloadSourceImage } = require('./lib/source-image');

async function main() {
  const slug = process.argv.find((arg) => arg.startsWith('--issue='))?.slice(8);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug || ''))
    throw new Error('Use --issue=<newsletter-slug>');
  const apply = process.argv.includes('--apply');
  const file = path.join(
    __dirname,
    '../../public/page-content/newsletters',
    `${slug}.json`,
  );
  const issue = JSON.parse(await fs.readFile(file, 'utf8'));
  assertPublicMediaBaseUrl(getCdnBaseUrl());
  // Verify and sanitize all inputs before making storage or database writes.
  const prepared = [];
  for (const [name, image] of Object.entries(issue.images)) {
    if (
      !/^[a-z0-9-]+$/u.test(image.id) ||
      new URL(image.sourceUrl).protocol !== 'https:'
    )
      throw new Error('Invalid image source');
    const source = await downloadSourceImage(image.sourceUrl, {
      validateImage: (buffer) => sharp(buffer).metadata(),
    });
    const sanitized = await sanitizeImageBuffer(source.buffer);
    prepared.push({ name, image, sanitized });
    console.log(
      `${name}: ${sanitized.metadata.width}x${sanitized.metadata.height} validated`,
    );
  }
  if (!apply) {
    console.log(
      'Dry run: no files, database records or storage objects changed.',
    );
    return;
  }
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  for (const { name, image, sanitized } of prepared) {
    const base = `legacy/newsletters/${image.id}`;
    const key = `${base}/original.webp`;
    let asset = await MediaAsset.findOne({ key }).lean();
    if (!asset) {
      const put = (objectKey, body) =>
        s3.send(
          new PutObjectCommand({
            Bucket: process.env.MINIO_BUCKET_NAME,
            Key: objectKey,
            Body: body,
            ContentType: 'image/webp',
          }),
        );
      await put(key, sanitized.buffer);
      const variants = {};
      for (const [variant, width] of Object.entries({
        thumb: 400,
        medium: 900,
        large: 1600,
        hero: 2200,
      })) {
        const output = await sharp(sanitized.buffer)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        const variantKey = `${base}/${variant}.webp`;
        await put(variantKey, output.data);
        variants[variant] = {
          key: variantKey,
          url: buildPublicMediaUrl(variantKey),
          width: output.info.width,
          height: output.info.height,
          size: output.info.size,
          mimeType: 'image/webp',
        };
      }
      asset = await MediaAsset.findOneAndUpdate(
        { key },
        {
          $setOnInsert: {
            key,
            originalKey: key,
            originalUrl: buildPublicMediaUrl(key),
            url: variants.large.url,
            originalName: path.basename(new URL(image.sourceUrl).pathname),
            displayName: image.alt,
            mimeType: 'image/webp',
            width: sanitized.metadata.width,
            height: sanitized.metadata.height,
            size: sanitized.buffer.length,
            variants,
            display: variants.medium,
            uploadContext: {
              type: 'migration',
              context: 'newsletter',
              sourceUrl: image.sourceUrl,
              sourceSlug: slug,
              sourceField: `images.${name}`,
              label: issue.title,
              linkedAt: new Date(),
            },
            fileMetadata: {
              sourceUrl: image.sourceUrl,
              articleUrl: issue.sourceUrl,
            },
          },
        },
        { upsert: true, new: true, runValidators: true },
      ).lean();
    }
    // Do not wire an inaccessible CDN image into the article.
    const response = await fetch(asset.url, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `CDN verification failed for ${name}: ${response.status}`,
      );
    await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    issue.images[name] = {
      ...image,
      mediaStatus: 'cdn-verified',
      mediaKey: asset.key,
      url: asset.url,
      width: asset.width,
      height: asset.height,
      variants: asset.variants,
    };
    await fs.writeFile(file, `${JSON.stringify(issue, null, 2)}\n`);
    console.log(`${name}: registered in MediaAsset and verified on CDN`);
  }
}

main()
  .catch((error) => {
    console.error(`Newsletter media import failed (${error.name || 'Error'}).`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
