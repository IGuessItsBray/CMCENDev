require('dotenv').config({
  path: require('node:path').join(__dirname, '../../.env'),
  quiet: true,
});
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const NewsArticle = require('../../models/NewsArticle');
const User = require('../../models/User');
const { getUserPermissions } = require('../../config/permissions');
const { writeAuditLog } = require('../../services/audit-log');
const { linkMediaAssetToSource } = require('../../services/media-assets');
const { imageUrls, plainText } = require('../../public/newsletter-format');
const { normalizeBlocks } = require('../../services/newsletter-content');
const { recordContentRevision } = require('../../services/content-revisions');

function inline(nodes) {
  return nodes
    .map((node) => {
      if (typeof node === 'string') return node;
      if (node.type === 'br') return '\n';
      const text = inline(node.children || []);
      if (node.type === 'link') return `[${text}](${node.href})`;
      if (node.type === 'strong') return `**${text}**`;
      if (node.type === 'em') return `_${text}_`;
      throw new Error('Unsupported inline content');
    })
    .join('');
}
function legacyContent(issue) {
  return issue.blocks
    .map((block) => {
      if (block.type === 'heading') return `## ${block.text}`;
      if (block.type === 'paragraph') return inline(block.children);
      if (block.type === 'list')
        return block.items.map((item) => `- ${inline(item)}`).join('\n');
      if (block.type === 'figure') {
        const image = issue.images[block.image];
        return `![${image.alt}](${image.url})${block.caption ? `\n\n${block.caption}` : ''}`;
      }
      throw new Error('Unsupported article block');
    })
    .join('\n\n');
}
function convert(issue) {
  const blocks = normalizeBlocks(
    issue.blocks.map((block) =>
      block.type === 'figure'
        ? { ...block, image: issue.images[block.image] }
        : block,
    ),
  );
  const cover =
    issue.images.crest ||
    issue.images.featured ||
    Object.values(issue.images)[0];
  return {
    migrationSource: issue.sourceUrl,
    layout: 'newsletter',
    newsletter: {
      author: issue.author,
      issue: issue.issue,
      kicker: issue.kicker,
      date: issue.publishedAt,
      language: issue.language,
      sourceUrl: issue.sourceUrl,
      headerCrest: Boolean(issue.images.crest),
      archived: true,
    },
    title: { [issue.language]: issue.title },
    content: { [issue.language]: plainText(blocks) },
    newsletterBlocks: { en: [], fr: [], [issue.language]: blocks },
    imageUrl: cover.url,
    imageDisplayUrl: cover.url,
    status: 'draft',
  };
}
async function main() {
  const apply = process.argv.includes('--apply');
  const directory = path.join(__dirname, 'import/newsletters');
  const issues = await Promise.all(
    (await fs.readdir(directory))
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map(async (file) =>
        JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')),
      ),
  );
  const drafts = issues.map(convert);
  for (const draft of drafts) {
    const error = new NewsArticle({
      ...draft,
      createdBy: new mongoose.Types.ObjectId(),
    }).validateSync();
    if (error) throw error;
    if (draft.content[draft.newsletter.language].length > 20000)
      throw new Error('Article exceeds News content limit');
  }
  if (!apply) {
    console.log(`Validated ${drafts.length} newsletter drafts; no writes.`);
    return;
  }
  const actorId = process.argv
    .find((value) => value.startsWith('--actor='))
    ?.slice(8);
  if (!mongoose.isValidObjectId(actorId))
    throw new Error('Use --actor=<administrator-id>');
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const actor = await User.findById(actorId);
  if (!actor || !getUserPermissions(actor).canManageNews)
    throw new Error('Import actor must have canManageNews');
  await NewsArticle.init();
  const results = [];
  for (const draft of drafts) {
    let article = await NewsArticle.findOne({
      migrationSource: draft.migrationSource,
    });
    if (!article) {
      article = await NewsArticle.create({ ...draft, createdBy: actor._id });
      await writeAuditLog({
        action: 'content.created',
        actor,
        targetType: 'newsArticle',
        target: article._id,
        targetSnapshot: {
          title: draft.title[draft.newsletter.language],
          status: 'draft',
        },
        metadata: {
          source: 'newsletter-migration',
          sourceUrl: draft.migrationSource,
        },
      });
    } else if (
      process.argv.includes('--upgrade-structured') &&
      !['en', 'fr'].some(
        (language) => article.newsletterBlocks?.[language]?.length,
      )
    ) {
      const issue = issues.find(
        (value) => value.sourceUrl === draft.migrationSource,
      );
      if (
        article.status !== 'draft' ||
        article.content[issue.language] !== legacyContent(issue) ||
        article.content[issue.language === 'en' ? 'fr' : 'en']
      )
        throw new Error(
          'Existing article was edited; refusing to replace its body',
        );
      const before = {
        content: article.content.toObject(),
        newsletterBlocks: article.newsletterBlocks?.toObject?.() || {},
      };
      article.newsletterBlocks = draft.newsletterBlocks;
      article.content = draft.content;
      article.newsletter.archived = true;
      await article.save();
      await recordContentRevision({
        contentType: 'newsArticle',
        content: article,
        actor,
        status: article.status,
        fields: ['content', 'newsletterBlocks'],
        before,
        after: {
          content: draft.content,
          newsletterBlocks: draft.newsletterBlocks,
        },
        note: 'Preserve source blocks, captions and image variants in the article editor.',
      });
      await writeAuditLog({
        action: 'content.updated',
        actor,
        targetType: 'newsArticle',
        target: article._id,
        metadata: { source: 'newsletter-structured-migration' },
      });
    }
    for (const mediaUrl of new Set([article.imageUrl, ...imageUrls(article)]))
      await linkMediaAssetToSource({
        mediaUrl,
        sourceType: 'newsArticle',
        context: 'newsletter',
        sourceModel: 'NewsArticle',
        sourceId: article._id,
        sourceField: mediaUrl === article.imageUrl ? 'imageUrl' : 'content',
        sourceUrl: `/news-story?id=${article._id}`,
        inferredName: article.title.en || article.title.fr,
      });
    results.push({
      sourceUrl: draft.migrationSource,
      id: String(article._id),
      status: article.status,
      pageUrl: `/newsletter?id=${article._id}`,
      previewUrl: `/newsletter?id=${article._id}&preview=1`,
    });
  }
  await fs.writeFile(
    path.join(__dirname, 'import/newsletter-articles.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(JSON.stringify(results));
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(`Newsletter import failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
module.exports = { convert };
