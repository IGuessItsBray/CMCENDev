const LEGAL_VERSIONS = Object.freeze({
  privacy: '2026-09-01',
  terms: '2026-09-01',
});

function readSetting(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getLegalContact() {
  return {
    footerAddressLabel: readSetting('FOOTER_ADDRESS_LABEL', 'Address:'),
    addressLines: [
      readSetting(
        'FOOTER_ADDRESS_LINE_1',
        'Communications & Electronics Association: Care of C&E Branch Office',
      ),
      readSetting('FOOTER_ADDRESS_LINE_2', 'Forde Building, Rm 217,'),
      readSetting('FOOTER_ADDRESS_LINE_3', '9 Byng Ave,'),
      readSetting('FOOTER_ADDRESS_LINE_4', 'Kingston, ON, K7K 5L3'),
    ].filter(Boolean),
    footerEmailLabel: readSetting('FOOTER_EMAIL_LABEL', 'Email:'),
    footerEmail: readSetting(
      'FOOTER_EMAIL',
      readSetting('SUPPORT_CONTACT_EMAIL', 'support@cmcen.ca'),
    ),
    legalEmail: readSetting('LEGAL_CONTACT_EMAIL', 'legal@cmcen.ca'),
    privacyEmail: readSetting('PRIVACY_CONTACT_EMAIL', 'privacy@cmcen.ca'),
    supportEmail: readSetting('SUPPORT_CONTACT_EMAIL', 'support@cmcen.ca'),
    securityEmail: readSetting('SECURITY_CONTACT_EMAIL', 'security@cmcen.ca'),
  };
}

module.exports = { LEGAL_VERSIONS, getLegalContact };
