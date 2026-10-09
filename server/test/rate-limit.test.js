const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRateLimit } = require('../middleware/rate-limit');

function invoke(limiter, ip) {
  const response = {
    locals: {},
    headers: {},
    statusCode: 200,
    allowed: false,
    set(headers, value) {
      if (typeof headers === 'string') this.headers[headers] = value;
      else Object.assign(this.headers, headers);
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  limiter({ ip }, response, () => {
    response.allowed = true;
  });
  return response;
}

test('bounds limiter cardinality without evicting active counters and expires idle entries', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100000 });
  const limiter = createRateLimit({
    name: 'test',
    windowMs: 1000,
    max: 2,
    maxEntries: 2,
  });
  assert.equal(invoke(limiter, 'a').allowed, true);
  assert.equal(invoke(limiter, 'b').allowed, true);
  for (let i = 0; i < 1000; i += 1) {
    assert.equal(invoke(limiter, `new-${i}`).statusCode, 429);
  }
  assert.equal(invoke(limiter, 'a').allowed, true);
  const limited = invoke(limiter, 'a');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['RateLimit-Remaining'], '0');
  assert.equal(limited.headers['Retry-After'], '1');
  t.mock.timers.tick(1000);
  assert.equal(invoke(limiter, 'c').allowed, true);
  assert.equal(invoke(limiter, 'd').allowed, true);
  assert.equal(invoke(limiter, 'e').statusCode, 429);
});

test('invalid limiter settings fail at creation', () => {
  for (const windowMs of [0, -1, Infinity]) {
    assert.throws(() => createRateLimit({ name: 'test', windowMs, max: 2 }));
  }
});
