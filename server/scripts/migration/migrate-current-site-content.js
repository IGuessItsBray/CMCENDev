require('dotenv').config({
  path: require('path').join(__dirname, '..', '..', '.env')
});

const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, resolvePath } = require('./lib/args');

const args = parseArgs();
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const apply = Boolean(args.apply);
const content = String(args.content || 'all');
const allowedContentModes = new Set([
  'all',
  'messages',
  'comments',
  'retirements',
  'last-posts'
]);
const contentMode = allowedContentModes.has(content) ? content : 'all';

function addFlag(argv, name, value) {
  if (value === undefined || value === null || value === false || value === '') {
    return;
  }

  argv.push(`--${name}=${value}`);
}

function runMigration(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [
    scriptPath,
    ...scriptArgs
  ], {
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${scriptName} exited with code ${result.status}`);
  }
}

function buildSharedArgs(manifestName, limitValue) {
  const sharedArgs = [
    `--output=${outputDir}`,
    `--manifest=${path.join(outputDir, manifestName)}`
  ];

  if (apply) {
    sharedArgs.push('--apply');
  }

  addFlag(sharedArgs, 'limit', limitValue);

  return sharedArgs;
}

function getRetirementContentMode() {
  if (contentMode === 'comments') {
    return 'comments';
  }

  if (contentMode === 'last-posts') {
    return '';
  }

  return contentMode === 'messages' || contentMode === 'retirements'
    ? 'retirements'
    : 'all';
}

function getLastPostContentMode() {
  if (contentMode === 'comments') {
    return 'comments';
  }

  if (contentMode === 'retirements') {
    return '';
  }

  return contentMode === 'messages' || contentMode === 'last-posts'
    ? 'last-posts'
    : 'all';
}

function main() {
  const retirementContent = getRetirementContentMode();
  const lastPostContent = getLastPostContentMode();

  console.log(`${apply ? 'Applying' : 'Dry-running'} current-site migration`);
  console.log(`Output directory: ${outputDir}`);

  if (retirementContent) {
    const retirementArgs = buildSharedArgs(
      'current-retirement-scrape-manifest.json',
      args['retirement-limit'] || args.limit
    );
    retirementArgs.push(`--content=${retirementContent}`);

    console.log('Starting retirement migration');
    runMigration('scrape-current-retirements.js', retirementArgs);
  }

  if (lastPostContent) {
    const lastPostArgs = buildSharedArgs(
      'current-last-post-scrape-manifest.json',
      args['last-post-limit'] || args.limit
    );
    lastPostArgs.push(`--content=${lastPostContent}`);

    console.log('Starting Last Post migration');
    runMigration('scrape-current-last-posts.js', lastPostArgs);
  }

  console.log('Current-site migration finished');
}

main();
