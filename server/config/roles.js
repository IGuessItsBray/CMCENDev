// shared role configuration to prevent middleware and model from maintaining separate, potentially contradictory lists.
const USER_ROLES = Object.freeze([
  'subscriber',
  'contributor',
  'author',
  'editor',
  'administrator'
]);

const ROLE_LEVELS = Object.freeze({
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  administrator: 4
});

module.exports = {
  USER_ROLES,
  ROLE_LEVELS
};