const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const {
  formatRetirementSubmissionEmail,
  getRetirementSubmissionSubject,
} = require('../services/retirement-submission-email');

const ENV_KEYS = [
  'CDN_BASE_URL',
  'CDN_PUBLIC_BASE_URL',
  'MINIO_BUCKET_NAME',
  'MINIO_ENDPOINT',
  'MINIO_PUBLIC_ENDPOINT',
];
const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnvironment[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnvironment[key];
    }
  }
});

test('formats all retirement submission fields for the branch mailbox', () => {
  const submission = {
    retiree: {
      rank: 'Sergeant',
      firstName: 'Alex',
      lastName: 'Example',
      postNominals: 'CD',
      tradeRole: '00340 - CELE',
      retirementDate: new Date('2026-08-01T00:00:00.000Z'),
    },
    messageLanguage: 'en',
    message: 'Thank you for your service.',
    photoUrl: 'https://cdn.example.test/retirements/alex.jpg',
    submitter: {
      firstName: 'Sam',
      lastName: 'Submitter',
      relationship: 'colleague',
      email: 'sam@example.test',
      unit: '42 Signal Regiment',
    },
    publicationConsent: { confirmed: true },
    memberReviewConfirmation: { confirmed: true },
  };

  const email = formatRetirementSubmissionEmail(submission);

  assert.equal(
    email.text,
    [
      'RANK: Sergeant',
      'FIRST_NAME: Alex',
      'LAST_NAME: Example',
      'POST_NOMINALS: CD',
      'TRADE_ROLE: 00340 - CELE',
      'RETIREMENT_DATE: 2026-08-01',
      'MESSAGE_LANGUAGE: en',
      'MESSAGE: Thank you for your service.',
      'PHOTO_URL: https://cdn.example.test/retirements/alex.jpg',
      'SUBMITTER_FIRST_NAME: Sam',
      'SUBMITTER_LAST_NAME: Submitter',
      'SUBMITTER_RELATIONSHIP: colleague',
      'SUBMITTER_EMAIL: sam@example.test',
      'SUBMITTER_UNIT: 42 Signal Regiment',
      'PUBLICATION_CONSENT_CONFIRMED: true',
      'MEMBER_REVIEW_CONFIRMED: true',
    ].join('\n'),
  );
  assert.match(email.html, /PHOTO_URL: https:\/\/cdn\.example\.test\/retirements\/alex\.jpg/);
  assert.equal(
    getRetirementSubmissionSubject(submission),
    'Retirement submission: Sergeant Alex Example',
  );
});

test('escapes user-provided HTML in the email body', () => {
  const email = formatRetirementSubmissionEmail({
    retiree: { rank: '<script>', firstName: 'Alex', lastName: 'Example' },
    message: '<strong>Thank you</strong>',
  });

  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;strong&gt;Thank you&lt;\/strong&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
});

test('uses the canonical CDN URL for an uploaded photo', () => {
  process.env.CDN_PUBLIC_BASE_URL = 'https://cdn.example.ca/media';
  process.env.MINIO_ENDPOINT = 'http://100.64.0.10:9000';
  process.env.MINIO_BUCKET_NAME = 'cmcen-demo';

  const email = formatRetirementSubmissionEmail({
    photoUrl:
      'http://100.64.0.10:9000/cmcen-demo/images/alex-example/large.webp',
  });

  assert.match(
    email.text,
    /PHOTO_URL: https:\/\/cdn\.example\.ca\/media\/images\/alex-example\/large\.webp/,
  );
});
