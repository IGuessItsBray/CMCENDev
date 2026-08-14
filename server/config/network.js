const MAX_TRUSTED_PROXY_ENTRIES = 16;

function getTrustedProxyCidrs(value = process.env.TRUST_PROXY_CIDRS) {
  const cidrs = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_TRUSTED_PROXY_ENTRIES);

  return cidrs.length ? cidrs : false;
}

function isRequestFromTrustedProxy(req) {
  const trustProxy = req?.app?.get('trust proxy fn');
  const remoteAddress = req?.socket?.remoteAddress;

  return Boolean(
    remoteAddress &&
    typeof trustProxy === 'function' &&
    trustProxy(remoteAddress, 0),
  );
}

module.exports = {
  getTrustedProxyCidrs,
  isRequestFromTrustedProxy,
};
