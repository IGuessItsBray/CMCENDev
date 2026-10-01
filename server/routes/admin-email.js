const express = require('express');
const EmailDeliveryAttempt = require('../models/EmailDeliveryAttempt');
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rate-limit');
const { writeAuditLog } = require('../services/audit-log');
const {
  CATEGORIES,
  getEmailControls,
  setEmailControl,
} = require('../services/email-controls');
const { isEmailSendingDisabled, sendMail } = require('../services/mailer');
const { getCaslSenderInfo } = require('../services/weekly-brief');

const router = express.Router();
router.use(authMiddleware, requirePermission('canManageEmail'));

function readiness() {
  return {
    transport: Boolean(
      process.env.SMTP_HOST &&
      Number(process.env.SMTP_PORT) &&
      process.env.MAIL_FROM,
    ),
    subscriptions: Boolean(
      getCaslSenderInfo().ready && process.env.APP_BASE_URL,
    ),
  };
}

function effectiveStatus(controls, ready) {
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      !isEmailSendingDisabled() &&
        ready.transport &&
        (category === 'weekly' || category === 'news'
          ? ready.subscriptions
          : true) &&
        controls[category] === true,
    ]),
  );
}

router.get('/', async (req, res) => {
  try {
    const [controls, attempts] = await Promise.all([
      getEmailControls(),
      EmailDeliveryAttempt.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    res.set('Cache-Control', 'no-store');
    const ready = readiness();
    res.json({
      controls,
      effective: effectiveStatus(controls, ready),
      globalDisabled: isEmailSendingDisabled(),
      readiness: ready,
      attempts,
    });
  } catch (error) {
    console.error('Email status lookup failed:', error?.name || 'unknown');
    res.status(503).json({ error: 'Email status unavailable' });
  }
});

router.patch('/controls', async (req, res) => {
  const { category, enabled } = req.body || {};
  if (
    !CATEGORIES.includes(category) ||
    typeof enabled !== 'boolean' ||
    Object.keys(req.body).some((key) => !['category', 'enabled'].includes(key))
  ) {
    return res
      .status(400)
      .json({ error: 'Choose one email category and a boolean state' });
  }
  try {
    const controls = await setEmailControl(category, enabled);
    await writeAuditLog({
      req,
      action: 'email.control_changed',
      actor: req.user,
      targetType: 'emailControl',
      targetSnapshot: { category },
      metadata: { enabled },
    });
    const ready = readiness();
    res.json({
      controls,
      effective: effectiveStatus(controls, ready),
      globalDisabled: isEmailSendingDisabled(),
      readiness: ready,
    });
  } catch (error) {
    console.error('Email control update failed:', error?.name || 'unknown');
    res.status(503).json({ error: 'Email control could not be updated' });
  }
});

const testLimit = createRateLimit({
  name: 'admin-email-test',
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => String(req.user?._id || req.ip),
});

router.post('/test', testLimit, async (req, res) => {
  const recipient = String(req.body?.recipient || '')
    .trim()
    .toLowerCase();
  const allowed = String(process.env.EMAIL_TEST_RECIPIENTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    Object.keys(req.body || {}).some((key) => key !== 'recipient') ||
    !allowed.includes(recipient) ||
    !/^\S+@\S+\.\S+$/u.test(recipient)
  ) {
    return res
      .status(400)
      .json({ error: 'Recipient is not in the configured test allowlist' });
  }
  if (isEmailSendingDisabled())
    return res.status(503).json({ error: 'Global email sending is disabled' });
  if (!readiness().transport)
    return res.status(503).json({ error: 'SMTP transport is not configured' });
  await writeAuditLog({
    req,
    action: 'email.test_requested',
    actor: req.user,
    targetType: 'emailTest',
  });
  try {
    const result = await sendMail({
      category: 'test',
      workflow: 'admin_test',
      to: recipient,
      subject: 'CMCEN email delivery test',
      text: 'This is a CMCEN email delivery test. No action is needed.',
    });
    res.json({ status: 'accepted', correlationId: result.correlationId });
  } catch (error) {
    res.status(502).json({ error: 'SMTP did not accept the test message' });
  }
});

module.exports = router;
