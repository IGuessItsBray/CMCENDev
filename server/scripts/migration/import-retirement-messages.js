require('dotenv').config();

const fs = require('fs');
const path = require('path');

const mongoose = require('mongoose');
const { parseArgs, resolvePath } = require('./lib/args');
const {
  cleanString,
  parseDate,
  stripHtml
} = require('./lib/wordpress');
const RetirementMessage = require('../../models/RetirementMessage');

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

function parseRetiree(record) {
  const title = cleanString(record.title)
    .replace(/^RETIREMENT\s+(ANNOUNCEMENT\s+)?[-–:]?\s*/iu, '');
  const withoutTrade = title.split(/\s+-\s+\d{3,}/u)[0];
  const parts = withoutTrade.split(/\s+/u).filter(Boolean);

  return {
    rank: parts.slice(0, Math.min(3, parts.length - 2)).join(' ') || 'Unknown',
    firstName: parts.length >= 2 ? parts[parts.length - 2] : 'Unknown',
    lastName: parts.length >= 1 ? parts[parts.length - 1].replace(/,+$/u, '') : 'Unknown',
    postNominals: title.match(/,\s*([A-Z, ]*CD[A-Z, ]*)/u)?.[1]?.trim() || '',
    tradeRole: title.match(/\d{3,}\s*,\s*(.+)$/u)?.[1]?.trim() || '',
    retirementDate: parseDate(record.retirementDate) || null
  };
}

function getPhotoUrl(record, imageMap) {
  if (record.thumbnailId && imageMap.has(record.thumbnailId)) {
    return imageMap.get(record.thumbnailId);
  }

  return record.image?.sourceUrl || '';
}

function buildDocument(record, imageMap) {
  const message = stripHtml(record.contentHtml);
  const published = record.status === 'published';
  const status = published ? 'published' : 'pending';
  const publishedAt = published ? parseDate(record.postDate) : null;

  return {
    retiree: parseRetiree(record),
    message,
    messageLanguage: record.messageLanguage === 'fr' ? 'fr' : 'en',
    messages: {
      [record.messageLanguage === 'fr' ? 'fr' : 'en']: message
    },
    photoUrl: getPhotoUrl(record, imageMap),
    submitter: {
      firstName: 'Legacy',
      lastName: 'Import',
      relationship: 'other',
      email: 'legacy-import@cmcen.local',
      unit: 'CMCEN'
    },
    publicationConsent: {
      confirmed: true,
      confirmedAt: parseDate(record.postDate) || new Date()
    },
    memberReviewConfirmation: {
      confirmed: true,
      confirmedAt: parseDate(record.postDate) || new Date()
    },
    status,
    reviewedAt: publishedAt,
    publishedAt,
    legacy: {
      ...record.legacy,
      importedAt: new Date(),
      comments: record.comments,
      thumbnailId: record.thumbnailId,
      sourceImageUrl: record.image?.sourceUrl || ''
    }
  };
}

async function main() {
  if (apply && !process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  const records = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    .filter(record => record.type === 'retirement')
    .slice(0, limit);
  const imageMap = loadImageMap();

  if (apply) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  let changed = 0;

  for (const record of records) {
    const document = buildDocument(record, imageMap);

    if (document.message.length < 100) {
      console.log(`Skipping ${record.wordpressPostId}: message too short`);
      continue;
    }

    if (apply) {
      await RetirementMessage.findOneAndUpdate(
        {
          'legacy.source': 'wordpress',
          'legacy.postId': record.wordpressPostId
        },
        {
          $set: document
        },
        {
          upsert: true,
          runValidators: true
        }
      );
    }

    changed += 1;
    console.log(`${apply ? 'Imported' : 'Would import'} retirement ${record.wordpressPostId}: ${record.title}`);
  }

  if (apply) {
    await mongoose.disconnect();
  }

  console.log(`${apply ? 'Imported' : 'Would import'} ${changed} retirement messages.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
