const {
  DEFAULT_CERTIFICATE_FONT_PATHS,
} = require('../../config/certificate-fonts');

async function withBundledCertificateFonts(action) {
  const variables = Object.keys(DEFAULT_CERTIFICATE_FONT_PATHS);
  const saved = new Map(variables.map((key) => [key, process.env[key]]));
  variables.forEach((key) => delete process.env[key]);
  try {
    return await action();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

module.exports = { withBundledCertificateFonts };
