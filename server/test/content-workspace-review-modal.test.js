const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const workspaceScript = fs.readFileSync(
  path.join(publicPath, 'content-workspace.js'),
  'utf8',
);
const workspaceStyles = fs.readFileSync(
  path.join(publicPath, 'styles.css'),
  'utf8',
);
const appUtilsScript = fs.readFileSync(
  path.join(publicPath, 'app-utils.js'),
  'utf8',
);
const translations = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'data', 'translations.json'),
    'utf8',
  ),
);
const reviewActions = workspaceScript.slice(
  workspaceScript.indexOf('function createContentWorkspaceReviewActions'),
  workspaceScript.indexOf('function createRemovalActions'),
);

test('offers immediate or scheduled publication through the shared modal', () => {
  assert.match(
    reviewActions,
    /await CMCENModal\.choose\([\s\S]*?content_workspace_publish_timing[\s\S]*?value: "now"[\s\S]*?content_workspace_publish_now[\s\S]*?value: "schedule"[\s\S]*?content_workspace_schedule_publish/u,
  );
  assert.match(
    reviewActions,
    /await CMCENModal\.form\([\s\S]*?content_workspace_schedule_publish_prompt[\s\S]*?name: "scheduledPublishAt",[\s\S]*?type: "cmcen-date-time",[\s\S]*?locale: getContentWorkspaceLocale\(\),[\s\S]*?required: true,/u,
  );
  assert.match(
    reviewActions,
    /scheduledPublishAt: scheduledDate\.toISOString\(\)/u,
  );
  assert.doesNotMatch(reviewActions, /content-workspace-review-decision/u);
  assert.doesNotMatch(reviewActions, /content-workspace-review-prompt/u);
});

test('uses the custom date and time picker in shared modal forms', () => {
  assert.match(
    appUtilsScript,
    /field\.type === "cmcen-date-time"[\s\S]*?window\.CMCENDateTimePicker\?\.create/u,
  );
  assert.match(
    appUtilsScript,
    /valueInput\.name = field\.name \|\| "";[\s\S]*?window\.CMCENDateTimePicker\.create\([\s\S]*?onInput: \(\{ date: selectedDate, time: selectedTime \}\)[\s\S]*?valueInput\.value = selectedDate/u,
  );
});

test('sends a schedule only for supported scheduled publish decisions', () => {
  assert.match(
    reviewActions,
    /scheduledPublishAt: isScheduledPublication\s*\?\s*scheduledPublishAt\s*:\s*undefined,/u,
  );
  assert.match(
    workspaceScript,
    /const contentWorkspaceScheduledPublicationTypes = new Set\(\[\s*"event",\s*"retirementMessage",\s*"lastPost",\s*\]\);/u,
  );
  assert.match(
    workspaceScript,
    /function createScheduledPublicationStatus\(item\)[\s\S]*?contentWorkspaceScheduledPublicationTypes\.has\(item\.type\)[\s\S]*?item\.scheduledPublishAt[\s\S]*?content_workspace_scheduled_publication_at/u,
  );

  for (const language of ['en', 'fr']) {
    assert.equal(
      typeof translations[language].content_workspace_schedule_publish,
      'string',
    );
    assert.equal(
      typeof translations[language].content_workspace_scheduled_publication_at,
      'string',
    );
  }
});

test('offers a confirmed cancellation for scheduled publication', () => {
  assert.match(
    reviewActions,
    /content_workspace_cancel_scheduled_publish[\s\S]*?confirmDecision\("cancel-schedule"\)/u,
  );
  assert.match(
    reviewActions,
    /action === "cancel-schedule"[\s\S]*?content_workspace_cancel_scheduled_publish_confirmation/u,
  );

  for (const language of ['en', 'fr']) {
    assert.equal(
      typeof translations[language].content_workspace_cancel_scheduled_publish,
      'string',
    );
    assert.equal(
      typeof translations[language]
        .content_workspace_cancel_scheduled_publish_success,
      'string',
    );
  }
});

test('saves unsaved content before publishing or scheduling', () => {
  assert.match(
    reviewActions,
    /async function saveUnsavedChangesBeforePublication\(\)[\s\S]*?hasUnsavedContentWorkspaceChanges\(\)[\s\S]*?content_workspace_save_before_publish_message[\s\S]*?content_workspace_save_and_continue[\s\S]*?saveContentWorkspaceChanges\(item, saveButton\)/u,
  );
  assert.match(
    reviewActions,
    /if\s*\(\s*\(action === "publish" \|\| action === "cancel-schedule"\)\s*&&\s*!\(await saveUnsavedChangesBeforePublication\(\)\)\s*\)\s*\{[\s\S]*?return;/u,
  );

  for (const language of ['en', 'fr']) {
    assert.equal(
      typeof translations[language]
        .content_workspace_save_before_publish_message,
      'string',
    );
    assert.equal(
      typeof translations[language].content_workspace_save_and_continue,
      'string',
    );
  }
});

test('collects a required rejection reason through the shared destructive modal', () => {
  assert.match(
    reviewActions,
    /await CMCENModal\.form\([\s\S]*?content_workspace_reject_confirmation[\s\S]*?title: getText\([\s\S]*?content_workspace_confirm_reject[\s\S]*?destructive: true,[\s\S]*?tone: "danger",[\s\S]*?name: "rejectionReason",[\s\S]*?type: "textarea",[\s\S]*?required: true,[\s\S]*?requiresNonWhitespace: true,[\s\S]*?maxLength: 2000,/u,
  );
  assert.match(
    reviewActions,
    /rejectionReason:\s*action === "reject" \? rejectionReason\.trim\(\) : undefined,/u,
  );
  assert.doesNotMatch(workspaceStyles, /content-workspace-rejection-field/u);
  assert.doesNotMatch(workspaceStyles, /content-workspace-review-message/u);
});

test('keeps whitespace-only required modal fields invalid', () => {
  assert.match(
    appUtilsScript,
    /field\.requiresNonWhitespace\s*===\s*true\s*&&\s*field\.required\s*===\s*true[\s\S]*?control\.setCustomValidity\([\s\S]*?!control\.value\.trim\(\)/u,
  );
});

test('applies the requested success and danger modal accents', () => {
  assert.match(
    appUtilsScript,
    /"cmcen-modal--success"[\s\S]*?options\.tone === "success"[\s\S]*?"cmcen-modal--danger"[\s\S]*?options\.tone === "danger"/u,
  );
  assert.match(
    workspaceStyles,
    /\.cmcen-modal--success[\s\S]*?--success-border/u,
  );
  assert.match(workspaceStyles, /\.cmcen-modal--danger[\s\S]*?--danger/u);
  assert.match(
    workspaceStyles,
    /:is\([\s\S]*?\.cmcen-modal-button-primary\.is-success[\s\S]*?--success-border/u,
  );
});
