const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const submitEventHtml = fs.readFileSync(
  path.join(publicPath, 'submit-event.html'),
  'utf8',
);
const submitEventScript = fs.readFileSync(
  path.join(publicPath, 'submit-event.js'),
  'utf8',
);

test('provides linked, visible validation for an event title in either language', () => {
  assert.match(
    submitEventHtml,
    /id="eventTitleError"[\s\S]*role="alert"[\s\S]*hidden/u,
  );
  assert.match(
    submitEventHtml,
    /id="eventTitleEn"[\s\S]*aria-describedby="eventTitleRequirement eventTitleError"/u,
  );
  assert.match(
    submitEventHtml,
    /id="eventTitleFr"[\s\S]*aria-describedby="eventTitleRequirement eventTitleError"/u,
  );
  assert.match(submitEventScript, /function syncEventTitleValidation/u);
  assert.match(submitEventScript, /field\.setCustomValidity\(message\)/u);
  assert.match(
    submitEventScript,
    /syncEventTitleValidation\(\{ showError: true \}\)/u,
  );
});
