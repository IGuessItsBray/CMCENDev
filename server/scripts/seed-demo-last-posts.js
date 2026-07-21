const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

const mongoose = require('mongoose');
const LastPostMessage = require('../models/LastPostMessage');

const DEMO_LAST_POSTS = [
  {
    legacy: {
      source: 'demo',
      postId: 910001,
      postType: 'last-post-demo'
    },
    deceased: {
      fullRank: 'LCol',
      firstName: 'Arthur',
      surname: 'MacLaren',
      postNominal: 'CD'
    },
    submitter: {
      rank: 'Maj',
      firstName: 'Elena',
      lastName: 'Ward',
      email: 'elena.ward@cmcen-demo.invalid'
    },
    title: 'LCol Arthur MacLaren, CD',
    messageLanguage: 'en',
    message:
      'It is with deep respect that we mark the passing of LCol Arthur MacLaren, CD. Throughout a career devoted to the C&E community, Arthur was known for his steady judgment, quiet humour, and unfailing attention to the people beside him.\n\nWhether at a field headquarters, in the classroom, or among old friends, he made time to listen and to offer practical counsel. His example of service and fellowship will remain with all who had the privilege to know him.\n\nThe C&E Family extends its sincere condolences to his family, friends, and former colleagues.',
    imageUrl: '/images/jimmy.jpg',
    status: 'published',
    publishedAt: new Date('2026-07-08T12:00:00.000Z')
  },
  {
    legacy: {
      source: 'demo',
      postId: 910002,
      postType: 'last-post-demo'
    },
    deceased: {
      fullRank: 'Adj',
      firstName: 'Claire',
      surname: 'Beaulieu',
      postNominal: 'CD'
    },
    submitter: {
      rank: 'Capt',
      firstName: 'Marc',
      lastName: 'Gagnon',
      email: 'marc.gagnon@cmcen-demo.invalid'
    },
    title: 'Adj Claire Beaulieu, CD',
    messageLanguage: 'fr',
    message:
      'C’est avec une profonde reconnaissance que nous soulignons le décès de l’adj Claire Beaulieu, CD. Claire a servi la communauté des C et E avec compétence, bienveillance et une loyauté sans faille envers les personnes qui l’entouraient.\n\nSa présence calme, son sens du devoir et sa générosité envers les jeunes membres ont marqué toutes les équipes auxquelles elle a appartenu. Son souvenir demeurera vivant auprès de sa famille, de ses amis et de ses collègues.\n\nLa famille des C et E offre ses plus sincères condoléances à tous ceux et celles qui l’ont connue.',
    imageUrl: '',
    status: 'published',
    publishedAt: new Date('2026-06-18T12:00:00.000Z')
  }
];

async function seedDemoLastPosts() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  try {
    for (const lastPost of DEMO_LAST_POSTS) {
      await LastPostMessage.findOneAndUpdate(
        {
          'legacy.source': lastPost.legacy.source,
          'legacy.postId': lastPost.legacy.postId
        },
        { $set: lastPost },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true
        }
      );
    }

    console.log(`Seeded ${DEMO_LAST_POSTS.length} demo Last Post notices.`);
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoLastPosts().catch(error => {
  console.error('Could not seed demo Last Post notices:', error);
  process.exitCode = 1;
});
