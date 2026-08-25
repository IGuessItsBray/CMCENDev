const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function formOpeningTag(documentName, formId) {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', documentName),
    'utf8',
  );
  const match = html.match(new RegExp(`<form\\b[^>]*\\bid="${formId}"[^>]*>`, 'u'));

  assert.ok(match, `expected ${documentName} to contain #${formId}`);
  return match[0];
}

test('authentication forms explicitly use POST as their no-JavaScript fallback', () => {
  const forms = [
    ['login.html', 'loginForm'],
    ['login.html', 'forgotPasswordForm'],
    ['login.html', 'resetPasswordForm'],
    ['login.html', 'emailVerificationForm'],
    ['login.html', 'guestAccessForm'],
    ['login.html', 'mfaTotpForm'],
    ['register.html', 'registerForm'],
  ];

  for (const [documentName, formId] of forms) {
    assert.match(formOpeningTag(documentName, formId), /\bmethod="post"/u);
  }
});
