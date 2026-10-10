/* Shared staff rank catalogue and validation; see docs/NOTICE RANK EDITING.md. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CMCENRanks = api;
}(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const catalogue = Object.freeze([
  {
    "id": "civilian",
    "en": "Civilian",
    "fr": "Civil"
  },
  {
    "id": "recruit",
    "en": "Recruit",
    "fr": "Recrue"
  },
  {
    "id": "private",
    "en": "Private",
    "fr": "Soldat"
  },
  {
    "id": "aviator",
    "en": "Aviator",
    "fr": "Aviateur"
  },
  {
    "id": "sailor_third_class",
    "en": "Sailor Third Class",
    "fr": "Matelot de 3e classe"
  },
  {
    "id": "corporal",
    "en": "Corporal",
    "fr": "Caporal"
  },
  {
    "id": "sailor_second_class",
    "en": "Sailor Second Class",
    "fr": "Matelot de 2e classe"
  },
  {
    "id": "master_corporal",
    "en": "Master Corporal",
    "fr": "Caporal-chef"
  },
  {
    "id": "master_sailor",
    "en": "Master Sailor",
    "fr": "Matelot-chef"
  },
  {
    "id": "sailor_first_class",
    "en": "Sailor First Class",
    "fr": "Matelot de 1re classe"
  },
  {
    "id": "sergeant",
    "en": "Sergeant",
    "fr": "Sergent"
  },
  {
    "id": "petty_officer_second_class",
    "en": "Petty Officer 2nd Class",
    "fr": "Maître de 2e classe"
  },
  {
    "id": "warrant_officer",
    "en": "Warrant Officer",
    "fr": "Adjudant"
  },
  {
    "id": "petty_officer_first_class",
    "en": "Petty Officer 1st Class",
    "fr": "Maître de 1re classe"
  },
  {
    "id": "master_warrant_officer",
    "en": "Master Warrant Officer",
    "fr": "Adjudant-maître"
  },
  {
    "id": "chief_petty_officer_second_class",
    "en": "Chief Petty Officer 2nd Class",
    "fr": "Premier maître de 2e classe"
  },
  {
    "id": "chief_warrant_officer",
    "en": "Chief Warrant Officer",
    "fr": "Adjudant-chef"
  },
  {
    "id": "chief_petty_officer_first_class",
    "en": "Chief Petty Officer 1st Class",
    "fr": "Premier maître de 1re classe"
  },
  {
    "id": "officer_cadet",
    "en": "Officer Cadet",
    "fr": "Élève-officier"
  },
  {
    "id": "naval_cadet",
    "en": "Naval Cadet",
    "fr": "Aspirant de marine"
  },
  {
    "id": "second_lieutenant",
    "en": "Second Lieutenant",
    "fr": "Sous-lieutenant"
  },
  {
    "id": "acting_sub_lieutenant",
    "en": "Acting Sub-Lieutenant",
    "fr": "Enseigne de vaisseau de 2e classe"
  },
  {
    "id": "lieutenant",
    "en": "Lieutenant",
    "fr": "Lieutenant"
  },
  {
    "id": "sub_lieutenant",
    "en": "Sub-Lieutenant",
    "fr": "Enseigne de vaisseau de 1re classe"
  },
  {
    "id": "captain",
    "en": "Captain",
    "fr": "Capitaine"
  },
  {
    "id": "lieutenant_navy",
    "en": "Lieutenant (Navy)",
    "fr": "Lieutenant de vaisseau"
  },
  {
    "id": "major",
    "en": "Major",
    "fr": "Major"
  },
  {
    "id": "lieutenant_commander",
    "en": "Lieutenant-Commander",
    "fr": "Capitaine de corvette"
  },
  {
    "id": "lieutenant_colonel",
    "en": "Lieutenant-Colonel",
    "fr": "Lieutenant-colonel"
  },
  {
    "id": "commander",
    "en": "Commander",
    "fr": "Capitaine de frégate"
  },
  {
    "id": "colonel",
    "en": "Colonel",
    "fr": "Colonel"
  },
  {
    "id": "captain_navy",
    "en": "Captain (Navy)",
    "fr": "Capitaine de vaisseau"
  },
  {
    "id": "brigadier_general",
    "en": "Brigadier-General",
    "fr": "Brigadier-général"
  },
  {
    "id": "commodore",
    "en": "Commodore",
    "fr": "Commodore"
  },
  {
    "id": "major_general",
    "en": "Major-General",
    "fr": "Major-général"
  },
  {
    "id": "rear_admiral",
    "en": "Rear-Admiral",
    "fr": "Contre-amiral"
  },
  {
    "id": "lieutenant_general",
    "en": "Lieutenant-General",
    "fr": "Lieutenant-général"
  },
  {
    "id": "vice_admiral",
    "en": "Vice-Admiral",
    "fr": "Vice-amiral"
  },
  {
    "id": "general",
    "en": "General",
    "fr": "Général"
  },
  {
    "id": "admiral",
    "en": "Admiral",
    "fr": "Amiral"
  }
].map(Object.freeze));
  const aliases = {
    en: { Capt: 'captain', Lt: 'lieutenant', '2Lt': 'second_lieutenant',
      Maj: 'major', LCol: 'lieutenant_colonel', Col: 'colonel',
      Cpl: 'corporal', MCpl: 'master_corporal', Sgt: 'sergeant',
      WO: 'warrant_officer', MWO: 'master_warrant_officer', CWO: 'chief_warrant_officer' },
    fr: { Capt: 'captain', Lt: 'lieutenant', Slt: 'second_lieutenant',
      Maj: 'major', Lcol: 'lieutenant_colonel', Col: 'colonel',
      Cpl: 'corporal', Cplc: 'master_corporal', Sgt: 'sergeant',
      Adj: 'warrant_officer', Adjum: 'master_warrant_officer', Adjuc: 'chief_warrant_officer' },
  };
  const normalize = value => String(value || '').trim().normalize('NFC').toLocaleLowerCase()
    .replace(/[–—]/gu, '-').replace(/\s+/gu, ' ');
  function resolve(value, language) {
    if (!['en', 'fr'].includes(language) || !normalize(value)) return null;
    const matches = catalogue.filter(rank => normalize(rank[language]) === normalize(value) ||
      Object.entries(aliases[language]).some(([alias, id]) => id === rank.id && normalize(alias) === normalize(value)));
    return matches.length === 1 ? matches[0] : null;
  }
  function initialValues(person = {}, legacyField = 'rank') {
    const en = String(person.ranks?.en || person[legacyField] || '');
    const fr = String(person.ranks?.fr || '');
    // Never reinterpret a retired/custom value or replace an authored counterpart.
    return { en, fr: fr || resolve(en, 'en')?.fr || '' };
  }
  function validateSelection(values) {
    if (values.catalogueId === undefined) return;
    const rank = catalogue.find(rank => rank.id === values.catalogueId);
    if (!rank || values.en !== rank.en || values.fr !== rank.fr)
      throw new Error('Selected rank must match its English/French catalogue pair');
  }
  function editPayload(person, legacyField, values) {
    const initial = initialValues(person, legacyField);
    const changed = values.en !== initial.en || values.fr !== initial.fr;
    const en = resolve(values.en, 'en'), fr = resolve(values.fr, 'fr');
    const pair = en && fr && en.id === fr.id && values.en === en.en && values.fr === en.fr ? en : null;
    const ranks = { ...values, ...(changed && pair ? { catalogueId: pair.id } : {}) };
    validateSelection(ranks);
    // Keep the original certificate/legacy wording unless a rank was explicitly changed.
    // Unknown legacy-only records gain no fabricated authored translations.
    if (!changed && !resolve(initial.en, 'en'))
      return { [legacyField]: person[legacyField] || '',
        ...(person.ranks ? { ranks: { en: person.ranks.en || '', fr: person.ranks.fr || '' } } : {}) };
    return { [legacyField]: changed ? values.en : person[legacyField] || '', ranks };
  }
  function bind(en, fr, initial, notify = () => {}) {
    const controls = { en, fr };
    for (const language of ['en', 'fr']) {
      controls[language].addEventListener('change', () => {
        const value = controls[language].value;
        const rank = catalogue.find(rank => rank[language] === value);
        if (rank) { en.value = rank.en; fr.value = rank.fr; }
        else if (!value) { en.value = ''; fr.value = ''; }
        else if (value === initial[language]) { en.value = initial.en; fr.value = initial.fr; }
        notify();
      });
    }
  }
  return Object.freeze({ catalogue, resolve, initialValues, validateSelection, editPayload, bind });
}));
