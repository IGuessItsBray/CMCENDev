// shared role configuration to prevent middleware and model from maintaining separate, potentially contradictory lists.
const USER_ROLES = Object.freeze([
  'ghost',
  'subscriber',
  'contributor',
  'author',
  'editor',
  'administrator',
  'developer'
]);

const ROLE_LEVELS = Object.freeze({
  ghost: -1,
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  administrator: 4,
  developer: 5
});

module.exports = {
  USER_ROLES,
  ROLE_LEVELS
};
