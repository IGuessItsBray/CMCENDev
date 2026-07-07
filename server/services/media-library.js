const DEFAULT_CDN_BASE_URL = 'https://cdn.corebot.ca/cmcen-demo';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/u, '');
}

function getCdnBaseUrl() {
  return trimTrailingSlash(
    process.env.CDN_PUBLIC_BASE_URL ||
    process.env.CDN_BASE_URL ||
    DEFAULT_CDN_BASE_URL
  );
}

function getKnownCdnBaseUrls() {
  return [
    getCdnBaseUrl(),
    DEFAULT_CDN_BASE_URL
  ].filter((value, index, allValues) =>
    value && allValues.indexOf(value) === index
  );
}

function encodeObjectKey(key) {
  return String(key || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

function buildPublicMediaUrl(key) {
  const cleanKey = String(key || '').replace(/^\/+/u, '');

  return cleanKey
    ? `${getCdnBaseUrl()}/${encodeObjectKey(cleanKey)}`
    : '';
}

function getMediaKeyFromValue(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (!/^https?:\/\//iu.test(rawValue)) {
    return decodeURIComponent(rawValue.replace(/^\/+/u, ''));
  }

  try {
    const url = new URL(rawValue);

    for (const knownBaseUrl of getKnownCdnBaseUrls()) {
      const cdnBaseUrl = new URL(knownBaseUrl);

      if (url.origin !== cdnBaseUrl.origin) {
        continue;
      }

      const basePath = cdnBaseUrl.pathname.replace(/\/+$/u, '');
      let objectPath = url.pathname;

      if (basePath && objectPath.startsWith(`${basePath}/`)) {
        objectPath = objectPath.slice(basePath.length + 1);
      } else {
        objectPath = objectPath.replace(/^\/+/u, '');
      }

      return decodeURIComponent(objectPath);
    }
  } catch {
    return '';
  }

  return '';
}

module.exports = {
  buildPublicMediaUrl,
  getCdnBaseUrl,
  getMediaKeyFromValue
};
