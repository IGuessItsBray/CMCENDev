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

module.exports = {
  CONTENT_STATUSES,
  EVENT_ORGANIZING_ENTITIES,
  EVENT_TYPES,
  CANADIAN_REGIONS,
  CANADIAN_TIMEZONES
};
