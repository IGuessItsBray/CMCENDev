const express = require('express');
const Timer = require('../models/Timer');
const { authMiddleware, optionalAuthMiddleware, requirePermission } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

function cleanString(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function cleanLocalizedText(value = {}) {
  return {
    en: cleanString(value.en).slice(0, 600),
    fr: cleanString(value.fr).slice(0, 600)
  };
}

function cleanColor(value, fallback) {
  const color = cleanString(value);
  return COLOR_PATTERN.test(color) ? color : fallback;
}

function cleanDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanPlacement(value) {
  return value === 'home' ? 'home' : 'global';
}

function cleanScreenPosition(value) {
  return value === 'below-header' ? 'below-header' : 'header';
}

function timerPayload(body = {}) {
  return {
    title: cleanString(body.title, 'Untitled banner').slice(0, 120) || 'Untitled banner',
    text: cleanLocalizedText(body.text || {}),
    color: cleanColor(body.color, '#1d4ed8'),
    textColor: cleanColor(body.textColor, '#ffffff'),
    startsAt: cleanDate(body.startsAt),
    endsAt: cleanDate(body.endsAt),
    countdownAt: cleanDate(body.countdownAt),
    placement: cleanPlacement(body.placement),
    screenPosition: cleanScreenPosition(body.screenPosition),
    enabled: body.enabled !== false,
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : 0
  };
}

function toTimerResponse(timer) {
  return {
    _id: String(timer._id),
    title: timer.title || 'Untitled banner',
    text: timer.text || { en: '', fr: '' },
    color: timer.color || '#1d4ed8',
    textColor: timer.textColor || '#ffffff',
    startsAt: timer.startsAt ? timer.startsAt.toISOString() : '',
    endsAt: timer.endsAt ? timer.endsAt.toISOString() : '',
    countdownAt: timer.countdownAt ? timer.countdownAt.toISOString() : '',
    placement: timer.placement || 'global',
    screenPosition: timer.screenPosition || 'header',
    enabled: timer.enabled !== false,
    order: timer.order || 0,
    createdAt: timer.createdAt ? timer.createdAt.toISOString() : '',
    updatedAt: timer.updatedAt ? timer.updatedAt.toISOString() : ''
  };
}

function activeTimerQuery(scope) {
  const now = new Date();
  const placements = scope === 'home'
    ? ['global', 'home']
    : ['global'];

  return {
    enabled: true,
    placement: { $in: placements },
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }
    ]
  };
}

async function writeTimerAuditLog(req, action, timer, metadata = {}) {
  try {
    await writeAuditLog({
      req,
      action,
      actor: req.user,
      targetType: 'timer',
      target: timer?._id || null,
      targetSnapshot: timer ? toTimerResponse(timer) : null,
      metadata
    });
  } catch (error) {
    console.error('Timer audit log failed:', error);
  }
}

router.get('/timers/active', optionalAuthMiddleware, async (req, res) => {
  try {
    const scope = req.query.scope === 'home' ? 'home' : 'global';
    const timers = await Timer.find(activeTimerQuery(scope))
      .sort({ order: 1, createdAt: -1 })
      .limit(4)
      .lean();

    res.json({ timers: timers.map(toTimerResponse) });
  } catch (error) {
    console.error('Active timers failed:', error);
    res.status(500).json({ error: 'Could not load banners' });
  }
});

router.get(
  '/admin/timers',
  authMiddleware,
  requirePermission('canManageTimers'),
  async (req, res) => {
  try {
    const timers = await Timer.find({})
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({ timers: timers.map(toTimerResponse) });
  } catch (error) {
    console.error('Admin timers failed:', error);
    res.status(500).json({ error: 'Could not load banners' });
  }
  }
);

router.post(
  '/admin/timers',
  authMiddleware,
  requirePermission('canManageTimers'),
  async (req, res) => {
  try {
    const timer = await Timer.create({
      ...timerPayload(req.body || {}),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null
    });

    await writeTimerAuditLog(req, 'timer.created', timer);

    res.status(201).json({ timer: toTimerResponse(timer) });
  } catch (error) {
    console.error('Timer create failed:', error);
    res.status(400).json({ error: 'Could not create banner' });
  }
  }
);

router.patch(
  '/admin/timers/:timerId',
  authMiddleware,
  requirePermission('canManageTimers'),
  async (req, res) => {
  try {
    const timer = await Timer.findById(req.params.timerId);

    if (!timer) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    Object.assign(timer, timerPayload(req.body || {}), {
      updatedBy: req.user?._id || null
    });
    await timer.save();

    await writeTimerAuditLog(req, 'timer.updated', timer);

    res.json({ timer: toTimerResponse(timer) });
  } catch (error) {
    console.error('Timer update failed:', error);
    res.status(400).json({ error: 'Could not update banner' });
  }
  }
);

router.delete(
  '/admin/timers/:timerId',
  authMiddleware,
  requirePermission('canManageTimers'),
  async (req, res) => {
  try {
    const timer = await Timer.findById(req.params.timerId);

    if (!timer) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    await timer.deleteOne();
    await writeTimerAuditLog(req, 'timer.deleted', timer);

    res.json({ message: 'Banner deleted' });
  } catch (error) {
    console.error('Timer delete failed:', error);
    res.status(500).json({ error: 'Could not delete banner' });
  }
  }
);

module.exports = router;
