const { SOURCE, mapKey } = require('./account-import');
const { validateHistory } = require('./account-history');

const FIELDS = {
  description: 'biography',
  user_url: 'websiteUrl',
  facebook: 'socialLinks.facebook',
  first_name: 'firstName',
  last_name: 'lastName',
  'mepr-address-one': 'address.line1',
  'mepr-address-two': 'address.line2',
  'mepr-address-city': 'address.city',
  'mepr-address-country': 'address.country',
  'mepr-address-state': 'address.stateProvince',
  'mepr-address-zip': 'address.postalCode',
  mepr_rank: 'rank',
  mepr_post_nominals: 'postNominals',
  mepr_company: 'company',
  mepr_status: 'status',
  mepr_affiliation_element: 'affiliationElement',
  mepr_mosid_moc_trade: 'trade',
  mepr_mosid_moc_trade_other: 'tradeOther',
  mepr_current_unit: 'currentUnit',
  Phone: 'phone',
};
const get = (object, key) => key.split('.').reduce((v, k) => v?.[k], object);
const blank = (value) => value === undefined || value === null || value === '';

function profileRows(input) {
  if (
    input?.source !== SOURCE ||
    !Array.isArray(input.users) ||
    !input.users.length
  )
    throw new Error('Invalid profile source');
  const ids = new Set();
  for (const row of input.users) {
    if (
      !Number.isSafeInteger(row.sourceUserId) ||
      row.sourceUserId <= 0 ||
      ids.has(row.sourceUserId) ||
      !row.meta ||
      typeof row.meta !== 'object'
    )
      throw new Error('Invalid profile identity');
    ids.add(row.sourceUserId);
    validateHistory(row);
    for (const [key, values] of Object.entries(row.meta)) {
      if (
        ![...Object.keys(FIELDS), 'locale', 'icl_admin_language'].includes(
          key,
        ) ||
        !Array.isArray(values) ||
        values.some((v) => typeof v !== 'string')
      )
        throw new Error('Unexpected profile metadata');
    }
  }
  return input.users;
}

async function planProfile(row, user, mapping, User) {
  if (
    !mapping ||
    mapping._id !== mapKey(row) ||
    mapping.source !== SOURCE ||
    mapping.sourceUserId !== row.sourceUserId ||
    mapping.state !== 'complete' ||
    String(mapping.userId) !== String(user?._id)
  )
    throw new Error('Account import must finish before profile backfill');
  const set = {};
  const issues = [];
  let unchanged = 0;
  const untouched =
    user.createdAt &&
    user.updatedAt &&
    mapping.completedAt &&
    +new Date(user.createdAt) === +new Date(user.updatedAt) &&
    +new Date(user.updatedAt) <= +new Date(mapping.completedAt);
  const candidates = { ...row.meta };
  const locale = candidates.locale?.filter(Boolean) || [];
  const language = locale.length ? locale : candidates.icl_admin_language || [];
  if (language.length)
    candidates.preferredLanguage = language.map(
      (v) =>
        ({
          en_US: 'en',
          en_CA: 'en',
          fr_CA: 'fr',
          fr_FR: 'fr',
          en: 'en',
          fr: 'fr',
        })[v] || v,
    );
  for (const [source, target] of Object.entries({
    ...FIELDS,
    preferredLanguage: 'preferredLanguage',
  })) {
    const values = [
      ...new Set(
        (candidates[source] || []).map((v) => v.trim()).filter(Boolean),
      ),
    ];
    if (!values.length) continue;
    if (values.length !== 1) {
      issues.push({ field: target, reason: 'conflicting-source-values' });
      continue;
    }
    let value = values[0];
    if (target === 'affiliationElement' && value === 'air-force')
      value = 'air_force';
    // Use the application's setters and field validators, without requiring
    // missing profile fields or changing completion, login or security state.
    const probe = new User({ profileComplete: false });
    probe.set(target, value);
    value = probe.get(target);
    try {
      await probe.validate([target]);
    } catch {
      issues.push({ field: target, reason: 'invalid-source-value' });
      continue;
    }
    const current = get(user, target);
    if (current === value) {
      unchanged += 1;
      continue;
    }
    if (
      !blank(current) &&
      !(target === 'preferredLanguage' && current === 'en' && untouched)
    ) {
      issues.push({ field: target, reason: 'existing-value-preserved' });
      continue;
    }
    set[target] = value;
  }
  return { set, issues, unchanged };
}

// Compare-and-set each original field plus updatedAt: concurrent user changes
// cause a skip, never an overwrite. Dot paths preserve other address fields.
function profileFilter(user, fields) {
  const filter = { _id: user._id };
  for (const key of [...fields, 'updatedAt']) {
    const value = get(user, key);
    filter[key] = value === undefined ? { $exists: false } : { $eq: value };
  }
  return filter;
}

module.exports = { FIELDS, get, profileRows, planProfile, profileFilter };
