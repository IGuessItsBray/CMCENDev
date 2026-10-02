const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  chooseWordPressImage,
} = require('../scripts/migration/lib/wordpress-image-choice');
const {
  prepareBestMedia,
} = require('../scripts/migration/lib/content-import-package');
const { bytesDigest } = require('../scripts/migration/lib/content-import');
const origin = 'https://cmcen-rcmce.ca/wp-content/uploads/';
async function fixture() {
  const original = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 100, g: 50, b: 25 },
    },
  })
    .jpeg()
    .toBuffer();
  const thumbnail = await sharp(original).resize(300).jpeg().toBuffer();
  const scaled = await sharp(original).resize(900).jpeg().toBuffer();
  const metadata = {
    id: 123,
    source_url: origin + 'photo-scaled.jpg',
    media_details: {
      width: 900,
      height: 600,
      original_image: 'photo.jpg',
      sizes: {
        medium: {
          source_url: origin + 'photo-300x200.jpg',
          width: 300,
          height: 200,
        },
      },
    },
  };
  return { original, thumbnail, scaled, metadata };
}
test('selects declared WordPress original without upscaling or changing known source provenance', async () => {
  const f = await fixture();
  const fetched = [];
  const result = await chooseWordPressImage({
    sourceUrl: origin + 'photo-300x200.jpg',
    knownBuffer: f.thumbnail,
    metadata: f.metadata,
    expectedMediaId: 123,
    fetchImage: async (url) => {
      fetched.push(url);
      assert.equal(url, origin + 'photo.jpg');
      return f.original;
    },
  });
  assert.deepEqual(fetched, [origin + 'photo.jpg']);
  assert.equal(result.choice.upgraded, true);
  assert.equal(result.choice.sourceUrl, origin + 'photo-300x200.jpg');
  assert.equal(result.choice.selectedSourceUrl, origin + 'photo.jpg');
  assert.equal(result.choice.selected.width, 1200);
  assert.equal(result.choice.selected.sha256, bytesDigest(f.original));
});
test('missing or undecodable original falls back to largest verified same-attachment rendition', async (t) => {
  for (const bad of ['missing', 'invalid'])
    await t.test(bad, async () => {
      const f = await fixture();
      const result = await chooseWordPressImage({
        sourceUrl: origin + 'photo-300x200.jpg',
        knownBuffer: f.thumbnail,
        metadata: f.metadata,
        fetchImage: async (url) => {
          if (url === origin + 'photo.jpg') {
            if (bad === 'missing') throw Error('404');
            return Buffer.from('not an image');
          }
          return f.scaled;
        },
      });
      assert.equal(
        result.choice.selectedSourceUrl,
        origin + 'photo-scaled.jpg',
      );
      assert.equal(result.choice.selected.width, 900);
      assert.equal(result.choice.reason, 'largest-declared-rendition');
      assert(result.choice.issues.length);
    });
});
test('missing, ambiguous, wrong-attachment and wrong-source metadata preserve known bytes without fetch', async (t) => {
  for (const mode of ['missing', 'id', 'source', 'origin'])
    await t.test(mode, async () => {
      const f = await fixture();
      const metadata =
        mode === 'missing' ? undefined : structuredClone(f.metadata);
      if (mode === 'id') metadata.id = 456;
      if (mode === 'source')
        metadata.media_details.sizes.medium.source_url = origin + 'other.jpg';
      if (mode === 'origin')
        metadata.media_details.original_image =
          'https://other.example/other.jpg';
      let fetched = 0;
      const result = await chooseWordPressImage({
        sourceUrl: origin + 'photo-300x200.jpg',
        knownBuffer: f.thumbnail,
        metadata,
        expectedMediaId: 123,
        fetchImage: async () => {
          fetched++;
          throw Error('unavailable');
        },
      });
      assert.equal(result.choice.upgraded, false);
      assert.deepEqual(result.buffer, f.thumbnail);
      if (mode !== 'origin') assert.equal(fetched, 0);
    });
});
test('wrong image, declared dimension mismatch, and no better source cannot become upgrades', async (t) => {
  for (const mode of ['wrong-image', 'wrong-dimensions', 'equal'])
    await t.test(mode, async () => {
      const f = await fixture();
      delete f.metadata.media_details.original_image;
      const wrong = await sharp({
        create: { width: 900, height: 600, channels: 3, background: 'blue' },
      })
        .png()
        .toBuffer();
      if (mode === 'equal') {
        f.metadata.source_url = origin + 'photo-300x200.jpg';
        f.metadata.media_details.width = 300;
        f.metadata.media_details.height = 200;
      }
      const result = await chooseWordPressImage({
        sourceUrl: origin + 'photo-300x200.jpg',
        knownBuffer: f.thumbnail,
        metadata: f.metadata,
        fetchImage: async () => (mode === 'wrong-image' ? wrong : f.original),
      });
      assert.equal(result.choice.upgraded, false);
      assert.deepEqual(result.buffer, f.thumbnail);
    });
});
test('batch preparation rewrites placeholders before pinning but preserves originals and reused live assets', async () => {
  const f = await fixture(),
    sha = bytesDigest(f.thumbnail),
    key = `images/archive/wordpress/${sha}.jpg`;
  const batch = {
    media: [
      {
        key,
        filename: sha + '.jpg',
        sha256: sha,
        bytes: f.thumbnail.length,
        sourceUrl: origin + 'photo-300x200.jpg',
        plannedAssetId: 'a'.repeat(24),
      },
      {
        key: 'reused',
        sourceUrl: origin + 'crest.png',
        existingAssetId: 'b'.repeat(24),
      },
    ],
    items: [
      {
        document: {
          photoUrl: `{{media:${key}}}`,
          legacy: { originalBody: `{{media:${key}}}` },
        },
      },
    ],
  };
  const writes = [];
  const result = await prepareBestMedia({
    batch,
    readMedia: async () => f.thumbnail,
    metadata: [f.metadata],
    fetchImage: async () => f.original,
    writeMedia: async (m, b) => writes.push([m.key, b.length]),
  });
  assert.equal(result.identityPlanMustBeRegenerated, true);
  assert.equal(writes.length, 1);
  assert.equal(result.batch.media[0].sha256, bytesDigest(f.original));
  assert.equal(result.batch.media[0].sourceUrl, batch.media[0].sourceUrl);
  assert.equal(
    result.batch.items[0].document.photoUrl,
    `{{media:${result.batch.media[0].key}}}`,
  );
  assert.equal(
    result.batch.items[0].document.legacy.originalBody,
    `{{media:${key}}}`,
  );
  assert.deepEqual(result.batch.media[1], batch.media[1]);
  assert.equal(batch.media[0].sha256, sha);
});

test('ambiguous attachment metadata preserves known source and flags without fetching', async () => {
  const f = await fixture(),
    sha = bytesDigest(f.thumbnail),
    key = `images/archive/wordpress/${sha}.jpg`;
  const batch = {
    media: [
      {
        key,
        filename: sha + '.jpg',
        sha256: sha,
        bytes: f.thumbnail.length,
        sourceUrl: origin + 'photo-300x200.jpg',
      },
    ],
    items: [],
  };
  let fetched = 0;
  const result = await prepareBestMedia({
    batch,
    readMedia: async () => f.thumbnail,
    metadata: [f.metadata, { ...f.metadata, id: 456 }],
    fetchImage: async () => {
      fetched++;
      return f.original;
    },
    writeMedia: async () => assert.fail('unexpected write'),
  });
  assert.equal(fetched, 0);
  assert.equal(result.choices[0].upgraded, false);
  assert(result.choices[0].issues.includes('ambiguous-attachment-metadata'));
  assert.equal(result.batch.media[0].sha256, sha);
});

test('already downloaded metadata-linked original is recognized without fetching smaller variants', async () => {
  const f = await fixture();
  let fetched = 0;
  const result = await chooseWordPressImage({
    sourceUrl: origin + 'photo.jpg',
    knownBuffer: f.original,
    metadata: f.metadata,
    expectedMediaId: 123,
    fetchImage: async () => {
      fetched++;
      return f.scaled;
    },
  });
  assert.equal(fetched, 0);
  assert.equal(result.choice.upgraded, false);
  assert.equal(result.choice.wordpressMediaId, 123);
  assert.deepEqual(result.choice.issues, []);
});
