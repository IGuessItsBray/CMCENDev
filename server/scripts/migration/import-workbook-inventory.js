require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env'),
});

const path = require('path');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { parseArgs, resolvePath } = require('./lib/args');
const { writeJson } = require('./lib/wordpress');
const {
  assertPublicMediaBaseUrl,
  configurePublicMediaBaseUrl,
} = require('./lib/public-media');
const { readWorkbookInventory } = require('./lib/workbook-inventory');
const {
  buildDocument,
  buildRecordFilter,
  getCommentKey,
  slugify,
} = require('./lib/workbook-import');
const { uploadWorkbookMedia } = require('./lib/workbook-media');
const RetirementMessage = require('../../models/RetirementMessage');
const RetirementComment = require('../../models/RetirementComment');
const LastPostMessage = require('../../models/LastPostMessage');
const LastPostComment = require('../../models/LastPostComment');
const User = require('../../models/User');

const args = parseArgs();
const inputPath = args.input ? resolvePath(args.input) : '';
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'workbook-inventory-import-manifest.json'),
);
const checkpointPath = resolvePath(
  args.checkpoint,
  path.join(outputDir, 'workbook-inventory-import.checkpoint.json'),
);
const apply = Boolean(args.apply);
const limit = args.limit ? Number(args.limit) : Infinity;
const publicMediaBaseUrl = configurePublicMediaBaseUrl(args);

function summarize(results) {
  return {
    records: results.length,
    imported: results.filter((result) => result.imported).length,
    published: results.filter((result) => result.status === 'published').length,
    pendingTranslation: results.filter((result) => result.status === 'pending')
      .length,
    mediaAssets: results.reduce(
      (total, result) => total + result.mediaAssets,
      0,
    ),
    skippedNonImageMedia: results.reduce(
      (total, result) => total + result.skippedNonImageMedia.length,
      0,
    ),
    mediaFailures: results.reduce(
      (total, result) => total + result.mediaFailures.length,
      0,
    ),
    comments: results.reduce(
      (total, result) => total + result.commentsImported,
      0,
    ),
    unparsedComments: results.reduce(
      (total, result) => total + result.unparsedComments,
      0,
    ),
    failures: results.filter((result) => result.error).length,
  };
}

function writeCheckpoint(inventory, results) {
  writeJson(checkpointPath, {
    generatedAt: new Date().toISOString(),
    inputPath: inventory.inputPath,
    complete: results.length === inventory.candidates.slice(0, limit).length,
    results,
    summary: summarize(results),
  });
}

async function getLegacyImportUser() {
  return User.findOneAndUpdate(
    { username: 'LegacyImport' },
    {
      $setOnInsert: {
        accountType: 'ghost',
        username: 'LegacyImport',
        email: 'legacy-import@cmcen.local',
        password: randomUUID(),
        accountName: 'Legacy Import',
        firstName: 'Legacy',
        lastName: 'Import',
        preferredLanguage: 'en',
        role: 'subscriber',
        customRoles: [],
        contentAreas: [],
      },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

async function getCommentAuthor(authorName) {
  const cleanName = String(authorName || 'WordPress Commenter').trim();
  const username = `workbook-comment-${slugify(cleanName).slice(0, 45)}`;
  const [firstName, ...lastNameParts] = cleanName.split(/\s+/u).filter(Boolean);

  return User.findOneAndUpdate(
    { username },
    {
      $setOnInsert: {
        accountType: 'ghost',
        username,
        email: `${username}@cmcen.local`,
        password: randomUUID(),
        accountName: cleanName,
        firstName: firstName || 'WordPress',
        lastName: lastNameParts.join(' ') || 'Commenter',
        preferredLanguage: 'en',
        role: 'subscriber',
        customRoles: [],
        contentAreas: [],
      },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

async function importComments(candidate, importedMessage, legacyUser) {
  const CommentModel =
    candidate.type === 'retirement' ? RetirementComment : LastPostComment;
  const messageField =
    candidate.type === 'retirement' ? 'retirementMessage' : 'lastPostMessage';
  const imported = [];

  for (const comment of candidate.comments.filter(
    (entry) => entry.parsed && entry.body.length >= 2,
  )) {
    const author = await getCommentAuthor(comment.authorName);
    const publishedAt = new Date(comment.publishedAt);
    const document = {
      [messageField]: importedMessage._id,
      author: author._id,
      body: comment.body.slice(0, 2000),
      status: 'published',
      reviewedBy: legacyUser._id,
      reviewedAt: publishedAt,
      publishedBy: legacyUser._id,
      publishedAt,
      rejectionReason: '',
      legacy: {
        source: 'workbook-bilingual-inventory',
        recordId: candidate.recordId,
        commentKey: getCommentKey(candidate, comment),
        sourcePostIds: candidate.sourcePostIds,
        authorName: comment.authorName,
        importedAt: new Date(),
      },
    };

    imported.push(
      await CommentModel.findOneAndUpdate(
        {
          'legacy.source': 'workbook-bilingual-inventory',
          'legacy.commentKey': document.legacy.commentKey,
        },
        { $set: document },
        { new: true, upsert: true, runValidators: true },
      ),
    );
  }

  return imported;
}

async function importCandidate(candidate, legacyUser) {
  const mediaResult = await uploadWorkbookMedia(candidate);
  const document = buildDocument(candidate, mediaResult, legacyUser);
  const Model =
    candidate.type === 'retirement' ? RetirementMessage : LastPostMessage;
  const importedMessage = await Model.findOneAndUpdate(
    buildRecordFilter(candidate),
    { $set: document },
    { new: true, upsert: true, runValidators: true },
  );
  const comments = await importComments(candidate, importedMessage, legacyUser);

  return {
    importedMessage,
    mediaResult,
    comments,
  };
}

async function main() {
  if (!inputPath) {
    throw new Error('Pass --input=<cleaned workbook path>.');
  }

  const inventory = readWorkbookInventory(inputPath);
  const candidates = inventory.candidates.slice(0, limit);
  const results = [];

  if (apply) {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not configured.');
    }
    if (!process.env.MINIO_BUCKET_NAME) {
      throw new Error('MINIO_BUCKET_NAME is not configured.');
    }

    assertPublicMediaBaseUrl(publicMediaBaseUrl);
    await mongoose.connect(process.env.MONGO_URI);
  }

  try {
    const legacyUser = apply ? await getLegacyImportUser() : null;

    for (const [index, candidate] of candidates.entries()) {
      const result = {
        recordId: candidate.recordId,
        type: candidate.type,
        status: candidate.bilingual ? 'published' : 'pending',
        sourcePostIds: candidate.sourcePostIds,
        mediaAssets: 0,
        skippedNonImageMedia: [],
        mediaFailures: [],
        commentsImported: 0,
        unparsedComments: candidate.comments.filter(
          (comment) => !comment.parsed,
        ).length,
        imported: false,
      };

      try {
        if (apply) {
          const imported = await importCandidate(candidate, legacyUser);
          result.imported = true;
          result.mediaAssets = imported.mediaResult.assets.length;
          result.skippedNonImageMedia = imported.mediaResult.skipped;
          result.mediaFailures = imported.mediaResult.failures;
          result.commentsImported = imported.comments.length;
        } else {
          result.mediaAssets = candidate.mediaLinks.filter((value) =>
            require('./lib/workbook-media').isImageLikeUrl(value),
          ).length;
          result.skippedNonImageMedia = candidate.mediaLinks.filter(
            (value) => !require('./lib/workbook-media').isImageLikeUrl(value),
          );
        }
      } catch (error) {
        result.error = error.message || String(error);
      }

      results.push(result);
      writeCheckpoint(inventory, results);
      console.log(
        `[${index + 1}/${candidates.length}] Processed record ${candidate.recordId}`,
      );
    }
  } finally {
    if (apply) {
      await mongoose.disconnect();
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    inputPath: inventory.inputPath,
    apply,
    complete: true,
    inventory: inventory.summary,
    results,
    summary: summarize(results),
  };
  writeJson(manifestPath, manifest);
  console.log(`Wrote manifest: ${manifestPath}`);
  console.log(JSON.stringify(manifest.summary));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
