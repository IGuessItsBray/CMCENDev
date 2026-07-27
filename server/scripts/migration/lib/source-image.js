const path = require('path');
const axios = require('axios');

const DEFAULT_IMAGE_URL =
  'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp';
const DEFAULT_IMAGE_NAME = 'cmcen-crest.webp';

function getUrlFileName(sourceUrl) {
  try {
    return path.basename(new URL(sourceUrl).pathname);
  } catch {
    return '';
  }
}

async function requestImage(httpClient, sourceUrl, userAgent) {
  return httpClient.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': userAgent,
    },
  });
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
}) {
  const response = await requestImage(httpClient, DEFAULT_IMAGE_URL, userAgent);

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

  if (!sourceUrl) {
    return loadDefaultImage({
      httpClient,
      fallbackReason: 'missing-source-url',
      userAgent,
      validate,
    });
  }

  let response;
  try {
    response = await requestImage(httpClient, sourceUrl, userAgent);
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
    });
  }
}

module.exports = {
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_URL,
  downloadSourceImage,
};
