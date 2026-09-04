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
    'search_button_label',
    'social_media',
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

test('uses French translations for the reported shared homepage controls', () => {
  const sharedNavigation = fs.readFileSync(
    path.join(publicDirectory, 'index.js'),
    'utf8',
  );

  [
    ['search_button_label', 'Rechercher'],
    ['social_media', 'Médias sociaux'],
    ['terms_of_use', 'Conditions d’utilisation'],
    ['footer_credit', 'Fait avec ♥ par Bray et Eric'],
  ].forEach(([key, expectedFrenchText]) => {
    assert.match(
      sharedNavigation,
      new RegExp(`data-i18n(?:-aria-label)?="${key}"`, 'u'),
      `${key} is applied by the shared header or footer`,
    );
    assert.equal(translations.fr[key], expectedFrenchText);
  });
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

test('renders managed banners as readable status notices without marquee motion', () => {
  const timersScript = fs.readFileSync(
    path.join(publicDirectory, 'timers.js'),
    'utf8',
  );
  const styles = fs.readFileSync(
    path.join(publicDirectory, 'styles.css'),
    'utf8',
  );

  assert.match(
    timersScript,
    /banner\.setAttribute\(\s*"role",\s*"status"\s*\)/u,
  );
  assert.match(timersScript, /site-timer-accent/u);
  assert.doesNotMatch(timersScript, /is-marquee|site-timer-marquee/u);
  assert.match(styles, /\.site-timer-accent/u);
  assert.doesNotMatch(styles, /site-timer-marquee/u);
});

test('allows a visitor to dismiss one banner locally for 24 hours', () => {
  const timersScript = fs.readFileSync(
    path.join(publicDirectory, 'timers.js'),
    'utf8',
  );
  const styles = fs.readFileSync(
    path.join(publicDirectory, 'styles.css'),
    'utf8',
  );

  assert.match(
    timersScript,
    /TIMER_DISMISSAL_DURATION_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/u,
  );
  assert.match(timersScript, /localStorage\.setItem\(/u);
  assert.match(timersScript, /site-timer-dismiss/u);
  assert.match(timersScript, /site-timer-dismiss-icon/u);
  assert.match(timersScript, /root\.addEventListener\("click"/u);
  assert.doesNotMatch(timersScript, /window\.setTimeout\(/u);
  assert.match(timersScript, /if\s*\(hasVisibleCountdown\(\)\)/u);
  assert.match(styles, /\.site-timer-dismiss/u);
  assert.match(styles, /\.site-timer-dismiss-icon/u);
});

test('localizes the public news listing heading and description', () => {
  const markup = fs.readFileSync(
    path.join(publicDirectory, 'news_stories.html'),
    'utf8',
  );
  const keys = new Set(translationKeys(markup));

  [
    ['news_listing_eyebrow', 'Nouvelles et événements'],
    ['news_listing_heading', 'Articles de nouvelles'],
    [
      'news_listing_intro',
      'Mises à jour, récits et annonces de l’ensemble de la famille des C et E.',
    ],
    ['news_listing_loading', 'Chargement des articles de nouvelles…'],
    ['news_listing_aria_label', 'Articles de nouvelles publiés'],
  ].forEach(([key, expectedFrenchText]) => {
    assert.ok(keys.has(key), `${key} is used by the news listing`);
    assert.ok(translations.en[key]?.trim(), `${key} has English text`);
    assert.equal(translations.fr[key], expectedFrenchText);
  });
});
