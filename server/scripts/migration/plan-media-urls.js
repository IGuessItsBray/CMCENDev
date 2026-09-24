// Read-only inventory. Never updates MongoDB or object storage.
require('dotenv').config({
  path: require('path').join(__dirname, '../../.env'),
  quiet: true,
});
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { collectMediaReferences } = require('./lib/media-url-plan');

async function main() {
  const args = process.argv.slice(2);
  const option = (name) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const from = option('from');
  const to = option('to');
  for (const value of [from, to]) {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Use public HTTP(S) base URLs without credentials, query strings, or fragments.',
      );
    }
  }
  if (
    args.some(
      (arg) =>
        arg !== '--database' &&
        !arg.startsWith('--from=') &&
        !arg.startsWith('--to='),
    )
  ) {
    throw new Error(
      'Supported options: --from=<public base> --to=<public base> [--database]. This tool cannot apply changes.',
    );
  }
  const references = [];
  const directory = path.join(__dirname, '../../public');
  const bundledImages = new Set([
    'images/ce-family-organization-chart.jpg',
    'images/foundation-students-pow-exhibit.jpg',
    'images/td-insurance-membership.gif',
  ]);
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(filename);
        continue;
      }
      if (!/\.(json|html|js|css)$/u.test(entry.name)) continue;
      const text = fs.readFileSync(filename, 'utf8');
      const value = entry.name.endsWith('.json') ? JSON.parse(text) : text;
      for (const ref of collectMediaReferences(value, from, to)) {
        references.push({
          file: path.relative(directory, filename),
          ...ref,
          ...(bundledImages.has(ref.key)
            ? { sourceKey: undefined, sourceFile: `server/public/${ref.key}` }
            : {}),
        });
      }
    }
  }
  scan(directory);
  if (args.includes('--database')) {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 15000,
    });
    // Explicit content collections: excludes accounts, credentials, queues and audit logs.
    for (const collection of [
      'newsarticles',
      'events',
      'retirementmessages',
      'lastpostmessages',
      'pages',
      'mediaassets',
      'professionalawards',
      'navigationitems',
    ]) {
      for await (const document of mongoose.connection.db
        .collection(collection)
        .find({})) {
        for (const ref of collectMediaReferences(document, from, to)) {
          references.push({ collection, id: String(document._id), ...ref });
        }
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        databaseScanned: args.includes('--database'),
        from,
        to,
        references,
        objectKeys: [...new Set(references.map((ref) => ref.key))].sort(),
        objectCopies: [
          ...new Map(
            references.map((ref) => [
              JSON.stringify([ref.sourceFile || ref.sourceKey, ref.key]),
              {
                sourceKey: ref.sourceKey,
                sourceFile: ref.sourceFile,
                destinationKey: ref.key,
              },
            ]),
          ).values(),
        ],
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(
      `Inventory failed (${error.name}). Check arguments and connectivity. Connection details are not printed.`,
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
