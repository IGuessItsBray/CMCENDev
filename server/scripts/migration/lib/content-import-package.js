const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { EJSON } = require('mongoose').mongo.BSON;
const { inspectBatch } = require('./content-preflight');
const {
  chooseWordPressImage,
  originalImageUrl,
} = require('./wordpress-image-choice');
const {
  bytesDigest,
  validateManifest,
  canonical,
  assertGroupMediaDependencies,
} = require('./content-import');

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  return value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, sorted(value[key])]),
      )
    : value;
}
const jsonDigest = (value) =>
  bytesDigest(Buffer.from(JSON.stringify(sorted(value))));

function verifyPreparedIdentity(batch, plan) {
  const copy = structuredClone(plan);
  delete copy.manifestDigest;
  assert.equal(jsonDigest(copy), plan.manifestDigest, 'Identity plan changed');
  assert.equal(batch.batchId, plan.batchId);
  assert.equal(batch.items.length, plan.groups.length);
  for (const item of batch.items) {
    const group = plan.groups.find((g) => g.groupKey === item.key);
    assert(group);
    assert.equal(item.document._id, group.destinationId);
    assert.deepEqual(
      item.sources.map((s) => s.id).sort((a, b) => a - b),
      [...group.sourceIds].sort((a, b) => a - b),
    );
    assert.equal(
      jsonDigest(item.document),
      group.preparedPayloadDigest,
      'Prepared content changed',
    );
    for (const c of item.comments) {
      const expected = plan.comments.find(
        (e) => e.sourceCommentId === c.sourceCommentId,
      );
      assert(expected);
      assert.equal(c.document._id, expected.destinationId);
      assert.equal(
        jsonDigest(c.document),
        expected.preparedPayloadDigest,
        'Prepared comment changed',
      );
    }
  }
  assert.equal(
    plan.comments.length,
    batch.items.flatMap((i) => i.comments).length,
  );
  assert.equal(plan.media.length, batch.media.length);
  for (const m of batch.media) {
    const expected = plan.media.find((e) => e.key === m.key);
    assert(expected);
    assert.equal(expected.sourceSha256, m.sha256);
    assert.equal(expected.bytes, m.bytes);
    assert.equal(expected.destinationId, m.existingAssetId || m.plannedAssetId);
  }
}

function mediaReader(root) {
  const base = fs.realpathSync(root);
  return async (m) => {
    assert.equal(path.basename(m.filename), m.filename);
    assert(/^[a-f\d]{64}\.[a-z0-9]+$/.test(m.filename));
    const file = fs.realpathSync(path.join(base, m.filename));
    assert(file.startsWith(base + path.sep), 'Media escaped package root');
    assert.equal(fs.statSync(file).size, m.bytes);
    assert(m.bytes <= 25 * 1024 * 1024);
    return fs.readFileSync(file);
  };
}

async function freezeContentPackage({
  batch,
  identity,
  models,
  buildPublicMediaUrl,
  readMedia,
  preparedAt = new Date(),
}) {
  verifyPreparedIdentity(batch, identity);
  for (const item of batch.items) {
    const declared = batch.media
      .filter((m) => item.mediaUrls.includes(m.sourceUrl))
      .map((m) => m.key);
    assertGroupMediaDependencies(
      [item.document, ...item.comments.map((c) => c.document)],
      batch.media,
      declared,
    );
  }
  const resolve = (v) => {
    if (typeof v === 'string')
      return v.replace(/\{\{media:([^}]+)\}\}/g, (_, key) => {
        assert(batch.media.some((m) => m.key === key));
        return buildPublicMediaUrl(key);
      });
    if (Array.isArray(v)) return v.map(resolve);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([key, value]) => [
          key,
          key === 'originalBody' ? value : resolve(value),
        ]),
      );
    return v;
  };
  const input = resolve(batch);
  const evidence = batch.media.map((m) => ({
    sourceUrl: m.sourceUrl,
    sourceVerified: true,
    sourceSha256: m.sha256,
    destinationVerified: true,
    destinationUrl: buildPublicMediaUrl(m.key),
    destinationSha256: m.sha256,
  }));
  // These flags permit pure source/schema validation only; runContentImport verifies actual destination bytes and references.
  const checked = await inspectBatch(input, {
    models,
    mediaEvidence: evidence,
  });
  assert(
    checked.safeToApply,
    `Source/schema preflight failed: ${checked.results.flatMap((r) => r.issues.map((i) => i.code)).join(',')}`,
  );
  const manifest = {
    version: 1,
    batchId: batch.batchId,
    targetOrigin: batch.targetOrigin,
    sourceOrigin: 'https://cmcen-rcmce.ca',
    preparedAt: preparedAt.toISOString(),
    preparationOnly: true,
    groups: [],
    media: [],
  };
  for (const m of batch.media) {
    const bytes = await readMedia(m);
    assert.equal(bytesDigest(bytes), m.sha256);
    assert.equal(bytes.length, m.bytes);
    if (m.selection) {
      assert.equal(m.selection.sourceUrl, m.sourceUrl);
      assert.equal(m.selection.selected.sha256, m.sha256);
      assert.equal(
        m.selection.selectedSourceUrl,
        m.selectedSourceUrl || m.sourceUrl,
      );
    }
    const url = buildPublicMediaUrl(m.key);
    const media = {
      key: m.key,
      filename: m.filename,
      sha256: m.sha256,
      bytes: m.bytes,
      mimeType: m.contentType,
      url,
      ...(m.selection ? { sourceSelection: m.selection } : {}),
    };
    if (m.existingAssetId) media.existingAssetId = m.existingAssetId;
    else {
      let dimensions = {};
      if (m.kind === 'pdf')
        assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      else {
        const metadata = await sharp(bytes).metadata();
        assert(metadata.width && metadata.height);
        dimensions = { width: metadata.width, height: metadata.height };
      }
      const name = decodeURIComponent(
        new URL(m.sourceUrl).pathname.split('/').pop(),
      );
      const doc = new models.MediaAsset({
        _id: m.plannedAssetId,
        uuid: bytesDigest(Buffer.from(`${batch.batchId}:media:${m.key}`)),
        key: m.key,
        url,
        originalKey: m.key,
        originalUrl: url,
        originalName: name,
        displayName: name,
        mimeType: m.contentType,
        size: m.bytes,
        ...dimensions,
        uploadContext: {
          type: 'migration',
          context: batch.batchId,
          sourceUrl: m.selectedSourceUrl || m.sourceUrl,
        },
        fileMetadata: {
          sha256: m.sha256,
          importBatch: batch.batchId,
          ...(m.selection ? { sourceSelection: m.selection } : {}),
        },
        createdAt: preparedAt,
        updatedAt: preparedAt,
      });
      await doc.validate();
      media.assetDocument = EJSON.serialize(doc.toObject(), { relaxed: false });
    }
    manifest.media.push(media);
  }
  for (const item of input.items) {
    const Model =
      models[
        item.kind === 'retirement' ? 'RetirementMessage' : 'LastPostMessage'
      ];
    const values = {
      ...item.document,
      legacy: { ...item.document.legacy, importGroupKey: item.key },
    };
    const doc = new Model(values);
    await doc.validate();
    const comments = [];
    for (const c of item.comments) {
      const cd = new models.Comment(c.document);
      await cd.validate();
      comments.push({
        sourceCommentId: c.sourceCommentId,
        document: EJSON.serialize(cd.toObject(), { relaxed: false }),
      });
    }
    manifest.groups.push({
      key: item.key,
      kind: item.kind,
      sourceIds: item.sources.map((s) => s.id),
      sourceFingerprint: item.languageReview.sourceFingerprint,
      document: EJSON.serialize(doc.toObject(), { relaxed: false }),
      comments,
      authorMappings: item.authorMappings,
      mediaKeys: batch.media
        .filter((m) => item.mediaUrls.includes(m.sourceUrl))
        .map((m) => m.key),
    });
  }
  validateManifest(manifest);
  return manifest;
}

async function validateFrozenModels(manifest, models) {
  for (const group of manifest.groups) {
    const Model =
      models[
        group.kind === 'retirement' ? 'RetirementMessage' : 'LastPostMessage'
      ];
    for (const [model, value] of [
      [Model, group.document],
      ...group.comments.map((c) => [models.Comment, c.document]),
    ]) {
      const expected = EJSON.deserialize(value);
      const doc = new model(expected);
      await doc.validate();
      assert.equal(
        canonical(doc.toObject()),
        canonical(expected),
        'Frozen model payload changed',
      );
    }
  }
  for (const m of manifest.media)
    if (m.assetDocument) {
      const expected = EJSON.deserialize(m.assetDocument);
      const doc = new models.MediaAsset(expected);
      await doc.validate();
      assert.equal(
        canonical(doc.toObject()),
        canonical(expected),
        'Frozen asset changed',
      );
    }
}

async function prepareBestMedia({
  batch,
  readMedia,
  metadata = [],
  fetchImage,
  writeMedia,
}) {
  const prepared = structuredClone(batch);
  const choices = [];
  for (const m of prepared.media) {
    // A reused live asset cannot be upgraded by a local content-import plan.
    if (m.existingAssetId || m.kind === 'pdf') {
      choices.push({
        sourceUrl: m.sourceUrl,
        upgraded: false,
        issues: [
          m.existingAssetId ? 'reused-asset-preserved' : 'non-image-preserved',
        ],
      });
      continue;
    }
    const bytes = await readMedia(m);
    assert.equal(bytesDigest(bytes), m.sha256);
    const matches = metadata.filter((d) =>
      [
        originalImageUrl(d),
        d.source_url,
        ...Object.values(d.media_details?.sizes || {}).map((s) => s.source_url),
      ].includes(m.sourceUrl),
    );
    const attachment =
      m.wordpressMetadata || (matches.length === 1 ? matches[0] : null);
    const chosen = await chooseWordPressImage({
      sourceUrl: m.sourceUrl,
      knownBuffer: bytes,
      metadata: attachment,
      expectedMediaId: m.wordpressMediaId,
      fetchImage,
    });
    if (matches.length > 1 && !m.wordpressMetadata)
      chosen.choice.issues.push('ambiguous-attachment-metadata');
    choices.push(chosen.choice);
    m.selection = chosen.choice;
    if (!chosen.choice.upgraded) continue;
    const extension = {
      jpeg: 'jpg',
      png: 'png',
      webp: 'webp',
      avif: 'avif',
      tiff: 'tiff',
      heif: 'heic',
    }[chosen.choice.selected.format];
    const oldKey = m.key;
    m.sha256 = chosen.choice.selected.sha256;
    m.bytes = chosen.buffer.length;
    m.filename = `${m.sha256}.${extension}`;
    m.key = `images/archive/wordpress/${m.filename}`;
    m.contentType = `image/${chosen.choice.selected.format === 'jpeg' ? 'jpeg' : chosen.choice.selected.format}`;
    m.selectedSourceUrl = chosen.choice.selectedSourceUrl;
    await writeMedia(m, chosen.buffer);
    const replace = (v) => {
      if (typeof v === 'string')
        return v.replaceAll(`{{media:${oldKey}}}`, `{{media:${m.key}}}`);
      if (Array.isArray(v)) return v.map(replace);
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            k === 'originalBody' ? x : replace(x),
          ]),
        );
      return v;
    };
    prepared.items = prepared.items.map(replace);
  }
  return {
    batch: prepared,
    choices,
    preparationOnly: true,
    identityPlanMustBeRegenerated: true,
  };
}

module.exports = {
  prepareBestMedia,
  verifyPreparedIdentity,
  mediaReader,
  freezeContentPackage,
  validateFrozenModels,
};
