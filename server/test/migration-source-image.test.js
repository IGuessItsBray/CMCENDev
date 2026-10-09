const assert = require('node:assert/strict');
const { test } = require('node:test');
const sharp = require('sharp');
process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.test/cmcen';
const {
  DEFAULT_IMAGE_NAME,
  DEFAULT_IMAGE_URL,
  downloadSourceImage,
  publicImageLookup,
} = require('../scripts/migration/lib/source-image');

test('restricts image origins and applies bounded HTTP request controls', async () => {
  let calls = 0;
  const httpClient = {
    get: async (url, options) => {
      calls += 1;
      assert.equal(options.adapter, 'http');
      assert.equal(options.proxy, false);
      assert.equal(options.maxRedirects, 0);
      assert.equal(options.maxContentLength, 10 * 1024 * 1024);
      assert.equal(options.lookup, publicImageLookup);
      return { data: Buffer.from('image'), headers: {} };
    },
  };
  for (const url of [
    'http://cmcen-rcmce.ca/image.jpg',
    'https://127.0.0.1/image',
    'https://other.example/image',
    'https://user:pass@cmcen-rcmce.ca/image',
  ]) {
    await assert.rejects(
      downloadSourceImage(url, { httpClient }),
      /allowed HTTPS origin/u,
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    downloadSourceImage('https://[::1]/image', {
      httpClient,
      allowedOrigins: ['https://[::1]'],
    }),
    /allowed HTTPS origin/u,
  );
  await downloadSourceImage('https://cmcen-rcmce.ca/image.jpg', { httpClient });
  assert.equal(calls, 1);
});

test('rejects private DNS answers, including mixed public/private answers, without a second resolution', async (t) => {
  const dns = require('node:dns');
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2002:7f00:1::',
  ]) {
    t.mock.method(dns, 'lookup', (hostname, options, callback) =>
      callback(null, [
        { address: '8.8.8.8', family: 4 },
        { address, family: address.includes(':') ? 6 : 4 },
      ]),
    );
    await assert.rejects(
      new Promise((resolve, reject) =>
        publicImageLookup('cmcen-rcmce.ca', { all: true }, (error, result) =>
          error ? reject(error) : resolve(result),
        ),
      ),
      /public addresses/u,
    );
    t.mock.restoreAll();
  }
  t.mock.method(dns, 'lookup', (hostname, options, callback) =>
    callback(null, [{ address: '8.8.8.8', family: 4 }]),
  );
  const result = await new Promise((resolve, reject) =>
    publicImageLookup('cmcen-rcmce.ca', { all: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    ),
  );
  assert.deepEqual(result, [{ address: '8.8.8.8', family: 4 }]);
});

test('the patched Axios HTTP adapter enforces private-network lookup rejection', async (t) => {
  const dns = require('node:dns');
  t.mock.method(dns, 'lookup', (hostname, options, callback) =>
    callback(null, [{ address: '127.0.0.1', family: 4 }]),
  );
  await assert.rejects(
    downloadSourceImage('https://cmcen-rcmce.ca/image.jpg'),
    /public addresses/u,
  );
});

test('uses the canonical CMCEN crest when a legacy source image returns 404', async () => {
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/missing.jpeg';
  const requestedUrls = [];
  const sourceImage = await downloadSourceImage(sourceUrl, {
    httpClient: {
      get: async (url) => {
        requestedUrls.push(url);

        if (url === sourceUrl) {
          const error = new Error('Not Found');
          error.response = { status: 404 };
          throw error;
        }

        return {
          data: Buffer.from('cmcen crest'),
          headers: { 'content-type': 'image/webp' },
        };
      },
    },
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'http-404');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.equal(sourceImage.contentType, 'image/webp');
  assert.equal(sourceImage.sourceUrl, sourceUrl);
  assert.equal(sourceImage.fallbackSourceUrl, DEFAULT_IMAGE_URL);
  assert.deepEqual(requestedUrls, [sourceUrl, DEFAULT_IMAGE_URL]);
});

test('uses the canonical CMCEN crest when a legacy post has no source image', async () => {
  const sourceImage = await downloadSourceImage('', {
    httpClient: {
      get: async (url) => {
        assert.equal(url, DEFAULT_IMAGE_URL);
        return {
          data: Buffer.from('cmcen crest'),
          headers: { 'content-type': 'image/webp' },
        };
      },
    },
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
    downloadSourceImage('https://cmcen-rcmce.ca/image.jpg', {
      httpClient: {
        get: async () => {
          throw failure;
        },
      },
    }),
    failure,
  );
});

test('uses the canonical CMCEN crest when downloaded source bytes cannot be decoded', async () => {
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/corrupt.png';
  const requestedUrls = [];
  const validatedBuffers = [];
  const sourceImage = await downloadSourceImage(sourceUrl, {
    httpClient: {
      get: async (url) => {
        requestedUrls.push(url);
        return {
          data: Buffer.from(url === sourceUrl ? 'corrupt png' : 'cmcen crest'),
          headers: {
            'content-type': url === sourceUrl ? 'image/png' : 'image/webp',
          },
        };
      },
    },
    validateImage: async (buffer) => {
      validatedBuffers.push(buffer.toString());
      if (buffer.toString() === 'corrupt png') {
        throw new Error('libpng read error');
      }
    },
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'invalid-image-data');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.equal(sourceImage.sourceUrl, sourceUrl);
  assert.equal(sourceImage.fallbackSourceUrl, DEFAULT_IMAGE_URL);
  assert.deepEqual(requestedUrls, [sourceUrl, DEFAULT_IMAGE_URL]);
  assert.deepEqual(validatedBuffers, ['corrupt png', 'cmcen crest']);
});

test('falls back when PNG metadata is readable but the pixel stream is corrupt', async () => {
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/truncated.png';
  const validPng = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 25, g: 50, b: 75, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const truncatedPng = validPng.subarray(0, validPng.length - 20);

  await sharp(truncatedPng).metadata();
  await assert.rejects(
    sharp(truncatedPng).raw().toBuffer(),
    /libpng read error/u,
  );

  const sourceImage = await downloadSourceImage(sourceUrl, {
    httpClient: {
      get: async (url) => ({
        data: url === sourceUrl ? truncatedPng : validPng,
        headers: { 'content-type': 'image/png' },
      }),
    },
    validateImage: (buffer) => sharp(buffer).rotate().raw().toBuffer(),
  });

  assert.equal(sourceImage.usedFallback, true);
  assert.equal(sourceImage.fallbackReason, 'invalid-image-data');
  assert.equal(sourceImage.originalName, DEFAULT_IMAGE_NAME);
  assert.deepEqual(sourceImage.buffer, validPng);
});
