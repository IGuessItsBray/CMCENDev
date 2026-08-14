const assert = require('node:assert/strict');
const { test } = require('node:test');
const { authOrTempMiddleware } = require('../middleware/auth');
const {
  getTrustedProxyCidrs,
  isRequestFromTrustedProxy,
} = require('../config/network');
const { getClientIp, getCountry } = require('../services/analytics');
const { createRateLimit, pruneEntries } = require('../middleware/rate-limit');

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) {
      if (typeof name === 'object') {
        Object.assign(this.headers, name);
      } else {
        this.headers[name] = value;
      }
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('reads an explicit and bounded trusted-proxy allowlist', () => {
  assert.deepEqual(
    getTrustedProxyCidrs(' loopback, 172.18.0.0/16, ,uniquelocal '),
    ['loopback', '172.18.0.0/16', 'uniquelocal'],
  );
  assert.equal(getTrustedProxyCidrs(''), false);
});

test('only accepts forwarding data from a trusted proxy connection', () => {
  const trustedRequest = {
    socket: { remoteAddress: '127.0.0.1' },
    app: { get: () => (address) => address === '127.0.0.1' },
  };
  const directRequest = {
    socket: { remoteAddress: '198.51.100.40' },
    app: { get: () => () => false },
  };

  assert.equal(isRequestFromTrustedProxy(trustedRequest), true);
  assert.equal(isRequestFromTrustedProxy(directRequest), false);
});

test('analytics relies on Express-resolved client data', () => {
  const directRequest = {
    ip: '198.51.100.40',
    headers: {
      'x-forwarded-for': '203.0.113.8',
      'cf-ipcountry': 'US',
    },
    socket: { remoteAddress: '198.51.100.40' },
    app: { get: () => () => false },
  };
  const proxiedRequest = {
    ...directRequest,
    app: { get: () => (address) => address === '198.51.100.40' },
  };

  assert.equal(getClientIp(directRequest), '198.51.100.40');
  assert.equal(getCountry(directRequest, 'en-CA'), 'CA');
  assert.equal(getCountry(proxiedRequest, 'en-CA'), 'US');
});

test('temporary MFA tokens are rejected when supplied only in the URL', async () => {
  const response = createResponse();
  let nextCalled = false;

  await authOrTempMiddleware(
    {
      headers: {},
      body: {},
      query: { tempToken: 'must-not-be-read-from-the-url' },
    },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Authentication required');
  assert.equal(nextCalled, false);
});

test('rate-limit cache prunes expired entries and reserves room for new keys', () => {
  const entries = new Map([
    ['expired', { resetAt: 10 }],
    ['oldest', { resetAt: 30 }],
    ['newest', { resetAt: 40 }],
  ]);

  pruneEntries(entries, 20, 2);

  assert.deepEqual([...entries.keys()], ['newest']);

  const limiter = createRateLimit({
    name: 'test',
    windowMs: 60_000,
    max: 1,
    maxEntries: 2,
    keyGenerator: (req) => req.key,
  });
  const first = createResponse();
  const second = createResponse();

  limiter({ key: 'same' }, first, () => {});
  limiter({ key: 'same' }, second, () => {});

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
});
