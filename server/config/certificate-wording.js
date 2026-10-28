// These describe the retiring MEMBER relative to the certificate RECIPIENT.
// Explicit requester answers, never inferred from familyMembers.relationship.
// Preserve the original PDF script's wording, including its punctuation/typos.
const FAMILY_WORDING_OPTIONS = Object.freeze(
  [
    ['husband', "your husband's", 'de votre mari'],
    ['wife', "your wife's", 'de votre épouse'],
    ['common-law', "your common-law's", 'de votre conjoint de fait'],
    ['partner', "your partner's", 'de votre partenaire'],
    ['girlfriend', "your girlfriend's", 'de votre amie'],
    ['boyfriend', "your boyfriend's", 'de votre petit ami'],
    ['father', "your father's", 'de votre père'],
    ['mother', "your mother's", 'de votre mère'],
    ['step-father', "your step-father's", 'de votre beau-père'],
    ['step-mother', "your step-mother's", 'de votre belle-mère'],
    ['child', "your child's", 'de votre enfant'],
    ['son', "you son's", 'de votre fils'],
    ['daughter', "your daughter's", 'de votre fille'],
    ['guardian', "your guardian's", 'de votre tuteur'],
    ['cousin', "your cousin's", 'de votre cousin'],
    ['brother', "your brother's", 'de votre frère'],
    ['sister', "your sister's", 'de votre sœur'],
    ['uncle', "your uncle's", 'de votre oncle'],
    ['aunt', "your aunt's", 'de votre tante'],
  ].map(([key, en, fr]) =>
    Object.freeze({
      key,
      en,
      fr: `${fr}${['partner', 'girlfriend'].includes(key) ? '' : '.'}`,
    }),
  ),
);

module.exports = { FAMILY_WORDING_OPTIONS };
