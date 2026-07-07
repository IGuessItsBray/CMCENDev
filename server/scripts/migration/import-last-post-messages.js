require('dotenv').config();

const fs = require('fs');
const path = require('path');

const mongoose = require('mongoose');
const { parseArgs, resolvePath } = require('./lib/args');
const { parseDate, stripHtml } = require('./lib/wordpress');
const LastPostMessage = require('../../models/LastPostMessage');

const args = parseArgs();
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'wordpress-migration-manifest.json')
);
const imageManifestPath = resolvePath(
  args.images,
  path.join(outputDir, 'wordpress-image-upload-manifest.json')
);
const apply = Boolean(args.apply);
const limit = args.limit ? Number(args.limit) : Infinity;

function loadImageMap() {
  if (!fs.existsSync(imageManifestPath)) {
    return new Map();
  }

  return new Map(
    JSON.parse(fs.readFileSync(imageManifestPath, 'utf8'))
      .filter(entry => entry.cdnUrl)
      .map(entry => [Number(entry.wordpressAttachmentId), entry.cdnUrl])
  );
}

function buildDocument(record, imageMap) {
  const fallbackTitle = `Legacy Last Post ${record.wordpressPostId}`;
  const title = record.title || fallbackTitle;
  const message =
    stripHtml(record.contentHtml) ||
    record.title ||
    '';

  return {
    title,
    slug: record.slug,
    message,
    messageLanguage: record.messageLanguage || 'unknown',
    photoUrl: record.thumbnailId && imageMap.has(record.thumbnailId)
      ? imageMap.get(record.thumbnailId)
      : record.image?.sourceUrl || '',
    status: record.status,
    publishedAt: record.status === 'published'
      ? parseDate(record.postDate)
      : null,
    legacyComments: record.comments,
    legacy: {
      ...record.legacy,
      importedAt: new Date(),
      raw: {
        thumbnailId: record.thumbnailId,
        sourceImageUrl: record.image?.sourceUrl || '',
        excerpt: record.excerpt
      }
    }
  };
}

async function main() {
  if (apply && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  const records = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    .filter(record => record.type === 'lastPost')
    .slice(0, limit);
  const imageMap = loadImageMap();

  if (apply) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  for (const record of records) {
    if (apply) {
      await LastPostMessage.findOneAndUpdate(
        {
          'legacy.source': 'wordpress',
          'legacy.postId': record.wordpressPostId
        },
        {
          $set: buildDocument(record, imageMap)
        },
        {
          upsert: true,
          runValidators: true
        }
      );
    }

    console.log(`${apply ? 'Imported' : 'Would import'} Last Post ${record.wordpressPostId}: ${record.title}`);
  }

  if (apply) {
    await mongoose.disconnect();
  }

  console.log(`${apply ? 'Imported' : 'Would import'} ${records.length} Last Post messages.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
