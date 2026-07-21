require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env')
});

const path = require('path');

const mongoose = require('mongoose');
const { parseArgs, resolvePath } = require('./lib/args');
const { cleanString, writeJson } = require('./lib/wordpress');
const MediaAsset = require('../../models/MediaAsset');
const RetirementMessage = require('../../models/RetirementMessage');
const {
  buildPublicMediaUrl,
  getMediaKeyFromValue
} = require('../../services/media-library');

const args = parseArgs();
const apply = Boolean(args.apply);
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'retirement-media-link-manifest.json')
);

function normalize(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/&amp;/gu, '&')
    .replace(/&#038;/gu, '&')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function getRetirementTitle(message) {
  const retiree = message.retiree || {};
  const legacyTitle = cleanString(message.legacy?.title);

  if (legacyTitle) {
    return legacyTitle;
  }

  return cleanString([
    'RETIREMENT',
    [retiree.rank, retiree.firstName, retiree.lastName]
      .filter(Boolean)
      .join(' '),
    retiree.postNominals,
    retiree.tradeRole
  ].filter(Boolean).join(' - '));
}

function getVariantKeys(asset) {
  return Object.values(asset.variants || {})
    .map(variant => variant?.key)
    .filter(Boolean);
}

function getAssetKeys(asset) {
  return [
    asset.key,
    asset.originalKey,
    ...getVariantKeys(asset)
  ].filter(Boolean);
}

function indexAssets(assets) {
  const byKey = new Map();
  const byWordPressPostId = new Map();
  const byTitle = new Map();

  assets.forEach(asset => {
    const plainAsset = asset.toObject ? asset.toObject() : asset;

    getAssetKeys(plainAsset).forEach(key => {
      byKey.set(key, plainAsset);

      const postId = key.match(/retirements\/(\d+)-/u)?.[1];

      if (postId) {
        byWordPressPostId.set(Number(postId), plainAsset);
      }
    });

    [
      plainAsset.displayName,
      plainAsset.originalName
    ].forEach(name => {
      const normalizedName = normalize(name);

      if (normalizedName && !byTitle.has(normalizedName)) {
        byTitle.set(normalizedName, plainAsset);
      }
    });
  });

  return {
    byKey,
    byWordPressPostId,
    byTitle
  };
}

function findAssetForMessage(message, indexes) {
  const photoKey = getMediaKeyFromValue(message.photoUrl);
  const legacyMediaKey = cleanString(message.legacy?.mediaAssetKey);
  const wordpressPostId = Number(message.legacy?.wordpressPostId || 0);
  const title = normalize(getRetirementTitle(message));
  const candidates = [
    legacyMediaKey,
    photoKey
  ].filter(Boolean);

  for (const key of candidates) {
    const asset = indexes.byKey.get(key);

    if (asset) {
      return {
        asset,
        matchedBy: key === legacyMediaKey ? 'legacy.mediaAssetKey' : 'photoUrl'
      };
    }
  }

  if (wordpressPostId && indexes.byWordPressPostId.has(wordpressPostId)) {
    return {
      asset: indexes.byWordPressPostId.get(wordpressPostId),
      matchedBy: 'wordpressPostId'
    };
  }

  if (title && indexes.byTitle.has(title)) {
    return {
      asset: indexes.byTitle.get(title),
      matchedBy: 'title'
    };
  }

  return null;
}

function getCanonicalPhotoUrl(asset) {
  return asset.url ||
    buildPublicMediaUrl(asset.variants?.large?.key || asset.originalKey || asset.key);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const [assets, messages] = await Promise.all([
    MediaAsset.find({}).lean(),
    RetirementMessage.find({}).lean()
  ]);
  const indexes = indexAssets(assets);
  const results = [];

  for (const message of messages) {
    const match = findAssetForMessage(message, indexes);
    const currentPhotoKey = getMediaKeyFromValue(message.photoUrl);

    if (!match) {
      results.push({
        retirementMessageId: message._id,
        title: getRetirementTitle(message),
        matched: false,
        currentPhotoUrl: message.photoUrl || '',
        currentPhotoKey
      });
      continue;
    }

    const asset = match.asset;
    const nextPhotoUrl = getCanonicalPhotoUrl(asset);
    const nextLegacy = {
      ...(message.legacy || {}),
      mediaAssetKey: asset.key || asset.originalKey || '',
      mediaLinkedAt: new Date()
    };
    const changed =
      message.photoUrl !== nextPhotoUrl ||
      message.legacy?.mediaAssetKey !== nextLegacy.mediaAssetKey;

    if (apply && changed) {
      await RetirementMessage.updateOne(
        { _id: message._id },
        {
          $set: {
            photoUrl: nextPhotoUrl,
            legacy: nextLegacy
          }
        }
      );
    }

    results.push({
      retirementMessageId: message._id,
      title: getRetirementTitle(message),
      matched: true,
      matchedBy: match.matchedBy,
      changed,
      currentPhotoUrl: message.photoUrl || '',
      nextPhotoUrl,
      mediaAssetKey: nextLegacy.mediaAssetKey,
      mediaAssetName: asset.displayName || asset.originalName || ''
    });
  }

  await mongoose.disconnect();

  writeJson(manifestPath, {
    apply,
    scannedAt: new Date().toISOString(),
    mediaAssets: assets.length,
    retirementMessages: messages.length,
    matched: results.filter(result => result.matched).length,
    changed: results.filter(result => result.changed).length,
    unmatched: results.filter(result => !result.matched).length,
    results
  });

  console.log(`${apply ? 'Linked' : 'Would link'} ${results.filter(result => result.changed).length} retirement media references.`);
  console.log(`Matched ${results.filter(result => result.matched).length}/${results.length} retirement messages.`);
  console.log(`Wrote manifest: ${manifestPath}`);
}

main().catch(async error => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.error(error);
  process.exit(1);
});
