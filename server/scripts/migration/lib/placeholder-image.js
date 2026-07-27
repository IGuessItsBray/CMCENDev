const CANONICAL_CREST_URL =
  'https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp';

const PLACEHOLDER_PATTERNS = Object.freeze([
  /cmcen-crest-snip/iu,
  /jimmy-(?:crest|statue)/iu,
  /canada-flag/iu,
  /td[-_ ]?insurance/iu,
  /064b615c-38c3-4946-a82f-48116a9d9a55/iu,
]);

function isPlaceholderImage(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) =>
    pattern.test(String(value || '')),
  );
}

module.exports = {
  CANONICAL_CREST_URL,
  isPlaceholderImage,
};
