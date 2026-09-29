const fs = require('node:fs');
const { parseArgs } = require('./lib/args');
const { planAccounts } = require('./lib/account-plan');

const args = parseArgs();
if (
  !args.source ||
  !args.output ||
  args.apply ||
  Object.keys(args).some(
    (key) => !['_', 'source', 'output', 'destination'].includes(key),
  )
) {
  throw new Error(
    'Usage: node scripts/migration/plan-accounts.js --source audit.json --output plan.json [--destination identities.json] (read-only)',
  );
}
const source = JSON.parse(fs.readFileSync(args.source, 'utf8'));
const destination = args.destination
  ? JSON.parse(fs.readFileSync(args.destination, 'utf8'))
  : undefined;
const plan = planAccounts(source, destination);
// Refuse to replace an earlier plan; keep private artifacts out of Git.
fs.writeFileSync(args.output, `${JSON.stringify(plan, null, 2)}\n`, {
  flag: 'wx',
  mode: 0o600,
});
console.log(JSON.stringify(plan.summary, null, 2));
