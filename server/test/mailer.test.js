const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getSmtpClientName,
  getSmtpSecurityOptions,
  isEmailSendingDisabled,
  sendMail,
} = require('../services/mailer');

test('uses the configured SMTP HELO name when present', () => {
  assert.equal(
    getSmtpClientName({
      SMTP_HELO_NAME: 'mailer.cmcen.example.ca',
      MAIL_FROM: 'noreply@cmcen.example.ca',
    }),
    'mailer.cmcen.example.ca',
  );
});

test('uses the sender domain as the SMTP HELO fallback', () => {
  assert.equal(
    getSmtpClientName({ MAIL_FROM: 'noreply@cmcen.example.ca' }),
    'cmcen.example.ca',
  );
  assert.equal(
    getSmtpClientName({ MAIL_FROM: 'CMCEN / RCMCE <noreply@cmcen.example.ca>' }),
    'cmcen.example.ca',
  );
  assert.equal(getSmtpClientName({ MAIL_FROM: 'invalid' }), undefined);
});

test('uses explicit SMTP security modes', () => {
  assert.deepEqual(
    getSmtpSecurityOptions({ SMTP_PORT: '587', SMTP_SECURE: 'starttls' }),
    { secure: false, requireTLS: true },
  );
  assert.deepEqual(
    getSmtpSecurityOptions({ SMTP_PORT: '465', SMTP_SECURE: 'tls' }),
    { secure: true, requireTLS: false },
  );
});

test('disables all email delivery only when explicitly configured', () => {
  assert.equal(isEmailSendingDisabled({ DISABLE_EMAIL_SENDING: 'true' }), true);
  assert.equal(isEmailSendingDisabled({ DISABLE_EMAIL_SENDING: ' TRUE ' }), true);
  assert.equal(isEmailSendingDisabled({ DISABLE_EMAIL_SENDING: 'false' }), false);
  assert.equal(isEmailSendingDisabled({}), false);
});

test('skips the shared mailer when global email delivery is disabled', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDisableEmailSending = process.env.DISABLE_EMAIL_SENDING;

  process.env.NODE_ENV = 'development';
  process.env.DISABLE_EMAIL_SENDING = 'true';

  try {
    const result = await sendMail({
      to: 'member@example.test',
      subject: 'Notification test',
      text: 'This must not be delivered.',
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'DISABLE_EMAIL_SENDING is true');
    assert.deepEqual(result.accepted, []);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalDisableEmailSending === undefined) {
      delete process.env.DISABLE_EMAIL_SENDING;
    } else {
      process.env.DISABLE_EMAIL_SENDING = originalDisableEmailSending;
    }
  }
});
