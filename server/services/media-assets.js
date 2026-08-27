const MediaAsset = require('../models/MediaAsset');
const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const NewsArticle = require('../models/NewsArticle');
const Page = require('../models/Page');
const RetirementMessage = require('../models/RetirementMessage');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const {
  buildPublicMediaUrl,
  getMediaKeyFromValue,
} = require('./media-library');
const s3Client = require('../storage');

const MEDIA_UPLOAD_SOURCE_TYPES = new Set([
  'retirementMessage',
  'lastPostMessage',
  'newsArticle',
  'event',
  'mediaManager',
  'pageBuilder',
  'migration',
  'directUpload',
  'legacyStorage',
  'unknown',
]);

function cleanString(value, fallback = '') {
  const cleanValue = String(value || '').trim();
  return cleanValue || fallback;
}

function truncate(value, maxLength = 240) {
  return cleanString(value).slice(0, maxLength);
}

function normalizeUploadSourceType(value) {
  const sourceType = cleanString(value);
  return MEDIA_UPLOAD_SOURCE_TYPES.has(sourceType) ? sourceType : 'unknown';
}

function buildUploadContext(input = {}) {
  const type = normalizeUploadSourceType(
    input.uploadSource || input.type || input.sourceType,
  );

  return {
    type,
    context: truncate(input.context || input.uploadContext || type),
    sourceId: truncate(input.sourceId),
    sourceModel: truncate(input.sourceModel),
    sourceField: truncate(input.sourceField),
    sourceUrl: truncate(input.sourceUrl, 2000),
    sourceSlug: truncate(input.sourceSlug),
    label: truncate(input.sourceName || input.inferredName || input.label),
    linkedAt: input.linkedAt || null,
  };
}

function buildUploadContextFromBody(body = {}) {
  return buildUploadContext(body);
}

function sanitizeImageMetadata(metadata = {}) {
  // Keep only rendering information. Embedded camera, location, author, and
  // profile metadata must never be copied into the media record.
  return Object.fromEntries(
    [
      'format',
      'width',
      'height',
      'space',
      'channels',
      'depth',
      'hasAlpha',
      'pages',
      'pageHeight',
    ]
      .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
      .map((key) => [key, metadata[key]]),
  );
}

function getDisplayName(file, uploadContext = {}) {
  return truncate(
    uploadContext.label || file?.originalname || 'Uploaded image',
  );
}

function buildFileMetadata(file = {}, uploadResult = {}) {
  return {
    originalName: cleanString(file.originalname),
    encoding: cleanString(file.encoding),
    mimeType: cleanString(file.mimetype || uploadResult.original?.mimeType),
    size: Number(file.size || uploadResult.original?.size || 0),
    storageKey: cleanString(uploadResult.key),
    originalKey: cleanString(uploadResult.original?.key),
  };
}

async function createMediaAssetRecord({
  uploadResult,
  file,
  user,
  uploadContext,
  imageMetadata,
}) {
  const cleanUploadContext = buildUploadContext(uploadContext);
  const displayName = getDisplayName(file, cleanUploadContext);

  const asset = await MediaAsset.create({
    ...(uploadResult.uuid ? { uuid: uploadResult.uuid } : {}),
    key: uploadResult.key,
    url: uploadResult.url,
    originalKey: uploadResult.original?.key || uploadResult.key,
    originalUrl: uploadResult.original?.url || uploadResult.url,
    originalName: truncate(
      file?.originalname || uploadResult.originalName || displayName,
    ),
    displayName,
    ...(cleanString(uploadResult.cdnSlug)
      ? { cdnSlug: cleanString(uploadResult.cdnSlug) }
      : {}),
    mimeType: uploadResult.original?.mimeType || file?.mimetype || '',
    width: uploadResult.original?.width || 0,
    height: uploadResult.original?.height || 0,
    size: uploadResult.original?.size || file?.size || 0,
    variants: uploadResult.variants || {},
    display: uploadResult.display || {},
    uploadContext: cleanUploadContext,
    inferredName: cleanUploadContext.label,
    fileMetadata: buildFileMetadata(file, uploadResult),
    imageMetadata: sanitizeImageMetadata(
      imageMetadata || uploadResult.imageMetadata || {},
    ),
    uploadedBy: user?._id || null,
    storageEncryption: uploadResult.storageEncryption || {},
  });

  return asset.toObject();
}

async function linkMediaAssetToSource({
  mediaUrl,
  sourceType,
  sourceId,
  sourceModel,
  sourceField,
  sourceUrl,
  sourceSlug,
  inferredName,
  context,
}) {
  const key = getMediaKeyFromValue(mediaUrl);

  if (!key && !cleanString(mediaUrl)) {
    return null;
  }

  const uploadContext = buildUploadContext({
    type: sourceType,
    context,
    sourceId: sourceId ? String(sourceId) : '',
    sourceModel,
    sourceField,
    sourceUrl,
    sourceSlug,
    sourceName: inferredName,
    linkedAt: new Date(),
  });
  const cleanInferredName = truncate(inferredName);
  const update = {
    uploadContext,
    inferredName: cleanInferredName,
  };

  if (cleanInferredName) {
    update.displayName = cleanInferredName;
  }

  return MediaAsset.findOneAndUpdate(
    {
      $or: [
        { key },
        { originalKey: key },
        { url: mediaUrl },
        { originalUrl: mediaUrl },
      ].filter((condition) => Object.values(condition)[0]),
    },
    { $set: update },
    { returnDocument: 'after' },
  );
}

function getMediaAssetKeys(asset = {}) {
  const variants = asset.variants || {};
  const values = [
    asset.key,
    asset.url,
    asset.originalKey,
    asset.originalUrl,
    asset.display?.key,
    asset.display?.url,
    ...Object.values(variants).flatMap((variant) => [
      variant?.key,
      variant?.url,
    ]),
  ];

  return new Set(
    values
      .flatMap((value) => [
        String(value || '').trim(),
        getMediaKeyFromValue(value),
      ])
      .filter(Boolean),
  );
}

function getMediaAssetObjectKeys(asset = {}) {
  const variants = asset.variants || {};
  const values = [
    asset.key,
    asset.originalKey,
    getMediaKeyFromValue(asset.url),
    getMediaKeyFromValue(asset.originalUrl),
    asset.display?.key,
    getMediaKeyFromValue(asset.display?.url),
    ...Object.values(variants).flatMap((variant) => [
      variant?.key,
      getMediaKeyFromValue(variant?.url),
    ]),
  ];

  return [
    ...new Set(
      values.map((value) => String(value || '').trim()).filter(Boolean),
    ),
  ];
}

function isMediaReferenceForAsset(value, assetKeys) {
  const cleanValue = String(value || '').trim();

  return (
    Boolean(cleanValue) &&
    (assetKeys.has(cleanValue) ||
      assetKeys.has(getMediaKeyFromValue(cleanValue)))
  );
}

function getPageMediaReferences(blocks = []) {
  const references = [];
  const addMediaItem = (item, fieldPrefix) => {
    if (!item || typeof item !== 'object') return;

    references.push(
      [item.mediaKey, `${fieldPrefix}.mediaKey`],
      [item.mediaUrl, `${fieldPrefix}.mediaUrl`],
    );

    Object.entries(item.mediaVariants || {}).forEach(
      ([variantName, variant]) => {
        references.push(
          [variant?.key, `${fieldPrefix}.mediaVariants.${variantName}.key`],
          [variant?.url, `${fieldPrefix}.mediaVariants.${variantName}.url`],
        );
      },
    );
  };

  blocks.forEach((block, blockIndex) => {
    addMediaItem(block, `blocks.${blockIndex}`);
    (block?.columns || []).forEach((column, columnIndex) => {
      addMediaItem(column, `blocks.${blockIndex}.columns.${columnIndex}`);
    });
    (block?.items || []).forEach((item, itemIndex) => {
      addMediaItem(item, `blocks.${blockIndex}.items.${itemIndex}`);
    });
  });

  return references;
}

async function getContentMediaReferences(assetKeys) {
  const [events, retirementMessages, lastPostMessages, newsArticles, pages] =
    await Promise.all([
      Event.find({ imagePath: { $nin: [null, ''] } })
        .select('_id imagePath')
        .lean(),
      RetirementMessage.find({ photoUrl: { $nin: [null, ''] } })
        .select('_id photoUrl')
        .lean(),
      LastPostMessage.find({
        $or: [
          { imageUrl: { $nin: [null, ''] } },
          { photoUrl: { $nin: [null, ''] } },
        ],
      })
        .select('_id imageUrl photoUrl')
        .lean(),
      NewsArticle.find({
        $or: [
          { imageUrl: { $nin: [null, ''] } },
          { imageDisplayUrl: { $nin: [null, ''] } },
        ],
      })
        .select('_id imageUrl imageDisplayUrl')
        .lean(),
      Page.find({}).select('_id blocks').lean(),
    ]);
  const references = [];
  const addReference = (type, document, field, value) => {
    if (isMediaReferenceForAsset(value, assetKeys)) {
      references.push({
        type,
        id: String(document._id),
        field,
      });
    }
  };

  events.forEach((event) => {
    addReference('event', event, 'imagePath', event.imagePath);
  });
  retirementMessages.forEach((message) => {
    addReference('retirementMessage', message, 'photoUrl', message.photoUrl);
  });
  lastPostMessages.forEach((message) => {
    addReference('lastPostMessage', message, 'imageUrl', message.imageUrl);
    addReference('lastPostMessage', message, 'photoUrl', message.photoUrl);
  });
  newsArticles.forEach((article) => {
    addReference('newsArticle', article, 'imageUrl', article.imageUrl);
    addReference(
      'newsArticle',
      article,
      'imageDisplayUrl',
      article.imageDisplayUrl,
    );
  });
  pages.forEach((page) => {
    getPageMediaReferences(page.blocks).forEach(([value, field]) => {
      addReference('page', page, field, value);
    });
  });

  return references;
}

async function deleteContentMediaAsset({ mediaUrl, source }) {
  const cleanMediaUrl = String(mediaUrl || '').trim();

  if (!cleanMediaUrl) {
    return { status: 'none' };
  }

  const key = getMediaKeyFromValue(cleanMediaUrl);
  const mediaAsset = await MediaAsset.findOne({
    $or: [
      { key },
      { originalKey: key },
      { url: cleanMediaUrl },
      { originalUrl: cleanMediaUrl },
    ].filter((condition) => Object.values(condition)[0]),
  }).lean();

  if (!mediaAsset) {
    return { status: 'untracked' };
  }

  const assetKeys = getMediaAssetKeys(mediaAsset);
  const references = await getContentMediaReferences(assetKeys);
  const remainingReferences = references.filter(
    (reference) =>
      reference.type !== source.type ||
      String(reference.id) !== String(source.id),
  );

  if (remainingReferences.length) {
    return {
      status: 'shared',
      key: mediaAsset.key,
      references: remainingReferences,
    };
  }

  const objectKeys = getMediaAssetObjectKeys(mediaAsset);
  await Promise.all(
    objectKeys.map((objectKey) =>
      s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.MINIO_BUCKET_NAME,
          Key: objectKey,
        }),
      ),
    ),
  );
  await MediaAsset.deleteOne({ _id: mediaAsset._id });

  return {
    status: 'deleted',
    key: mediaAsset.key,
    objectKeys,
  };
}

async function deleteContentMediaAssets({ mediaUrls, source }) {
  const uniqueMediaUrls = [
    ...new Set(
      (Array.isArray(mediaUrls) ? mediaUrls : [])
        .map((mediaUrl) => String(mediaUrl || '').trim())
        .filter(Boolean),
    ),
  ];
  const cleanup = [];

  for (const mediaUrl of uniqueMediaUrls) {
    cleanup.push(await deleteContentMediaAsset({ mediaUrl, source }));
  }

  return cleanup;
}

module.exports = {
  buildUploadContext,
  buildUploadContextFromBody,
  createMediaAssetRecord,
  deleteContentMediaAsset,
  deleteContentMediaAssets,
  linkMediaAssetToSource,
  sanitizeImageMetadata,
};
