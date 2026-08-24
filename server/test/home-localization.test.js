const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const publicDirectory = path.join(__dirname, '..', 'public');
const translations = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'data', 'translations.json'),
    'utf8',
  ),
);

function translationKeys(source) {
  return Array.from(
    source.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/gu),
  ).map((match) => match[1]);
}

test('localizes the homepage news section and shared navigation labels', () => {
  const homeMarkup = fs.readFileSync(
    path.join(publicDirectory, 'index.html'),
    'utf8',
  );
  const sharedNavigation = fs.readFileSync(
    path.join(publicDirectory, 'index.js'),
    'utf8',
  );
  const keys = new Set([
    ...translationKeys(homeMarkup),
    ...translationKeys(sharedNavigation),
  ]);

  [
    'home_news_eyebrow',
    'home_news_title',
    'home_news_intro',
    'home_browse_news',
    'home_news_loading',
    'home_news_aria_label',
    'mobile_menu_open',
    'terms_of_use',
    'footer_credit',
  ].forEach((key) => {
    assert.ok(keys.has(key), `${key} is used by the public interface`);
    assert.ok(translations.en[key]?.trim(), `${key} has English text`);
    assert.ok(translations.fr[key]?.trim(), `${key} has French text`);
  });

  assert.match(
    sharedNavigation,
    /getInterfaceTranslation\("mobile_menu_close"/u,
  );
  assert.ok(translations.en.mobile_menu_close?.trim());
  assert.ok(translations.fr.mobile_menu_close?.trim());
});

test('keeps legacy banner copy visible when French contains the countdown placeholder', () => {
  const timersScript = fs.readFileSync(
    path.join(publicDirectory, 'timers.js'),
    'utf8',
  );

  assert.match(timersScript, /function getTimerMessage\(timer\)/u);
  assert.match(timersScript, /!timer\.countdownAt/u);
  assert.match(timersScript, /compte à rebours/iu);
  assert.match(timersScript, /return englishText;/u);
});
