const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Element } = require('./helpers/dashboard-dom');
const flush = () => new Promise(setImmediate);

async function setup({
  rejectSave = false,
  resources = [{ key: 'leadership', label: 'Branch', kind: 'leadership' }],
  content = {
    en: { heading: 'Branch', sections: [{ heading: 'Council', cards: [{ name: 'Example', role: 'Advisor', imageKey: '' }] }] },
    fr: { heading: 'Branche', sections: [{ heading: 'Conseil', cards: [{ name: 'Exemple', role: 'Conseiller', imageKey: '' }] }] },
  },
  portraitUrls = {},
  media = [],
} = {}) {
  const host = new Element('div');
  const root = { querySelector: () => host };
  const requests = [];
  const document = {
    documentElement: { lang: 'en' },
    createElement(tag) {
      const element = new Element(tag);
      element.classList = { toggle() {} };
      return element;
    },
  };
  const window = { confirm: () => false };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/organization-content-editor.js'),
      'utf8',
    ),
    { document, window, AbortController, URLSearchParams },
  );
  const api = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.startsWith('/api/organization-content/media?'))
      return { media, nextCursor: '' };
    if (options.method === 'PUT') {
      if (rejectSave)
        throw new Error(
          'Someone else changed this content. Reload before saving.',
        );
      return { version: options.body.version + 1, content: structuredClone(options.body.content) };
    }
    if (url.endsWith('/manage')) return { resources };
    return { content: structuredClone(content), portraitUrls, version: 1 };
  };
  const instance = window.OrganizationContentEditor.mountLeadership({
    api,
    root,
    permissions: {},
  });
  await flush();
  return { host, requests, instance };
}

test('saving preserves both languages and sends the loaded version', async () => {
  const { host, requests, instance } = await setup();
  const input = host.querySelector('input');
  input.value = 'Updated branch';
  await input.fire('input');
  assert.equal(instance.hasUnsavedChanges(), true);
  await host.querySelector('.organization-save').fire('click');
  const request = requests.find((r) => r.options.method === 'PUT');
  assert.equal(request.options.body.version, 1);
  assert.equal(request.options.body.content.en.sections[0].cards[0].name, 'Updated branch');
  assert.equal(request.options.body.content.fr.heading, 'Branche');
  assert.equal(request.options.body.content.fr.sections[0].cards[0].name, 'Exemple');
  assert.equal(instance.hasUnsavedChanges(), false);
  instance.dispose();
});

test('a rejected save preserves unsaved edits and blocks discarded navigation', async () => {
  const { host, instance } = await setup({ rejectSave: true });
  const input = host.querySelector('input');
  input.value = 'Keep this edit';
  await input.fire('input');
  await host.querySelector('.organization-save').fire('click');
  assert.equal(input.value, 'Keep this edit');
  assert.equal(instance.hasUnsavedChanges(), true);
  assert.equal(instance.canNavigate(), false);
  assert.match(
    host.querySelector('.organization-status').textContent,
    /Reload/,
  );
  instance.dispose();
});

test('no assigned areas does not fetch arbitrary content or enable saving', async () => {
  const { host, requests, instance } = await setup({ resources: [] });
  assert.equal(requests.length, 1);
  assert.equal(host.querySelector('.organization-save').disabled, true);
  assert.equal(instance.hasUnsavedChanges(), false);
  instance.dispose();
});

test('leadership portraits render supplied public URLs without making immutable image fields editable', async () => {
  const localized = {
    heading: 'Leadership',
    sections: [
      {
        heading: 'Council',
        cards: [
          {
            name: 'Example',
            role: 'Advisor',
            imageKey: 'images/example.jpg',
            image: '/assets/fallback.png',
            imageAlt: 'Example portrait',
            bio: '',
          },
        ],
      },
    ],
  };
  const { host, instance } = await setup({
    resources: [{ key: 'leadership', label: 'Leadership', kind: 'leadership' }],
    content: { en: localized, fr: structuredClone(localized) },
    portraitUrls: {
      'images/example.jpg': 'https://cdn.example.org/images/example.jpg',
    },
  });
  const images = host.querySelectorAll('img');
  assert.equal(images.length, 2);
  assert.equal(images[0].src, 'https://cdn.example.org/images/example.jpg');
  assert.equal(images[0].alt, 'Example portrait');
  assert.equal(
    host
      .querySelectorAll('input')
      .some((input) => input.value === '/assets/fallback.png'),
    false,
  );
  instance.dispose();
});

test('leadership portrait picker searches existing images and saves a selection without exposing storage key input', async () => {
  const localized = {
    heading: 'Leaders',
    sections: [
      {
        heading: 'Council',
        cards: [
          {
            name: 'Example',
            role: 'Advisor',
            imageKey: 'images/old.jpg',
            imageAlt: 'Portrait',
            bio: '',
          },
        ],
      },
    ],
  };
  const { host, requests, instance } = await setup({
    content: { en: localized, fr: structuredClone(localized) },
    media: [
      {
        key: 'images/new.jpg',
        url: 'https://cdn.example.org/new.jpg',
        name: 'New portrait',
      },
    ],
  });
  assert.equal(
    host
      .querySelectorAll('input')
      .some((input) => input.value === 'images/old.jpg'),
    false,
  );
  const picker = host.querySelector('.organization-media-picker');
  picker.querySelector('input').value = 'New';
  await picker.querySelector('button').fire('click');
  await flush();
  assert.ok(requests.some((request) => request.url.includes('/media?q=New')));
  await host.querySelector('.organization-media-item').fire('click');
  assert.equal(instance.hasUnsavedChanges(), true);
  await host.querySelector('.organization-save').fire('click');
  const saved = requests.find((request) => request.options.method === 'PUT');
  assert.equal(
    saved.options.body.content.en.sections[0].cards[0].imageKey,
    'images/new.jpg',
  );
  assert.equal(
    saved.options.body.content.fr.sections[0].cards[0].imageKey,
    'images/old.jpg',
  );
  instance.dispose();
});

test('leadership exposes only names and portrait selection, preserving fixed copy on save', async () => {
  const card = {
    name: 'Existing name', rank: 'Colonel', role: 'Advisor',
    bio: 'Fixed biography', imageAlt: 'Fixed description', profileUrl: '/fixed-profile',
    imageKey: 'images/existing.jpg', image: '/fixed.png', placeholder: true, featured: true,
  };
  const localized = { heading: 'Fixed page', heroSubtitle: 'Fixed introduction',
    sections: [{ heading: 'Fixed section', description: 'Fixed section copy', cards: [card] }] };
  const { host, requests, instance } = await setup({
    content: { en: localized, fr: structuredClone(localized) },
  });
  const inputs = host.querySelectorAll('input');
  for (const value of ['Colonel', 'Advisor', 'Fixed biography', 'Fixed description',
    '/fixed-profile', 'Fixed page', 'Fixed introduction', 'Fixed section', 'Fixed section copy']) {
    assert.equal(inputs.some(input => input.value === value), false, value);
  }
  assert.equal(host.querySelectorAll('textarea').length, 0);
  assert.equal(inputs.some(input => input.type === 'checkbox'), false);
  const name = inputs.find(input => input.value === 'Existing name');
  name.value = 'New name';
  await name.fire('input');
  await host.querySelector('.organization-save').fire('click');
  const saved = requests.find(request => request.options.method === 'PUT').options.body.content;
  assert.deepEqual({ ...saved.en.sections[0].cards[0] }, { ...card, name: 'New name' });
  assert.equal(saved.en.heading, 'Fixed page');
  assert.equal(saved.en.sections[0].description, 'Fixed section copy');
  instance.dispose();
});


test('editing after save changes the canonical roster and sends the new version', async () => {
  const { host, instance, requests } = await setup();
  for (const name of ['First edit', 'Second edit']) {
    const input = host.querySelector('input');
    input.value = name;
    await input.fire('input');
    await host.querySelector('.organization-save').fire('click');
  }
  const saves = requests.filter((request) => request.options.method === 'PUT');
  assert.deepEqual(saves.map(({ options }) => options.body.version), [1, 2]);
  assert.deepEqual(
    saves.map(({ options }) => options.body.content.en.sections[0].cards[0].name),
    ['First edit', 'Second edit'],
  );
  instance.dispose();
});
