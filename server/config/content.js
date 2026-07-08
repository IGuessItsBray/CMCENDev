// central source for statuses, entities, types, regions and timezones
const CONTENT_STATUSES = Object.freeze([
  'draft',
  'pending',
  'published',
  'rejected'
]);

const EVENT_ORGANIZING_ENTITIES = Object.freeze([
  'branch',
  'association',
  'foundation',
  'museum'
]);

const EVENT_TYPES = Object.freeze([
  'conference',
  'mess-function',
  'ceremony',
  'training',
  'social',
  'other'
]);

const CANADIAN_REGIONS = Object.freeze([
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
  'International'
]);

const CANADIAN_TIMEZONES = Object.freeze([
  'America/St_Johns',
  'America/Halifax',
  'America/Toronto',
  'America/Winnipeg',
  'America/Edmonton',
  'America/Vancouver'
]);

const RETIREMENT_TRADE_ROLE_GROUPS = Object.freeze({
  officer: Object.freeze([
    '00172-07 - GENERAL OFFICER LIST (BGEN+)',
    '00340 - CELE',
    '00341 - SIGS'
  ]),

  ncm: Object.freeze([
    '00109 - ATIS TECH',
    '00120 - SIGINT SPEC',
    '00299 - NAV COMM',
    '00378 - CYBER OP',
    '00381 - CWO',
    '00383 - SIG OP',
    '00384 - LINE TECH',
    '00385 - SIG TECH',
    '00394 - IS TECH'
  ])
});

const MILITARY_TRADE_ROLES = Object.freeze([
  ...RETIREMENT_TRADE_ROLE_GROUPS.officer,
  ...RETIREMENT_TRADE_ROLE_GROUPS.ncm
]);

const ACCOUNT_TRADE_OPTIONS = Object.freeze([
  ...MILITARY_TRADE_ROLES,
  'other'
]);

const RETIREMENT_TRADE_ROLES = Object.freeze([
  ...MILITARY_TRADE_ROLES,
  'Civilian'
]);

module.exports = {
  CONTENT_STATUSES,
  EVENT_ORGANIZING_ENTITIES,
  EVENT_TYPES,
  CANADIAN_REGIONS,
  CANADIAN_TIMEZONES,
  ACCOUNT_TRADE_OPTIONS,
  MILITARY_TRADE_ROLES,
  RETIREMENT_TRADE_ROLE_GROUPS,
  RETIREMENT_TRADE_ROLES
};
