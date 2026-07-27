const { getCdnBaseUrl } = require('../../../services/media-library');

function configurePublicMediaBaseUrl(args) {
  const override = String(args['public-media-base-url'] || '').trim();

  if (override) {
    process.env.CDN_PUBLIC_BASE_URL = override;
  }

  return getCdnBaseUrl();
}

function assertPublicMediaBaseUrl(publicBaseUrl) {
  const internalEndpoint = String(process.env.MINIO_ENDPOINT || '').replace(
    /\/+$/u,
    '',
  );
  const publicEndpoint = String(
    process.env.MINIO_PUBLIC_ENDPOINT || '',
  ).replace(/\/+$/u, '');
  const hasCdnBase = Boolean(
    process.env.CDN_PUBLIC_BASE_URL || process.env.CDN_BASE_URL,
  );
  const hasSeparatePublicEndpoint = Boolean(
    publicEndpoint && publicEndpoint !== internalEndpoint,
  );

  if (!hasCdnBase && !hasSeparatePublicEndpoint) {
    throw new Error(
      `Public media URL resolves through the internal MinIO endpoint (${publicBaseUrl}). ` +
        'Set CDN_PUBLIC_BASE_URL or pass --public-media-base-url=<public URL including bucket>.',
    );
  }
}

module.exports = {
  assertPublicMediaBaseUrl,
  configurePublicMediaBaseUrl,
};
