const fs = require('node:fs');
const { parseArgs } = require('./lib/args');
const { inspectBatch } = require('./lib/content-preflight');

async function main() {
  const args = parseArgs();
  if (
    args._.length ||
    !args.input ||
    !args.output ||
    Object.keys(args).some(
      (key) => !['_', 'input', 'output', 'media'].includes(key),
    )
  )
    throw new Error(
      'Use --input, --output and optional --media; no apply mode',
    );
  const models = Object.fromEntries(
    ['RetirementMessage', 'LastPostMessage', 'Comment'].map((name) => [
      name,
      require(`../../models/${name}`),
    ]),
  );
  const report = await inspectBatch(
    JSON.parse(fs.readFileSync(args.input, 'utf8')),
    {
      models,
      mediaEvidence: args.media
        ? JSON.parse(fs.readFileSync(args.media, 'utf8'))
        : [],
    },
  );
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      groups: report.groups,
      readyGroups: report.readyGroups,
      safeToApply: report.safeToApply,
      issues: report.results.reduce((n, r) => n + r.issues.length, 0),
    }),
  );
  if (!report.safeToApply) process.exitCode = 2;
}
main().catch(() => {
  console.error('Content preflight failed; inspect input and output paths.');
  process.exitCode = 1;
});
