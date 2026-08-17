const assert = require('node:assert/strict');
const { test } = require('node:test');

const { getSmtpClientName } = require('../services/mailer');

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
  assert.equal(getSmtpClientName({ MAIL_FROM: 'invalid' }), undefined);
});
