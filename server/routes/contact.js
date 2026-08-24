const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rate-limit');
const { writeAuditLog } = require('../services/audit-log');
const {
  sendContactSubmissionEmail,
} = require('../services/contact-submission-email');

const router = express.Router();
const contactSubmissionLimit = createRateLimit({
  name: 'contact-submission',
  windowMs: 15 * 60 * 1000,
  max: 5,
});

function cleanSingleLineString(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function cleanMessage(value) {
  return String(value ?? '').replace(/\r\n?/gu, '\n').trim();
}

router.post('/', authMiddleware, contactSubmissionLimit, async (req, res) => {
  const subject = cleanSingleLineString(req.body?.subject);
  const message = cleanMessage(req.body?.message);

  if (!subject || !message) {
    return res.status(400).json({ error: 'A subject and message are required' });
  }

  if (subject.length > 160 || message.length > 10000) {
    return res.status(400).json({
      error: 'The subject or message is too long',
    });
  }

  try {
    const notification = await sendContactSubmissionEmail({
      user: req.user,
      subject,
      message,
    });

    if (notification.skipped) {
      return res.status(503).json({
        error: 'The contact form is temporarily unavailable',
      });
    }

    await writeAuditLog({
      req,
      action: 'contact.submitted',
      actor: req.user,
      targetType: 'contactMessage',
      targetSnapshot: { subject },
      metadata: { messageLength: message.length },
    });

    return res.status(202).json({ message: 'Your message has been sent.' });
  } catch (error) {
    console.error('Could not send contact form submission:', error);
    return res.status(502).json({ error: 'Could not send your message' });
  }
});

module.exports = router;
