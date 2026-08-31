const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const workspaceHtml = fs.readFileSync(
  path.join(publicPath, 'content-workspace.html'),
  'utf8',
);
const workspaceScript = fs.readFileSync(
  path.join(publicPath, 'content-workspace.js'),
  'utf8',
);
const translations = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'data', 'translations.json'),
    'utf8',
  ),
);

test('provides a paged Load more control for the content workspace list', () => {
  assert.match(workspaceHtml, /id="contentWorkspaceLoadMore"/u);
  assert.match(workspaceHtml, /id="contentWorkspaceLoadMoreButton"/u);
  assert.match(workspaceScript, /const CONTENT_WORKSPACE_PAGE_SIZE = 24;/u);
  assert.match(
    workspaceScript,
    /query\.set\("cursor", contentWorkspaceState\.nextCursor\);/u,
  );
  assert.match(
    workspaceScript,
    /contentWorkspaceLoadMoreButton\.addEventListener\("click", \(\) => \{\s+void loadContentWorkspace\(\{ append: true \}\);/su,
  );
});

test('loads revision history only after staff request it', () => {
  assert.match(
    workspaceScript,
    /loadHistory\.addEventListener\("click", async \(\) => \{[\s\S]*?await loadRevisionHistory\(item, revisions\);/u,
  );
  assert.doesNotMatch(
    workspaceScript,
    /contentWorkspaceDetail\.append\(history\);\s+loadRevisionHistory\(item, revisions\);/u,
  );
});

test('localizes content workspace loading controls in English and French', () => {
  for (const language of ['en', 'fr']) {
    assert.equal(
      typeof translations[language].content_workspace_load_more,
      'string',
    );
    assert.equal(
      typeof translations[language].content_workspace_loading_more,
      'string',
    );
    assert.equal(
      typeof translations[language].content_workspace_load_history,
      'string',
    );
    assert.equal(
      typeof translations[language].content_workspace_retry_history,
      'string',
    );
  }
});
