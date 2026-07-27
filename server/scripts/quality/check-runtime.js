const minimumVersion = [20, 19, 0];
const actualVersion = process.versions.node
  .split('.')
  .map((part) => Number.parseInt(part, 10));

const isSupported = minimumVersion.every((minimumPart, index) => {
  const actualPart = actualVersion[index] || 0;
  const earlierPartsMatch = minimumVersion
    .slice(0, index)
    .every((part, earlierIndex) => actualVersion[earlierIndex] === part);

  return !earlierPartsMatch || actualPart >= minimumPart;
});

if (!isSupported || actualVersion[0] >= 23) {
  console.error(
    `CMCEN requires Node.js >=20.19.0 and <23. Current version: ${process.version}. ` +
      'Run `nvm use` from the repository root before installing dependencies or running commands.',
  );
  process.exitCode = 1;
}
