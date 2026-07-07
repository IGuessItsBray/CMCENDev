const express = require('express');
const {
  authMiddleware,
  requirePermission
} = require('../middleware/auth');
const {
  SUPPORTED_LANGUAGES,
  createTranslationsRuntime,
  getTranslationRows,
  readTranslations,
  writeTranslations
} = require('../services/translation-store');
const { writeAuditLog } = require('../services/audit-log');

const router = express.Router();

function getEditableValues(body) {
  const values = {};

  SUPPORTED_LANGUAGES.forEach(language => {
    if (Object.prototype.hasOwnProperty.call(body, language)) {
      values[language] = body[language];
    }
  });

  return values;
}

function sendReadError(res, error) {
  console.error('Translation read failed:', error);
  res.status(500).json({ error: 'Could not load translations' });
}

router.get('/translations.json', async (req, res) => {
  try {
    const translations = await readTranslations();

    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.json(translations);
  } catch (error) {
    sendReadError(res, error);
  }
});

router.get('/translations.js', async (req, res) => {
  try {
    const translations = await readTranslations();

    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.send(createTranslationsRuntime(translations));
  } catch (error) {
    console.error('Translation runtime generation failed:', error);
    res.status(500).type('application/javascript').send(
      'console.error("Could not load translations.");'
    );
  }
});

router.get(
  '/api/translations',
  authMiddleware,
  requirePermission('canManageTranslations'),
  async (req, res) => {
    try {
      const translations = await readTranslations();

      res.json({
        translations,
        rows: getTranslationRows(translations)
      });
    } catch (error) {
      sendReadError(res, error);
    }
  }
);

router.patch(
  '/api/translations/:key',
  authMiddleware,
  requirePermission('canManageTranslations'),
  async (req, res) => {
    try {
      const key = String(req.params.key || '').trim();

      if (!key) {
        return res.status(400).json({ error: 'Translation key is required' });
      }

      const translations = await readTranslations();
      const existingKey = SUPPORTED_LANGUAGES.some(language =>
        Object.prototype.hasOwnProperty.call(translations[language], key)
      );

      if (!existingKey) {
        return res.status(404).json({ error: 'Translation key not found' });
      }

      const values = getEditableValues(req.body || {});
      const languages = Object.keys(values);

      if (!languages.length) {
        return res.status(400).json({
          error: 'At least one translation value is required'
        });
      }

      for (const language of languages) {
        if (typeof values[language] !== 'string') {
          return res.status(400).json({
            error: `${language} translation must be text`
          });
        }
      }

      const previousValues = {};
      const newValues = {};
      const changedLanguages = [];

      languages.forEach(language => {
        const previousValue = translations[language][key] || '';
        const nextValue = values[language].trim();

        previousValues[language] = previousValue;
        newValues[language] = nextValue;
        translations[language][key] = nextValue;

        if (previousValue !== nextValue) {
          changedLanguages.push(language);
        }
      });

      await writeTranslations(translations);

      if (changedLanguages.length) {
        await writeAuditLog({
          action: 'translation.updated',
          actor: req.user,
          targetType: 'translation',
          targetSnapshot: { key },
          metadata: {
            key,
            changedLanguages,
            previousValues: changedLanguages.reduce((result, language) => {
              result[language] = previousValues[language];
              return result;
            }, {}),
            newValues: changedLanguages.reduce((result, language) => {
              result[language] = newValues[language];
              return result;
            }, {})
          }
        });
      }

      res.json({
        key,
        values: SUPPORTED_LANGUAGES.reduce((result, language) => {
          result[language] = translations[language][key] || '';
          return result;
        }, {})
      });
    } catch (error) {
      console.error('Translation update failed:', error);
      res.status(500).json({ error: 'Could not update translation' });
    }
  }
);

module.exports = router;
