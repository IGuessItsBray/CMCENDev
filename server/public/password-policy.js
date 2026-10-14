(function (root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) module.exports = policy;
  else root.CMCENPasswordPolicy = policy;
})(typeof window === "undefined" ? globalThis : window, function () {
  function getPasswordValidationError(password) {
    if (typeof password !== "string") return "Password must be a string";
    if (Array.from(password).length < 12) {
      return "Password must contain at least 12 characters";
    }
    if (new TextEncoder().encode(password).length > 72) {
      return "Password must not exceed 72 UTF-8 bytes";
    }
    return "";
  }

  function getPasswordStrength(password) {
    // An invalid enrollment password must never appear strong.
    if (getPasswordValidationError(password)) return password ? 1 : 0;
    let score = 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }
  return { getPasswordValidationError, getPasswordStrength };
});
