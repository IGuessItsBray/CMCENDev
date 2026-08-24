const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BRANDING } = require('../config/branding');
const brandingRoutes = require('../routes/branding');

test('branding catalogue exposes the supported font and colour tokens', () => {
  assert.equal(BRANDING.fonts.length, 4);
  assert.equal(BRANDING.colors.light.length > 0, true);
  assert.equal(BRANDING.colors.dark.length > 0, true);
  assert.deepEqual(BRANDING.theming.supportedThemes, ['light', 'dark']);

  for (const [, value] of [...BRANDING.colors.light, ...BRANDING.colors.dark]) {
    assert.match(value, /^#[0-9a-f]{6}$/iu);
  }
});

test('branding endpoint returns the catalogue with public caching', () => {
  const response = {
    cacheControl: '',
    body: null,
    set(name, value) {
      if (name === 'Cache-Control') this.cacheControl = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };

  brandingRoutes.getBranding({}, response);

  assert.equal(response.cacheControl, 'public, max-age=300');
  assert.deepEqual(response.body, BRANDING);
});
