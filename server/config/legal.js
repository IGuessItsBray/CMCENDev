const LEGAL_VERSIONS = Object.freeze({
  privacy: '2026-09-01',
  terms: '2026-09-01',
});

function readSetting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getLegalContact() {
  return {
    organizationName: readSetting('FOOTER_ORGANIZATION_NAME', 'Communications & Electronics Association'),
    contactName: readSetting('FOOTER_CONTACT_NAME', 'C&E Association'),
    addressLines: [
      readSetting('FOOTER_ADDRESS_LINE_1', '9 Byng Ave'),
      readSetting('FOOTER_ADDRESS_LINE_2', 'Kingston, ON K7K 5L3'),
    ].filter(Boolean),
    legalEmail: readSetting('LEGAL_CONTACT_EMAIL', 'legal@cmcen.ca'),
    privacyEmail: readSetting('PRIVACY_CONTACT_EMAIL', 'privacy@cmcen.ca'),
    securityEmail: readSetting('SECURITY_CONTACT_EMAIL', 'security@cmcen.ca'),
  };
}

module.exports = { LEGAL_VERSIONS, getLegalContact };
