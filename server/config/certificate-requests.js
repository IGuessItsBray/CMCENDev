const CERTIFICATE_REQUEST_STATUSES = Object.freeze([
  'pending',
  'ready_to_mail',
  'mailed',
  // Retained for requests completed before the ready-to-mail workflow.
  'printed',
]);

const CERTIFICATE_REQUEST_ACTIONABLE_STATUSES = Object.freeze([
  'pending',
  'ready_to_mail',
  'printed',
]);

const CERTIFICATE_FAMILY_RELATIONSHIPS = Object.freeze([
  'husband',
  'wife',
  'partner',
  'girlfriend',
  'boyfriend',
  'father',
  'mother',
  'step-father',
  'step-mother',
  'adoptive-parent',
  'foster-parent',
  'guardian',
  'cousin',
  'brother',
  'sister',
  'son',
  'daughter',
  'uncle',
  'aunt',
  'other',
]);

const CERTIFICATE_DECORATIONS = Object.freeze([
  'VC',
  'CV',
  'OM',
  'CC',
  'OC',
  'CMM',
  'COM',
  'CVO',
  'OMM',
  'OOM',
  'LVO',
  'MMM',
  'MOM',
  'MVO',
  'GOQ',
  'OQ',
  'CQ',
  'SOM',
  'O Ont',
  'OBC',
  'AOE',
  'OPEI',
  'ONB',
  'ONS',
  'ONL',
  'SMV',
  'SC',
  'MSC',
  'MMV',
  'MB',
  'MSM',
  'RVM',
  'CD',
]);

module.exports = {
  CERTIFICATE_REQUEST_ACTIONABLE_STATUSES,
  CERTIFICATE_DECORATIONS,
  CERTIFICATE_FAMILY_RELATIONSHIPS,
  CERTIFICATE_REQUEST_STATUSES,
};
