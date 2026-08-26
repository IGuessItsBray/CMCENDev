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
const reviewActions = workspaceScript.slice(
  workspaceScript.indexOf('function createContentWorkspaceReviewActions'),
  workspaceScript.indexOf('function createRemovalActions'),
);

test('confirms publishing through the shared modal without changing the action row', () => {
  assert.match(
    reviewActions,
    /await CMCENModal\.confirm\([\s\S]*?content_workspace_publish_confirmation[\s\S]*?title: getText\([\s\S]*?content_workspace_confirm_publish[\s\S]*?tone: "success"/u,
  );
  assert.doesNotMatch(reviewActions, /content-workspace-review-decision/u);
  assert.doesNotMatch(reviewActions, /content-workspace-review-prompt/u);
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
    /field\.requiresNonWhitespace === true && field\.required === true[\s\S]*?control\.setCustomValidity\([\s\S]*?!control\.value\.trim\(\)/u,
  );
});

test('applies the requested success and danger modal accents', () => {
  assert.match(
    appUtilsScript,
    /"cmcen-modal--success"[\s\S]*?options\.tone === "success"[\s\S]*?"cmcen-modal--danger"[\s\S]*?options\.tone === "danger"/u,
  );
  assert.match(workspaceStyles, /\.cmcen-modal--success[\s\S]*?--success-border/u);
  assert.match(workspaceStyles, /\.cmcen-modal--danger[\s\S]*?--danger/u);
  assert.match(
    workspaceStyles,
    /:is\([\s\S]*?\.cmcen-modal-button-primary\.is-success[\s\S]*?--success-border/u,
  );
});
