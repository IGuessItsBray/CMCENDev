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
    en: {
      heading: 'Branch',
      sections: [
        {
          heading: 'Council',
          cards: [{ name: 'Example', role: 'Advisor', imageKey: '' }],
        },
      ],
    },
    fr: {
      heading: 'Branche',
      sections: [
        {
          heading: 'Conseil',
          cards: [{ name: 'Exemple', role: 'Conseiller', imageKey: '' }],
        },
      ],
    },
  },
  portraitUrls = {},
  media = [],
  leaders = [
    {
      id: 'leader-0-0',
      sectionIndex: 0,
      cardIndex: 0,
      name: 'Example',
      imageKey: '',
    },
  ],
  permissions = {},
  uploadResult = { key: 'images/upload.jpg', url: '/uploaded.jpg' },
} = {}) {
  const host = new Element('div');
  const root = { querySelector: () => host };
  const requests = [];
  const focusStates = [];
  const document = {
    documentElement: { lang: 'en' },
    createElement(tag) {
      const element = new Element(tag);
      element.classList = { toggle() {} };
      element.focus = () =>
        focusStates.push({
          tag: element.tagName,
          inert: !!element.closest('.organization-form')?.inert,
        });
      return element;
    },
  };
  const window = { confirm: () => false };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../public/organization-content-editor.js'),
      'utf8',
    ),
    { document, window, AbortController, URLSearchParams, FormData },
  );
  const api = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.startsWith('/api/organization-content/media?'))
      return { media, nextCursor: '' };
    if (url === '/api/upload') return uploadResult;
    if (options.method === 'PUT') {
      if (rejectSave)
        throw new Error(
          'Someone else changed this content. Reload before saving.',
        );
      return {
        version: options.body.version + 1,
        content: structuredClone(content),
        leaders: options.body.leaders.map((leader, index) => ({
          ...structuredClone(leader),
          sectionIndex: leaders[index].sectionIndex,
          cardIndex: leaders[index].cardIndex,
        })),
      };
    }
    if (url.endsWith('/manage')) return { resources };
    return {
      content: structuredClone(content),
      leaders: structuredClone(leaders),
      portraitUrls,
      version: 1,
    };
  };
  const instance = window.OrganizationContentEditor.mountLeadership({
    api,
    root,
    permissions,
  });
  await flush();
  return { host, requests, instance, focusStates };
}

test('one shared name and portrait picker save only allowed shared fields and version', async () => {
  const { host, requests, instance } = await setup();
  assert.equal(host.querySelectorAll('.organization-media-picker').length, 1);
  assert.equal(host.querySelectorAll('textarea').length, 2);
  for (const name of ['First', 'Second']) {
    const input = host.querySelector('input');
    input.value = name;
    await input.fire('input');
    await host.querySelector('.organization-save').fire('click');
  }
  const saves = requests.filter((r) => r.options.method === 'PUT');
  assert.deepEqual(
    saves.map((r) => r.options.body.version),
    [1, 2],
  );
  assert.deepEqual(
    saves.map((r) => r.options.body.leaders[0].name),
    ['First', 'Second'],
  );
  assert.deepEqual(Object.keys(saves[0].options.body), ['version', 'leaders']);
  assert.deepEqual(Object.keys(saves[0].options.body.leaders[0]), [
    'id',
    'name',
    'imageKey',
    'bios',
  ]);
  instance.dispose();
});
test('rejected save preserves edits and blocks navigation', async () => {
  const { host, instance } = await setup({ rejectSave: true });
  const input = host.querySelector('input');
  input.value = 'Keep';
  await input.fire('input');
  await host.querySelector('.organization-save').fire('click');
  assert.equal(input.value, 'Keep');
  assert.equal(instance.hasUnsavedChanges(), true);
  assert.equal(instance.canNavigate(), false);
  instance.dispose();
});
test('no assigned resources never fetches a roster', async () => {
  const { host, requests, instance } = await setup({ resources: [] });
  assert.equal(requests.length, 1);
  assert.equal(host.querySelector('.organization-save').disabled, true);
  instance.dispose();
});
test('existing portrait renders once; selection updates shared portrait without storage input', async () => {
  const { host, requests, instance } = await setup({
    leaders: [
      {
        id: 'a',
        sectionIndex: 0,
        cardIndex: 0,
        name: 'Example',
        imageKey: 'images/old.jpg',
      },
    ],
    portraitUrls: { 'images/old.jpg': '/old.jpg' },
    media: [{ key: 'images/new.jpg', url: '/new.jpg', name: 'New' }],
  });
  assert.equal(host.querySelectorAll('img').length, 1);
  assert.equal(host.querySelector('img').src, '/old.jpg');
  assert.equal(
    host.querySelectorAll('input').some((i) => i.value === 'images/old.jpg'),
    false,
  );
  const picker = host.querySelector('.organization-media-picker');
  picker.querySelector('input').value = 'New';
  await picker.querySelector('button').fire('click');
  await flush();
  await host.querySelector('.organization-media-item').fire('click');
  await host.querySelector('.organization-save').fire('click');
  assert.equal(
    requests.find((r) => r.options.method === 'PUT').options.body.leaders[0]
      .imageKey,
    'images/new.jpg',
  );
  instance.dispose();
});
test('conflicting legacy entries require an explicit choice and remain unchanged on load', async () => {
  const conflict = {
    en: { name: 'English', imageKey: 'images/en.jpg' },
    fr: { name: 'French', imageKey: 'images/fr.jpg' },
  };
  const { host, requests, instance } = await setup({
    leaders: [
      {
        id: 'a',
        sectionIndex: 0,
        cardIndex: 0,
        name: 'English',
        imageKey: 'images/en.jpg',
        conflict,
      },
    ],
  });
  assert.equal(instance.hasUnsavedChanges(), false);
  assert.equal(host.querySelector('.organization-save').disabled, true);
  assert.equal(host.querySelectorAll('.organization-media-picker').length, 0);
  assert.equal(
    requests.some((r) => r.options.method === 'PUT'),
    false,
  );
  await host
    .querySelectorAll('button')
    .find((b) => b.textContent === 'Use FR')
    .fire('click');
  assert.equal(host.querySelector('input').value, 'French');
  await host.querySelector('.organization-save').fire('click');
  const saved = requests.find((r) => r.options.method === 'PUT').options.body
    .leaders[0];
  assert.equal(saved.resolveConflict, true);
  assert.equal(saved.name, 'French');
  assert.equal(saved.imageKey, 'images/fr.jpg');
  instance.dispose();
});
test('upload name only appears after selecting a file, and named upload updates shared portrait', async () => {
  const { host, requests, instance } = await setup({
    permissions: { canUploadMedia: true },
  });
  const nameLabel = host
    .querySelectorAll('label')
    .find((label) => label.textContent === 'Name for new portrait');
  assert.ok(nameLabel);
  assert.equal(nameLabel.hidden, true);
  const upload = host
    .querySelectorAll('input')
    .find((input) => input.type === 'file');
  const file = new Blob(['photo'], { type: 'image/jpeg' });
  file.name = 'Headshot.jpg';
  upload.files = [file];
  await upload.fire('change');
  assert.equal(nameLabel.hidden, false);
  assert.equal(nameLabel.querySelector('input').value, 'Headshot');
  nameLabel.querySelector('input').value = 'Approved headshot';
  await host
    .querySelectorAll('button')
    .find((b) => b.textContent === 'Upload portrait')
    .fire('click');
  const request = requests.find((r) => r.url === '/api/upload');
  assert.equal(request.options.body.get('sourceName'), 'Approved headshot');
  await host.querySelector('.organization-save').fire('click');
  assert.equal(
    requests.find((r) => r.options.method === 'PUT').options.body.leaders[0]
      .imageKey,
    'images/upload.jpg',
  );
  instance.dispose();
});

test('oversized portrait is rejected before any upload request', async () => {
  const { host, requests, instance } = await setup({
    permissions: { canUploadMedia: true },
  });
  const upload = host
    .querySelectorAll('input')
    .find((input) => input.type === 'file');
  upload.files = [{ name: 'large.jpg', size: 10 * 1024 * 1024 + 1 }];
  await upload.fire('change');
  await host
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Upload portrait')
    .fire('click');
  assert.equal(
    requests.some((request) => request.url === '/api/upload'),
    false,
  );
  assert.match(
    host.querySelector('.organization-status').textContent,
    /exceeds 10 MiB/,
  );
  assert.equal(instance.hasUnsavedChanges(), false);
  instance.dispose();
});

const disclosureFor = (host, key) =>
  host
    .querySelectorAll('details')
    .find((node) => node.dataset.disclosureKey === key);

test('portrait selection preserves appointment, section and picker expansion; manual close survives save', async () => {
  const { host, requests, instance } = await setup({
    media: [{ key: 'images/chosen.jpg', url: '/chosen.jpg', name: 'Chosen' }],
  });
  disclosureFor(host, 'leader:leader-0-0').open = true;
  disclosureFor(host, 'portrait:leader-0-0').open = true;
  const picker = host.querySelector('.organization-media-picker');
  await picker.querySelector('button').fire('click');
  await flush();
  await host.querySelector('.organization-media-item').fire('click');
  assert.equal(disclosureFor(host, 'leader:leader-0-0').open, true);
  assert.equal(disclosureFor(host, 'section:0').open, true);
  assert.equal(disclosureFor(host, 'portrait:leader-0-0').open, true);
  disclosureFor(host, 'portrait:leader-0-0').open = false;
  disclosureFor(host, 'leader:leader-0-0').open = false;
  disclosureFor(host, 'section:0').open = false;
  await host.querySelector('.organization-save').fire('click');
  assert.equal(
    requests.some((request) => request.options.method === 'PUT'),
    true,
  );
  for (const key of ['section:0', 'leader:leader-0-0', 'portrait:leader-0-0'])
    assert.equal(disclosureFor(host, key).open, false, key);
  instance.dispose();
});

test('successful upload and save keep the same appointment expanded', async () => {
  const { host, instance, focusStates } = await setup({
    permissions: { canUploadMedia: true },
  });
  disclosureFor(host, 'leader:leader-0-0').open = true;
  const upload = host
    .querySelectorAll('input')
    .find((input) => input.type === 'file');
  const file = new Blob(['image'], { type: 'image/jpeg' });
  file.name = 'portrait.jpg';
  upload.files = [file];
  await upload.fire('change');
  await host
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Upload portrait')
    .fire('click');
  assert.equal(disclosureFor(host, 'leader:leader-0-0').open, true);
  assert.deepEqual(focusStates, [{ tag: 'SUMMARY', inert: false }]);
  await host.querySelector('.organization-save').fire('click');
  assert.equal(disclosureFor(host, 'leader:leader-0-0').open, true);
  instance.dispose();
});

test('resolving a legacy conflict preserves the expanded appointment', async () => {
  const { host, instance } = await setup({
    leaders: [
      {
        id: 'conflict',
        sectionIndex: 0,
        cardIndex: 0,
        name: 'EN',
        imageKey: '',
        conflict: {
          en: { name: 'EN', imageKey: '' },
          fr: { name: 'FR', imageKey: '' },
        },
      },
    ],
  });
  assert.equal(disclosureFor(host, 'leader:conflict').open, true);
  await host
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Use FR')
    .fire('click');
  assert.equal(disclosureFor(host, 'leader:conflict').open, true);
  await host.querySelector('.organization-save').fire('click');
  assert.equal(disclosureFor(host, 'leader:conflict').open, true);
  instance.dispose();
});

test('independent biographies retain defaults and multiline edits across consecutive saves', async () => {
  const { host, requests, instance } = await setup({
    leaders: [
      {
        id: 'bio',
        sectionIndex: 0,
        cardIndex: 0,
        name: 'Leader',
        imageKey: '',
        bios: { en: 'Original English\nSecond line', fr: 'Français conservé' },
      },
    ],
  });
  const [english, french] = host.querySelectorAll('textarea');
  assert.equal(english.lang, 'en');
  assert.equal(french.lang, 'fr');
  assert.equal(english.maxLength, 30000);
  assert.equal(english.value, 'Original English\nSecond line');
  assert.equal(french.value, 'Français conservé');
  english.value = 'New English\nParagraph two';
  await english.fire('input');
  await host.querySelector('.organization-save').fire('click');
  const currentFrench = host.querySelectorAll('textarea')[1];
  currentFrench.value = '';
  await currentFrench.fire('input');
  await host.querySelector('.organization-save').fire('click');
  const writes = requests.filter((request) => request.options.method === 'PUT');
  assert.deepEqual(
    { ...writes[0].options.body.leaders[0].bios },
    { en: 'New English\nParagraph two', fr: 'Français conservé' },
  );
  assert.deepEqual(
    { ...writes[1].options.body.leaders[0].bios },
    { en: 'New English\nParagraph two', fr: '' },
  );
  instance.dispose();
});

test('preserved legacy biography never revives automatically and restoration is explicit per language', async () => {
  const { host, requests, instance } = await setup({
    leaders: [
      {
        id: 'bio',
        sectionIndex: 0,
        cardIndex: 0,
        name: 'Leader',
        imageKey: '',
        bios: { en: 'Current English', fr: 'Current French' },
        legacyBios: { fr: 'Old French\nHistorical text' },
      },
    ],
  });
  assert.equal(host.querySelectorAll('textarea')[1].value, 'Current French');
  assert.equal(instance.hasUnsavedChanges(), false);
  assert.equal(
    requests.some((request) => request.options.method === 'PUT'),
    false,
  );
  await host
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Use preserved biography')
    .fire('click');
  assert.equal(
    host.querySelectorAll('textarea')[1].value,
    'Old French\nHistorical text',
  );
  await host.querySelector('.organization-save').fire('click');
  const leader = requests.find((request) => request.options.method === 'PUT')
    .options.body.leaders[0];
  assert.deepEqual(
    { ...leader.bios },
    { en: 'Current English', fr: 'Old French\nHistorical text' },
  );
  assert.equal(Object.hasOwn(leader, 'legacyBios'), false);
  instance.dispose();
});
