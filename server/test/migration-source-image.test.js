const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_URL,
  downloadSourceImage
} = require('../scripts/migration/lib/source-image');

test('uses jimmy crest when a legacy source image returns 404', async () => {
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/missing.jpeg';
  const requestedUrls = [];
  const sourceImage = await downloadSourceImage(sourceUrl, {
    httpClient: {
      get: async url => {
        requestedUrls.push(url);

        if (url === sourceUrl) {
          const error = new Error('Not Found');
          error.response = { status: 404 };
          throw error;
        }

        return {
          data: Buffer.from('jimmy crest'),
          headers: { 'content-type': 'image/webp' }
        };
      }
    }
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'http-404');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.equal(sourceImage.contentType, 'image/webp');
  assert.equal(sourceImage.sourceUrl, sourceUrl);
  assert.equal(sourceImage.fallbackSourceUrl, DEFAULT_IMAGE_URL);
  assert.deepEqual(requestedUrls, [sourceUrl, DEFAULT_IMAGE_URL]);
});

test('uses jimmy crest when a legacy post has no source image', async () => {
  const sourceImage = await downloadSourceImage('', {
    httpClient: {
      get: async url => {
        assert.equal(url, DEFAULT_IMAGE_URL);
        return {
          data: Buffer.from('jimmy crest'),
          headers: { 'content-type': 'image/webp' }
        };
      }
    }
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'missing-source-url');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.equal(sourceImage.fallbackSourceUrl, DEFAULT_IMAGE_URL);
});

test('does not hide non-404 source download failures', async () => {
  const failure = new Error('Upstream unavailable');
  failure.response = { status: 503 };

  await assert.rejects(
    downloadSourceImage('https://example.test/image.jpg', {
      httpClient: {
        get: async () => {
          throw failure;
        }
      }
    }),
    failure
  );
});

test('uses jimmy crest when downloaded source bytes cannot be decoded', async () => {
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/corrupt.png';
  const requestedUrls = [];
  const validatedBuffers = [];
  const sourceImage = await downloadSourceImage(sourceUrl, {
    httpClient: {
      get: async url => {
        requestedUrls.push(url);
        return {
          data: Buffer.from(url === sourceUrl ? 'corrupt png' : 'jimmy crest'),
          headers: { 'content-type': url === sourceUrl ? 'image/png' : 'image/webp' }
        };
      }
    },
    validateImage: async buffer => {
      validatedBuffers.push(buffer.toString());
      if (buffer.toString() === 'corrupt png') {
        throw new Error('libpng read error');
      }
    }
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'invalid-image-data');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.equal(sourceImage.sourceUrl, sourceUrl);
  assert.equal(sourceImage.fallbackSourceUrl, DEFAULT_IMAGE_URL);
  assert.deepEqual(requestedUrls, [sourceUrl, DEFAULT_IMAGE_URL]);
  assert.deepEqual(validatedBuffers, ['corrupt png', 'jimmy crest']);
});
