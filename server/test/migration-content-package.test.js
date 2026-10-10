const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sharp = require('sharp');
const { ObjectId } = require('mongoose').mongo.BSON;
const {
  freezeContentPackage,
  verifyPreparedIdentity,
  validateFrozenModels,
  mediaReader,
  prepareBestMedia,
} = require('../scripts/migration/lib/content-import-package');
const {
  bytesDigest,
  digest,
  assertGroupMediaDependencies,
  validateManifest,
  runContentImport,
} = require('../scripts/migration/lib/content-import');
const { main, journalWriter } = require('../scripts/migration/import-content');
const {
  retainWordPressSourceLinks,
} = require('../scripts/migration/lib/wordpress-source-links');
const models = Object.fromEntries(
  ['RetirementMessage', 'LastPostMessage', 'Comment', 'MediaAsset'].map(
    (name) => [name, require(`../models/${name}`)],
  ),
);
const sorted = (v) =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sorted(v[k])]),
        )
      : v;
const hash = (v) => bytesDigest(Buffer.from(JSON.stringify(sorted(v))));

async function candidate() {
  const bytes = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const sha = bytesDigest(bytes);
  const sourceUrl = 'https://cmcen-rcmce.ca/wp-content/uploads/synthetic.png';
  const key = `images/archive/wordpress/${sha}.png`;
  const id = String(new ObjectId());
  const userId = String(new ObjectId());
  const sources = ['en', 'fr'].map((language, i) => {
    const text = i ? 'Texte synthétique français' : 'Synthetic English';
    const originalBody = `<p>${text}</p>`;
    return {
      id: 101 + i,
      language,
      authorId: 7,
      status: 'publish',
      passwordProtected: false,
      originalBody,
      bodySha256: bytesDigest(Buffer.from(originalBody)),
      convertedText: text,
      conversionIssues: [],
    };
  });
  const document = {
    _id: id,
    messages: { en: sources[0].convertedText, fr: sources[1].convertedText },
    message: sources[0].convertedText,
    messageLanguage: 'en',
    status: 'draft',
    publishedAt: null,
    createdBy: userId,
    createdAt: '2020-01-01T12:00:00Z',
    updatedAt: '2020-01-01T12:00:00Z',
    legacy: {
      source: 'https://cmcen-rcmce.ca',
      sourcePostIds: [101, 102],
      sourceRecords: sources.map((s) => ({
        sourceId: s.id,
        language: s.language,
        slug: `synthetic-${s.language}`,
        url: `https://cmcen-rcmce.ca/${s.language === 'fr' ? 'fr/' : ''}synthetic-${s.language}/`,
      })),
      originalStatus: 'publish',
      submissionMetadata: 'historically-unknown',
      importBatch: 'synthetic-local-package',
    },
  };
  const batch = {
    batchId: 'synthetic-local-package',
    targetOrigin: 'http://127.0.0.1:9000',
    items: [
      {
        key: 'retirement:synthetic',
        kind: 'retirement',
        sources,
        document,
        comments: [],
        authorMappings: [{ sourceUserId: 7, userId }],
        languageReview: {
          sourceFingerprint: bytesDigest(
            Buffer.from(
              JSON.stringify(sources.map((s) => [s.id, s.bodySha256])),
            ),
          ),
          reviewedBy: 'Synthetic pair reviewer',
        },
        destinationEvidence: { destinationMatches: [] },
        mediaInventoryComplete: true,
        mediaUrls: [sourceUrl],
      },
    ],
    media: [
      {
        key,
        filename: `${sha}.png`,
        sha256: sha,
        bytes: bytes.length,
        contentType: 'image/png',
        sourceUrl,
        plannedAssetId: String(new ObjectId()),
      },
    ],
  };
  const identity = {
    batchId: batch.batchId,
    groups: [
      {
        groupKey: batch.items[0].key,
        destinationId: id,
        sourceIds: [101, 102],
        preparedPayloadDigest: hash(document),
      },
    ],
    comments: [],
    media: [
      {
        key,
        destinationId: batch.media[0].plannedAssetId,
        sourceSha256: sha,
        bytes: bytes.length,
      },
    ],
  };
  identity.manifestDigest = hash(identity);
  return { batch, identity, bytes };
}

test('new original-byte packages reject oversized image dimensions before freezing', async () => {
  const f = await candidate();
  const bytes = await sharp({ create: { width: 10001, height: 1, channels: 3, background: '#123456' } }).png().toBuffer();
  const sha = bytesDigest(bytes), key = `images/archive/wordpress/${sha}.png`;
  Object.assign(f.batch.media[0], { key, filename: `${sha}.png`, sha256: sha, bytes: bytes.length });
  Object.assign(f.identity.media[0], { key, sourceSha256: sha, bytes: bytes.length });
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  await assert.rejects(freezeContentPackage({
    ...f, models, readMedia: async () => bytes,
    buildPublicMediaUrl: value => `https://media.example.org/${value}`,
  }), /pixel\/dimension/u);
});

test('select-media CLI uses strict bounded transport for metadata and original bytes', async t => {
  const f = await candidate(), original = await sharp(f.bytes).resize(4, 4).png().toBuffer();
  const source = 'https://cmcen-rcmce.ca/wp-content/uploads/original.png';
  f.batch.media[0].wordpressMediaId = 321;
  const calls = [];
  t.mock.method(require('axios'), 'get', async (url, options) => {
    calls.push(url);
    assert.equal(options.lookup, require('../scripts/migration/lib/source-image').publicImageLookup);
    assert.equal(options.maxContentLength, 10 * 1024 * 1024);
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.proxy, false);
    return { data: url.includes('/wp-json/') ? Buffer.from(JSON.stringify({
      id: 321, source_url: source,
      media_details: { width: 4, height: 4, sizes: { thumbnail: { source_url: f.batch.media[0].sourceUrl, width: 1, height: 1 } } },
    })) : original };
  });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'strict-original-'));
  try {
    const input = path.join(temp, 'batch.json'), output = path.join(temp, 'selected.json');
    await fs.writeFile(input, JSON.stringify(f.batch));
    await fs.writeFile(path.join(temp, f.batch.media[0].filename), f.bytes);
    await main(['--select-media', '--input', input, '--media-root', temp, '--output', output]);
    const result = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.deepEqual(calls, ['https://cmcen-rcmce.ca/wp-json/wp/v2/media/321', source]);
    assert.equal(result.media[0].sha256, bytesDigest(original));
    assert.deepEqual(await fs.readFile(path.join(temp, result.media[0].filename)), original);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('verified EN/FR source permalinks survive identity pinning and frozen model serialization', async () => {
  const f = await candidate();
  f.batch.items[0].document.legacy.sourceRecords = f.batch.items[0].sources.map(
    (s) => ({
      sourceId: s.id,
      language: s.language,
      slug: `synthetic-${s.language}`,
    }),
  );
  const metadata = f.batch.items[0].sources.map((s) => ({
    id: s.id,
    slug: `synthetic-${s.language}`,
    status: 'publish',
    link: `https://cmcen-rcmce.ca/${s.language === 'fr' ? 'fr/' : ''}synthetic-${s.language}/`,
  }));
  f.batch = retainWordPressSourceLinks(f.batch, metadata);
  f.identity.groups[0].preparedPayloadDigest = hash(f.batch.items[0].document);
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  const manifest = await freezeContentPackage({
    ...f,
    models,
    readMedia: async () => f.bytes,
    buildPublicMediaUrl: (key) => `https://media.example.org/${key}`,
  });
  assert.deepEqual(
    manifest.groups[0].document.legacy.sourceRecords.map((r) => r.url),
    metadata.map((m) => m.link),
  );
  await validateFrozenModels(manifest, models);
});

test('freezer stops missing source URLs before media access instead of silently repeating the pilot omission', async () => {
  const f = await candidate();
  delete f.batch.items[0].document.legacy.sourceRecords[0].url;
  f.identity.groups[0].preparedPayloadDigest = hash(f.batch.items[0].document);
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  let reads = 0;
  await assert.rejects(
    freezeContentPackage({
      ...f,
      models,
      readMedia: async () => {
        reads++;
        return f.bytes;
      },
      buildPublicMediaUrl: (key) => `https://media.example.org/${key}`,
    }),
    /Verified source URLs/,
  );
  assert.equal(reads, 0);
});

test('freezer validates real archive models and binds source, pinned IDs and media without a DB', async () => {
  const f = await candidate();
  const manifest = await freezeContentPackage({
    ...f,
    models,
    readMedia: async () => f.bytes,
    buildPublicMediaUrl: (key) => `https://media.example.org/${key}`,
    preparedAt: new Date('2026-01-01T00:00:00Z'),
  });
  assert.equal(manifest.preparationOnly, true);
  assert.equal(manifest.groups.length, 1);
  await validateFrozenModels(manifest, models);
  assert.match(digest(manifest), /^[a-f\d]{64}$/);
  assert.equal(
    manifest.groups[0].document._id.$oid,
    f.batch.items[0].document._id,
  );
  assert.equal(manifest.groups[0].document.status, 'draft');
});

test('source/identity/media edits and trimming fail before freezing', async () => {
  const f = await candidate();
  const changed = structuredClone(f.batch);
  changed.items[0].document.messages.en = 'Changed';
  assert.throws(() => verifyPreparedIdentity(changed, f.identity));
  await assert.rejects(
    freezeContentPackage({
      ...f,
      models,
      readMedia: async () => Buffer.from('different'),
      buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
    }),
  );
  f.batch.items[0].document.message = ' Synthetic English ';
  f.identity.groups[0].preparedPayloadDigest = hash(f.batch.items[0].document);
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  await assert.rejects(
    freezeContentPackage({
      ...f,
      models,
      readMedia: async () => f.bytes,
      buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
    }),
  );
});

test('media reader rejects traversal, symlink escape and mismatched file size', async () => {
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'synthetic-media-root-'),
  );
  try {
    const root = path.join(temp, 'media');
    await fs.mkdir(root);
    const name = `${'a'.repeat(64)}.png`;
    await fs.writeFile(path.join(temp, 'outside'), 'outside');
    await fs.symlink(path.join(temp, 'outside'), path.join(root, name));
    const reader = mediaReader(root);
    await assert.rejects(reader({ filename: name, bytes: 7 }));
    await assert.rejects(reader({ filename: '../outside', bytes: 7 }));
    await fs.unlink(path.join(root, name));
    await fs.writeFile(path.join(root, name), 'inside');
    await assert.rejects(reader({ filename: name, bytes: 99 }));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('CLI defaults to no apply, rejects ambiguous flags and fsyncs ID-only journal', async () => {
  await assert.rejects(
    main(['--apply=false', '--input', 'unused', '--media-root', 'unused']),
  );
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-journal-'));
  try {
    const file = path.join(temp, 'journal.jsonl');
    const journal = journalWriter(file);
    await journal.append({ eventId: 'synthetic', state: 'complete' });
    journal.close();
    assert.deepEqual(JSON.parse((await fs.readFile(file, 'utf8')).trim()), {
      eventId: 'synthetic',
      state: 'complete',
    });
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('all nested display media references require group dependencies', () => {
  const key = `images/archive/wordpress/${'a'.repeat(64)}.png`;
  const pdf = `documents/archive/wordpress/${'b'.repeat(64)}.pdf`;
  const media = [{ key }, { key: pdf }];
  for (const document of [
    { messages: { en: `<img src="{{media:${key}}}">` } },
    {
      newsletterBlocks: {
        fr: [{ type: 'image', src: `https://media.example/${key}` }],
      },
    },
    { photoUrl: `{{media:${key}}}` },
    { imageDisplayUrl: `https://media.example/${key}` },
    { attachments: [{ href: `{{media:${pdf}}}` }] },
    { body: `<a href="https://media.example/${pdf}">Document</a>` },
  ]) {
    assert.throws(
      () => assertGroupMediaDependencies(document, media, []),
      /missing from group dependencies/,
    );
    assert.doesNotThrow(() =>
      assertGroupMediaDependencies(document, media, [key, pdf]),
    );
  }
  assert.throws(
    () =>
      assertGroupMediaDependencies({ photoUrl: `{{media:${key}}}` }, [], [key]),
    /missing from package/,
  );
  assert.doesNotThrow(() =>
    assertGroupMediaDependencies(
      { legacy: { originalBody: `{{media:${key}}}` } },
      [],
      [],
    ),
  );
});

test('freezer refuses a referenced cover omitted from item inventory even when batch media includes it', async () => {
  const f = await candidate();
  f.batch.items[0].document.photoUrl = `{{media:${f.batch.media[0].key}}}`;
  f.batch.items[0].mediaUrls = [];
  f.identity.groups[0].preparedPayloadDigest = hash(f.batch.items[0].document);
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  let mediaReads = 0;
  await assert.rejects(
    freezeContentPackage({
      ...f,
      models,
      readMedia: async () => {
        mediaReads++;
        return f.bytes;
      },
      buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
    }),
    /missing from group dependencies/,
  );
  assert.equal(mediaReads, 0);
});

test('frozen manifests recheck actual references before any destination access', async () => {
  const f = await candidate();
  f.batch.items[0].document.photoUrl = `{{media:${f.batch.media[0].key}}}`;
  f.identity.groups[0].preparedPayloadDigest = hash(f.batch.items[0].document);
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  const manifest = await freezeContentPackage({
    ...f,
    models,
    readMedia: async () => f.bytes,
    buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
  });
  assert.equal(manifest.groups[0].mediaKeys.length, 1);
  manifest.groups[0].mediaKeys = [];
  assert.throws(
    () => validateManifest(manifest),
    /missing from group dependencies/,
  );
});

test('selected originals freeze with both known-source and chosen-source checksum provenance', async () => {
  const f = await candidate();
  const knownSha = f.batch.media[0].sha256;
  f.batch.items[0].document.photoUrl = `{{media:${f.batch.media[0].key}}}`;
  const original = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const metadata = {
    id: 321,
    source_url:
      'https://cmcen-rcmce.ca/wp-content/uploads/synthetic-scaled.png',
    media_details: {
      width: 2,
      height: 2,
      original_image: 'synthetic-full.png',
      sizes: {
        thumbnail: {
          source_url: f.batch.media[0].sourceUrl,
          width: 1,
          height: 1,
        },
      },
    },
  };
  const selected = await prepareBestMedia({
    batch: f.batch,
    readMedia: async () => f.bytes,
    metadata: [metadata],
    fetchImage: async () => original,
    writeMedia: async () => {},
  });
  f.identity.groups[0].preparedPayloadDigest = hash(
    selected.batch.items[0].document,
  );
  Object.assign(f.identity.media[0], {
    key: selected.batch.media[0].key,
    sourceSha256: bytesDigest(original),
    bytes: original.length,
  });
  delete f.identity.manifestDigest;
  f.identity.manifestDigest = hash(f.identity);
  const manifest = await freezeContentPackage({
    batch: selected.batch,
    identity: f.identity,
    models,
    readMedia: async () => original,
    buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
  });
  assert.equal(manifest.media[0].sourceSelection.knownSource.sha256, knownSha);
  assert.equal(
    manifest.media[0].sourceSelection.selected.sha256,
    bytesDigest(original),
  );
  assert.equal(
    manifest.media[0].sourceSelection.selectedSourceUrl,
    'https://cmcen-rcmce.ca/wp-content/uploads/synthetic-full.png',
  );
  await validateFrozenModels(manifest, models);
});

test('select-media CLI prepares locally with no metadata and preserves known assets before identity pinning', async () => {
  const f = await candidate();
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'synthetic-media-choice-'),
  );
  try {
    const input = path.join(temp, 'batch.json'),
      output = path.join(temp, 'selected.json');
    await fs.writeFile(input, JSON.stringify(f.batch));
    await fs.writeFile(path.join(temp, f.batch.media[0].filename), f.bytes);
    await main([
      '--select-media',
      '--input',
      input,
      '--media-root',
      temp,
      '--output',
      output,
    ]);
    const selected = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(selected.preparationOnly, true);
    assert.equal(selected.identityPlanMustBeRegenerated, true);
    assert.equal(selected.media[0].sha256, f.batch.media[0].sha256);
    assert.deepEqual(selected.mediaSelectionReport[0].issues, [
      'metadata-unavailable',
    ]);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('content-addressed keys must match byte checksums before any destination or local-media access', async (t) => {
  const f = await candidate();
  const original = await freezeContentPackage({
    ...f,
    models,
    readMedia: async () => f.bytes,
    buildPublicMediaUrl: (k) => `https://media.example.org/${k}`,
  });
  for (const reused of [false, true])
    await t.test(
      reused ? 'reused addressed asset' : 'new addressed asset',
      async () => {
        const manifest = structuredClone(original),
          m = manifest.media[0];
        m.sha256 = 'f'.repeat(64);
        if (reused) {
          m.existingAssetId = m.assetDocument._id.$oid;
          delete m.assetDocument;
        } else m.assetDocument.fileMetadata.sha256 = m.sha256;
        let accesses = 0;
        const unreachable = new Proxy(
          {},
          {
            get() {
              accesses++;
              throw Error('unexpected destination access');
            },
          },
        );
        await assert.rejects(
          runContentImport({
            manifest,
            db: unreachable,
            store: unreachable,
            readMedia: async () => {
              accesses++;
              throw Error('unexpected local-media access');
            },
          }),
          /Content-addressed media key differs/,
        );
        assert.equal(accesses, 0);
      },
    );
});
