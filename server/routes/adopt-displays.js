const express = require('express');
const mongoose = require('mongoose');
const AdoptDisplay = require('../models/AdoptDisplay');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');
const router = express.Router();
const limits = {
  title: 240,
  description: 8000,
  adoptionAmount: 240,
  availability: 240,
  recognition: 2000,
  expiry: 240,
};
function text(value, limit) {
  if (typeof value !== 'string' || value.length > limit)
    throw new Error('Invalid text field');
  return value.trim();
}
function payload(body) {
  const result = {};
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Invalid display');
  for (const [key, limit] of Object.entries(limits)) {
    if (body[key] === undefined) continue;
    if (!body[key] || typeof body[key] !== 'object' || Array.isArray(body[key]))
      throw new Error('Invalid bilingual field');
    result[key] = {
      en: text(body[key].en ?? '', limit),
      fr: text(body[key].fr ?? '', limit),
    };
  }
  for (const [key, limit] of [
    ['displayNumber', 80],
    ['imageUrl', 2000],
  ]) {
    if (body[key] !== undefined) result[key] = text(body[key], limit);
  }
  if (result.imageUrl) {
    let url;
    try {
      url = new URL(result.imageUrl);
    } catch {
      throw new Error('Invalid image URL');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid image URL');
  }
  if (body.published !== undefined) {
    if (typeof body.published !== 'boolean')
      throw new Error('Invalid publication state');
    result.published = body.published;
  }
  return result;
}
function serialize(item) {
  const value = item.toObject ? item.toObject() : item;
  return Object.fromEntries(
    [
      '_id',
      ...Object.keys(limits),
      'displayNumber',
      'imageUrl',
      'published',
      'createdAt',
      'updatedAt',
    ].map((key) => [key, value[key]]),
  );
}
function validTitle(item) {
  return Boolean(item.title?.en || item.title?.fr);
}
async function audit(req, action, item) {
  await writeAuditLog({
    req,
    action: `adopt_display.${action}`,
    actor: req.user,
    targetType: 'adoptDisplay',
    target: item._id,
    targetSnapshot: {
      title: item.title.en || item.title.fr,
      displayNumber: item.displayNumber,
    },
    metadata: { published: item.published },
  });
}
router.get('/adopt-displays', async (req, res) => {
  try {
    const items = await AdoptDisplay.find({ published: true })
      .sort({ displayNumber: 1, _id: 1 })
      .lean();
    res.json({ displays: items.map(serialize) });
  } catch {
    res.status(500).json({ error: 'Could not load displays' });
  }
});
router.use(
  '/admin/adopt-displays',
  authMiddleware,
  requirePermission('canManageAdoptDisplays'),
);
router.param('displayId', (req, res, next, id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    return res.status(404).json({ error: 'Display not found' });
  next();
});
router.get('/admin/adopt-displays', async (req, res) => {
  try {
    const items = await AdoptDisplay.find({})
      .sort({ displayNumber: 1, _id: 1 })
      .lean();
    res.json({ displays: items.map(serialize) });
  } catch {
    res.status(500).json({ error: 'Could not load displays' });
  }
});
router.post('/admin/adopt-displays', async (req, res) => {
  let updates;
  try {
    updates = payload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!validTitle(updates))
    return res.status(400).json({ error: 'A display title is required' });
  try {
    const item = await AdoptDisplay.create({
      ...updates,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
    await audit(req, 'created', item);
    res.status(201).json({ display: serialize(item) });
  } catch {
    res.status(500).json({ error: 'Could not create display' });
  }
});
router.patch('/admin/adopt-displays/:displayId', async (req, res) => {
  let updates;
  try {
    updates = payload(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const item = await AdoptDisplay.findById(req.params.displayId);
    if (!item) return res.status(404).json({ error: 'Display not found' });
    item.set({ ...updates, updatedBy: req.user._id });
    if (!validTitle(item))
      return res.status(400).json({ error: 'A display title is required' });
    await item.save();
    await audit(req, 'updated', item);
    res.json({ display: serialize(item) });
  } catch {
    res.status(500).json({ error: 'Could not save display' });
  }
});
router.delete('/admin/adopt-displays/:displayId', async (req, res) => {
  try {
    const item = await AdoptDisplay.findById(req.params.displayId);
    if (!item) return res.status(404).json({ error: 'Display not found' });
    await item.deleteOne();
    await audit(req, 'deleted', item);
    res.json({ message: 'Display deleted' });
  } catch {
    res.status(500).json({ error: 'Could not delete display' });
  }
});
module.exports = router;
