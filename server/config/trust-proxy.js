const { isIP } = require('node:net');

function getTrustProxy(environment = process.env) {
  const configured = String(environment.TRUST_PROXY || '').trim();
  if (!configured) return false;

  const peers = configured.split(',').map((peer) => peer.trim());
  for (const peer of peers) {
    const [address, prefix, extra] = peer.split('/');
    const version = isIP(address);
    if (
      !version ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/u.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'TRUST_PROXY must contain only explicit proxy IP addresses or CIDRs',
      );
    }
  }
  return peers;
}

module.exports = { getTrustProxy };
