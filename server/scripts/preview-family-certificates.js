// Synthetic recipients only; saved member-to-recipient answers are fixture facts.
const { mkdir, realpath, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  generateFamilyCertificate,
  generateCertificatePacket,
} = require('../services/certificate-documents');

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
  const request = {
    certificateType: 'retirement',
    member: {
      fullName: 'Alex Tremblay',
      rank: 'Warrant Officer',
      rankLanguage: 'fr',
      decorations: ['MMM', 'CD'],
      ceBranchEnrollmentDate: '2000-02-29',
      releaseDate: '2026-08-01',
    },
    familyMembers: [
      {
        fullName: 'Camille Bélanger',
        relationship: 'wife',
        memberRelationshipToRecipient: 'husband',
      },
      {
        fullName: 'Émilie Anne-Marie Catherine Alexandra D’Amour-Lévesque',
        relationship: 'guardian',
        memberRelationshipToRecipient: 'daughter',
      },
    ],
  };
  for (const [filename, bytes] of [
    [
      'family-explicit-husband.pdf',
      await generateFamilyCertificate(request, 0),
    ],
    [
      'family-original-wording-long-name.pdf',
      await generateFamilyCertificate(request, 1),
    ],
    [
      'retirement-member-family-packet.pdf',
      await generateCertificatePacket(request),
    ],
  ]) {
    await writeFile(path.join(directory, filename), bytes, { mode: 0o600 });
    console.log(`Synthetic recipient proof: ${path.join(directory, filename)}`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
