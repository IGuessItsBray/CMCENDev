// Disposable local fixtures only. No staging connection or scheduler startup.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'local-heritage-preview-only';
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Page = require('../models/Page');
const NewsArticle = require('../models/NewsArticle');

async function main() {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGO_URI);
  const userId = new mongoose.Types.ObjectId();
  const imageUrl = '/images/foundation-students-pow-exhibit.jpg';
  await NewsArticle.create([
    {
      category: 'history-heritage',
      status: 'published',
      createdBy: userId,
      title: {
        en: 'Heritage Moments: preserving our stories',
        fr: 'Moments du patrimoine : préserver nos récits',
      },
      content: {
        en: 'Local preview fixture. Explore how the C&E community preserves its stories for future generations.',
        fr: 'Exemple local. Découvrez comment la communauté des C et E préserve ses récits pour les générations futures.',
      },
      imageUrl,
      imageDisplayUrl: imageUrl,
      publishedAt: new Date('2026-10-12'),
      originalPublishedAt: new Date('2017-04-09'),
    },
    {
      category: 'history-heritage',
      status: 'published',
      createdBy: userId,
      title: { en: 'A living heritage', fr: 'Un patrimoine vivant' },
      content: {
        en: 'Local preview fixture. New stories join this collection automatically when published in the History & Heritage category.',
        fr: 'Exemple local. De nouveaux récits rejoignent automatiquement cette collection lors de leur publication dans la catégorie Histoire et patrimoine.',
      },
      imageUrl,
      imageDisplayUrl: imageUrl,
      publishedAt: new Date('2026-10-10'),
    },
    {
      category: 'history-heritage',
      status: 'draft',
      createdBy: userId,
      title: { en: 'Excluded draft article' },
      content: { en: 'This draft must never appear.' },
    },
  ]);
  await Page.create({
    slug: 'ce-branch-battlefield-tour-vimy',
    category: 'history-heritage',
    status: 'published',
    title: {
      en: 'Heritage Events - 2017',
      fr: 'Événements patrimoniaux - 2017',
    },
    summary: {
      en: 'Local fixture for the selected Vimy page. The actual Vimy record remains a draft.',
      fr: 'Exemple local de la page Vimy sélectionnée. La véritable page Vimy reste un brouillon.',
    },
    legacy: { source: 'local-fixture' },
    publishedAt: new Date('2026-10-11'),
    originalPublishedAt: new Date('2017-04-09'),
    blocks: [
      {
        type: 'heading',
        text: {
          en: 'Vimy: remembering together',
          fr: 'Vimy : se souvenir ensemble',
        },
        underline: true,
      },
      {
        type: 'text',
        body: {
          en: 'Disposable preview content using the existing page-builder renderer. This is not a copy or publication of the live Vimy draft.',
          fr: 'Contenu temporaire utilisant le moteur de pages existant. Ceci ne publie pas le brouillon Vimy.',
        },
      },
      {
        type: 'image',
        mediaUrl: imageUrl,
        imageFit: 'natural',
        alt: { en: 'Museum exhibit', fr: 'Exposition du musée' },
      },
    ],
  });
  await Page.create([
    {
      slug: 'unselected-preview-page',
      status: 'published',
      title: { en: 'Unselected fixture page' },
    },
    {
      slug: 'draft-heritage-preview-page',
      category: 'history-heritage',
      status: 'draft',
      title: { en: 'Excluded heritage draft page' },
    },
  ]);
  const { app } = require('../server');
  const server = app.listen(3105, '127.0.0.1', () =>
    console.log(
      'Heritage fixture preview: http://127.0.0.1:3105/history-heritage',
    ),
  );
  const stop = async () => {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
