const SKIPPED_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.map',
  '.txt'
]);

function cleanString(value, fallback = '') {
  return String(value || fallback).trim();
}

function getPathExtension(pathname) {
  const match = cleanString(pathname).match(/(\.[a-z0-9]+)$/iu);
  return match ? match[1].toLowerCase() : '';
}

function shouldTrackRequest(req) {
  if (req.method !== 'GET') return false;
  if (req.path.startsWith('/api/')) return false;
  if (req.path === '/favicon.ico') return false;
  if (req.path === '/analytics.html') return false;

  const extension = getPathExtension(req.path);
  if (extension && extension !== '.html') return false;

  const accept = cleanString(req.headers.accept).toLowerCase();
  return !accept || accept.includes('text/html') || accept.includes('*/*');
}

function getDeviceType(userAgent) {
  const agent = userAgent.toLowerCase();

  if (/bot|crawler|spider|preview|slurp|duckduckbot|bingbot|googlebot/u.test(agent)) {
    return 'bot';
  }

  if (/ipad|tablet|kindle|silk/u.test(agent)) {
    return 'tablet';
  }

  if (/mobile|iphone|android.*mobile|phone/u.test(agent)) {
    return 'mobile';
  }

  if (agent) {
    return 'desktop';
  }

  return 'unknown';
}

function getOsType(userAgent) {
  const agent = userAgent.toLowerCase();

  if (/windows nt/u.test(agent)) return 'Windows';
  if (/iphone|ipad|ipod/u.test(agent)) return 'iOS';
  if (/android/u.test(agent)) return 'Android';
  if (/mac os x|macintosh/u.test(agent)) return 'macOS';
  if (/linux/u.test(agent)) return 'Linux';
  if (/cros/u.test(agent)) return 'ChromeOS';

  return 'Unknown';
}

function getBrowser(userAgent) {
  const agent = userAgent.toLowerCase();

  if (/edg\//u.test(agent)) return 'Edge';
  if (/opr\//u.test(agent) || /opera/u.test(agent)) return 'Opera';
  if (/chrome\//u.test(agent) && !/chromium/u.test(agent)) return 'Chrome';
  if (/safari\//u.test(agent) && !/chrome\//u.test(agent)) return 'Safari';
  if (/firefox\//u.test(agent)) return 'Firefox';
  if (/bot|crawler|spider/u.test(agent)) return 'Bot';

  return 'Unknown';
}

function getReferrerHost(referrer) {
  if (!referrer) return '';

  try {
    return new URL(referrer).hostname.replace(/^www\./iu, '');
  } catch {
    return '';
  }
}

function getSource(req, referrerHost) {
  if (!referrerHost) return 'direct';

  const host = cleanString(req.headers.host).split(':')[0].replace(/^www\./iu, '');
  if (host && referrerHost === host) return 'direct';

  return referrerHost;
}

function normalizeCountryCode(value) {
  const countryCode = cleanString(value).toUpperCase();

  return /^[A-Z]{2}$/u.test(countryCode) && !['XX', 'ZZ'].includes(countryCode)
    ? countryCode
    : '';
}

function getCountryFromLocale(locale) {
  const localeParts = cleanString(locale)
    .replace(/_/gu, '-')
    .split('-');

  return localeParts.length > 1
    ? normalizeCountryCode(localeParts[localeParts.length - 1])
    : '';
}

function getCountryFromTimeZone(timeZone) {
  const cleanTimeZone = cleanString(timeZone);

  if (/^(America\/Toronto|America\/Vancouver|America\/Edmonton|America\/Winnipeg|America\/Halifax|America\/St_Johns|America\/Regina|America\/Whitehorse)$/u.test(cleanTimeZone)) {
    return 'CA';
  }

  if (/^(America\/New_York|America\/Chicago|America\/Denver|America\/Los_Angeles|America\/Phoenix|America\/Anchorage|Pacific\/Honolulu)$/u.test(cleanTimeZone)) {
    return 'US';
  }

  const region = cleanTimeZone.split('/')[0];
  return region === 'Australia' ? 'AU' : '';
}

function getClientIp(req) {
  const forwardedFor = cleanString(req.headers['x-forwarded-for'])
    .split(',')
    .map(value => cleanString(value))
    .find(Boolean);

  return forwardedFor || cleanString(req.ip || req.socket?.remoteAddress);
}

function normalizeIpAddress(value) {
  return cleanString(value)
    .replace(/^::ffff:/u, '')
    .split('%')[0];
}

function isInternalIpAddress(value) {
  const ipAddress = normalizeIpAddress(value);

  if (!ipAddress) return false;
  if (ipAddress === '::1' || ipAddress === '127.0.0.1') return true;
  if (/^10\./u.test(ipAddress)) return true;
  if (/^192\.168\./u.test(ipAddress)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./u.test(ipAddress)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u.test(ipAddress)) return true;
  if (/^fc[0-9a-f]{2}:/iu.test(ipAddress) || /^fd[0-9a-f]{2}:/iu.test(ipAddress)) return true;
  if (/^fe80:/iu.test(ipAddress)) return true;

  return false;
}

function getCountry(req, fallbackLocale = '', fallbackTimeZone = '') {
  const country = [
    req.headers['cf-ipcountry'],
    req.headers['x-vercel-ip-country'],
    req.headers['x-appengine-country'],
    req.headers['x-real-ip-country'],
    req.headers['x-forwarded-country'],
    req.headers['x-client-country'],
    req.headers['x-country'],
    req.headers['x-country-code'],
    req.headers['x-geoip-country-code'],
    req.headers['x-geo-country'],
    req.headers['x-ip-country'],
    req.headers['fastly-client-country']
  ].map(normalizeCountryCode).find(Boolean);

  return country ||
    (isInternalIpAddress(getClientIp(req)) ? 'Internal' : '') ||
    getCountryFromLocale(fallbackLocale) ||
    getCountryFromTimeZone(fallbackTimeZone) ||
    'CA';
}

function normalizeStoredCountry(country, ipAddress = '') {
  const cleanCountry = cleanString(country);
  const countryCode = normalizeCountryCode(cleanCountry);

  if (['EN', 'FR'].includes(countryCode)) {
    return isInternalIpAddress(ipAddress) ? 'Internal' : 'CA';
  }

  if (countryCode) return countryCode;
  if (cleanCountry.toLowerCase() === 'internal') return 'Internal';
  if (isInternalIpAddress(ipAddress)) return 'Internal';

  return 'CA';
}

module.exports = {
  getBrowser,
  getClientIp,
  getCountry,
  getDeviceType,
  getOsType,
  getReferrerHost,
  normalizeStoredCountry,
  getSource,
  shouldTrackRequest
};
