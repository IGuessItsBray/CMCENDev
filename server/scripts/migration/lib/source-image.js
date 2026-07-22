const path = require('path');
const axios = require('axios');

const DEFAULT_IMAGE_URL = 'https://cdn.corebot.ca/cmcen-demo/images/064b615c-38c3-4946-a82f-48116a9d9a55/large.webp';
const DEFAULT_IMAGE_NAME = 'jimmy-crest.webp';

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
      'User-Agent': userAgent
    }
  });
}

async function loadDefaultImage({ httpClient, sourceUrl = '', fallbackReason, userAgent }) {
  const response = await requestImage(httpClient, DEFAULT_IMAGE_URL, userAgent);

  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type'] || 'image/webp',
    originalName: DEFAULT_IMAGE_NAME,
    sourceUrl,
    fallbackSourceUrl: DEFAULT_IMAGE_URL,
    usedFallback: true,
    fallbackReason
  };
}

async function downloadSourceImage(sourceUrl, options = {}) {
  const httpClient = options.httpClient || axios;
  const userAgent = options.userAgent || 'CMCEN migration script';

  if (!sourceUrl) {
    return loadDefaultImage({
      httpClient,
      fallbackReason: 'missing-source-url',
      userAgent
    });
  }

  try {
    const response = await requestImage(httpClient, sourceUrl, userAgent);

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers['content-type'] || 'image/jpeg',
      originalName: getUrlFileName(sourceUrl),
      sourceUrl,
      fallbackSourceUrl: '',
      usedFallback: false,
      fallbackReason: ''
    };
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }

    return loadDefaultImage({
      httpClient,
      sourceUrl,
      fallbackReason: 'http-404',
      userAgent
    });
  }
}

module.exports = {
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_URL,
  downloadSourceImage
};
