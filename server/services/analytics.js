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

function getCountry(req) {
  const country = [
    req.headers['cf-ipcountry'],
    req.headers['x-vercel-ip-country'],
    req.headers['x-appengine-country'],
    req.headers['x-country-code'],
    req.headers['x-geo-country'],
    req.headers['fastly-client-country']
  ].map(cleanString).find(Boolean);

  const countryCode = cleanString(country).toUpperCase();

  if (/^[A-Z]{2}$/u.test(countryCode) && !['XX', 'ZZ'].includes(countryCode)) {
    return countryCode;
  }

  return 'Unknown';
}

module.exports = {
  getBrowser,
  getCountry,
  getDeviceType,
  getOsType,
  getReferrerHost,
  getSource,
  shouldTrackRequest
};
