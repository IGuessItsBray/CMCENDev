const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '../public/index.js'),
  'utf8',
);
const updateSource = source.slice(
  source.indexOf('async function updateFooterVersion()'),
  source.indexOf('\nloadHeader();'),
);

async function renderVersion(hostname, data, failure) {
  const label = { textContent: '', hidden: true };
  const separator = { hidden: true };
  const context = {
    document: {
      getElementById: (id) => (id === 'footerVersion' ? label : separator),
    },
    window: { location: { hostname } },
    fetch: async (url, options) => {
      assert.equal(url, '/api/version');
      assert.equal(options.cache, 'no-store');
      if (failure === 'network') throw new Error('Offline');
      return { ok: failure !== 'http', json: async () => data };
    },
  };
  await vm.runInNewContext(`${updateSource}\nupdateFooterVersion();`, context);
  return { label, separator };
}

test('production hosts select the release rather than the commit', async () => {
  for (const host of [
    'cmcen-rcmce.ca',
    'cefamily.ca',
    'www.cmcen-rcmce.ca',
    'www.cefamily.ca',
  ]) {
    const { label, separator } = await renderVersion(host, {
      releaseVersion: 'v0.3.0',
      shortCommit: 'abcdef1',
    });
    assert.equal(label.textContent, 'CMCEN v0.3.0');
    assert.equal(label.hidden, false);
    assert.equal(separator.hidden, false);
  }
});

test('all other hosts select the commit even when running a release image', async () => {
  for (const host of [
    'cmcen-staging.corebot.ca',
    'staging.cefamily.ca',
    'beta.cmcen-rcmce.ca',
    'localhost',
    'other.example',
  ]) {
    const { label } = await renderVersion(host, {
      releaseVersion: 'v0.3.0',
      commit: 'abcdef1234567890',
    });
    assert.equal(label.textContent, 'CMCEN Dev abcdef1');
  }
});

test('missing metadata and failed requests keep an explicit fallback visible', async () => {
  for (const failure of [undefined, 'network', 'http']) {
    assert.equal(
      (await renderVersion('cefamily.ca', {}, failure)).label.textContent,
      'CMCEN version unavailable',
    );
    assert.equal(
      (await renderVersion('staging.cefamily.ca', {}, failure)).label
        .textContent,
      'CMCEN Dev unknown',
    );
  }
});
