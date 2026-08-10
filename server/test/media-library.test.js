const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  buildPublicMediaUrl,
  getCdnBaseUrl,
  getMediaKeyFromValue,
} = require('../services/media-library');

const ENV_KEYS = [
  'CDN_BASE_URL',
  'CDN_PUBLIC_BASE_URL',
  'MINIO_BUCKET_NAME',
  'MINIO_ENDPOINT',
  'MINIO_PUBLIC_ENDPOINT',
];
const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnvironment[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnvironment[key];
    }
  }
});

test('builds migrated media URLs from the public endpoint, not internal MinIO', () => {
  delete process.env.CDN_BASE_URL;
  delete process.env.CDN_PUBLIC_BASE_URL;
  process.env.MINIO_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_PUBLIC_ENDPOINT = 'http://cdn.corebot.ca';
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  const key =
    'legacy/current-site/retirements/357901-retirement-lieutenant-colonel-jeff-zoomer-szumlanski-00340-cele/large.webp';

  assert.equal(getCdnBaseUrl(), 'http://cdn.corebot.ca/cmcen-demo');
  assert.equal(
    buildPublicMediaUrl(key),
    `http://cdn.corebot.ca/cmcen-demo/${key}`,
  );
});

test('prefers an explicit CDN base URL', () => {
  process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.ca/media/';
  process.env.MINIO_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_PUBLIC_ENDPOINT = 'http://cdn.corebot.ca';
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  assert.equal(getCdnBaseUrl(), 'https://cdn.example.ca/media');
  assert.equal(
    buildPublicMediaUrl('images/example photo.jpg'),
    'https://cdn.example.ca/media/images/example%20photo.jpg',
  );
});

test('recognizes an internal storage URL and rebuilds it through the CDN', () => {
  process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.ca/media';
  process.env.MINIO_ENDPOINT = 'http://100.64.0.10:9000';
  delete process.env.MINIO_PUBLIC_ENDPOINT;
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  const internalUrl =
    'http://100.64.0.10:9000/cmcen-demo/images/alex-example/large.webp';

  assert.equal(
    getMediaKeyFromValue(internalUrl),
    'images/alex-example/large.webp',
  );
  assert.equal(
    buildPublicMediaUrl(getMediaKeyFromValue(internalUrl)),
    'https://cdn.example.ca/media/images/alex-example/large.webp',
  );
});
