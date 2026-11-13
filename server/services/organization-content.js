const { getUserPermissions } = require('../config/permissions');

const RESOURCES = Object.freeze([
  {
    key: 'leadership',
    label: 'Branch leadership',
    area: 'branch',
    kind: 'leadership',
  },
]);

const seeds = new Map(
  RESOURCES.map((resource) => {
    const content = JSON.parse(
      JSON.stringify(require(`../public/page-content/${resource.key}.json`)),
    );
    if (resource.kind === 'leadership') {
      for (const language of ['en', 'fr']) {
        for (const section of content[language].sections) {
          for (const card of section.cards) {
            card.bio = card.bio || content[language].bios?.[card.bioKey] || '';
            card.imageKey = card.imageKey || '';
            card.placeholder = Boolean(card.placeholder);
            delete card.bioKey;
          }
        }
        delete content[language].bios;
      }
    }
    return [resource.key, content];
  }),
);

function getSeed(key) {
  if (!seeds.has(key)) return null;
  const content = JSON.parse(JSON.stringify(seeds.get(key)));
  return content;
}

function canEditResource(user, resource) {
  if (!resource) return false;
  return Boolean(getUserPermissions(user).canManageLeadership);
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Fixed layouts are intentional: a scoped editor cannot inject arbitrary HTML,
// links, new keys, navigation or another organization's resource into a save.
function validateContent(key, value) {
  const seed = seeds.get(key);
  if (!seed) throw invalid('Unknown organization page');
  if (Buffer.byteLength(JSON.stringify(value)) > 300000)
    throw invalid('Content is too large');
  function validate(expected, actual, field = '') {
    if (typeof expected === 'string') {
      if (
        typeof actual !== 'string' ||
        actual.length > 30000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(actual)
      ) {
        throw invalid(`Invalid text: ${field}`);
      }
      if (field.endsWith('.name') && (!actual.trim() || actual.length > 200))
        throw invalid('A name of up to 200 characters is required');
      if (field.endsWith('.image') && actual !== expected)
        throw invalid('Use the portrait image key to change an image');
      if (field.endsWith('.profileUrl') && actual) {
        let url;
        try { url = new URL(actual); } catch { throw invalid('Invalid profile link'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw invalid('Profile links must be public HTTP or HTTPS URLs without credentials');
      }
      if (
        field.endsWith('.imageKey') &&
        actual &&
        !/^images\/[a-zA-Z0-9/_ .-]+$/u.test(actual)
      )
        throw invalid('Invalid portrait image key');
      if (field.endsWith('.imageKey') && actual.split('/').includes('..'))
        throw invalid('Invalid portrait image key');
      return actual;
    }
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length)
        throw invalid(`Invalid layout: ${field}`);
      return expected.map((item, index) =>
        validate(item, actual[index], `${field}.${index}`),
      );
    }
    if (expected && typeof expected === 'object') {
      if (
        !actual ||
        typeof actual !== 'object' ||
        Array.isArray(actual) ||
        Object.keys(actual).length !== Object.keys(expected).length ||
        Object.keys(expected).some((name) => !Object.hasOwn(actual, name))
      )
        throw invalid(`Invalid fields: ${field}`);
      if (Object.hasOwn(expected, 'imageKey') && !expected.image && !actual.imageKey)
        throw invalid('A portrait image is required');
      return Object.fromEntries(
        Object.entries(expected).map(([name, item]) => [
          name,
          validate(item, actual[name], `${field}.${name}`),
        ]),
      );
    }
    if (field.endsWith('.placeholder') && typeof actual === 'boolean')
      return actual;
    if (actual !== expected)
      throw invalid(`Layout field cannot be changed: ${field}`);
    return actual;
  }
  return validate(seed, value);
}

// Fixed bilingual copy is bundled, not staff-editable. Keep legacy stored
// values intact, but only overlay the two supported staff fields for display.
function overlayLeadership(content, stored) {
  for (const language of ['en', 'fr']) {
    content[language].sections.forEach((section, si) => section.cards.forEach((card, ci) => {
      const saved = stored?.[language]?.sections?.[si]?.cards?.[ci];
      const { name, imageKey } = card;
      for (const field of ['name', 'imageKey']) {
        if (typeof saved?.[field] === 'string') card[field] = saved[field];
      }
      if (saved && (card.name !== name || card.imageKey !== imageKey)) {
        card.imageAlt = card.name;
        if (card.imageKey) card.placeholder = false;
      }
    }));
  }
  return content;
}

function leadershipContent(stored) {
  return overlayLeadership(getSeed('leadership'), stored);
}

function applyLeadershipUpdate(value, stored) {
  const current = leadershipContent(stored);
  const checked = validateContent('leadership', value);
  const expected = JSON.parse(JSON.stringify(current));
  for (const language of ['en', 'fr']) {
    expected[language].sections.forEach((section, si) => section.cards.forEach((card, ci) => {
      const updated = checked[language].sections[si].cards[ci];
      card.name = updated.name;
      card.imageKey = updated.imageKey;
    }));
  }
  if (JSON.stringify(checked) !== JSON.stringify(expected)) throw invalid('Only leadership names and portraits can be changed');
  const result = JSON.parse(JSON.stringify(stored || current));
  for (const language of ['en', 'fr']) {
    result[language].sections.forEach((section, si) => section.cards.forEach((card, ci) => {
      card.name = checked[language].sections[si].cards[ci].name;
      card.imageKey = checked[language].sections[si].cards[ci].imageKey;
    }));
  }
  return result;
}

function portraitKeys(content) {
  const keys = new Set();
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const field of ['imageKey']) if (typeof value[field] === 'string' && value[field]) keys.add(value[field]);
      Object.values(value).forEach(visit);
    }
  }
  visit(content); return [...keys];
}

module.exports = {
  RESOURCES,
  getSeed,
  canEditResource,
  validateContent,
  portraitKeys,
  leadershipContent,
  overlayLeadership,
  applyLeadershipUpdate,
};
