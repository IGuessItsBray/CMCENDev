const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { buildPublicMediaUrl } = require('../services/media-library');
const { Element } = require('./helpers/dashboard-dom');

function extract(file, start, end, globals) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return vm.runInNewContext(
    `${source.slice(source.indexOf(`function ${start}(`), source.indexOf(`function ${end}(`))}\n${start}`,
    globals,
  );
}

test('media response exposes the stored original separately from the preview and identity', () => {
  const serialize = extract(
    '../routes/admin.js',
    'toAdminMediaAssetItem',
    'sortAdminMediaItems',
    {
      buildPublicMediaUrl,
      getMediaAssetAttachmentKeys: () => [],
      addAttachmentAliases: () => {},
    },
  );
  const asset = {
    key: 'images/thumb.webp',
    url: 'https://media.test/thumb.webp',
    originalKey: 'images/full.jpg',
    originalUrl: 'https://media.test/full.jpg',
  };
  const response = serialize(asset, new Map());
  assert.equal(response.key, asset.key);
  assert.equal(response.url, asset.url);
  assert.equal(response.originalKey, asset.originalKey);
  assert.equal(response.originalUrl, asset.originalUrl);
  const keyOnly = serialize({ ...asset, originalUrl: '' }, new Map());
  assert.equal(keyOnly.originalUrl, buildPublicMediaUrl(asset.originalKey));
  const legacy = serialize({ key: asset.key }, new Map());
  assert.equal(legacy.originalKey, asset.key);
  assert.equal(legacy.originalUrl, legacy.url);
  const explicitLegacy = serialize(
    { key: asset.key, url: 'https://legacy-media.test/existing.webp' },
    new Map(),
  );
  assert.equal(explicitLegacy.originalUrl, explicitLegacy.url);
});

test('legacy media dashboard opens the original but loads the thumbnail as its preview', () => {
  const createCard = extract(
    '../public/admin-users-view.js',
    'createMediaCard',
    'createMediaBulkToolbar',
    {
      document: {
        createElement(tag) {
          const el = new Element(tag);
          el.classList = { toggle() {} };
          return el;
        },
      },
      getState: () => ({}),
      actions: {},
      translate: (key) => key,
      formatFileSize: () => '',
      formatDate: () => '',
    },
  );
  for (const originalUrl of ['https://media.test/full.jpg', undefined]) {
    const item = {
      key: 'thumb.webp',
      url: 'https://media.test/thumb.webp',
      originalUrl,
    };
    const card = createCard(item);
    assert.equal(card.querySelector('img').src, item.url);
    for (const link of card.querySelectorAll('a'))
      assert.equal(link.href, originalUrl || item.url);
  }
});
