require('dotenv').config();

const fs = require('fs');
const path = require('path');

const mongoose = require('mongoose');
const { parseArgs, resolvePath } = require('./lib/args');
const RetirementMessage = require('../../models/RetirementMessage');

const args = parseArgs();
const outputDir = resolvePath(args.output, path.join(__dirname, 'output'));
const manifestPath = resolvePath(
  args.manifest,
  path.join(outputDir, 'wordpress-migration-manifest.json')
);

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  const records = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  await mongoose.connect(process.env.MONGO_URI);

  const importedRetirements = await RetirementMessage.countDocuments({
    'legacy.source': 'wordpress'
  });

  const summary = {
    manifest: {
      retirement: records.filter(record => record.type === 'retirement').length
    },
    mongo: {
      retirement: importedRetirements
    }
  };

  await mongoose.disconnect();

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
