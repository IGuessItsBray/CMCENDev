// Local synthetic-recipient proofs. No server, database or outbound email.
const { mkdir, realpath, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  generateTrustedToServe,
} = require('../services/trusted-to-serve-documents');
async function main() {
  const directory = process.argv[2];
  if (!directory || !path.isAbsolute(directory))
    throw new Error('Provide a private absolute output directory.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await realpath(directory),
    publicRoot = await realpath(path.join(__dirname, '../public'));
  if (
    resolved === publicRoot ||
    resolved.startsWith(`${publicRoot}${path.sep}`)
  )
    throw new Error('The output directory must be private.');
  for (const [filename, recipient] of [
    [
      'trusted-to-serve-short.pdf',
      {
        fullName: 'Alex Tremblay',
        rankEn: 'Aviator',
        rankFr: 'Aviateur',
        frPronoun: 'il',
        frRankGrammar: 'elided',
      },
    ],
    [
      'trusted-to-serve-long-accented.pdf',
      {
        fullName: 'Émilie Anne-Marie D’Amour-Lévesque',
        rankEn: 'Corporal',
        rankFr: 'Caporale',
        frPronoun: 'elle',
        frRankGrammar: 'feminine',
      },
    ],
  ]) {
    await writeFile(
      path.join(directory, filename),
      await generateTrustedToServe({
        ...recipient,
        presentationDate: '2026-11-13',
      }),
      { mode: 0o600 },
    );
    console.log(`Synthetic recipient proof: ${path.join(directory, filename)}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
