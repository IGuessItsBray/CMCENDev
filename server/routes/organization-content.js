const express = require('express');
const OrganizationContent = require('../models/OrganizationContent');
const MediaAsset = require('../models/MediaAsset');
const { authMiddleware } = require('../middleware/auth');
const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { buildPublicMediaUrl } = require('../services/media-library');
const {
  RESOURCES,
  canEditResource,
  portraitKeys,
  leadershipContent,
  applyLeadershipUpdate,
} = require('../services/organization-content');
const router = express.Router();
function portraitUrls(content) {
  return Object.fromEntries(portraitKeys(content).map((key) => [key, buildPublicMediaUrl(key)]));
}
router.use(authMiddleware);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/media', async (req, res) => {
  if (!RESOURCES.some((resource) => canEditResource(req.user, resource))) return res.sendStatus(403);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 120);
  const offset = Math.max(parseInt(req.query.cursor, 10) || 0, 0);
  const filter = { mimeType: /^image\//u };
  const search = String(req.query.q || '').trim().slice(0, 120);
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ displayName: pattern }, { originalName: pattern }, { key: pattern }];
  }
  const [assets, total] = await Promise.all([MediaAsset.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(), MediaAsset.countDocuments(filter)]);
  res.json({ media: assets.map((asset) => ({ key: asset.key, url: buildPublicMediaUrl(asset.key), variants: asset.variants || {}, name: asset.displayName || asset.originalName || asset.key, width: asset.width, height: asset.height, uuid: asset.uuid })), nextCursor: offset + assets.length < total ? String(offset + assets.length) : '', isTruncated: offset + assets.length < total });
});
router.get('/manage', (req, res) => {
  const resources = RESOURCES.filter((resource) =>
    canEditResource(req.user, resource),
  );
  if (!resources.length)
    return res
      .status(403)
      .json({ error: 'Branch leadership editing permission is required' });
  res.json({ resources, permissions: getUserPermissions(req.user) });
});
router.use('/manage/:key', (req, res, next) => {
  const resource = RESOURCES.find((item) => item.key === req.params.key);
  if (!resource)
    return res.status(404).json({ error: 'Unknown leadership page' });
  if (!canEditResource(req.user, resource))
    return res
      .status(403)
      .json({
        error: 'Branch leadership editing permission is required',
      });
  req.organizationResource = resource;
  next();
});
router.get('/manage/:key', async (req, res) => {
  const record = await OrganizationContent.findOne({
    key: req.params.key,
  }).lean();
  res.json({
    key: req.params.key,
    content: leadershipContent(record?.content),
    portraitUrls: portraitUrls(leadershipContent(record?.content)),
    version: record?.revision || 0,
  });
});
router.put('/manage/:key', async (req, res, next) => {
  try {
    if (
      !Number.isSafeInteger(req.body?.version) ||
      req.body.version < 0 ||
      !req.body.content
    ) {
      return res
        .status(400)
        .json({ error: 'Content and current version are required' });
    }
    const key = req.params.key;
    const previous = await OrganizationContent.findOne({ key }).lean();
    if ((previous?.revision || 0) !== req.body.version)
      return res
        .status(409)
        .json({
          error: 'Another editor changed this page. Reload before saving.',
        });
    const priorContent = leadershipContent(previous?.content);
    const content = applyLeadershipUpdate(req.body.content, previous?.content);
    const knownKeys = new Set(portraitKeys(priorContent));
    for (const imageKey of portraitKeys(content).filter(
      (item) => !knownKeys.has(item),
    )) {
      const asset = await MediaAsset.findOne({
        key: imageKey,
        mimeType: /^image\//u,
      })
        .select('_id')
        .lean();
      if (!asset)
        return res
          .status(400)
          .json({ error: 'Choose an uploaded image from the media library' });
    }
    let saved;
    if (!previous) {
      try {
        saved = await OrganizationContent.create({
          key,
          content,
          revision: 1,
          updatedBy: req.user._id,
        });
      } catch (error) {
        if (error.code === 11000)
          return res
            .status(409)
            .json({
              error: 'Another editor saved this page. Reload before saving.',
            });
        throw error;
      }
    } else {
      saved = await OrganizationContent.findOneAndUpdate(
        { key, revision: req.body.version },
        { $set: { content, updatedBy: req.user._id }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!saved)
        return res
          .status(409)
          .json({
            error: 'Another editor changed this page. Reload before saving.',
          });
    }
    await writeAuditLog({
      req,
      action: 'page.leadership.updated',
      actor: req.user,
      targetType: 'organizationContent',
      target: saved._id,
      targetSnapshot: { title: req.organizationResource.label, key },
      metadata: {
        area: req.organizationResource.area,
        revision: saved.revision,
        before: priorContent,
        after: leadershipContent(content),
      },
    });
    res.json({ key, content: leadershipContent(saved.content), version: saved.revision, portraitUrls: portraitUrls(saved.content) });
  } catch (error) {
    if (error.status === 400)
      return res.status(400).json({ error: error.message });
    next(error);
  }
});
module.exports = router;
