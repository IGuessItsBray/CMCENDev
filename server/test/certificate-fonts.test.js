const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  DEFAULT_CERTIFICATE_FONT_PATHS,
  certificateFontPath,
} = require('../config/certificate-fonts');
const { loadCertificateFont } = require('../services/certificate-documents');
const { withBundledCertificateFonts } = require('./helpers/certificate-fonts');

test('bundled font bytes retain the supplied identities and hashes and are the default without environment configuration', () =>
  withBundledCertificateFonts(async () => {
    for (const [variable, name, sha] of [
      [
        'CERTIFICATE_SCRIPT_MT_BOLD_PATH',
        'ScriptMTBold',
        '86ef79a9fb677eeaa268e3e5ce9f4d3a88e6c95369c2b68cffc4e64ed425866f',
      ],
      [
        'CERTIFICATE_BELL_MT_BOLD_PATH',
        'BellMTBold',
        '6f6ccbbbf7f8a7374c46cc70f0142afe73a77f976a0950dcecf866f490f87971',
      ],
      [
        'CERTIFICATE_BELL_MT_ITALIC_PATH',
        'BellMTItalic',
        'f5fd962cb8073fc25fdfc04c06f89669ea6dcde5fb92ac4dee9739a6aed1992c',
      ],
      [
        'CERTIFICATE_BELL_MT_PATH',
        'BellMT',
        '79d2ff1b448da18c61ede6e9e274c616eba30e6b3f7f444384853533c69694c6',
      ],
    ]) {
      const fontPath = certificateFontPath(variable);
      assert.equal(fontPath, DEFAULT_CERTIFICATE_FONT_PATHS[variable]);
      assert.ok(
        fontPath.startsWith(
          path.resolve(__dirname, '../private/certificates/fonts') + path.sep,
        ),
      );
      const bytes = await loadCertificateFont(fontPath, name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
      assert.deepEqual(bytes, await fs.readFile(fontPath));
      process.env[variable] = '';
      assert.equal(certificateFontPath(variable), fontPath);
    }
    const variable = 'CERTIFICATE_SCRIPT_MT_BOLD_PATH';
    process.env[variable] = DEFAULT_CERTIFICATE_FONT_PATHS[variable];
    assert.ok(
      await loadCertificateFont(certificateFontPath(variable), 'ScriptMTBold'),
    );
    process.env[variable] =
      DEFAULT_CERTIFICATE_FONT_PATHS.CERTIFICATE_BELL_MT_PATH;
    await assert.rejects(
      loadCertificateFont(certificateFontPath(variable), 'ScriptMTBold'),
      { code: 'certificate_fonts_unavailable' },
    );
  }));
