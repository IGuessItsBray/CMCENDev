/* Award-only grammatical metadata; other rank consumers keep their existing catalogue. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./person-rank-options"));
  else root.CMCENAwardRanks = factory(root.CMCENRanks);
})(typeof window === "object" ? window : globalThis, function (ranks) {
  "use strict";
  // CAF inclusive French rank forms (2022); abbreviations do not change with form.
  // Source: canada.ca/fr/ministere-defense-nationale/feuille-derable/defense/2022/02/fac-modernisent-grades-militaires-francais.html
  const feminine = {
    private: "Soldate",
    aviator: "Aviatrice",
    corporal: "Caporale",
    master_corporal: "Caporale-chef",
    sergeant: "Sergente",
    warrant_officer: "Adjudante",
    master_warrant_officer: "Adjudante-maître",
    chief_warrant_officer: "Adjudante-chef",
    officer_cadet: "Élève-officière",
    naval_cadet: "Aspirante de marine",
    second_lieutenant: "Sous-lieutenante",
    lieutenant: "Lieutenante",
    lieutenant_navy: "Lieutenante de vaisseau",
    major: "Majore",
    lieutenant_colonel: "Lieutenante-colonelle",
    colonel: "Colonelle",
    brigadier_general: "Brigadière-générale",
    major_general: "Majore-générale",
    lieutenant_general: "Lieutenante-générale",
    general: "Générale",
    rear_admiral: "Contre-amirale",
    vice_admiral: "Vice-amirale",
    admiral: "Amirale",
    chief_petty_officer_first_class: "Première maître de 1re classe",
    chief_petty_officer_second_class: "Première maître de 2e classe",
  };
  const elided = new Set([
    "aviator",
    "warrant_officer",
    "master_warrant_officer",
    "chief_warrant_officer",
    "officer_cadet",
    "naval_cadet",
    "acting_sub_lieutenant",
    "sub_lieutenant",
    "admiral",
  ]);
  // Civilian and generic Recruit are not specific military ranks with a verified
  // bilingual abbreviation; do not invent a service/qualification for them.
  const catalogue = Object.freeze(
    ranks.catalogue
      .filter((rank) => !["civilian", "recruit"].includes(rank.id))
      .map((rank) =>
        Object.freeze({
          ...rank,
          feminineFr: feminine[rank.id] || rank.fr,
          abbreviationEn: ranks.abbreviation(rank.en, "en"),
          abbreviationFr: ranks.abbreviation(rank.fr, "fr"),
          elided: elided.has(rank.id),
        }),
      ),
  );
  function resolve(fullRankEn, pronoun) {
    const rank = catalogue.find((rank) => rank.en === fullRankEn);
    if (!rank || !["il", "elle"].includes(pronoun)) return null;
    return {
      rank,
      frenchForm: pronoun === "elle" ? rank.feminineFr : rank.fr,
      grammar: rank.elided
        ? "elided"
        : pronoun === "elle"
          ? "feminine"
          : "masculine",
    };
  }
  return Object.freeze({ catalogue, resolve });
});
