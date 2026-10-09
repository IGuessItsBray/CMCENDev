const path = require('node:path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  quiet: true,
});
const { decryptFile } = require('../services/backups');

async function main() {
  const [, , source, destination] = process.argv;
  if (!source || !destination || !process.env.BACKUP_ENCRYPTION_PASSWORD) {
    throw new Error(
      'Use node scripts/decrypt-backup.js INPUT.enc OUTPUT with BACKUP_ENCRYPTION_PASSWORD in server/.env',
    );
  }
  await decryptFile(
    source,
    destination,
    process.env.BACKUP_ENCRYPTION_PASSWORD,
  );
  console.log('Backup authenticated and decrypted.');
}
main().catch(() => {
  console.error(
    'Decryption failed: check the password, input file, and unused output path.',
  );
  process.exitCode = 1;
});
