// Local synthetic-recipient proofs only: no database, server or outbound mail.
const { mkdir, realpath, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  generateMemberCertificate,
} = require('../services/certificate-documents');

async function main() {
  const directory = process.argv[2];
  const publicPath = path.resolve(__dirname, '../public');
  if (
    !directory ||
    !path.isAbsolute(directory) ||
    directory === publicPath ||
    directory.startsWith(`${publicPath}${path.sep}`)
  ) {
    throw new Error(
      'Provide a private absolute output directory outside server/public.',
    );
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await realpath(directory);
  const resolvedPublic = await realpath(publicPath);
  if (
    resolved === resolvedPublic ||
    resolved.startsWith(`${resolvedPublic}${path.sep}`)
  )
    throw new Error('The output directory must be private.');
  for (const [filename, fullName] of [
    ['member-real-fonts-ordinary.pdf', 'Émilie D’Amour'],
    [
      'member-real-fonts-long-accented.pdf',
      'Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque',
    ],
  ]) {
    const bytes = await generateMemberCertificate({
      certificateType: 'retirement',
      member: {
        fullName,
        rank: 'Warrant Officer',
        rankLanguage: 'fr',
        decorations: ['MMM', 'CD'],
        cafEnrollmentDate: '2000-02-29',
        releaseDate: '2026-08-01',
      },
    });
    await writeFile(path.join(directory, filename), bytes, { mode: 0o600 });
    console.log(`Synthetic recipient proof: ${path.join(directory, filename)}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
