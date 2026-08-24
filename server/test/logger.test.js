const test = require('node:test');
const assert = require('node:assert/strict');
const { redactString, sanitize } = require('../services/logger');

test('redacts credentials and personal contact details from log strings', () => {
  const result = redactString(
    'Bearer abc.def.ghi https://user:password@example.test?token=top-secret member@example.test',
  );

  assert.equal(result.includes('abc.def.ghi'), false);
  assert.equal(result.includes('top-secret'), false);
  assert.equal(result.includes('password'), false);
  assert.equal(result.includes('member@example.test'), false);
});

test('redacts sensitive object properties before they are logged', () => {
  const result = sanitize({
    email: 'member@example.test',
    nested: {
      accessToken: 'top-secret',
      password: 'not-for-logs',
    },
  });

  assert.equal(result.email, '[REDACTED]');
  assert.equal(result.nested.accessToken, '[REDACTED]');
  assert.equal(result.nested.password, '[REDACTED]');
});

test('retains a sanitized error stack for diagnostics', () => {
  const result = sanitize(
    new Error('Request failed with Bearer abc.def.ghi for member@example.test'),
  );

  assert.equal(result.name, 'Error');
  assert.equal(result.message, 'Request failed with [REDACTED] for [REDACTED]');
  assert.match(result.stack, /^Error: Request failed with \[REDACTED\]/u);
  assert.equal(result.stack.includes('abc.def.ghi'), false);
  assert.equal(result.stack.includes('member@example.test'), false);
});
