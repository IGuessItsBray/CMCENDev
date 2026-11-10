(function (root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) module.exports = policy;
  else root.CMCENPasswordPolicy = policy;
})(typeof window === "undefined" ? globalThis : window, function () {
  function getPasswordRequirements(password) {
    const characterCount = Array.from(password).length;
    const byteCount = new TextEncoder().encode(password).length;
    return {
      characterCount,
      byteCount,
      minimumLength: characterCount >= 12,
      maximumBytes: byteCount <= 72,
    };
  }

  function getPasswordValidationError(password) {
    if (typeof password !== "string") return "Password must be a string";
    const requirements = getPasswordRequirements(password);
    if (!requirements.minimumLength) {
      return "Password must contain at least 12 characters";
    }
    if (!requirements.maximumBytes) {
      return "Password must not exceed 72 UTF-8 bytes";
    }
    return "";
  }

  function getPasswordStrength(password) {
    // Advisory only: policy acceptance and estimated strength are different.
    // This local heuristic is not a dictionary or compromised-password check.
    if (getPasswordValidationError(password)) return password ? 1 : 0;
    const characters = Array.from(password.toLowerCase());
    const uniqueCount = new Set(characters).size;
    const mostFrequent = Math.max(
      ...Array.from(
        new Set(characters),
        (character) => characters.filter((value) => value === character).length,
      ),
    );
    // Do not reward padding, repeated blocks, or a few varied characters added
    // to a repeated password, even when all character classes are present.
    if (
      uniqueCount < 6 ||
      mostFrequent > characters.length / 2 ||
      /^(.{1,12})\1+$/u.test(password)
    )
      return 1;
    const length = characters.length;
    if (length >= 24 && uniqueCount >= 10) return 5;
    if (length >= 18 && uniqueCount >= 8) return 4;
    return 3;
  }
  return {
    getPasswordRequirements,
    getPasswordValidationError,
    getPasswordStrength,
  };
});
