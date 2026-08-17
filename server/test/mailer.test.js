const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getSmtpClientName,
  getSmtpSecurityOptions,
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
