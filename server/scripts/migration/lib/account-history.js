// Private migration provenance, never loaded by member or public endpoints.
const { hash } = require('./account-import');
const ACCOUNT_KEYS = [
  'ID',
  'user_login',
  'user_nicename',
  'user_email',
  'user_url',
  'user_registered',
  'user_status',
  'display_name',
];
const META_KEYS = [
  'Phone',
  '_icl_preferences',
  '_woocommerce_persistent_cart_1',
  'billing_address_1',
  'billing_city',
  'billing_country',
  'billing_email',
  'billing_first_name',
  'billing_last_name',
  'billing_phone',
  'billing_postcode',
  'billing_state',
  'description',
  'em_data_privacy_consent',
  'facebook',
  'first_name',
  'icl_admin_language',
  'icl_admin_language_for_edit',
  'invoice_user_last_view_date',
  'last_name',
  'last_update',
  'locale',
  'login_date',
  'mec_op',
  'mec_user_is_organizer',
  'mec_user_is_speaker',
  'mec_user_last_view_date',
  'mec_user_last_view_date_events',
  'mepr-address-city',
  'mepr-address-country',
  'mepr-address-one',
  'mepr-address-state',
  'mepr-address-two',
  'mepr-address-zip',
  'mepr_affiliation_element',
  'mepr_company',
  'mepr_current_unit',
  'mepr_mosid_moc_trade',
  'mepr_mosid_moc_trade_other',
  'mepr_post_nominals',
  'mepr_rank',
  'mepr_status',
  'mepr_user_message',
  'mlf_display_info',
  'nickname',
  'paying_customer',
  'ppscc_birthday_message',
  'rml_wpml_lang',
  'signup_notice_sent',
  'user_last_view_date',
  'user_last_view_date_events',
  'uuid',
  'wc_last_active',
  'wc_order_count_wp',
  'wfls-last-login',
  'wp_capabilities',
  'wp_user_level',
  'wpdiscuz_last_visit',
  'wpml_block_new_email_notifications',
  'wpseo_metadesc',
];

function validateHistory(row) {
  const data = row.legacyData;
  if (!data) return;
  if (
    !data.account ||
    !data.metadata ||
    Object.keys(data).some((k) => !['account', 'metadata'].includes(k)) ||
    String(data.account.ID) !== String(row.sourceUserId)
  )
    throw new Error('Invalid history identity');
  for (const [key, value] of Object.entries(data.account)) {
    if (!ACCOUNT_KEYS.includes(key) || typeof value !== 'string')
      throw new Error('Invalid history account field');
  }
  for (const [key, value] of Object.entries(data.metadata)) {
    if (
      !META_KEYS.includes(key) ||
      !Array.isArray(value) ||
      value.some((v) => typeof v !== 'string')
    )
      throw new Error('Invalid history metadata field');
  }
}

function historyHash(data) {
  return hash(JSON.stringify(data));
}
module.exports = { validateHistory, historyHash };
