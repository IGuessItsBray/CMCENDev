const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|password|secret|token|api[-_]?key|credential|private[-_]?key|session)/iu;
const SENSITIVE_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
  /([?&](?:access_token|api_key|authorization|code|password|refresh_token|token)=)[^&#\s]+/giu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/giu,
];
const REDACTED = '[REDACTED]';

function redactString(value) {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, REDACTED),
    String(value),
  );
}

function sanitize(value, key = '') {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

function write(level, message, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: redactString(message),
  };

  if (details !== undefined) {
    entry.details = sanitize(details);
  }

  const output = JSON.stringify(entry);
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${output}\n`);
}

function log(message, ...details) {
  write('info', message, details.length <= 1 ? details[0] : details);
}

function warn(message, ...details) {
  write('warn', message, details.length <= 1 ? details[0] : details);
}

function error(message, ...details) {
  write('error', message, details.length <= 1 ? details[0] : details);
}

function installConsole() {
  console.log = log;
  console.info = log;
  console.warn = warn;
  console.error = error;
  console.debug = log;
}

module.exports = {
  error,
  installConsole,
  log,
  redactString,
  sanitize,
  warn,
};
