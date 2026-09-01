const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const navigationSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'index.js'),
  'utf8',
);

test('shows the protected Contact quick link only to signed-in members', () => {
  assert.match(
    navigationSource,
    /<li data-auth-required hidden>\s*<a href="\/contact\.html" data-i18n="menu_contact">/u,
  );
});

test('keeps the TD Insurance campaign destination out of public footer code', () => {
  assert.match(navigationSource, /class="footer-partner-card"/u);
  assert.match(navigationSource, /data-i18n="footer_td_insurance_offer"/u);
  assert.match(
    navigationSource,
    /data-i18n="footer_td_insurance_login_notice"/u,
  );
  assert.match(
    navigationSource,
    /const tdInsuranceMemberBenefitUrl = "\/api\/member-benefits\/td-insurance"/u,
  );
  assert.match(
    navigationSource,
    /CMCENUtils\.apiJson\(tdInsuranceMemberBenefitUrl/u,
  );
  assert.doesNotMatch(navigationSource, /tdinsurance\.com/u);
});
