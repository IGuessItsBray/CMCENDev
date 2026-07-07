require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { parseArgs, resolvePath } = require('./lib/args');
const { buildPublicMediaUrl } = require('../../services/media-library');
const { writeJson } = require('./lib/wordpress');
const s3Client = require('../../storage');

const args = parseArgs();
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'wordpress-image-local-manifest.json')
);
const apply = Boolean(args.apply);

function getContentType(entry) {
  return entry.mimeType || 'application/octet-stream';
}

function getObjectKey(entry) {
  const fileName = path.basename(entry.localPath);
  return `legacy/wordpress/${entry.wordpressAttachmentId}/${fileName}`;
}

async function main() {
  if (apply && !process.env.MINIO_BUCKET_NAME) {
    throw new Error('MINIO_BUCKET_NAME is not configured.');
  }

  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const results = [];

  for (const entry of entries) {
    if (!entry.downloaded || !entry.localPath || !fs.existsSync(entry.localPath)) {
      results.push({
        ...entry,
        uploaded: false,
        error: 'Local image is missing'
      });
      continue;
    }

    const objectKey = getObjectKey(entry);

    if (apply) {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: objectKey,
        Body: fs.createReadStream(entry.localPath),
        ContentType: getContentType(entry)
      }));
    }

    results.push({
      ...entry,
      objectKey,
      cdnUrl: buildPublicMediaUrl(objectKey),
      uploaded: apply
    });

    console.log(`${apply ? 'Uploaded' : 'Would upload'} ${objectKey}`);
  }

  writeJson(path.join(outputDir, 'wordpress-image-upload-manifest.json'), results);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
