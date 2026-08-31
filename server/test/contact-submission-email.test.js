const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  formatContactSubmissionEmail,
  getReplyToEmail,
} = require('../services/contact-submission-email');

describe('contact submission email', () => {
  test('formats the message with account-derived contact details', () => {
    const formatted = formatContactSubmissionEmail({
      user: {
        accountName: 'Alex Example',
        email: 'alex@example.test',
        phone: '613-555-0100',
        rank: 'Captain',
        currentUnit: '1 C&E Regiment',
        company: 'CMCEN',
        address: {
          line1: '1 Test Way',
          city: 'Ottawa',
          stateProvince: 'Ontario',
          postalCode: 'K1A 0A1',
          country: 'Canada',
        },
      },
      subject: 'Account help',
      message: 'Please help with my account.\nThank you.',
    });

    assert.match(formatted.text, /NAME: Alex Example/);
    assert.match(formatted.text, /EMAIL: alex@example\.test/);
    assert.match(formatted.text, /PHONE: 613-555-0100/);
    assert.match(formatted.text, /UNIT: 1 C&E Regiment/);
    assert.match(formatted.text, /SUBJECT: Account help/);
    assert.match(
      formatted.text,
      /MESSAGE: Please help with my account\.\nThank you\./,
    );
    assert.match(formatted.html, /1 C&amp;E Regiment/);
  });

  test('only uses a valid member email as the reply-to address', () => {
    assert.equal(getReplyToEmail('member@example.test'), 'member@example.test');
    assert.equal(
      getReplyToEmail('member@example.test\r\nBcc: x@example.test'),
      undefined,
    );
  });
});
