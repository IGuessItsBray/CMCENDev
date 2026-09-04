const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { setPublicAssetCacheHeaders } = require('../server');
const { setTranslationRuntimeCacheHeaders } = require('../routes/translations');

function createResponse() {
  return {
    headers: new Map(),
    set(name, value) {
      this.headers.set(name, value);
      return this;
    },
  };
}

test('does not cache shared client code and styles at stable URLs', () => {
  for (const filename of ['index.js', 'styles.css']) {
    const response = createResponse();

    setPublicAssetCacheHeaders(
      response,
      path.join(__dirname, '..', 'public', filename),
    );

    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('caches content-hashed client code and styles indefinitely', () => {
  for (const filename of ['index.123456789abc.js', 'styles.abcdef123456.css']) {
    const response = createResponse();

    setPublicAssetCacheHeaders(
      response,
      path.join(__dirname, '..', 'public', filename),
    );

    assert.equal(
      response.headers.get('Cache-Control'),
      'public, max-age=31536000, immutable',
    );
  }
});

test('leaves versionable public assets to the static middleware defaults', () => {
  const response = createResponse();

  setPublicAssetCacheHeaders(
    response,
    path.join(__dirname, '..', 'public', 'images', 'logo.png'),
  );

  assert.equal(response.headers.has('Cache-Control'), false);
});

test('does not cache the generated translation runtime', () => {
  const response = createResponse();

  setTranslationRuntimeCacheHeaders(response);

  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
