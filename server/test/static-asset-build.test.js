const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildStaticAssets } = require('../scripts/quality/build-static-assets');

function createPublicDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cmcen-static-assets-'),
  );
  const publicDirectory = path.join(directory, 'public');

  fs.mkdirSync(publicDirectory);
  fs.writeFileSync(publicDirectory + '/styles.css', 'body { color: navy; }');
  fs.writeFileSync(publicDirectory + '/app.js', 'window.CMCEN = true;');
  fs.writeFileSync(
    publicDirectory + '/index.html',
    `<!doctype html>
<link rel="stylesheet" href="/styles.css?v=retirement-photo-raw-v1" />
<script src="app.js"></script>
<script src="/translations.js"></script>
<script src="https://example.invalid/external.js"></script>`,
  );

  return { directory, publicDirectory };
}

test('fingerprints physical CSS and JavaScript references in HTML', () => {
  const { directory, publicDirectory } = createPublicDirectory();

  try {
    const { assetMap, htmlFileCount } = buildStaticAssets({
      publicDirectory,
      rewriteHtml: true,
    });
    const stylesPath = assetMap.get('styles.css');
    const appPath = assetMap.get('app.js');
    const html = fs.readFileSync(publicDirectory + '/index.html', 'utf8');

    assert.equal(htmlFileCount, 1);
    assert.match(
      html,
      new RegExp(`/` + stylesPath.replace('.', '\\.') + '\\?'),
    );
    assert.match(html, new RegExp(`src="${appPath.replace('.', '\\.')}`));
    assert.match(html, /src="\/translations\.js"/u);
    assert.match(html, /src="https:\/\/example\.invalid\/external\.js"/u);
    assert.equal(
      fs.readFileSync(publicDirectory + '/' + stylesPath, 'utf8'),
      'body { color: navy; }',
    );

    buildStaticAssets({ publicDirectory, rewriteHtml: true });

    assert.equal(
      fs.readFileSync(publicDirectory + '/index.html', 'utf8'),
      html,
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});
