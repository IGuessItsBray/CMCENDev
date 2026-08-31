const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const Event = require('../models/Event');
const LastPostMessage = require('../models/LastPostMessage');
const NewsArticle = require('../models/NewsArticle');
const RetirementMessage = require('../models/RetirementMessage');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_QUERY_LENGTH = 120;
const MAX_RESULTS = 30;
const MAX_RESULTS_PER_SOURCE = 10;

const STATIC_PAGES = [
  {
    path: '/awards',
    file: 'awards.html',
    type: 'page',
    title: { en: 'Awards', fr: 'Prix' },
  },
  {
    path: '/association_directors',
    file: 'association_directors.html',
    type: 'page',
    title: {
      en: 'Association Directors and Advisors',
      fr: 'Directeurs et conseillers de l’Association',
    },
  },
  {
    path: '/branch_advisory_council',
    file: 'branch_advisory_council.html',
    type: 'page',
    title: {
      en: 'Branch Advisory Council',
      fr: 'Conseil consultatif de la Branche',
    },
  },
  {
    path: '/ce_professions',
    file: 'ce_professions.html',
    type: 'page',
    title: {
      en: 'Communications & Electronics Professions',
      fr: 'Professions des communications et de l’électronique',
    },
  },
  {
    path: '/about-family',
    file: 'about-family.html',
    type: 'page',
    title: { en: 'About the C&E Family', fr: 'Famille des C et E' },
  },
  {
    path: '/about_branch',
    file: 'about_branch.html',
    type: 'page',
    title: {
      en: 'About the C&E Branch',
      fr: 'À propos de la Branche des C et E',
    },
  },
  {
    path: '/about_association',
    file: 'about_association.html',
    type: 'page',
    title: {
      en: 'About the C&E Association',
      fr: 'À propos de l’Association des C et E',
    },
  },
  {
    path: '/about_museum_foundation',
    file: 'about_museum_foundation.html',
    type: 'page',
    title: {
      en: 'About the C&E Museum & Foundation',
      fr: 'À propos du Musée et de la Fondation des C et E',
    },
  },
  {
    path: '/affiliate_offers',
    file: 'affiliate_offers.html',
    type: 'page',
    title: { en: 'Affiliates', fr: 'Affiliés' },
  },
  {
    path: '/calendar',
    file: 'calendar.html',
    type: 'page',
    title: { en: 'Events Calendar', fr: 'Calendrier des événements' },
  },
  {
    path: '/retirements',
    file: 'retirements.html',
    type: 'page',
    title: { en: 'Retirement Messages', fr: 'Retraites' },
    summary: {
      en: 'Browse retirement messages celebrating members of the C&E community.',
      fr: 'Parcourez les messages de retraite célébrant les membres de la communauté des C et E.',
    },
  },
  {
    path: '/certificates',
    file: 'certificates.html',
    type: 'page',
    title: { en: 'Certificates', fr: 'Certificats' },
  },
  {
    path: '/doctrine_hub',
    file: 'doctrine_hub.html',
    type: 'page',
    title: { en: 'Doctrine Hub', fr: 'Centre de doctrine' },
  },
  {
    path: '/governance',
    file: 'governance.html',
    type: 'page',
    title: { en: 'Governance', fr: 'Gouvernance' },
  },
  {
    path: '/bursaries',
    file: 'bursaries.html',
    type: 'page',
    title: { en: 'Bursaries and Education', fr: 'Bourses et éducation' },
  },
  {
    path: '/cfmws',
    file: 'cfmws.html',
    type: 'page',
    title: {
      en: 'Canadian Forces Morale and Welfare Services',
      fr: 'Services de bien-être et moral des Forces canadiennes',
    },
  },
  {
    path: '/history',
    file: 'history.html',
    type: 'page',
    title: { en: 'History', fr: 'Histoire' },
  },
  {
    path: '/last-post',
    file: 'last-post.html',
    type: 'page',
    title: { en: 'Last Post', fr: 'Dernière sonnerie' },
  },
  {
    path: '/honours_awards',
    file: 'honours_awards.html',
    type: 'page',
    title: { en: 'Honours and Awards', fr: 'Distinctions et prix' },
  },
  {
    path: '/leadership',
    file: 'leadership.html',
    type: 'page',
    title: { en: 'Leadership', fr: 'Leadership' },
  },
  {
    path: '/news_stories',
    file: 'news_stories.html',
    type: 'page',
    title: { en: 'News Stories', fr: 'Nouvelles' },
  },
  {
    path: '/promotions',
    file: 'promotions.html',
    type: 'page',
    title: { en: 'Promotions', fr: 'Promotions' },
  },
  {
    path: '/veteran_services',
    file: 'veteran_services.html',
    type: 'page',
    title: { en: 'Veteran Services', fr: 'Services aux vétérans' },
  },
  {
    path: '/submit-retirement',
    file: 'submit-retirement.html',
    type: 'page',
    title: {
      en: 'Submit a Retirement Message',
      fr: 'Soumettre un message de retraite',
    },
  },
  {
    path: '/support_troops',
    file: 'support_troops.html',
    type: 'page',
    title: { en: 'Support Our Troops', fr: 'Appuyons nos troupes' },
  },
  {
    path: '/standing_orders',
    file: 'standing_orders.html',
    type: 'page',
    title: { en: 'Standing Orders', fr: 'Ordres permanents' },
  },
];

function cleanQuery(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getQueryTerms(query) {
  return query
    .toLowerCase()
    .split(' ')
    .map((term) => term.trim())
    .filter(Boolean);
}

function getLocalizedText(value, language) {
  if (!value) return '';

  const preferred =
    typeof value[language] === 'string' ? value[language].trim() : '';

  if (preferred) return preferred;

  const fallbackLanguage = language === 'fr' ? 'en' : 'fr';

  return typeof value[fallbackLanguage] === 'string'
    ? value[fallbackLanguage].trim()
    : '';
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, maxLength = 220) {
  const text = normalizeText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function scoreText(queryTerms, fields) {
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();

  if (!haystack) return 0;

  return queryTerms.reduce((score, term) => {
    if (!haystack.includes(term)) {
      return score;
    }

    const exactWord = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    return score + (exactWord.test(haystack) ? 2 : 1);
  }, 0);
}

function scoreTitleMatch(query, queryTerms, title, type) {
  const normalizedQuery = normalizeText(query).toLowerCase();
  const normalizedTitle = normalizeText(title).toLowerCase();

  if (!normalizedQuery || !normalizedTitle) {
    return 0;
  }

  if (normalizedTitle === normalizedQuery) {
    // An exact navigation-page title is the clearest possible destination.
    return type === 'page' ? 10000 : 9000;
  }

  const leadingTitleWord = new RegExp(
    `^${escapeRegex(normalizedQuery)}s?\\b`,
    'i',
  );

  if (leadingTitleWord.test(normalizedTitle)) {
    return type === 'page' ? 7000 : 6000;
  }

  const exactPhrase = new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`, 'i');

  if (exactPhrase.test(normalizedTitle)) {
    return 5000;
  }

  const hasEveryQueryTerm = queryTerms.every((term) => {
    const exactWord = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    return exactWord.test(normalizedTitle);
  });

  if (hasEveryQueryTerm) {
    return 1000;
  }

  return scoreText(queryTerms, [normalizedTitle]) * 100;
}

function scoreSearchResult(query, queryTerms, { title, type, fields }) {
  return (
    scoreTitleMatch(query, queryTerms, title, type) +
    scoreText(queryTerms, fields)
  );
}

function sortResults(results) {
  return results
    .filter((result) => Boolean(result?.url))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightDate = right.date ? new Date(right.date).getTime() : 0;
      const leftDate = left.date ? new Date(left.date).getTime() : 0;

      return rightDate - leftDate;
    })
    .slice(0, MAX_RESULTS)
    .map(({ score, ...result }) => result);
}

async function searchLastPostMessages(query, queryTerms, language) {
  const fields = [
    'title',
    'slug',
    'deceased.fullRank',
    'deceased.firstName',
    'deceased.surname',
    'deceased.postNominal',
    'messages.en',
    'messages.fr',
  ];
  const andClauses = queryTerms.map((term) => {
    const regex = new RegExp(escapeRegex(term), 'i');
    return { $or: fields.map((field) => ({ [field]: regex })) };
  });
  const messages = await LastPostMessage.find({
    status: 'published',
    $and: andClauses,
  })
    .select('title deceased messages publishedAt createdAt')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(MAX_RESULTS_PER_SOURCE)
    .lean();

  return messages.map((message) => {
    const name = [
      message.deceased?.fullRank,
      message.deceased?.firstName,
      message.deceased?.surname,
    ]
      .filter(Boolean)
      .join(' ');
    const title = message.title || (name ? `Last Post: ${name}` : 'Last Post');
    const summary = truncate(getLocalizedText(message.messages, language));

    return {
      type: 'last-post-message',
      sourceId: String(message._id),
      title,
      summary,
      url: `/last-post-message?id=${encodeURIComponent(String(message._id))}`,
      date: message.publishedAt || message.createdAt || null,
      score: scoreSearchResult(query, queryTerms, {
        title,
        type: 'last-post-message',
        fields: [
          title,
          summary,
          message.messages?.en,
          message.messages?.fr,
          message.deceased?.fullRank,
          message.deceased?.firstName,
          message.deceased?.surname,
          message.deceased?.postNominal,
        ],
      }),
    };
  });
}

async function searchNewsStories(query, queryTerms, language) {
  const fields = ['title.en', 'title.fr', 'content.en', 'content.fr'];
  const andClauses = queryTerms.map((term) => {
    const regex = new RegExp(escapeRegex(term), 'i');
    return { $or: fields.map((field) => ({ [field]: regex })) };
  });
  const articles = await NewsArticle.find({
    status: 'published',
    $and: andClauses,
  })
    .select('title content publishedAt createdAt')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(MAX_RESULTS_PER_SOURCE)
    .lean();

  return articles.map((article) => {
    const title = getLocalizedText(article.title, language) || 'News story';
    const summary = truncate(getLocalizedText(article.content, language));

    return {
      type: 'news-story',
      sourceId: String(article._id),
      title,
      summary,
      url: `/news-story?id=${encodeURIComponent(String(article._id))}`,
      date: article.publishedAt || article.createdAt || null,
      score: scoreSearchResult(query, queryTerms, {
        title,
        type: 'news-story',
        fields: [
          title,
          summary,
          article.title?.en,
          article.title?.fr,
          article.content?.en,
          article.content?.fr,
        ],
      }),
    };
  });
}

async function searchEvents(query, queryTerms, language) {
  // Build per-term regex checks so multi-word queries can match across fields
  const fields = [
    'title.en',
    'title.fr',
    'description.en',
    'description.fr',
    'location.en',
    'location.fr',
    'city',
    'provinceRegion',
    'organizingEntity',
    'eventType',
  ];

  const andClauses = queryTerms.map((term) => {
    const regex = new RegExp(escapeRegex(term), 'i');
    return { $or: fields.map((f) => ({ [f]: regex })) };
  });

  const events = await Event.find({
    status: 'published',
    // require each search term to match at least one of the fields
    $and: andClauses,
  })
    .select(
      'title description location city provinceRegion organizingEntity eventType startDate createdAt',
    )
    .sort({ startDate: 1 })
    .limit(MAX_RESULTS_PER_SOURCE)
    .lean();

  return events.map((event) => {
    const title = getLocalizedText(event.title, language) || 'Event';
    const description = getLocalizedText(event.description, language);
    const location = getLocalizedText(event.location, language);
    const summary = truncate(
      [
        description,
        location,
        event.city,
        event.provinceRegion,
        event.organizingEntity,
        event.eventType,
      ]
        .filter(Boolean)
        .join(' '),
    );

    return {
      type: 'event',
      sourceId: String(event._id),
      title,
      summary,
      url: `/event?id=${encodeURIComponent(String(event._id))}`,
      date: event.startDate || event.createdAt || null,
      score: scoreSearchResult(query, queryTerms, {
        title,
        type: 'event',
        fields: [
          title,
          summary,
          event.city,
          event.provinceRegion,
          event.organizingEntity,
          event.eventType,
        ],
      }),
    };
  });
}

async function searchRetirementMessages(query, queryTerms) {
  // Build per-term regex checks so multi-word queries can match across retiree fields
  const fields = [
    'retiree.rank',
    'retiree.firstName',
    'retiree.lastName',
    'retiree.postNominals',
    'retiree.tradeRole',
    'messages.en',
    'messages.fr',
    'message',
    'submitter.unit',
  ];

  const andClauses = queryTerms.map((term) => {
    const regex = new RegExp(escapeRegex(term), 'i');
    return { $or: fields.map((f) => ({ [f]: regex })) };
  });

  const messages = await RetirementMessage.find({
    status: 'published',
    // require each search term to match at least one of the fields
    $and: andClauses,
  })
    .select('retiree message messageLanguage messages publishedAt createdAt')
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(MAX_RESULTS_PER_SOURCE)
    .lean();

  return messages.map((message) => {
    const retireeNameBase = [
      message.retiree?.rank,
      message.retiree?.firstName,
      message.retiree?.lastName,
    ]
      .filter(Boolean)
      .join(' ');

    const retireeName = [retireeNameBase, message.retiree?.postNominals]
      .filter(Boolean)
      .join(', ');

    const title = retireeName
      ? `Retirement message for ${retireeName}`
      : 'Retirement message';

    const messageText =
      message.messages?.en || message.messages?.fr || message.message;

    const summary =
      truncate(stripHtml(messageText)) ||
      (retireeName
        ? `Read the retirement message for ${retireeName}.`
        : 'Read this retirement message from the C&E community.');

    return {
      type: 'retirement-message',
      sourceId: String(message._id),
      title,
      summary,
      url: `/retirement-message?id=${encodeURIComponent(String(message._id))}`,
      date: message.publishedAt || message.createdAt || null,
      score: scoreSearchResult(query, queryTerms, {
        title,
        type: 'retirement-message',
        fields: [
          title,
          summary,
          message.messages?.en,
          message.messages?.fr,
          message.retiree?.tradeRole,
          message.retiree?.postNominals,
        ],
      }),
    };
  });
}

async function searchStaticPages(query, queryTerms, language) {
  const pages = await Promise.all(
    STATIC_PAGES.map(async (page) => {
      try {
        const html = await fs.readFile(
          path.join(PUBLIC_DIR, page.file),
          'utf8',
        );
        const text = normalizeText(stripHtml(html));
        const title = getLocalizedText(page.title, language);
        const summary =
          getLocalizedText(page.summary, language) || truncate(text);
        const score = scoreSearchResult(query, queryTerms, {
          title,
          type: page.type,
          fields: [page.title.en, page.title.fr, text],
        });

        if (score === 0) {
          return null;
        }

        return {
          type: page.type,
          sourceId: page.path,
          title,
          summary,
          url: page.path,
          date: null,
          score,
        };
      } catch (error) {
        console.error(`Could not search static page ${page.file}:`, error);
        return null;
      }
    }),
  );

  return pages.filter(Boolean).slice(0, MAX_RESULTS_PER_SOURCE);
}

// GET /api/search?q=query&lang=en
// Search public site content using a shared result protocol.
router.get('/', async (req, res) => {
  try {
    const query = cleanQuery(req.query.q);
    const language = req.query.lang === 'fr' ? 'fr' : 'en';

    if (query.length < 2) {
      return res.json({
        query,
        total: 0,
        results: [],
      });
    }

    const queryTerms = getQueryTerms(query);
    const [events, retirementMessages, lastPostMessages, newsStories, pages] =
      await Promise.all([
        searchEvents(query, queryTerms, language),
        searchRetirementMessages(query, queryTerms),
        searchLastPostMessages(query, queryTerms, language),
        searchNewsStories(query, queryTerms, language),
        searchStaticPages(query, queryTerms, language),
      ]);

    const results = sortResults([
      ...events,
      ...retirementMessages,
      ...lastPostMessages,
      ...newsStories,
      ...pages,
    ]);

    res.json({
      query,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Search failed:', error);

    res.status(500).json({
      error: 'Could not complete search',
    });
  }
});

module.exports = router;
