const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getPlausibleConfig,
  normalizeHttpUrl,
} = require('../services/plausible');

test('disables Plausible when its domain or endpoint is not configured', () => {
  assert.deepEqual(getPlausibleConfig({}), { enabled: false });
  assert.deepEqual(
    getPlausibleConfig({ PLAUSIBLE_DOMAIN: 'cmcen.example' }),
    { enabled: false },
  );
});

test('builds a self-hosted Plausible configuration', () => {
  assert.deepEqual(
    getPlausibleConfig({
      PLAUSIBLE_DOMAIN: 'cmcen.example',
      PLAUSIBLE_API_URL: 'https://analytics.cmcen.example/api/event',
    }),
    {
      enabled: true,
      domain: 'cmcen.example',
      endpoint: 'https://analytics.cmcen.example/api/event',
    },
  );
});

test('rejects non-HTTP Plausible endpoints', () => {
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), '');
  assert.equal(normalizeHttpUrl('not a url'), '');
  assert.deepEqual(
    getPlausibleConfig({
      PLAUSIBLE_DOMAIN: 'cmcen.example',
      PLAUSIBLE_API_URL: 'javascript:alert(1)',
    }),
    { enabled: false },
  );
});
