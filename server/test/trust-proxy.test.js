const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const proxyaddr = require('proxy-addr');
const { getTrustProxy } = require('../config/trust-proxy');

function forwardedRequest(environment, remoteAddress, headers) {
  const app = express();
  app.set('trust proxy', getTrustProxy(environment));
  const req = Object.create(app.request);
  req.app = app;
  req.socket = { remoteAddress };
  req.connection = req.socket;
  req.headers = headers;
  return req;
}

test('ignores spoofed forwarding headers by default and from untrusted peers', () => {
  for (const environment of [{}, { TRUST_PROXY: '192.0.2.10' }]) {
    const req = forwardedRequest(environment, '198.51.100.9', {
      'x-forwarded-for': '203.0.113.99',
      'x-forwarded-proto': 'https',
    });
    assert.equal(req.ip, '198.51.100.9');
    assert.equal(req.secure, false);
  }
});

test('trusts only explicit proxy peers and stops at the nearest untrusted hop', () => {
  const req = forwardedRequest(
    { TRUST_PROXY: '192.0.2.10/32,2001:db8:1::/64' },
    '192.0.2.10',
    {
      'x-forwarded-for': '203.0.113.99, 198.51.100.9',
      'x-forwarded-proto': 'https',
    },
  );
  assert.equal(req.ip, '198.51.100.9');
  assert.equal(req.secure, true);
  const trust = proxyaddr.compile(['::ffff:192.0.2.10/128']);
  assert.equal(trust('192.0.2.10'), true);
  assert.equal(trust('192.0.2.11'), false);
});

test('rejects broad and malformed proxy configuration', () => {
  for (const TRUST_PROXY of [
    'true',
    '1',
    'loopback',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.1/33',
    '127.0.0.1,',
    '::1/no',
    '10.0.0.1/8/4',
  ]) {
    assert.throws(() => getTrustProxy({ TRUST_PROXY }), /TRUST_PROXY/u);
  }
});

test('handles hostile nested query input without prototype pollution', () => {
  const qs = require('qs');
  const parsed = qs.parse(
    'a[__proto__][polluted]=1&a[constructor][prototype][polluted]=1&x[0]=one&x[999999999]=two',
  );
  assert.equal({}.polluted, undefined);
  assert.equal(Array.isArray(parsed.x), false);
});
