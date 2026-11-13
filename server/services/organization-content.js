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

const languages = ['en', 'fr'];

function cardIdentity(card) {
  return { name: card.name, imageKey: card.imageKey || '' };
}

function sameIdentity(left, right) {
  return left.name === right.name && left.imageKey === right.imageKey;
}

// Bilingual files retain layout and text. Slot identifiers reflect the existing
// matched section/card order; keep this order stable when editing fixed copy.
function leadershipLeaders(stored, { includeLegacyBios = false } = {}) {
  const seed = seeds.get('leadership');
  return seed.en.sections.flatMap((section, sectionIndex) =>
    section.cards.map((card, cardIndex) => {
      const id = `${sectionIndex}:${cardIndex}`;
      const defaults = {
        en: cardIdentity(card),
        fr: cardIdentity(seed.fr.sections[sectionIndex].cards[cardIndex]),
      };
      const legacy = Object.fromEntries(languages.map((language) => {
        const original = stored?.[language]?.sections?.[sectionIndex]?.cards?.[cardIndex];
        return [language, Object.fromEntries(Object.entries(defaults[language]).map(([field, fallback]) =>
          [field, typeof original?.[field] === 'string' ? original[field] : fallback],
        ))];
      }));
      const hasOverride = languages.some((language) => !sameIdentity(legacy[language], defaults[language]));
      const shared = stored?.sharedLeaders?.[id];
      const conflict = !shared && hasOverride && !sameIdentity(legacy.en, legacy.fr)
        ? legacy
        : undefined;
      const bios = Object.fromEntries(languages.map((language) => {
        const saved = stored?.bioOverrides?.[id]?.[language];
        return [language, typeof saved === 'string' ? saved : seed[language].sections[sectionIndex].cards[cardIndex].bio];
      }));
      const legacyBios = {};
      if (includeLegacyBios) {
        for (const language of languages) {
          const oldLocale = stored?.[language];
          const oldCard = oldLocale?.sections?.[sectionIndex]?.cards?.[cardIndex];
          const original = typeof oldCard?.bio === 'string'
            ? oldCard.bio
            : oldLocale?.bios?.[oldCard?.bioKey];
          if (typeof original === 'string' && original !== bios[language]
            && original !== seed[language].sections[sectionIndex].cards[cardIndex].bio)
            legacyBios[language] = original;
        }
      }
      return {
        id,
        sectionIndex,
        cardIndex,
        ...(shared || (hasOverride ? legacy.en : defaults.en)),
        bios,
        ...(Object.keys(legacyBios).length ? { legacyBios } : {}),
        ...(conflict ? { conflict } : {}),
      };
    }),
  );
}

function overlayLeadership(content, stored) {
  for (const leader of leadershipLeaders(stored)) {
    for (const language of languages) {
      const card = content[language].sections[leader.sectionIndex].cards[leader.cardIndex];
      const identity = leader.conflict?.[language] || leader;
      const original = cardIdentity(card);
      card.name = identity.name;
      if (typeof stored?.bioOverrides?.[leader.id]?.[language] === 'string')
        card.bio = leader.bios[language];
      if (identity.imageKey || Object.hasOwn(card, 'imageKey')) card.imageKey = identity.imageKey;
      if (!sameIdentity(identity, original)) {
        card.imageAlt = identity.name;
        if (identity.imageKey) card.placeholder = false;
      }
    }
  }
  return content;
}

function leadershipContent(stored) {
  return overlayLeadership(getSeed('leadership'), stored);
}

function applyLeadershipUpdate(value, stored) {
  const current = leadershipLeaders(stored);
  if (!Array.isArray(value) || value.length !== current.length)
    throw invalid('Submit the complete leadership roster');
  const incoming = new Map();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || Object.keys(row).some((key) => !['id', 'name', 'imageKey', 'bios', 'resolveConflict'].includes(key))
      || typeof row.id !== 'string' || incoming.has(row.id))
      throw invalid('Invalid leadership roster entry');
    incoming.set(row.id, row);
  }
  const sharedLeaders = {};
  const bioOverrides = {};
  const seed = seeds.get('leadership');
  for (const leader of current) {
    const row = incoming.get(leader.id);
    if (!row || (row.resolveConflict !== undefined && row.resolveConflict !== true))
      throw invalid('Invalid leadership roster entry');
    const { name, imageKey, bios = leader.bios } = row;
    if (!bios || typeof bios !== 'object' || Array.isArray(bios)
      || Object.keys(bios).length !== languages.length
      || languages.some((language) => !Object.hasOwn(bios, language)
        || typeof bios[language] !== 'string' || bios[language].length > 30000
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(bios[language])))
      throw invalid('Enter plain-text biographies in both languages, up to 30,000 characters each');
    for (const language of languages) {
      if (bios[language] !== seed[language].sections[leader.sectionIndex].cards[leader.cardIndex].bio) {
        bioOverrides[leader.id] ??= {};
        bioOverrides[leader.id][language] = bios[language];
      }
    }
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\u0000-\u001f]/u.test(name))
      throw invalid('A name of up to 200 characters is required');
    if (typeof imageKey !== 'string' || imageKey.length > 500
      || (imageKey && (!/^images\/[a-zA-Z0-9/_ .-]+$/u.test(imageKey) || imageKey.split('/').includes('..'))))
      throw invalid('Invalid portrait image key');
    if (!imageKey && languages.some((language) =>
      !seed[language].sections[leader.sectionIndex].cards[leader.cardIndex].image))
      throw invalid('A portrait image is required');
    if (leader.conflict && row.resolveConflict !== true)
      throw Object.assign(new Error('Resolve each conflicting leadership entry before saving'), { status: 409 });
    const defaults = cardIdentity(seed.en.sections[leader.sectionIndex].cards[leader.cardIndex]);
    // Do not pin an unedited bundled value just because another leader changed.
    if (leader.conflict || !sameIdentity({ name, imageKey }, defaults)
      || stored?.sharedLeaders?.[leader.id] || !sameIdentity(leader, defaults))
      sharedLeaders[leader.id] = { name, imageKey };
  }
  // Keep historical bilingual overrides intact even when superseded.
  return { ...stored, sharedLeaders, bioOverrides };
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
  portraitKeys,
  leadershipContent,
  leadershipLeaders,
  overlayLeadership,
  applyLeadershipUpdate,
};
