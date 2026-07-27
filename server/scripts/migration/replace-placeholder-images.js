require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const path = require('path');
const { parseArgs, resolvePath } = require('./lib/args');
const { writeJson } = require('./lib/wordpress');
const { CANONICAL_CREST_URL, isPlaceholderImage } = require('./lib/placeholder-image');
const RetirementMessage = require('../../models/RetirementMessage');
const LastPostMessage = require('../../models/LastPostMessage');
const MediaAsset = require('../../models/MediaAsset');
const { writeAuditLog } = require('../../services/audit-log');

const args = parseArgs();
const apply = Boolean(args.apply);
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(args.manifest, path.join(outputDir, 'placeholder-image-replacement-manifest.json'));

function getAssetUrls(asset) {
  return [
    asset.url,
    asset.originalUrl,
    ...Object.values(asset.variants || {}).map(variant => variant.url)
  ].filter(Boolean);
}

async function getPlaceholderMediaUrls() {
  const assets = await MediaAsset.find({}).lean();
  const urls = new Set();

  assets.forEach(asset => {
    const fingerprint = [
      asset.key,
      asset.originalKey,
      asset.originalName,
      asset.displayName,
      asset.fileMetadata?.originalName,
      asset.fileMetadata?.fallbackAsset,
      asset.fileMetadata?.fallbackSourceUrl
    ].filter(Boolean).join(' ');

    if (isPlaceholderImage(fingerprint)) {
      getAssetUrls(asset).forEach(url => urls.add(url));
    }
  });

  return urls;
}

function replacementFor(document, fields, placeholderMediaUrls) {
  const matchingFields = fields.filter(field =>
    isPlaceholderImage(document[field]) || placeholderMediaUrls.has(document[field])
  );
  return matchingFields.length ? matchingFields : null;
}

async function collect(Model, type, fields, placeholderMediaUrls) {
  const documents = await Model.find({ status: 'published' }).lean();
  return documents.flatMap(document => {
    const fieldsToReplace = replacementFor(document, fields, placeholderMediaUrls);
    return fieldsToReplace ? [{ type, id: String(document._id), title: document.title || `${document.retiree?.rank || ''} ${document.retiree?.firstName || ''} ${document.retiree?.lastName || ''}`.trim(), fields: fieldsToReplace }] : [];
  });
}

async function applyReplacement(item) {
  const Model = item.type === 'retirement' ? RetirementMessage : LastPostMessage;
  const update = Object.fromEntries(item.fields.map(field => [field, CANONICAL_CREST_URL]));
  await Model.updateOne({ _id: item.id }, { $set: update });
  await writeAuditLog({
    action: 'migration.placeholder_image_replaced',
    targetType: item.type === 'retirement' ? 'retirement-message' : 'last-post-message',
    target: item.id,
    metadata: { fields: item.fields, replacementUrl: CANONICAL_CREST_URL }
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const placeholderMediaUrls = await getPlaceholderMediaUrls();
  const replacements = [
    ...await collect(RetirementMessage, 'retirement', ['photoUrl'], placeholderMediaUrls),
    ...await collect(LastPostMessage, 'last-post', ['imageUrl', 'photoUrl'], placeholderMediaUrls)
  ];

  if (apply) {
    for (const item of replacements) {
      await applyReplacement(item);
    }
  }

  writeJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    apply,
    replacementUrl: CANONICAL_CREST_URL,
    placeholderMediaAssets: placeholderMediaUrls.size,
    replacements
  });
  console.log(`${apply ? 'Replaced' : 'Found'} ${replacements.length} placeholder image record(s).`);
  console.log(`Wrote placeholder image manifest: ${manifestPath}`);
  await mongoose.disconnect();
}

main().catch(async error => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  console.error(error.message || error);
  process.exit(1);
});
