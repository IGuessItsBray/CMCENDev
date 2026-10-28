const path = require('node:path');

const directory = path.join(__dirname, '../private/certificates/fonts');
const DEFAULT_CERTIFICATE_FONT_PATHS = Object.freeze({
  CERTIFICATE_SCRIPT_MT_BOLD_PATH: path.join(directory, 'ScriptMTBold.ttf'),
  CERTIFICATE_BELL_MT_BOLD_PATH: path.join(directory, 'bellmtbold.ttf'),
  CERTIFICATE_BELL_MT_ITALIC_PATH: path.join(directory, 'bellmtitalic.ttf'),
  CERTIFICATE_BELL_MT_PATH: path.join(directory, 'bellmt.ttf'),
});

// A nonempty override is validated as supplied; invalid overrides must fail,
// never silently fall back to another file or font family.
function certificateFontPath(variable) {
  return process.env[variable] || DEFAULT_CERTIFICATE_FONT_PATHS[variable];
}

module.exports = { DEFAULT_CERTIFICATE_FONT_PATHS, certificateFontPath };
