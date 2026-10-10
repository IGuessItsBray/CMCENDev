// Pure preparation: JSON stdin/stdout, no database, network or deployed writes.
const fs = require('node:fs');
const { prepareRetirementIdentity } = require('./lib/notice-identity');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(prepareRetirementIdentity(
  input.retiree, input.sourceRecords, input.primaryLanguage || 'en',
), null, 2) + '\n');
