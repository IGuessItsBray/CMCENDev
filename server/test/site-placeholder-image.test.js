const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const publicPath = path.join(__dirname, '..', 'public');
const appUtilsScript = fs.readFileSync(
  path.join(publicPath, 'app-utils.js'),
  'utf8',
);

function getPlaceholderImageClassifier() {
  const context = {
    URL,
    HTMLImageElement: class {},
    MutationObserver: class {
      observe() {}
    },
    document: {
      documentElement: {},
      querySelectorAll() {
        return [];
      },
    },
    fetch: async () => ({ ok: false }),
    localStorage: {
      getItem() {
        return '';
      },
      setItem() {},
      removeItem() {},
    },
    navigator: { language: 'en-CA' },
    window: {
      addEventListener() {},
      location: {
        origin: 'https://cmcen.example',
        pathname: '/',
        search: '',
      },
    },
  };

  vm.runInNewContext(appUtilsScript, context);
  return context.window.CMCENUtils.isSitePlaceholderImage;
}

test('classifies shared site placeholder image URLs', () => {
  const isSitePlaceholderImage = getPlaceholderImageClassifier();

  assert.equal(isSitePlaceholderImage(''), false);
  assert.equal(isSitePlaceholderImage('/uploads/retiree-photo.webp'), false);
  assert.equal(isSitePlaceholderImage('/images/logo.png?version=2'), true);
  assert.equal(isSitePlaceholderImage('/images/cmcen-crest.webp'), true);
  assert.equal(isSitePlaceholderImage('/images/branch-crest/sigs.png'), true);
  assert.equal(
    isSitePlaceholderImage('https://[invalid/legacy/wordpress/348036/logo.png'),
    true,
  );
});

test('public content pages share the site placeholder image classifier', () => {
  for (const filename of [
    'home.js',
    'retirements.js',
    'retirement-message.js',
    'last-post-message.js',
  ]) {
    const source = fs.readFileSync(path.join(publicPath, filename), 'utf8');

    assert.match(source, /CMCENUtils\.isSitePlaceholderImage\(/u);
    assert.doesNotMatch(source, /function is\w*Placeholder(?:Photo|Image)\(/u);
  }
});
