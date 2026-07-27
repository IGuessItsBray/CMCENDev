const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  assertPublicMediaBaseUrl,
  configurePublicMediaBaseUrl,
} = require('../scripts/migration/lib/public-media');

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

test('migration override replaces an internal container endpoint', () => {
  delete process.env.CDN_BASE_URL;
  delete process.env.CDN_PUBLIC_BASE_URL;
  process.env.MINIO_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_PUBLIC_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  const publicBaseUrl = configurePublicMediaBaseUrl({
    'public-media-base-url': 'http://cdn.corebot.ca/cmcen-demo/',
  });

  assert.equal(publicBaseUrl, 'http://cdn.corebot.ca/cmcen-demo');
  assert.doesNotThrow(() => assertPublicMediaBaseUrl(publicBaseUrl));
});

test('apply validation rejects an internal-only public URL', () => {
  delete process.env.CDN_BASE_URL;
  delete process.env.CDN_PUBLIC_BASE_URL;
  process.env.MINIO_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_PUBLIC_ENDPOINT = 'http://mystic-minio:9000';
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  const publicBaseUrl = configurePublicMediaBaseUrl({});

  assert.throws(
    () => assertPublicMediaBaseUrl(publicBaseUrl),
    /Public media URL resolves through the internal MinIO endpoint/u,
  );
});
