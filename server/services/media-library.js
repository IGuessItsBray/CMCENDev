function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/u, '');
}

function getMinioPublicBaseUrl() {
  const endpoint = trimTrailingSlash(
    process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT
  );
  const bucketName = String(process.env.MINIO_BUCKET_NAME || '').replace(/^\/+|\/+$/gu, '');

  return endpoint && bucketName
    ? `${endpoint}/${bucketName}`
    : endpoint;
}

function getCdnBaseUrl() {
  return trimTrailingSlash(
    process.env.CDN_PUBLIC_BASE_URL ||
    process.env.CDN_BASE_URL ||
    getMinioPublicBaseUrl()
  );
}

function getKnownCdnBaseUrls() {
  return [
    getCdnBaseUrl()
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

function getMediaKeyFromPath(pathname, basePath = '') {
  const cleanBasePath = trimTrailingSlash(basePath);
  let objectPath = String(pathname || '');

  if (cleanBasePath && objectPath.startsWith(`${cleanBasePath}/`)) {
    objectPath = objectPath.slice(cleanBasePath.length + 1);
  } else {
    objectPath = objectPath.replace(/^\/+/u, '');
  }

  return decodeURIComponent(objectPath);
}

function getMediaKeyFromValue(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (!/^https?:\/\//iu.test(rawValue)) {
    for (const knownBaseUrl of getKnownCdnBaseUrls()) {
      if (!knownBaseUrl.startsWith('/')) continue;

      if (rawValue === knownBaseUrl || rawValue.startsWith(`${knownBaseUrl}/`)) {
        return getMediaKeyFromPath(rawValue, knownBaseUrl);
      }
    }

    return getMediaKeyFromPath(rawValue);
  }

  try {
    const url = new URL(rawValue);

    for (const knownBaseUrl of getKnownCdnBaseUrls()) {
      if (knownBaseUrl.startsWith('/')) {
        if (url.pathname === knownBaseUrl || url.pathname.startsWith(`${knownBaseUrl}/`)) {
          return getMediaKeyFromPath(url.pathname, knownBaseUrl);
        }

        continue;
      }

      const cdnBaseUrl = new URL(knownBaseUrl);

      if (url.origin !== cdnBaseUrl.origin) {
        continue;
      }

      return getMediaKeyFromPath(url.pathname, cdnBaseUrl.pathname);
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
