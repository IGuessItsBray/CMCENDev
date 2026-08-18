function normalizeHttpUrl(value) {
  const candidate = String(value || '').trim();

  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function getPlausibleConfig(environment = process.env) {
  const domain = String(environment.PLAUSIBLE_DOMAIN || '').trim();
  const endpoint = normalizeHttpUrl(environment.PLAUSIBLE_API_URL);

  if (!domain || !endpoint) {
    return { enabled: false };
  }

  return { enabled: true, domain, endpoint };
}

module.exports = {
  getPlausibleConfig,
  normalizeHttpUrl,
};
