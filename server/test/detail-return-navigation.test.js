const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function setup(search = '') {
  const location = {
    origin: 'https://cmcen.example',
    pathname: '/retirements',
    search,
    hash: '',
  };
  const targets = new Map();
  const context = {
    URL,
    URLSearchParams,
    location,
    HTMLImageElement: class {},
    MutationObserver: class {
      observe() {}
    },
    document: {
      addEventListener() {},
      documentElement: {},
      querySelectorAll: () => [],
      getElementById: (id) => targets.get(id),
    },
    fetch: async () => ({ ok: false }),
    window: { location, addEventListener() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/app-utils.js'), 'utf8'),
    context,
  );
  return { utils: context.window.CMCENUtils, location, targets };
}

test('detail links carry current filters and an encoded return anchor', () => {
  const { utils } = setup('?q=A%26B&year=2030');
  const url = new URL(
    utils.detailHref('/retirement-message', 'record&id', 'retirement-record'),
    'https://cmcen.example',
  );
  assert.equal(url.searchParams.get('id'), 'record&id');
  assert.equal(
    url.searchParams.get('returnTo'),
    '/retirements?q=A%26B&year=2030#retirement-record',
  );
});

test('return links accept only the matching same-origin list', () => {
  for (const value of [
    '',
    'https://evil.test/calendar',
    '//evil.test/calendar',
    '/retirements',
    'javascript:alert(1)',
    'https://[invalid',
    'https://user:pass@cmcen.example/calendar',
  ]) {
    const { utils } = setup('?returnTo=' + encodeURIComponent(value));
    const link = {};
    utils.setDetailReturnLink(link, '/calendar');
    assert.equal(link.href, '/calendar', value);
  }
  const value = '/calendar?month=2030-06&view=agenda#calendar-event-a';
  const { utils } = setup('?returnTo=' + encodeURIComponent(value));
  const link = {};
  utils.setDetailReturnLink(link, '/calendar');
  assert.equal(link.href, value);
  utils.setDetailReturnLink(null, '/calendar');
});

test('anchor restoration only scrolls to a matching loaded item', () => {
  const { utils, location, targets } = setup();
  let scrolls = 0;
  targets.set('retirement-a', {
    scrollIntoView() {
      scrolls++;
    },
  });
  for (const hash of ['', '#unrelated', '#retirement-missing', '#%invalid']) {
    location.hash = hash;
    utils.restoreListAnchor('retirement-');
  }
  assert.equal(scrolls, 0);
  location.hash = '#retirement-a';
  utils.restoreListAnchor('retirement-');
  assert.equal(scrolls, 1);
});
