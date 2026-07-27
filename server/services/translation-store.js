const fs = require('fs/promises');
const path = require('path');

const TRANSLATION_FILE = path.join(
  __dirname,
  '..',
  'data',
  'translations.json',
);

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'fr']);

let writeQueue = Promise.resolve();

function assertTranslationShape(translations) {
  if (
    !translations ||
    typeof translations !== 'object' ||
    Array.isArray(translations)
  ) {
    throw new Error('Translations must be an object');
  }

  SUPPORTED_LANGUAGES.forEach((language) => {
    if (
      !translations[language] ||
      typeof translations[language] !== 'object' ||
      Array.isArray(translations[language])
    ) {
      throw new Error(`Missing ${language} translations`);
    }
  });
}

async function readTranslations() {
  const fileContents = await fs.readFile(TRANSLATION_FILE, 'utf8');
  const translations = JSON.parse(fileContents);

  assertTranslationShape(translations);

  return translations;
}

async function writeTranslations(translations) {
  assertTranslationShape(translations);

  const tempFile = `${TRANSLATION_FILE}.tmp`;
  const body = `${JSON.stringify(translations, null, 2)}\n`;

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fs.writeFile(tempFile, body, 'utf8');
      await fs.rename(tempFile, TRANSLATION_FILE);
    });

  return writeQueue;
}

function getTranslationKeys(translations) {
  const keys = new Set();

  SUPPORTED_LANGUAGES.forEach((language) => {
    Object.keys(translations[language] || {}).forEach((key) => {
      keys.add(key);
    });
  });

  return Array.from(keys);
}

function getTranslationRows(translations) {
  return getTranslationKeys(translations).map((key) => {
    const values = {};

    SUPPORTED_LANGUAGES.forEach((language) => {
      values[language] =
        typeof translations[language]?.[key] === 'string'
          ? translations[language][key]
          : '';
    });

    return {
      key,
      values,
      missing: SUPPORTED_LANGUAGES.filter(
        (language) => !values[language].trim(),
      ),
    };
  });
}

function createTranslationsRuntime(translations) {
  const serializedTranslations = JSON.stringify(translations).replace(
    /</g,
    '\\u003c',
  );

  return `"use strict";

const translations = ${serializedTranslations};
const langToggle = document.getElementById("langToggle");
let currentLang = localStorage.getItem("lang") || "en";

if (!translations[currentLang]) {
  currentLang = "en";
}

function translate(key, replacements = {}, lang = currentLang) {
  let text = translations[lang]?.[key] ?? translations.en?.[key] ?? key;

  Object.entries(replacements).forEach(([name, value]) => {
    text = text.replaceAll(\`{\${name}}\`, String(value));
  });

  return text;
}

function applyLanguage(lang) {
  const nextLang = translations[lang] ? lang : "en";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = translate(key, {}, nextLang);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = translate(key, {}, nextLang);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    const key = el.getAttribute("data-i18n-aria-label");
    el.setAttribute("aria-label", translate(key, {}, nextLang));
  });

  document.documentElement.setAttribute("lang", nextLang);

  if (langToggle) {
    langToggle.textContent = nextLang === "en" ? "FR" : "EN";
  }

  localStorage.setItem("lang", nextLang);
  currentLang = nextLang;

  document.dispatchEvent(
    new CustomEvent("languagechange", {
      bubbles: true,
      detail: { language: nextLang }
    })
  );
}

function refreshTranslations(nextTranslations) {
  Object.keys(translations).forEach(language => {
    delete translations[language];
  });

  Object.assign(translations, nextTranslations);
  applyLanguage(currentLang);
}

if (langToggle) {
  langToggle.addEventListener("click", () => {
    applyLanguage(currentLang === "en" ? "fr" : "en");
  });
}

window.translations = translations;
window.translate = translate;
window.applyLanguage = applyLanguage;
window.refreshTranslations = refreshTranslations;
window.translationsReady = Promise.resolve(translations);

applyLanguage(currentLang);

document.dispatchEvent(
  new CustomEvent("translationready", {
    bubbles: true,
    detail: { language: currentLang }
  })
);
`;
}

module.exports = {
  SUPPORTED_LANGUAGES,
  createTranslationsRuntime,
  getTranslationRows,
  readTranslations,
  writeTranslations,
};
