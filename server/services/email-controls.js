const EmailControl = require('../models/EmailControl');

const CATEGORIES = Object.freeze(['account', 'operational', 'weekly', 'news']);

async function getEmailControls() {
  const saved = await EmailControl.findById('site').lean();
  return Object.fromEntries(
    CATEGORIES.map((key) => [key, saved?.[key] === true]),
  );
}

async function isCategoryEnabled(category) {
  if (!CATEGORIES.includes(category)) return false;
  const controls = await getEmailControls();
  return controls[category];
}

async function setEmailControl(category, enabled) {
  if (!CATEGORIES.includes(category) || typeof enabled !== 'boolean') {
    throw new TypeError('Invalid email control');
  }
  await EmailControl.updateOne(
    { _id: 'site' },
    { $set: { [category]: enabled } },
    { upsert: true },
  );
  return getEmailControls();
}

module.exports = {
  CATEGORIES,
  getEmailControls,
  isCategoryEnabled,
  setEmailControl,
};
