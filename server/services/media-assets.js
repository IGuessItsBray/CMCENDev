const MediaAsset = require('../models/MediaAsset');
const { buildPublicMediaUrl, getMediaKeyFromValue } = require('./media-library');

const MEDIA_UPLOAD_SOURCE_TYPES = new Set([
  'retirementMessage',
  'lastPostMessage',
  'event',
  'mediaManager',
  'pageBuilder',
  'migration',
  'directUpload',
  'legacyStorage',
  'unknown'
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
  return MEDIA_UPLOAD_SOURCE_TYPES.has(sourceType)
    ? sourceType
    : 'unknown';
}

function buildUploadContext(input = {}) {
  const type = normalizeUploadSourceType(
    input.uploadSource ||
    input.type ||
    input.sourceType
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
    linkedAt: input.linkedAt || null
  };
}

function buildUploadContextFromBody(body = {}) {
  return buildUploadContext(body);
}

function sanitizeMetadataValue(value) {
  if (Buffer.isBuffer(value)) {
    return {
      byteLength: value.length
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeMetadataValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeMetadataValue(item)
      ])
    );
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  return String(value || '');
}

function sanitizeImageMetadata(metadata = {}) {
  return sanitizeMetadataValue(metadata);
}

function getDisplayName(file, uploadContext = {}) {
  return truncate(
    uploadContext.label ||
    file?.originalname ||
    'Uploaded image'
  );
}

function buildFileMetadata(file = {}, uploadResult = {}) {
  return {
    originalName: cleanString(file.originalname),
    encoding: cleanString(file.encoding),
    mimeType: cleanString(file.mimetype || uploadResult.original?.mimeType),
    size: Number(file.size || uploadResult.original?.size || 0),
    storageKey: cleanString(uploadResult.key),
    originalKey: cleanString(uploadResult.original?.key)
  };
}

async function createMediaAssetRecord({
  uploadResult,
  file,
  user,
  uploadContext,
  imageMetadata
}) {
  const cleanUploadContext = buildUploadContext(uploadContext);
  const displayName = getDisplayName(file, cleanUploadContext);

  const asset = await MediaAsset.create({
    key: uploadResult.key,
    url: uploadResult.url,
    originalKey: uploadResult.original?.key || uploadResult.key,
    originalUrl: uploadResult.original?.url || uploadResult.url,
    originalName: truncate(file?.originalname || uploadResult.originalName || displayName),
    displayName,
    ...(cleanString(uploadResult.cdnSlug)
      ? { cdnSlug: cleanString(uploadResult.cdnSlug) }
      : {}),
    mimeType: uploadResult.original?.mimeType || file?.mimetype || '',
    width: uploadResult.original?.width || 0,
    height: uploadResult.original?.height || 0,
    size: uploadResult.original?.size || file?.size || 0,
    variants: uploadResult.variants || {},
    uploadContext: cleanUploadContext,
    inferredName: cleanUploadContext.label,
    fileMetadata: buildFileMetadata(file, uploadResult),
    imageMetadata: sanitizeImageMetadata(imageMetadata || uploadResult.imageMetadata || {}),
    uploadedBy: user?._id || null
  });

  return asset.toObject();
}

async function createDirectUploadMediaAssetRecord({
  key,
  originalName,
  contentType,
  size,
  user,
  uploadContext
}) {
  const url = buildPublicMediaUrl(key);
  const initialUploadContext = buildUploadContext(uploadContext);
  const cleanUploadContext = buildUploadContext({
    ...initialUploadContext,
    type:
      initialUploadContext.type === 'unknown'
        ? 'directUpload'
        : initialUploadContext.type,
    context:
      initialUploadContext.context === 'unknown'
        ? 'direct-upload'
        : initialUploadContext.context
  });
  const displayName = truncate(cleanUploadContext.label || originalName || key);

  const asset = await MediaAsset.create({
    key,
    url,
    originalKey: key,
    originalUrl: url,
    originalName: truncate(originalName || key),
    displayName,
    mimeType: cleanString(contentType),
    size: Number(size || 0),
    uploadContext: cleanUploadContext,
    inferredName: cleanUploadContext.label,
    fileMetadata: {
      originalName: cleanString(originalName),
      mimeType: cleanString(contentType),
      size: Number(size || 0),
      storageKey: cleanString(key),
      uploadStatus: 'signed-url-issued'
    },
    uploadedBy: user?._id || null
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
  context
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
    linkedAt: new Date()
  });
  const cleanInferredName = truncate(inferredName);
  const update = {
    uploadContext,
    inferredName: cleanInferredName
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
        { originalUrl: mediaUrl }
      ].filter(condition => Object.values(condition)[0])
    },
    { $set: update },
    { returnDocument: 'after' }
  );
}

module.exports = {
  buildUploadContext,
  buildUploadContextFromBody,
  createDirectUploadMediaAssetRecord,
  createMediaAssetRecord,
  linkMediaAssetToSource,
  sanitizeImageMetadata
};
