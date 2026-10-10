const path = require('path');
const axios = require('axios');
const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');
const { MAX_IMAGE_BYTES } = require('../../../services/media-sanitization');
const { buildPublicMediaUrl } = require('../../../services/media-library');

const DEFAULT_IMAGE_URL = buildPublicMediaUrl('images/branch-crest/large.webp');
const DEFAULT_IMAGE_NAME = 'cmcen-crest.webp';
const blockedNetworks = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
])
  blockedNetworks.addSubnet(address, prefix, 'ipv4');
const publicIpv6 = new BlockList();
publicIpv6.addSubnet('2000::', 3, 'ipv6');
blockedNetworks.addSubnet('2001:db8::', 32, 'ipv6');
blockedNetworks.addSubnet('2002::', 16, 'ipv6');
blockedNetworks.addSubnet('2001::', 32, 'ipv6');

function publicImageLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (
      !addresses.length ||
      addresses.some(
        ({ address, family }) =>
          blockedNetworks.check(address, family === 6 ? 'ipv6' : 'ipv4') ||
          (family === 6 && !publicIpv6.check(address, 'ipv6')),
      )
    ) {
      return callback(
        new Error('Source image DNS must resolve only to public addresses'),
      );
    }
    // Use the validated addresses directly in the connection; do not resolve twice.
    return options?.all
      ? callback(null, addresses)
      : callback(null, addresses[0].address, addresses[0].family);
  });
}

function assertImageSource(sourceUrl, allowedOrigins) {
  const url = new URL(sourceUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/^\[|\]$/gu, '')) ||
    !allowedOrigins.includes(url.origin)
  ) {
    throw new Error('Source image URL must use an allowed HTTPS origin');
  }
}

function getUrlFileName(sourceUrl) {
  try {
    return path.basename(new URL(sourceUrl).pathname);
  } catch {
    return '';
  }
}

async function requestImage(httpClient, sourceUrl, userAgent, allowedOrigins) {
  assertImageSource(sourceUrl, allowedOrigins);
  return httpClient.get(sourceUrl, {
    adapter: 'http',
    proxy: false,
    lookup: publicImageLookup,
    maxRedirects: 0,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': userAgent,
    },
  });
}

function defaultAllowedOrigins() {
  return [
    'https://cmcen-rcmce.ca',
    'https://www.cmcen-rcmce.ca',
    ...(DEFAULT_IMAGE_URL.startsWith('https://')
      ? [new URL(DEFAULT_IMAGE_URL).origin]
      : []),
  ];
}

// Strict transport only: original-selection callers must never substitute a
// crest for a failed candidate. No validation, conversion or fallback here.
async function requestSourceImage(sourceUrl, options = {}) {
  return requestImage(
    options.httpClient || axios,
    sourceUrl,
    options.userAgent || 'CMCEN migration script',
    options.allowedOrigins || defaultAllowedOrigins(),
  );
}

async function validateImage(image, validate) {
  if (validate) {
    await validate(image.buffer);
  }

  return image;
}

async function loadDefaultImage({
  httpClient,
  sourceUrl = '',
  fallbackReason,
  userAgent,
  validate,
  allowedOrigins,
}) {
  const response = await requestImage(
    httpClient,
    DEFAULT_IMAGE_URL,
    userAgent,
    allowedOrigins,
  );

  return validateImage(
    {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'image/webp',
      originalName: DEFAULT_IMAGE_NAME,
      sourceUrl,
      fallbackSourceUrl: DEFAULT_IMAGE_URL,
      usedFallback: true,
      fallbackReason,
    },
    validate,
  );
}

async function downloadSourceImage(sourceUrl, options = {}) {
  const httpClient = options.httpClient || axios;
  const userAgent = options.userAgent || 'CMCEN migration script';
  const validate = options.validateImage;
  const allowedOrigins = options.allowedOrigins || defaultAllowedOrigins();

  if (!sourceUrl) {
    return loadDefaultImage({
      httpClient,
      fallbackReason: 'missing-source-url',
      userAgent,
      validate,
      allowedOrigins,
    });
  }

  let response;
  try {
    response = await requestImage(
      httpClient,
      sourceUrl,
      userAgent,
      allowedOrigins,
    );
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }

    return loadDefaultImage({
      httpClient,
      sourceUrl,
      fallbackReason: 'http-404',
      userAgent,
      validate,
      allowedOrigins,
    });
  }

  const sourceImage = {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type'] || 'image/jpeg',
    originalName: getUrlFileName(sourceUrl),
    sourceUrl,
    fallbackSourceUrl: '',
    usedFallback: false,
    fallbackReason: '',
  };

  try {
    return await validateImage(sourceImage, validate);
  } catch {
    return loadDefaultImage({
      httpClient,
      sourceUrl,
      fallbackReason: 'invalid-image-data',
      userAgent,
      validate,
      allowedOrigins,
    });
  }
}

module.exports = {
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_URL,
  downloadSourceImage,
  requestSourceImage,
  publicImageLookup,
};
