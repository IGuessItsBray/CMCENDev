// Explicit operator CLI. Never loads dotenv, mail, user creation or private account profiles.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { parseArgs } = require('./lib/args');
const {
  digest,
  bytesDigest,
  validateManifest,
  runContentImport,
} = require('./lib/content-import');
const {
  freezeContentPackage,
  mediaReader,
  validateFrozenModels,
  prepareBestMedia,
} = require('./lib/content-import-package');

function journalWriter(file) {
  const fd = fs.openSync(file, 'a', 0o600);
  return {
    append: async (event) => {
      fs.writeSync(fd, JSON.stringify(event) + '\n');
      fs.fsyncSync(fd);
    },
    close: () => fs.closeSync(fd),
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  const allowed = [
    '_',
    'input',
    'identity-plan',
    'media-root',
    'output',
    'prepare',
    'select-media',
    'metadata-root',
    'apply',
    'authorization',
    'journal',
    'expected-origin',
    'expected-database',
  ];
  for (const name of ['prepare', 'apply', 'select-media'])
    assert(
      args[name] === undefined || args[name] === true,
      'Boolean flags take no value',
    );
  assert(
    !args._.length &&
      !Object.keys(args).some((k) => !allowed.includes(k)) &&
      args.input &&
      args['media-root'],
  );
  assert(!args.prepare || !args.apply);
  assert(!args['select-media'] || (!args.prepare && !args.apply));
  const models = Object.fromEntries(
    ['RetirementMessage', 'LastPostMessage', 'Comment', 'MediaAsset'].map(
      (name) => [name, require(`../../models/${name}`)],
    ),
  );
  const { buildPublicMediaUrl } = require('../../services/media-library');
  const input = JSON.parse(fs.readFileSync(args.input));
  const readMedia = mediaReader(args['media-root']);
  if (args['select-media']) {
    assert(args.output);
    const metadata = args['metadata-root']
      ? fs
          .readdirSync(args['metadata-root'])
          .filter((name) => /^media-\d+\.json$/.test(name))
          .map((name) =>
            JSON.parse(fs.readFileSync(path.join(args['metadata-root'], name))),
          )
      : [];
    for (const m of input.media) {
      if (!m.wordpressMediaId || m.wordpressMetadata || m.existingAssetId)
        continue;
      const local = metadata.find((d) => d.id === m.wordpressMediaId);
      if (local) {
        m.wordpressMetadata = local;
        continue;
      }
      try {
        const source = new URL(m.sourceUrl);
        assert(source.origin === 'https://cmcen-rcmce.ca');
        const response = await fetch(
          `${source.origin}/wp-json/wp/v2/media/${m.wordpressMediaId}`,
          { signal: AbortSignal.timeout(15000), redirect: 'error' },
        );
        if (response.ok) m.wordpressMetadata = await response.json();
      } catch {
        /* Missing metadata preserves the known source and flags it. */
      }
    }
    const result = await prepareBestMedia({
      batch: input,
      readMedia,
      metadata,
      fetchImage: async (url) => {
        const response = await fetch(url, {
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        });
        assert(response.ok);
        return require('./lib/content-import-storage').bounded(
          response.body,
          32 * 1024 * 1024,
        );
      },
      writeMedia: async (m, bytes) => {
        const file = path.join(fs.realpathSync(args['media-root']), m.filename);
        if (fs.existsSync(file))
          assert.equal(bytesDigest(fs.readFileSync(file)), m.sha256);
        else fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
      },
    });
    fs.writeFileSync(
      args.output,
      JSON.stringify(
        {
          ...result.batch,
          mediaSelectionReport: result.choices,
          preparationOnly: true,
          identityPlanMustBeRegenerated: true,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        preparationOnly: true,
        images: result.choices.length,
        upgraded: result.choices.filter((c) => c.upgraded).length,
        identityPlanMustBeRegenerated: true,
      }),
    );
    return;
  }
  if (args.prepare) {
    assert(args.output && args['identity-plan']);
    const identity = JSON.parse(fs.readFileSync(args['identity-plan']));
    const manifest = await freezeContentPackage({
      batch: input,
      identity,
      models,
      buildPublicMediaUrl,
      readMedia,
    });
    fs.writeFileSync(args.output, JSON.stringify(manifest, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        preparationOnly: true,
        groups: manifest.groups.length,
        manifestDigest: digest(manifest),
      }),
    );
    return;
  }
  const manifest = input;
  validateManifest(manifest);
  await validateFrozenModels(manifest, models);
  assert(
    args['expected-origin'] === manifest.targetOrigin &&
      new URL(process.env.APP_BASE_URL || '').origin === manifest.targetOrigin,
    'Target origin mismatch',
  );
  assert(args['expected-database'] && process.env.MONGO_URI);
  const authorization = args.authorization
    ? JSON.parse(fs.readFileSync(args.authorization))
    : null;
  if (args.apply)
    assert(
      authorization && args.journal,
      'Apply requires owner authorization and journal',
    );
  const client = new mongoose.mongo.MongoClient(process.env.MONGO_URI);
  let journal;
  try {
    await client.connect();
    const db = client.db();
    assert.equal(db.databaseName, args['expected-database']);
    const { contentObjectStore } = require('./lib/content-import-storage');
    const store = contentObjectStore({
      client: require('../../storage'),
      bucket: process.env.MINIO_BUCKET_NAME,
      endpoint: process.env.MINIO_ENDPOINT,
      publicOrigin: new URL(
        buildPublicMediaUrl(manifest.media[0]?.key || 'images/archive'),
      ).origin,
    });
    if (args.apply) journal = journalWriter(path.resolve(args.journal));
    const report = await runContentImport({
      client,
      db,
      manifest,
      store,
      readMedia,
      authorization,
      apply: !!args.apply,
      journal: journal?.append,
    });
    if (args.output)
      fs.writeFileSync(args.output, JSON.stringify(report, null, 2), {
        flag: 'wx',
        mode: 0o600,
      });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    journal?.close();
    await client.close();
  }
}

if (require.main === module)
  main().catch((error) => {
    console.error(
      `Content import stopped (${error.code || error.name || 'error'}). Preserve the manifest and journal; no email was sent.`,
    );
    process.exitCode = 1;
  });
module.exports = { main, journalWriter };
