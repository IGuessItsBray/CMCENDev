/*
 * One-off helper for moving the leadership portraits to the public media CDN.
 * Delete this script once the upload and CDN verification are complete.
 *
 * Usage (from server/):
 *   node scripts/upload-leadership-portraits.js
 *   node scripts/upload-leadership-portraits.js --debug
 *   node scripts/upload-leadership-portraits.js --debug --use-root-credentials
 *   node scripts/upload-leadership-portraits.js --apply
 */
require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env'),
});

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const debug = args.has('--debug');
const useRootCredentials = args.has('--use-root-credentials');
const publicMediaBaseUrlArg = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--public-media-base-url='));

if (publicMediaBaseUrlArg) {
  process.env.CDN_PUBLIC_BASE_URL = publicMediaBaseUrlArg.slice(
    '--public-media-base-url='.length,
  );
}

if (useRootCredentials) {
  const missingRootCredentials = [
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
  ].filter((name) => !String(process.env[name] || '').trim());

  if (missingRootCredentials.length) {
    throw new Error(
      `Missing required root credential configuration: ${missingRootCredentials.join(', ')}.`,
    );
  }

  // This only changes the environment for this one-off Node process.
  process.env.MINIO_ACCESS_KEY = process.env.MINIO_ROOT_USER;
  process.env.MINIO_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD;
}

const s3Client = require('../storage');
const { buildPublicMediaUrl } = require('../services/media-library');

const portraitsDirectory = path.join(
  __dirname,
  '..',
  'public',
  'images',
  'leadership',
);
const pageContentPath = path.join(
  __dirname,
  '..',
  'public',
  'page-content',
  'leadership.json',
);
const localImagePrefix = '/images/leadership/';
const contentTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

function redact(value) {
  let safeValue = String(value || '');

  for (const secret of [
    process.env.MINIO_ACCESS_KEY,
    process.env.MINIO_SECRET_KEY,
  ]) {
    if (secret) {
      safeValue = safeValue.split(secret).join('[redacted]');
    }
  }

  return safeValue;
}

function getEndpointForLogs() {
  try {
    const endpoint = new URL(process.env.MINIO_ENDPOINT);

    endpoint.username = '';
    endpoint.password = '';
    return endpoint.toString();
  } catch {
    return '[invalid MINIO_ENDPOINT URL]';
  }
}

function fingerprint(value) {
  return value
    ? `sha256:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)}`
    : 'not configured';
}

function debugLog(message) {
  if (debug) {
    console.log(`[debug] ${message}`);
  }
}

function storageError(context, error) {
  const metadata = error?.$metadata || {};
  const details = [
    `name=${error?.name || 'unknown'}`,
    `code=${error?.Code || error?.code || 'unknown'}`,
    `status=${metadata.httpStatusCode || 'unknown'}`,
    `requestId=${metadata.requestId || 'unknown'}`,
    `message=${redact(error?.message || 'No error message returned')}`,
  ];

  return new Error(`${context}: ${details.join(', ')}`);
}

function logConfiguration() {
  debugLog(`Using root credentials: ${useRootCredentials}`);
  debugLog(`MinIO endpoint: ${getEndpointForLogs()}`);
  debugLog(`MinIO bucket: ${process.env.MINIO_BUCKET_NAME}`);
  debugLog(`MINIO_ACCESS_KEY: ${fingerprint(process.env.MINIO_ACCESS_KEY)}`);
  debugLog(
    `MINIO_SECRET_KEY configured: ${Boolean(process.env.MINIO_SECRET_KEY)}`,
  );
  debugLog(
    `CDN_PUBLIC_BASE_URL configured: ${Boolean(process.env.CDN_PUBLIC_BASE_URL)}`,
  );
}

function collectPortraitPaths(value, paths = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPortraitPaths(item, paths));
    return paths;
  }

  if (!value || typeof value !== 'object') {
    return paths;
  }

  for (const [key, item] of Object.entries(value)) {
    if (
      key === 'image' &&
      typeof item === 'string' &&
      item.startsWith(localImagePrefix)
    ) {
      paths.add(item);
    } else {
      collectPortraitPaths(item, paths);
    }
  }

  return paths;
}

function replacePortraitPaths(value, publicUrls) {
  if (Array.isArray(value)) {
    return value.map((item) => replacePortraitPaths(item, publicUrls));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'image' && publicUrls.has(item)
        ? publicUrls.get(item)
        : replacePortraitPaths(item, publicUrls),
    ]),
  );
}

function assertConfiguration() {
  const required = [
    'MINIO_ENDPOINT',
    'MINIO_BUCKET_NAME',
    'CDN_PUBLIC_BASE_URL',
  ];
  const missing = required.filter(
    (name) => !String(process.env[name] || '').trim(),
  );

  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}.`);
  }
}

async function readPortrait(localPath) {
  const filename = path.basename(localPath);
  const extension = path.extname(filename).toLowerCase();
  const contentType = contentTypes.get(extension);

  if (!contentType || filename !== localPath.slice(localImagePrefix.length)) {
    throw new Error(`Unexpected leadership portrait path: ${localPath}`);
  }

  const sourcePath = path.join(portraitsDirectory, filename);
  const buffer = await fs.readFile(sourcePath);
  const hash = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')
    .slice(0, 12);
  const key = `leadership/portraits/${path.basename(filename, extension)}-${hash}${extension}`;

  return {
    buffer,
    contentType,
    key,
    localPath,
    publicUrl: buildPublicMediaUrl(key),
  };
}

async function uploadPortrait(portrait) {
  debugLog(`Uploading ${portrait.key} (${portrait.buffer.length} bytes).`);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: portrait.key,
        Body: portrait.buffer,
        ContentType: portrait.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    debugLog(`Verifying ${portrait.key}.`);
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: portrait.key,
      }),
    );
  } catch (error) {
    throw storageError(`Upload failed for ${portrait.key}`, error);
  }
}

async function checkBucketAccess() {
  debugLog('Running read-only ListObjectsV2 preflight (MaxKeys=1).');

  try {
    const result = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.MINIO_BUCKET_NAME,
        MaxKeys: 1,
      }),
    );
    debugLog(
      `ListObjectsV2 preflight succeeded (${result.KeyCount || 0} object returned).`,
    );
  } catch (error) {
    throw storageError('Bucket preflight failed', error);
  }
}

async function main() {
  assertConfiguration();
  logConfiguration();

  if (debug) {
    await checkBucketAccess();
  }

  const pageContent = JSON.parse(await fs.readFile(pageContentPath, 'utf8'));
  const localPaths = [...collectPortraitPaths(pageContent)].sort();
  const portraits = await Promise.all(localPaths.map(readPortrait));

  if (!portraits.length) {
    throw new Error(
      'No local leadership portraits were found in leadership.json.',
    );
  }

  console.table(
    portraits.map(({ key, localPath, publicUrl }) => ({
      localPath,
      key,
      publicUrl,
    })),
  );

  if (!apply) {
    console.log(
      '\nDry run only. No MinIO objects or page-content files were changed.',
    );
    console.log(
      '\nRun again with --apply to upload and replace these image paths.',
    );
    return;
  }

  for (const portrait of portraits) {
    await uploadPortrait(portrait);
    console.log(`Uploaded and verified ${portrait.key}`);
  }

  const publicUrls = new Map(
    portraits.map(({ localPath, publicUrl }) => [localPath, publicUrl]),
  );
  const updatedPageContent = replacePortraitPaths(pageContent, publicUrls);

  await fs.writeFile(
    pageContentPath,
    `${JSON.stringify(updatedPageContent, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nUpdated ${path.relative(process.cwd(), pageContentPath)}.`);
  console.log(
    'Local portraits were not deleted. Verify the CDN first, then remove them manually.',
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
