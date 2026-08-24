const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getCaslSenderInfo,
  isFridayNoonEastern,
  renderWeeklyBriefEmail,
} = require('../services/weekly-brief');

test('requires all CASL sender details before weekly brief delivery is ready', () => {
  assert.equal(getCaslSenderInfo({ CASL_SENDER_NAME: 'CMCEN' }).ready, false);
  assert.deepEqual(
    getCaslSenderInfo({
      CASL_SENDER_NAME: 'CMCEN',
      CASL_SENDER_MAILING_ADDRESS: '100 Example Street, Ottawa, ON',
      CASL_SENDER_CONTACT: 'https://example.test/contact',
    }),
    {
      name: 'CMCEN',
      mailingAddress: '100 Example Street, Ottawa, ON',
      contact: 'https://example.test/contact',
      ready: true,
    },
  );
});

test('recognizes Friday noon in Eastern Time across daylight-saving time', () => {
  assert.equal(isFridayNoonEastern(new Date('2026-08-14T16:00:00.000Z')), true);
  assert.equal(isFridayNoonEastern(new Date('2026-01-16T17:00:00.000Z')), true);
  assert.equal(
    isFridayNoonEastern(new Date('2026-08-14T15:59:00.000Z')),
    false,
  );
});

test('renders sender identification and a unique unsubscribe link in every brief', () => {
  const rendered = renderWeeklyBriefEmail({
    content: { lastPosts: [], retirements: [], news: [] },
    baseUrl: 'https://cmcen.example.test',
    unsubscribeUrl: 'https://cmcen.example.test/unsubscribe/opaque-token',
    sender: {
      name: 'CMCEN / RCMCE',
      mailingAddress: '100 Example Street, Ottawa, ON',
      contact: 'https://cmcen.example.test/contact',
    },
  });

  assert.match(rendered.html, /CMCEN \/ RCMCE/u);
  assert.match(rendered.html, /100 Example Street/u);
  assert.match(rendered.html, /unsubscribe\/opaque-token/u);
  assert.match(rendered.text, /Unsubscribe from this weekly brief/u);
});
